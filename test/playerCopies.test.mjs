import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// tools/build-player.mjs writes the one player page twice: for the Unity package (which the native Android SDK copies
// as it builds) and for the native iOS SDK, whose files a game drags in. `node tools/build-player.mjs --check` says
// whether they're stale; this, without esbuild, that they're the same page.
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test("the iOS SDK's player is the Unity package's", () => {
  assert.equal(read('ios/IndieAds/IndieAdsPlayer.html'), read('unity/Runtime/Resources/IndieAdsPlayer.html'), 'run node tools/build-player.mjs');
});
