#!/usr/bin/env node
/**
 * Writes into an app's AndroidManifest.xml the games it may ask about, from the catalogue:
 * Android 11+ answers "is it installed?" only for packages in the manifest's <queries>.
 * Run when a game joins the catalogue; it needs an app release to take effect.
 *
 * Its own entries are kept between markers and replaced whole each run; anything else in
 * the file is left as it is.
 *
 * iOS isn't asked which games are installed (Apple's review guidelines, 5.1.2 iv), so nothing
 * is written to an Info.plist: --ios takes out the LSApplicationQueriesSchemes this tool wrote
 * there before 0.3.0, and touches nothing else.
 *
 * Usage: node tools/native-queries.mjs catalogue.json [--android path/AndroidManifest.xml] [--ios path/Info.plist] [--host id]
 *   --host  this app's own id in the catalogue, left out of the list
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { readCatalogue } from './lib.mjs';

const args = process.argv.slice(2), opt = name => { const i = args.indexOf(`--${name}`); return i < 0 ? null : args[i + 1]; };
const { cat } = readCatalogue(args[0]);
const apps = Object.values(cat.apps).filter(a => a.id !== opt('host'));
const packages = [...new Set(apps.map(a => a.android?.package).filter(Boolean))].sort();
const START = 'house-ads: the games asked about (tools/native-queries.mjs)', END = 'house-ads: end';
const marked = new RegExp(`[ \\t]*<!-- ${START.replace(/[()]/g, '\\$&')} -->[\\s\\S]*?<!-- ${END} -->\\n?`);
const between = (text, block, insertBefore, file) => {
  if (marked.test(text)) return text.replace(marked, block);
  const at = text.lastIndexOf(insertBefore);
  if (at < 0) throw new Error(`${file}: no ${insertBefore}`);
  const line = text.lastIndexOf('\n', at) + 1;
  return text.slice(0, line) + block + text.slice(line);
};

const ios = opt('ios'), android = opt('android');
if (ios) {
  const text = readFileSync(ios, 'utf8'), had = marked.test(text);
  if (had) writeFileSync(ios, text.replace(marked, ''));
  console.log(`${ios}: ${had ? 'the schemes this tool wrote are taken out' : 'nothing of this tool\'s in it'}; iOS isn't asked which games are installed`);
}
if (android) {
  const block = `    <!-- ${START} -->\n    <queries>\n${packages.map(p => `        <package android:name="${p}" />\n`).join('')}    </queries>\n    <!-- ${END} -->\n`;
  writeFileSync(android, between(readFileSync(android, 'utf8'), block, '</manifest>', android));
  console.log(`${android}: ${packages.length} packages`);
}
if (!ios && !android) console.log(`packages: ${packages.join(', ')}`);
