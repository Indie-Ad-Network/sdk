#!/usr/bin/env node
/**
 * Checks a catalogue file the way the player will read it (core/catalogue.js): that each
 * creative's file is there beside it, and that its bytes and sha256 are its file's.
 * Exits 1 if anything is wrong.
 * Usage: node tools/validate-catalogue.mjs path/to/catalogue.json
 */
import { readCatalogue, stamps, audit } from './lib.mjs';

const { cat } = readCatalogue(process.argv[2]), stamped = stamps(cat), problems = audit(cat, stamped);
for (const c of cat.creatives) {
  const bytes = stamped.get(c.id)?.bytes;
  console.log(`  ${c.id.padEnd(28)} ${c.kind.padEnd(8)} ${String(c.secs).padStart(2)} s  ${cat.apps[c.app].name}${bytes ? ` ${(bytes / 1e6).toFixed(1)} MB` : ''}`);
}
console.log(`${Object.keys(cat.apps).length} apps, ${cat.creatives.length} creatives`);
for (const p of problems) console.error(`  ✗ ${p}`);
process.exit(problems.length ? 1 : 0);
