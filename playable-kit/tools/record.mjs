// Films a playable being played, sound and all, to a video ad as ../CREATIVES.md asks for one (MP4, H.264 and
// AAC, 30 frames a second, about 2 Mbps). Needs Chrome and ffmpeg.
//   node tools/record.mjs dist/playable.html ad.mp4 [--play play.mjs] [--secs 30] [--size 1920x1080] [--from 0] [--gpu]
//
//   --play   who plays it: a module whose default export is `async page => { … }`, given the page of cdp.mjs
//            (eval, touch, tap, swipe, sleep, until) and page.width, page.height (CSS pixels) and page.at() (ms since it loaded).
//            Without one nobody touches the ad: it stalls, and plays itself if it can. template/play.mjs is one.
//   --secs   the video's length (15 or 30).   --from   seconds of the start to leave out.
//   --size   the video's pixels; the page is laid out at a third of them (1920x1080: a 640×360 phone on its side;
//            1080x1920 for portrait).          --gpu    for a WebGL playable, as cdp.mjs.
//   The first argument may be an address instead of a file (one with :// in it), with its ?query and #hash.
//
// How: Chrome's screencast gives each frame it draws with the time it drew it, and the frames are laid end to end
// for as long as each was on screen. The sound is taken in the page: whatever a node sends to the speakers is sent
// to a recorder as well (so WebAudio only, which is what runtime/audio.js plays; an <audio> element isn't heard).
// It runs in real time. No test can hear or watch: play the video before it's uploaded.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { launch, sleep } from './cdp.mjs';

const args = process.argv.slice(2), flags = {}, plain = [];
for (let i = 0; i < args.length; i++) { const m = /^--(\w+)$/.exec(args[i]); if (!m) plain.push(args[i]); else flags[m[1]] = m[1] === 'gpu' ? true : args[++i]; }
const [playable, out] = plain, size = /^(\d+)x(\d+)$/.exec(flags.size ?? '1920x1080');
if (!playable || !out || !size) { console.log('usage: node tools/record.mjs playable.html ad.mp4 [--play play.mjs] [--secs 30] [--size 1920x1080] [--from 0] [--gpu]'); process.exit(2); }
const SCALE = 3, PW = +size[1], PH = +size[2], width = Math.round(PW / SCALE), height = Math.round(PH / SCALE), SECS = +(flags.secs ?? 30), FROM = +(flags.from ?? 0);

// in the page, ahead of its own scripts: every connection to the speakers goes to a recorder too
const HEAR = `(() => {
  const taps = new WeakMap(), connect = AudioNode.prototype.connect, rec = window.__rec = { chunks: [], t0: null, mr: null };
  AudioNode.prototype.connect = function (to, ...rest) {
    if (to instanceof AudioDestinationNode) {
      let tap = taps.get(to.context);
      if (!tap) { taps.set(to.context, tap = to.context.createMediaStreamDestination());
        const mr = rec.mr = new MediaRecorder(tap.stream, { mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 192000 });
        mr.ondataavailable = e => rec.chunks.push(e.data); mr.onstart = () => { rec.t0 = Date.now(); }; mr.start(250); }
      connect.call(this, tap);
    }
    return connect.call(this, to, ...rest);
  };
  rec.stop = async () => { if (!rec.mr) return null; await new Promise(r => { rec.mr.onstop = r; rec.mr.stop(); });
    const b = new Uint8Array(await new Blob(rec.chunks).arrayBuffer()); let s = ''; for (let i = 0; i < b.length; i += 32768) s += String.fromCharCode.apply(null, b.subarray(i, i + 32768));
    return { t0: rec.t0, webm: btoa(s) }; };
})()`;

const work = mkdtempSync(join(tmpdir(), 'playable-film-')), chrome = await launch({ gpu: !!flags.gpu, scale: SCALE, sound: true });
let failed = false;
try {
  const page = await chrome.open(null, { width, height, init: HEAR }), frames = [];
  let loaded = Infinity;   // when the playable took the page over: what was drawn before is the blank page
  page.on(m => {
    if (m.method === 'Page.frameNavigated' && !m.params.frame.parentId) loaded = Date.now();
    if (m.method !== 'Page.screencastFrame') return;
    page.send('Page.screencastFrameAck', { sessionId: m.params.sessionId });
    const t = m.params.metadata.timestamp * 1000; if (t < loaded) return;
    const file = join(work, String(frames.length).padStart(6, '0') + '.jpg'); writeFileSync(file, Buffer.from(m.params.data, 'base64')); frames.push({ file, t });
  });
  await page.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: PW, maxHeight: PH, everyNthFrame: 1 });
  await page.goto(playable.includes('://') ? playable : pathToFileURL(resolve(playable)).href);
  const began = Date.now(); Object.assign(page, { width, height, at: () => Date.now() - began });
  // the player plays for as long as the film runs; what it does after the end is of no matter
  if (flags.play) (await import(pathToFileURL(resolve(flags.play)).href)).default(page).catch(e => { if (page.at() < (FROM + SECS) * 1000) { failed = true; console.log('the player stopped: ' + (e.stack ?? e)); } });
  while (page.at() < (FROM + SECS) * 1000 + 300) await sleep(50);
  await page.send('Page.stopScreencast');
  const end = Date.now(), sound = await page.eval('window.__rec?.stop()');
  if (!frames.length) throw new Error('Chrome drew nothing');
  if (frames[0].t - began > 1000) console.log(`  warning  nothing was drawn for the first ${((frames[0].t - began) / 1000).toFixed(1)} s`);

  // each frame for as long as it was on screen
  const zero = frames[0].t, list = frames.map((f, i) => `file '${f.file}'\nduration ${Math.max(((frames[i + 1]?.t ?? end) - f.t) / 1000, 0.001).toFixed(4)}\n`).join('') + `file '${frames.at(-1).file}'\n`;
  writeFileSync(join(work, 'frames.txt'), list);
  if (sound) writeFileSync(join(work, 'sound.webm'), Buffer.from(sound.webm, 'base64'));
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', join(work, 'frames.txt'),
    ...(sound ? ['-itsoffset', ((sound.t0 - zero) / 1000).toFixed(3), '-i', join(work, 'sound.webm')] : ['-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo']),
    '-ss', String(FROM), '-t', String(SECS), '-map', '0:v', '-map', '1:a', '-vf', `fps=30,scale=${PW}:${PH}:flags=lanczos,format=yuv420p`,
    '-af', `aresample=async=1,afade=t=out:st=${(FROM + SECS - 0.45).toFixed(2)}:d=0.45`,   // the sound doesn't end on a click
    '-c:v', 'libx264', '-preset', 'slow', '-profile:v', 'high', '-b:v', '2200k', '-maxrate', '3000k', '-bufsize', '6000k', '-g', '60',
    '-c:a', 'aac', '-b:a', '128k', '-ar', '48000', '-movflags', '+faststart', out], { stdio: 'inherit' });

  const gaps = frames.slice(1).map((f, i) => f.t - frames[i].t).sort((a, b) => a - b), took = (end - zero) / 1000;
  console.log(`${out}: ${execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_name,width,height:format=duration,size', '-of', 'default=nw=1:nk=1', out], { encoding: 'utf8' }).trim().split('\n').join(' ')}`);
  console.log(`  ${frames.length} frames drawn in ${took.toFixed(1)} s (${(frames.length / took).toFixed(0)} a second; the longest wait for one ${Math.round(gaps.at(-1) ?? 0)} ms)`);
  if (!sound) console.log('  warning  the page made no sound: the video is silent');
  for (const l of page.logs.filter(l => /^(EXCEPTION|error)/.test(l))) { console.log('  page     ' + l); }
} catch (e) { failed = true; console.log('FAILED  ' + (e.stack ?? e)); }
finally { await chrome.close(); rmSync(work, { recursive: true, force: true }); }
process.exit(failed ? 1 : 0);
