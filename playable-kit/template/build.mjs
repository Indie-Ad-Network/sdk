// Builds dist/playable.html: one self-contained page. `node build.mjs`
// KIT is where indie-ads' playable-kit lies from this file: change it when this folder is copied into a game.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LINES } from './src/lines.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const KIT = process.env.PLAYABLE_KIT || join(here, '..');
const { voice, page, runtime } = await import(join(KIT, 'tools/build.mjs'));

const { TRANSLATIONS } = await import('./src/lines.i18n.mjs').catch(() => ({ TRANSLATIONS: {} }));
const code = [runtime('host', 'audio', 'narrator', 'stick'), readFileSync(join(here, 'src/game.js'), 'utf8')];

// One page a language: English from src/lines.mjs, the others from src/lines.i18n.mjs (`node build.mjs es` for some alone).
// Takes come from vo/recorded[/<code>] (tools/bake-vo.py, or a person); SCRATCH_VOICE=Samantha fills gaps with `say` on a Mac.
for (const lang of ['en', ...Object.keys(TRANSLATIONS)].filter(l => !process.argv[2] || process.argv.slice(2).includes(l))) {
  const tr = lang === 'en' ? null : TRANSLATIONS[lang];
  const v = voice({ lines: LINES, words: tr && tr.lines, recorded: join(here, 'vo/recorded', tr ? lang : ''), cache: join(here, '.cache/vo', lang), scratch: tr ? null : process.env.SCRATCH_VOICE || null });
  const count = t => Object.values(v.takes).filter(x => x === t).length;
  console.log(`${lang}      voice: ${count('recorded')} recorded, ${count('scratch')} scratch, ${count('none')} captions only; ${Object.values(v.lines).reduce((s, l) => s + l.dur, 0).toFixed(1)} s in all`);
  page({ template: join(here, 'src/page.html'), data: { lang, lines: v.lines, vo: v.vo }, code, out: join(here, 'dist', `playable${tr ? '.' + lang : ''}.html`), maxMB: 5,
    // what the admin's form is filled with when the page is picked: 30 s, and Finish early (host.done() at the end). Keep playing
    // is ticked unless keepPlaying: false: someone still short of the ring when time is up may go on
    settings: { secs: 30, finishEarly: true } });
}
