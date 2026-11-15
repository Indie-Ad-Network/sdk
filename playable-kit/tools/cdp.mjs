// A page in headless Chrome, driven over its debugging socket: enough to load a playable, touch and
// swipe on it, read what it says of itself (in the page, or in the frame the ad player puts it in) and
// take pictures. No dependencies (Node 22+ has WebSocket). CHROME=/path/to/chrome if it isn't in /Applications.
//
//   const chrome = await launch({ gpu: true });          // gpu: a WebGL playable needs it (Metal, on a Mac)
//   const page = await chrome.open(url, { width: 390, height: 844 });
//   await page.eval('window.__ad.T'); await page.eval('...', { frame: true }); await page.swipe(x0, y0, x1, y1);
//   await page.shot('a.png'); await page.close(); await chrome.close();
//
// For filming (record.mjs): launch({ scale: 3, sound: true }) draws every page at 3 device pixels to one of its own,
// which Chrome's screencast only does when started so, and plays sound into nothing instead of muting it, so the
// page's audio clock runs. open(null, { init }) opens a page with nothing loaded and `init` run ahead of every
// page's own scripts; page.goto(url) loads it; page.send and page.on are the debugging protocol itself.
//
// Run in real time: Chrome's --virtual-time-budget froze or blanked WebGL pages when it was tried.
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
export const sleep = ms => new Promise(r => setTimeout(r, ms));

export async function launch({ gpu = false, scale: drawn = 0, sound = false } = {}) {
  const profile = mkdtempSync(join(tmpdir(), 'playable-kit-'));
  const proc = spawn(CHROME, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--hide-scrollbars', sound ? '--disable-audio-output' : '--mute-audio', ...(drawn ? [`--force-device-scale-factor=${drawn}`] : []),
    '--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', ...(gpu ? ['--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist'] : []), 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  const wsUrl = await new Promise((ok, no) => {
    let err = ''; const t = setTimeout(() => no(new Error('Chrome did not start: ' + err)), 15000);
    proc.stderr.on('data', d => { err += d; const m = /DevTools listening on (ws:\/\/\S+)/.exec(err); if (m) { clearTimeout(t); ok(m[1]); } });
  });
  const ws = new WebSocket(wsUrl); await new Promise((ok, no) => { ws.onopen = ok; ws.onerror = no; });
  let id = 0; const waiting = new Map(), listeners = [];
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && waiting.has(m.id)) { const { ok, no } = waiting.get(m.id); waiting.delete(m.id); m.error ? no(new Error(m.error.message)) : ok(m.result); } else for (const f of listeners) f(m); };
  const send = (method, params = {}, sessionId) => new Promise((ok, no) => { waiting.set(++id, { ok, no }); ws.send(JSON.stringify({ id, method, params, sessionId })); });

  async function open(url, { width = 390, height = 844, scale = drawn ? 0 : 2, init = null } = {}) {   // scale 0: as Chrome was started
    const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
    const s = (method, params) => send(method, params, sessionId);
    const logs = [], contexts = new Map(), frames = [];   // frame id -> its page's own JavaScript context
    listeners.push(m => { if (m.sessionId !== sessionId) return;
      if (m.method === 'Runtime.executionContextCreated' && m.params.context.auxData?.isDefault) contexts.set(m.params.context.auxData.frameId, m.params.context.id);
      if (m.method === 'Target.attachedToTarget' && m.params.targetInfo.type === 'iframe') frames.push(m.params.sessionId);   // a frame Chrome runs in a process of its own
      if (m.method === 'Target.detachedFromTarget') { const i = frames.indexOf(m.params.sessionId); if (i >= 0) frames.splice(i, 1); } if (m.method === 'Runtime.consoleAPICalled') logs.push(m.params.type + ': ' + m.params.args.map(a => a.value ?? a.description ?? '').join(' ')); if (m.method === 'Runtime.exceptionThrown') logs.push('EXCEPTION: ' + (m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text)); });
    await s('Page.enable'); await s('Runtime.enable');
    await s('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: false, flatten: true });
    await s('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: scale, mobile: true });
    await s('Emulation.setTouchEmulationEnabled', { enabled: true });
    if (init) await s('Page.addScriptToEvaluateOnNewDocument', { source: init });
    if (url) { await s('Page.navigate', { url }); await sleep(300); }
    const page = {
      logs, send: s, on: f => listeners.push(m => { if (m.sessionId === sessionId) f(m); }), goto: url => s('Page.navigate', { url }),
      // `frame`: evaluate in the first child frame instead (the playable inside the ad player)
      async eval(expression, { frame = false } = {}) {
        let contextId;
        if (frame && frames.length) {
          const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, frames[frames.length - 1]);
          if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
          return r.result.value;
        }
        if (frame) {
          const { frameTree } = await s('Page.getFrameTree'); const child = frameTree.childFrames?.[0]?.frame;
          contextId = child && contexts.get(child.id); if (!contextId) return undefined;
        }
        const r = await s('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, ...(contextId ? { contextId } : {}) });
        if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
        return r.result.value;
      },
      async shot(file) { const { data } = await s('Page.captureScreenshot', { format: 'png' }); writeFileSync(file, Buffer.from(data, 'base64')); return file; },
      async touch(type, x, y) { await s('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] }); },
      async swipe(x0, y0, x1, y1, ms = 120) { await page.touch('touchStart', x0, y0); for (let i = 1; i <= 4; i++) { await sleep(ms / 4); await page.touch('touchMove', x0 + (x1 - x0) * i / 4, y0 + (y1 - y0) * i / 4); } await page.touch('touchEnd'); },
      sleep,
      // waits for `expression` to be true in the page, and gives what it was; null if it never is in `secs`
      async until(expression, secs = 60) { for (const t0 = Date.now(); ;) { const v = await page.eval(expression); if (v) return v; if (Date.now() - t0 > secs * 1000) return null; await sleep(50); } },
      async tap(x, y) { await page.touch('touchStart', x, y); await sleep(40); await page.touch('touchEnd'); },
      async resize(w, h) { await s('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: scale, mobile: true }); },
      close: () => send('Target.closeTarget', { targetId }),
    };
    return page;
  }
  return { open, async close() { try { ws.close(); } catch {} proc.kill(); await sleep(200); try { rmSync(profile, { recursive: true, force: true }); } catch {} } };
}
