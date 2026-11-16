#!/usr/bin/env node
/**
 * Publishes a catalogue and its files by FTPS to an Apache server: the catalogue, each
 * creative, poster, icon and art it names, and an .htaccess with the headers they must be
 * served with (lib.mjs).
 *
 * The files go up first and the catalogue last, so it never names a file that isn't there.
 * Over FTPS only, credentials from ~/.netrc (curl -n).
 *
 * Usage: node tools/publish.mjs path/to/catalogue.json ftp://host/dir/ [--upload]
 *   without --upload it lists what would go, and checks the catalogue
 */
import { writeFileSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { checked, HTACCESS } from './lib.mjs';

const [arg, to] = process.argv.slice(2).filter(a => !a.startsWith('--'));
if (!arg || !/^ftp:\/\/[^/]+\/.*\/$/.test(to ?? '')) { console.error('usage: publish.mjs catalogue.json ftp://host/dir/ [--upload]'); process.exit(2); }
const { file, names } = checked(arg);

const htaccess = join(mkdtempSync(join(tmpdir(), 'indie-ads-')), '.htaccess');
writeFileSync(htaccess, HTACCESS);
const uploads = [[htaccess, '.htaccess'], ...names.map(name => [join(dirname(file), name), name])];

for (const [, name] of uploads) console.log(`  ${name}`);
if (!process.argv.includes('--upload')) { console.log(`${uploads.length} files for ${to}: re-run with --upload to publish`); process.exit(0); }
// one curl, one TLS session. TLS 1.2: over 1.3 some Pure-FTPd hosts abort uploads partway
const cfg = uploads.map(([from, name]) => `upload-file = "${from}"\nurl = "${to}${name}"`).join('\n');
execFileSync('curl', ['-n', '--ssl-reqd', '--tls-max', '1.2', '--ftp-create-dirs', '-sS', '--config', '-'], { input: cfg, stdio: ['pipe', 'inherit', 'inherit'] });
console.log(`published ${uploads.length} files to ${to}`);
