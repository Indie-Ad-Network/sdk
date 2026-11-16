#!/usr/bin/env node
// core/ and web/host.js as one page, for a game whose web view is handed HTML, not a server
// (the Unity package): unity/Runtime/Resources/IndieAdsPlayer.html, which is committed, so a
// game that takes the package needs no Node. Run after any change to core/ or web/:
//
//   node tools/build-player.mjs          (wants esbuild: `npx` fetches it, or ESBUILD=<path to its binary>)
//
// `--check` builds and compares instead of writing: 1 if the committed page is stale.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = new URL('..', import.meta.url), out = new URL('unity/Runtime/Resources/IndieAdsPlayer.html', root);
// es2020: every web view a game of ours still runs on (iOS 14's WKWebView, Android's System WebView 80+)
const args = [fileURLToPath(new URL('web/host.js', root)), '--bundle', '--format=iife', '--minify', '--target=es2020', '--charset=utf8', '--log-level=warning'];
const [cmd, ...pre] = process.env.ESBUILD ? [process.env.ESBUILD] : ['npx', '--yes', 'esbuild@0.25'];
const js = execFileSync(cmd, [...pre, ...args], { encoding: 'utf8', maxBuffer: 16e6 }).trim();
if (/<\/script/i.test(js)) throw new Error('the bundle would end its own <script>');

// transparent until the player draws: the game shows through a web view with nothing in it
const html = `<!doctype html>
<html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
<style>html, body { margin: 0; height: 100%; background: transparent; overflow: hidden; }</style>
</head><body><script>
${js}
</script></body></html>
`;
if (process.argv.includes('--check')) {
  let now = ''; try { now = readFileSync(out, 'utf8'); } catch { /* not built yet */ }
  if (now !== html) { console.error('unity/Runtime/Resources/IndieAdsPlayer.html is stale: run tools/build-player.mjs'); process.exit(1); }
} else {
  writeFileSync(out, html);
  console.log(`${fileURLToPath(out)}  ${(html.length / 1024).toFixed(1)} KB`);
}
