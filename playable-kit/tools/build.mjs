// What every playable's own build.mjs needs: the voice takes made ready, files as base64, the page put
// together as one HTML file, and the checks house-ads makes of it. No dependencies beyond Node 22 and ffmpeg
// (and, on a Mac, `say` for scratch takes). An ad's build imports this; template/build.mjs is the smallest one.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pageSays } from '../../ingest/src/page-says.js';

const KIT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const run = (cmd, args) => execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] }).toString();
const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.ttf': 'font/ttf', '.woff2': 'font/woff2' };
export const kb = n => (n / 1024).toFixed(0) + ' KB';
export const b64 = file => readFileSync(file).toString('base64');
export const dataURI = file => `data:${MIME[extname(file).toLowerCase()] || 'application/octet-stream'};base64,${b64(file)}`;
export const duration = file => +run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).trim();

// The kit's runtime, as text to put in the page ahead of the ad's own code: runtime('host', 'audio', 'narrator', 'stick')
export const runtime = (...names) => names.map(n => readFileSync(join(KIT, 'runtime', n + '.js'), 'utf8')).join('\n');

// Any sound as a small mono mp3 in `out`, base64. Remade only when the source is newer.
export function mp3(src, out, { rate = 32000, kbps = 64, filter } = {}) {
  mkdirSync(dirname(out), { recursive: true });
  if (!existsSync(out) || statSync(out).mtimeMs < statSync(src).mtimeMs)
    run('ffmpeg', ['-v', 'error', '-y', '-i', src, ...(filter ? ['-af', filter] : []), '-ac', '1', '-ar', String(rate), '-c:a', 'libmp3lame', '-b:a', kbps + 'k', out]);
  return b64(out);
}

const TRIM = 'silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse';
function peakOf(src) {   // dB, of the trimmed take (ffmpeg reports on stderr)
  const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', src, '-af', TRIM + ',volumedetect', '-f', 'null', '-'], { encoding: 'utf8' });
  const m = /max_volume: (-?[\d.]+) dB/.exec(r.stderr || ''); return m ? +m[1] : 0;
}

// The voice: for each line, its take as mp3 and how long it runs.
//   lines     { key: 'words' | { text, say?, pool?, note? } }   (the ad's src/lines.mjs)
//   recorded  folder of takes named <key>.wav (tools/bake-vo.py's, or a person's)
//   cache     folder for the mp3s
//   scratch   a `say` voice ('Samantha') for lines with no take yet, Mac only; without it they are captions alone
//   words     another language's words, { key: 'words' }: the same keys, pools and order, said and shown in that language
// Gives { lines: { key: { text, dur, pool? } }, vo: { key: base64 }, takes: { key: 'recorded' | 'scratch' | 'none' } }.
// A take is trimmed of silence, brought up to -2 dB and given 40 ms of lead-in. A line with no take gets a
// length from its word count, so the captions still run at about the right pace.
export function voice({ lines, recorded, cache, scratch = null, words: other = null }) {
  const out = { lines: {}, vo: {}, takes: {} };
  mkdirSync(cache, { recursive: true });
  for (const [key, l] of Object.entries(lines)) {
    const line = other ? { ...(typeof l === 'string' ? {} : l), text: other[key] ?? (typeof l === 'string' ? l : l.text), say: undefined } : typeof l === 'string' ? { text: l } : l, words = line.say ?? line.text;
    let src = ['.wav', '.aiff', '.m4a', '.mp3'].map(e => join(recorded, key + e)).find(existsSync), take = src ? 'recorded' : 'none';
    if (!src && scratch && process.platform === 'darwin') {
      src = join(cache, 'scratch', key + '.aiff'); const said = src + '.txt'; mkdirSync(dirname(src), { recursive: true });
      if (!existsSync(src) || !existsSync(said) || readFileSync(said, 'utf8') !== words) { run('say', ['-v', scratch, '-o', src, words]); writeFileSync(said, words); }
      take = 'scratch';
    }
    let dur = +(0.6 + 0.35 * words.split(/\s+/).length).toFixed(2);
    if (src) {
      const file = join(cache, key + '.mp3');
      if (!existsSync(file) || statSync(file).mtimeMs < statSync(src).mtimeMs)
        run('ffmpeg', ['-v', 'error', '-y', '-i', src, '-af', `${TRIM},volume=${(-2 - peakOf(src)).toFixed(1)}dB,adelay=40:all=1`, '-ac', '1', '-ar', '24000', '-c:a', 'libmp3lame', '-b:a', '48k', file]);
      out.vo[key] = b64(file); dur = +duration(file).toFixed(2);
    }
    out.lines[key] = { text: line.text, dur, ...(line.pool ? { pool: line.pool } : {}) };
    out.takes[key] = take;
  }
  return out;
}

// What house-ads asks of a playable (../PLAYABLE_HOST.md), checked on the finished page.
// Gives { errors, warnings, size, steps, says }: an error is something the admin or the player would refuse.
// `says` is what the admin will make of the page's settings (ingest/src/page-says.js).
export function check(html, { maxMB = 8 } = {}) {
  const errors = [], warnings = [], size = Buffer.byteLength(html);
  if (size > maxMB * 1e6) errors.push(`the page is ${(size / 1e6).toFixed(2)} MB: ${maxMB} MB at most`);
  else if (size > 5e6) warnings.push(`the page is ${(size / 1e6).toFixed(2)} MB: over 5 MB, the admin warns`);
  // nothing may be fetched: the page has no origin and, in an ad, may have no network
  const bare = html.replace(/data:[a-z0-9/+.-]+;base64,[A-Za-z0-9+/=]+/gi, 'data:').replace(/"[A-Za-z0-9+/=]{2000,}"/g, '""');
  const outside = bare.match(/<(?:script|img|link|audio|video|source|iframe)\b[^>]*?\b(?:src|href)\s*=\s*["'](?!data:|#)[^"']+|url\(\s*["']?(?!data:)[a-z]+:\/\/[^)"']+/gi);
  if (outside) errors.push('the page reaches outside itself: ' + [...new Set(outside)].slice(0, 5).join(', '));
  if (/\b(?:fetch|XMLHttpRequest|importScripts|EventSource|WebSocket)\s*\(/.test(bare)) warnings.push('the page seems to make a network request (fetch, XMLHttpRequest…): it has no origin and may have no network');
  if (/\b(?:localStorage|sessionStorage|indexedDB|document\.cookie)\b/.test(bare)) warnings.push('the page uses storage: in the sandbox nothing is kept between showings');
  if (/\b(?:alert|confirm|prompt)\s*\(/.test(bare.replace(/<style[\s\S]*?<\/style>/g, ''))) warnings.push('the page may call alert/confirm/prompt: the sandbox ignores them');
  // the names written out in the code (comments aside): one put together as it runs ('solved_' + n) isn't seen here
  const steps = [...new Set([...bare.replace(/^\s*\/\/.*$/gm, '').matchAll(/\bstep\(\s*['"]([^'"]+)['"]\s*\)/g)].map(m => m[1]))];
  for (const s of steps) if (!/^[\w.-]{1,32}$/.test(s)) errors.push(`step name "${s}": letters, digits, . - _ only, 32 at most`);
  if (steps.length > 12) errors.push(`${steps.length} step names: a dozen at most are counted`);
  if (!steps.length) warnings.push('no funnel steps found (host.step / houseAds.step): the dashboard will show only show and first_touch');
  if (!/viewableChange/.test(bare)) errors.push("the page doesn't listen for viewableChange: it must pause and go silent when not viewable");
  if (!/audioVolumeChange/.test(bare)) warnings.push("the page doesn't listen for audioVolumeChange: a muted host game would still hear it");
  const says = pageSays(html);
  if (says.error) errors.push(says.error);
  if (says.said?.finishEarly && !says.closes) errors.push("its house-ads tag asks for finishEarly, but the page never calls mraid.close()");
  if (says.closes && says.said?.finishEarly === undefined) warnings.push('the page calls mraid.close() but no house-ads tag says finishEarly (page({ settings })): the admin\'s Finish early starts unticked, and one who reaches the end waits out the countdown on the end card');
  return { errors, warnings, size, steps, says };
}

// what the admin's form will start as for a page, in a line (check()'s `says`)
export const adminLine = s => `${s.secs ? s.secs + ' s, ' : ''}Finish early ${s.finishEarly ? 'on' : 'off'}, Keep playing ${s.keepPlaying ? 'on' : 'off'}${s.said ? '' : ' (no house-ads tag)'}`;

// One self-contained page: `template` with /*DATA*/ replaced by `window.<global> = <data>` and /*CODE*/ by the
// code, in order (kit runtime first). Checked, then written. Throws if a check fails.
// `settings` ({ secs, finishEarly, keepPlaying }) go in the head as the house-ads tag the admin reads when it's
// uploaded, to fill its form: Seconds from secs, Finish early ticked only if asked for here (and the page calls
// mraid.close()), Keep playing ticked unless it says keepPlaying: false (PLAYABLE_HOST.md, "Settings from the page").
export function page({ template, data, code, out, global = '__AD__', maxMB = 8, quiet = false, settings = null }) {
  const json = JSON.stringify(data).replace(/<\//g, '<\\/');
  const js = [].concat(code).join('\n');
  if (/<\/script/i.test(js)) throw new Error('the code contains "</script": write it as "<\\/script"');
  let html = readFileSync(template, 'utf8');
  for (const mark of ['/*DATA*/', '/*CODE*/']) if (!html.includes(mark)) throw new Error(`${template} has no ${mark}`);
  html = html.replace('/*DATA*/', () => `window.${global}=${json};`).replace('/*CODE*/', () => js);
  if (settings) {
    const tag = `<meta name="house-ads" content='${JSON.stringify(settings).replace(/&/g, '&amp;').replace(/'/g, '&#39;')}'>`;
    const at = /<meta\s+charset[^>]*>/i.exec(html) ?? /<head[^>]*>/i.exec(html);   // after the charset, which wants to be first
    if (!at) throw new Error(`${template} has no <head> for the house-ads tag`);
    html = html.slice(0, at.index + at[0].length) + tag + html.slice(at.index + at[0].length);
  }
  const r = check(html, { maxMB });
  if (!quiet) for (const w of r.warnings) console.log('warning: ' + w);
  if (r.errors.length) throw new Error(r.errors.join('\n'));
  mkdirSync(dirname(out), { recursive: true }); writeFileSync(out, html);
  if (!quiet) console.log(`page    ${out}  ${(r.size / 1e6).toFixed(2)} MB, steps: ${r.steps.join(' ') || 'none'}`);
  if (!quiet && r.says.said) console.log('admin   ' + adminLine(r.says));
  return r;
}
