// What the tools share: a catalogue file read the way the player reads it, and its local files.
import { readFileSync, existsSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { resolve, dirname, relative } from 'node:path';
import { validate, filesOf } from '../core/catalogue.js';

const local = u => u?.startsWith('file:') ? fileURLToPath(u) : null;

// { file, raw (as written), cat (validated, its paths as file: URLs) }
export function readCatalogue(arg) {
  const file = resolve(arg ?? 'catalogue.json'), raw = JSON.parse(readFileSync(file, 'utf8'));
  return { file, raw, cat: validate(raw, pathToFileURL(file).href) };
}

// Every local file the catalogue names: [{ what, id, field, file }]. The one list of them:
// a new field that names a file is added here, and every tool has it.
export const assets = cat => [
  ...cat.creatives.flatMap(c => filesOf(c).map(([field, u]) => ({ what: 'creative', id: c.id, field, file: local(u) }))),
  ...Object.values(cat.apps).flatMap(a => [['icon', a.icon], ['art', a.art]].map(([field, u]) => ({ what: 'app', id: a.id, field, file: local(u) }))),
].filter(x => x.file);

// Each creative's own file as it is on disk: Map id → { bytes, sha256 }, for those that are there.
export const stamps = cat => new Map(assets(cat).filter(x => x.field === 'src' && existsSync(x.file))
  .map(x => [x.id, { bytes: statSync(x.file).size, sha256: createHash('sha256').update(readFileSync(x.file)).digest('hex') }]));

// What's wrong with it, as the player would find: entries dropped, files missing, and stamps
// that aren't their files' (which would have every player's download refused).
export function audit(cat, stamped = stamps(cat)) {
  const problems = [...cat.dropped];
  for (const x of assets(cat)) if (!existsSync(x.file)) problems.push(`${x.what} ${x.id}: no file ${x.file}`);
  for (const c of cat.creatives) {
    const s = stamped.get(c.id);
    if (s && (c.bytes !== s.bytes || c.sha256 !== s.sha256)) problems.push(`creative ${c.id}: bytes/sha256 ${c.sha256 ? "don't match its file" : 'not stamped'}: run tools/stamp-catalogue.mjs`);
  }
  return problems;
}

// What the server must say of these files, whoever it is: games on other origins (an app's
// web view, another site) may fetch them; search engines needn't; and the catalogue itself is
// never cached, so a change to what's shown is seen at once. Written out for each kind of
// server by the publish tools.
const FOR_ALL = { 'Access-Control-Allow-Origin': '*', 'X-Robots-Tag': 'noindex, nofollow' }, FOR_CATALOGUE = { 'Cache-Control': 'no-cache' };
const lines = (headers, line) => Object.entries(headers).map(([k, v]) => line(k, v)).join('\n');
export const HTACCESS = `# Written by house-ads tools/publish.mjs.
<IfModule mod_headers.c>
${lines(FOR_ALL, (k, v) => `  Header set ${k} "${v}"`)}
  <Files "catalogue.json">
${lines(FOR_CATALOGUE, (k, v) => `    Header set ${k} "${v}"`)}
  </Files>
</IfModule>
`;
export const CLOUDFLARE_HEADERS = `# Written by house-ads publish-cloudflare.mjs: don't edit, it's rewritten at each publish.
/*
${lines(FOR_ALL, (k, v) => `  ${k}: ${v}`)}
/catalogue.json
${lines(FOR_CATALOGUE, (k, v) => `  ${k}: ${v}`)}
`;

// The files to publish with a catalogue, as paths within its folder, the catalogue last (so
// it never names a file that isn't there yet). Throws if it names one outside its folder.
export function publishList(file, cat) {
  const root = dirname(file), files = [...new Set(assets(cat).map(x => x.file))];
  const outside = files.filter(f => relative(root, f).startsWith('..'));
  if (outside.length) throw new Error(`outside the catalogue's folder: ${outside.join(', ')}`);
  return [...files.map(f => relative(root, f)), 'catalogue.json'];
}

// Read and check a catalogue for publishing; exits 1, saying why, if it isn't fit to go.
export function checked(arg) {
  const { file, cat } = readCatalogue(arg), problems = audit(cat);
  let names = [];
  try { names = publishList(file, cat); } catch (e) { problems.push(e.message); }
  for (const p of problems) console.error(`  ✗ ${p}`);
  if (problems.length) process.exit(1);
  return { file, cat, names };
}
