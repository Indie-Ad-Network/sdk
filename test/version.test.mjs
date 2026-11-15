import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

// The repository is one thing with one version (unity/CHANGELOG.md says why): the page the
// Unity package ships is built from core/, and the two must be of the same release. A tag
// vX.Y.Z is that version, so these must agree before one is made.
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const versionOf = path => JSON.parse(read(path)).version;
const version = versionOf('package.json');

test('the version is Semantic Versioning', () => {
  assert.match(version, /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/);
});

test('every package in the repository has the same version', () => {
  for (const path of ['unity/package.json', 'capacitor/package.json']) assert.equal(versionOf(path), version, path);
});

test('the release the player says it is (core/wire.js SDK) is this version', async () => {
  assert.equal((await import('../core/wire.js')).SDK, version, 'core/wire.js: SDK');
});

test("the git URL the Unity README gives is this version's tag", () => {
  assert.equal(read('unity/README.md').match(/sdk\.git\?path=\/unity#(v[\w.-]+)/)?.[1], `v${version}`, 'unity/README.md: the package URL names another release');
});

test("the changelog's newest entry is this version", () => {
  const newest = read('unity/CHANGELOG.md').match(/^## \[(?!Unreleased\])([^\]]+)\]/m)?.[1];   // what's written up before its release is under [Unreleased]
  assert.equal(newest, version, 'add a "## [version] - date" entry to unity/CHANGELOG.md');
});

// The oldest web views a game of ours runs on (iOS 14.0's, Android's System WebView 80) read the player as it's
// written: esbuild's target lowers syntax, and nothing lowers a method they haven't or CSS they can't read.
test("the player uses nothing its oldest web views haven't", () => {
  const NEWER = [/\.at\(/, /\.replaceAll\(/, /\bstructuredClone\b/, /Object\.hasOwn\b/, /\.findLast(Index)?\(/, /\.toSorted\(/, /[^-]\binset\s*:/, /aspect-ratio\s*:/];
  for (const dir of ['../core/', '../web/']) for (const name of readdirSync(new URL(dir, import.meta.url)).filter(f => f.endsWith('.js') && f !== 'strings.js')) {
    const text = readFileSync(new URL(dir + name, import.meta.url), 'utf8').split('\n').filter(line => !/^\s*\/\//.test(line)).join('\n');
    for (const re of NEWER) assert.ok(!re.test(text), `${name} uses ${re.source}`);
  }
});
