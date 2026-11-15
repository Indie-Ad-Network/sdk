// Checks a finished playable against what house-ads asks of one (../PLAYABLE_HOST.md): its size, that it
// reaches for nothing outside itself, its funnel step names, that it pauses when told. Exits 1 on an error.
//   node tools/check.mjs path/to/playable.html [more.html ...]
import { readFileSync } from 'node:fs';
import { check, adminLine } from './build.mjs';

let failed = 0;
for (const file of process.argv.slice(2)) {
  const r = check(readFileSync(file, 'utf8'));
  console.log(`${file}: ${(r.size / 1e6).toFixed(2)} MB, steps: ${r.steps.join(' ') || 'none'}`);
  console.log('  admin    ' + adminLine(r.says));
  for (const e of r.errors) console.log('  ERROR    ' + e);
  for (const w of r.warnings) console.log('  warning  ' + w);
  if (r.errors.length) failed++;
}
if (process.argv.length < 3) { console.log('usage: node tools/check.mjs playable.html'); process.exit(2); }
process.exit(failed ? 1 : 0);
