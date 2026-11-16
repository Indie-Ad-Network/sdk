#!/usr/bin/env node
/**
 * Takes out of an app's AndroidManifest.xml and Info.plist what this tool wrote there for releases up to 0.5.0,
 * which asked Android whether the catalogue's games were installed (and, before 0.3.0, iOS): the <queries> and
 * the LSApplicationQueriesSchemes between its markers. The package no longer asks what else is on a device, so
 * neither is needed. Anything else in the files is left as it is. Run it once, on a game moving to 0.5.1.
 *
 * Usage: node tools/native-queries.mjs [--android path/AndroidManifest.xml] [--ios path/Info.plist]
 */
import { readFileSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2), opt = name => { const i = args.indexOf(`--${name}`); return i < 0 ? null : args[i + 1]; };
const START = 'house-ads: the games asked about (tools/native-queries.mjs)', END = 'house-ads: end';
const marked = new RegExp(`[ \\t]*<!-- ${START.replace(/[()]/g, '\\$&')} -->[\\s\\S]*?<!-- ${END} -->\\n?`);

const files = [opt('android'), opt('ios')].filter(Boolean);
for (const file of files) {
  const text = readFileSync(file, 'utf8'), had = marked.test(text);
  if (had) writeFileSync(file, text.replace(marked, ''));
  console.log(`${file}: ${had ? 'what this tool wrote is taken out' : "nothing of this tool's in it"}`);
}
if (!files.length) console.log('Usage: node tools/native-queries.mjs [--android path/AndroidManifest.xml] [--ios path/Info.plist]');
