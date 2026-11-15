// The kit, end to end, on its own template: builds it, plays it by itself (?auto=1) and then inside
// house-ads' real player with a finger holding the stick over, and checks what came out. Needs Chrome
// and ffmpeg. Pictures go to .cache/shots. Exits 1 if a check fails.
//   node tools/selftest.mjs
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { serve } from './serve.mjs';
import { launch, sleep } from './cdp.mjs';

const kit = resolve(dirname(fileURLToPath(import.meta.url)), '..'), PAGE = join(kit, 'template/dist/playable.html'), OUT = join(kit, '.cache/shots');
mkdirSync(OUT, { recursive: true });
console.log(execFileSync('node', [join(kit, 'template/build.mjs')], { encoding: 'utf8' }).trim());
let failed = 0;
const check = (ok, what) => { console.log((ok ? '  ok    ' : '  FAIL  ') + what); if (!ok) failed++; };
const until = async (f, secs, every = 250) => { const t0 = Date.now(); for (;;) { const v = await f(); if (v) return v; if (Date.now() - t0 > secs * 1000) return null; await sleep(every); } };
const chrome = await launch(), server = await serve(PAGE, 0), PORT = server.address().port;   // any free port
try {
  console.log('\n== by itself, ?auto=1');
  let page = await chrome.open(pathToFileURL(PAGE).href + '?auto=1');
  let st = await until(async () => { const s = await page.eval('window.__ad ? { done: __ad.done, steps: __ad.steps, events: __ad.events, T: __ad.T } : null'); return s && s.done ? s : null; }, 25);
  await page.shot(join(OUT, 'alone.png'));
  if (!st) st = await page.eval('window.__ad ? { done: __ad.done, steps: __ad.steps, events: __ad.events, T: __ad.T } : null');
  check(!!st && st.done, `it reaches its end (T ${st?.T?.toFixed(1)})`);
  check(st && st.steps.join(' ') === '1_shown 2_pushed 3_there 4_end', 'the steps, in order: ' + st?.steps.join(' '));
  const said = (st?.events || []).filter(e => e.includes(' say ')).map(e => e.split(' ')[2]), order = ['hook', 'hook2', 'moved', 'close', 'there', 'next'];
  check(said[0] === 'hook', 'the hook is said first: ' + said.join(' '));
  check(said.every((k, i) => !i || order.indexOf(k) > order.indexOf(said[i - 1])) && said.slice(-2).join(' ') === 'there next', 'a fast player skips lines and never hears one out of order; the payoff and the last line are said');
  check(new Set(said).size === said.length, 'no line twice');
  if (page.logs.length) console.log(page.logs.join('\n'));
  await page.close();

  console.log('\n== nobody touches it');
  page = await chrome.open(pathToFileURL(PAGE).href);
  await sleep(13000);
  st = await page.eval('({ events: __ad.events, steps: __ad.steps })');
  const idle = st.events.filter(e => e.includes(' say ')).map(e => e.split(' ')[2]);
  check(idle.includes('stall_1') && idle.includes('stall_2') && idle.indexOf('stall_1') > idle.indexOf('hook2'), 'after the hook, a stall line each time nothing is done: ' + idle.join(' '));
  check(st.steps.join(' ') === '1_shown', 'and no step claimed that was not reached: ' + st.steps.join(' '));
  await page.close();

  console.log('\n== in house-ads\' player, finishEarly, a finger holding the stick right');
  page = await chrome.open(`http://127.0.0.1:${PORT}/harness.html?secs=30&finishEarly=1`);
  await sleep(1500);
  const inner = await page.eval('window.__ad ? { paused: __ad.paused, T: __ad.T } : null', { frame: true });
  check(!!inner && !inner.paused && inner.T > 0, `it runs in the sandboxed frame (T ${inner?.T?.toFixed(1)})`);
  await page.touch('touchStart', 150, 500); await sleep(60); for (let i = 1; i <= 5; i++) { await page.touch('touchMove', 150 + i * 20, 500); await sleep(30); }
  const ev = await until(async () => { const e = await page.eval('window.__events.map(e => e[0] + (e[1].step ? ":" + e[1].step : ""))'); return e.includes('reward') || e.includes('fail') ? e : null; }, 25);
  await page.touch('touchEnd'); await sleep(400); await page.shot(join(OUT, 'harness.png'));
  const got = ev || await page.eval('window.__events.map(e => e[0] + (e[1].step ? ":" + e[1].step : ""))');
  check(got.includes('first_touch'), 'the first touch was reported');
  check(['step:1_shown', 'step:2_pushed', 'step:3_there', 'step:4_end'].every(s => got.includes(s)), 'every step reached the player: ' + got.join(' '));
  check(got.includes('complete') && got.includes('reward') && !got.includes('fail'), 'the page said it was done and the reward was given early');
  if (page.logs.length) console.log(page.logs.join('\n'));
  await page.close();

  console.log('\n== in house-ads\' player, muted, then not viewable');
  page = await chrome.open(`http://127.0.0.1:${PORT}/harness.html?secs=30&muted=1`);
  await sleep(1500);
  await page.eval(`document.querySelector('#house-ads').shadowRoot.querySelector('iframe').contentWindow.postMessage({ houseAds: 'viewable', value: false }, '*')`);
  await sleep(300); const a = await page.eval('({ paused: __ad.paused, T: __ad.T })', { frame: true }); await sleep(700); const b = await page.eval('({ paused: __ad.paused, T: __ad.T })', { frame: true });
  check(a.paused && b.T === a.T, `told it isn't viewable, it stands still (T ${a.T.toFixed(2)} then ${b.T.toFixed(2)})`);
  await page.close();
} finally { await chrome.close(); server.close(); }
process.exit(failed ? 1 : 0);
