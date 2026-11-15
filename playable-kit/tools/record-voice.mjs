// Records the voice sample the lines are cloned from: about 20 seconds of you, reading the way the ad
// should sound. Needs ffmpeg and a microphone. The sample is yours: it is never put in the page, and
// *.reference.wav is ignored by git. Only clone a voice whose owner agreed.
//   node tools/record-voice.mjs [voice.reference.wav] [--secs 20] [--device <n or name>] [--list]
//   node tools/record-voice.mjs voice.reference.wav --from a-recording.m4a     use a recording you already have
import { spawnSync } from 'node:child_process';
import { existsSync, renameSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const args = process.argv.slice(2), opt = name => { const i = args.indexOf('--' + name); return i < 0 ? null : args.splice(i, 2)[1]; };
const list = args.includes('--list'), secs = +(opt('secs') || 20), device = opt('device'), from = opt('from');
const out = resolve(args.find(a => !a.startsWith('--')) || 'voice.reference.wav'), raw = out + '.raw.wav';
const ff = (a, o = {}) => spawnSync('ffmpeg', ['-hide_banner', ...a], { encoding: 'utf8', ...o });
if (ff(['-version']).error) { console.error('ffmpeg is needed (macOS: brew install ffmpeg).'); process.exit(1); }

// where the microphone is, by system
const os = process.platform, mic = os === 'darwin' ? ['-f', 'avfoundation', '-i', ':' + (device ?? 'default')]
  : os === 'win32' ? ['-f', 'dshow', '-i', 'audio=' + (device ?? '')] : ['-f', 'pulse', '-i', device ?? 'default'];
if (list || (os === 'win32' && !device && !from)) {
  const r = os === 'darwin' ? ff(['-f', 'avfoundation', '-list_devices', 'true', '-i', '']) : os === 'win32' ? ff(['-list_devices', 'true', '-f', 'dshow', '-i', 'dummy']) : spawnSync('pactl', ['list', 'short', 'sources'], { encoding: 'utf8' });
  const text = (r.stderr || '') + (r.stdout || ''), at = text.search(/audio devices/i);   // a Mac lists its cameras first
  console.log(text.slice(Math.max(0, at)).split('\n').filter(l => /audio|\[\d+\]|"|alsa|pulse|input/i.test(l) && !/error/i.test(l)).join('\n'));
  console.log('\nChoose one with --device (its number on a Mac, its name in quotes on Windows).'); process.exit(list ? 0 : 1);
}

if (from) { if (!existsSync(from)) { console.error('No such file: ' + from); process.exit(1); } }
else {
  console.log(`Read this aloud, the way the ad should sound: lively, close to the microphone, in a quiet room.
The voice copies your energy, so a flat reading gives a flat ad. ${secs} seconds; stop early with q.

  "Okay, okay... what do we have here? Whoa, this looks amazing! So I just swipe... and it moves?
   Ha! Yes! Got it! Wait, wait, wait... what's that? Oh no. Oh no, no, no! Come on, come on...
   Phew! That was close. Alright... what's next? Ooh, I have to see this!"
`);
  for (const n of [3, 2, 1]) { process.stdout.write(n + '... '); spawnSync(process.execPath, ['-e', 'setTimeout(() => {}, 1000)']); }
  console.log('recording');
  const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...mic, '-t', String(secs), '-ac', '1', raw], { stdio: 'inherit' });
  if (r.status !== 0 || !existsSync(raw)) { console.error('\nNothing was recorded. Is the microphone allowed for this terminal? `--list` shows the microphones; `--device` picks one.'); process.exit(1); }
}

// trimmed of silence at each end, mono, and brought up to a steady level
const src = from || raw, TRIM = 'silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse';
const peak = +(/max_volume: (-?[\d.]+) dB/.exec(ff(['-nostats', '-i', src, '-af', TRIM + ',volumedetect', '-f', 'null', '-']).stderr || '') || [0, NaN])[1];
const made = ff(['-loglevel', 'error', '-y', '-i', src, '-af', `${TRIM},volume=${Number.isFinite(peak) ? (-2 - peak).toFixed(1) : 0}dB`, '-ac', '1', '-ar', '44100', out + '.tmp.wav']);
if (made.status !== 0) { console.error(made.stderr); process.exit(1); }
renameSync(out + '.tmp.wav', out); if (!from) rmSync(raw, { force: true });
const len = +spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', out], { encoding: 'utf8' }).stdout;
console.log(`\n${out}: ${len.toFixed(1)} s of speech, recorded peak ${Number.isFinite(peak) ? peak.toFixed(1) + ' dB' : 'unknown'}`);
if (!(len >= 8)) console.log('  Short: 10 to 30 seconds of speech clones best. Record again.');
if (peak < -25) console.log('  Quiet: move closer to the microphone, or raise its level, and record again.');
if (peak > -0.5) console.log('  Clipped: it was too loud for the microphone. Back off a little and record again.');
console.log('Listen to it. Then, from your ad\'s folder:  sh <kit>/tools/bake-vo.sh --ref ' + out);
