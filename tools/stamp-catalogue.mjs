#!/usr/bin/env node
/**
 * Writes each creative's `bytes` and `sha256` into the catalogue from its file beside it. The
 * cache knows a file by its sha256, so a stamped creative is downloaded once however often
 * the catalogue or its URL moves, and a download that isn't the file is refused.
 * Run after adding or replacing a creative. Rewrites the JSON, two spaces to the indent.
 * Usage: node tools/stamp-catalogue.mjs path/to/catalogue.json
 */
import { writeFileSync } from 'node:fs';
import { readCatalogue, stamps } from './lib.mjs';

const { file, raw, cat } = readCatalogue(process.argv[2]), stamped = stamps(cat);
let n = 0;
for (const c of raw.creatives ?? []) {
  const s = stamped.get(c.id);   // none for a creative hosted elsewhere: stamped by whoever hosts it
  if (!s || (c.bytes === s.bytes && c.sha256 === s.sha256)) continue;
  Object.assign(c, s); n++;
  console.log(`  stamped ${c.id}  ${s.bytes} bytes  ${s.sha256.slice(0, 12)}…`);
}
if (n) writeFileSync(file, JSON.stringify(raw, null, 2) + '\n');
console.log(n ? `${n} stamped` : 'all stamps current');
