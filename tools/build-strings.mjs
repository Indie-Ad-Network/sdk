#!/usr/bin/env node
// strings/*.json → core/strings.js, the player's words as a module (strings/README.md).
// `--check`: 1 if the module is stale, writing nothing. The text is also what
// test/strings.test.mjs compares, so the two can't drift.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const dir = new URL('../strings/', import.meta.url), out = new URL('../core/strings.js', import.meta.url);

export function build() {
  const all = {};
  for (const name of readdirSync(dir).filter(n => n.endsWith('.json')).sort()) all[name.slice(0, -5)] = JSON.parse(readFileSync(new URL(name, dir), 'utf8'));
  return `// Written by tools/build-strings.mjs from strings/*.json: don't edit, change those and run it.\nexport const STRINGS = ${JSON.stringify(all, null, 1)};\n`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const text = build();
  if (process.argv.includes('--check')) {
    let now = ''; try { now = readFileSync(out, 'utf8'); } catch { /* not built yet */ }
    if (now !== text) { console.error('core/strings.js is stale: run tools/build-strings.mjs'); process.exit(1); }
  } else writeFileSync(out, text);
}
