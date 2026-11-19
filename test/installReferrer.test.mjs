import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// One InstallReferrer.java, in each package that builds it: Capacitor's Gradle and Unity's each want it in their own place.
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test("Capacitor's and Unity's InstallReferrer.java are the same file", () => {
  assert.equal(read('unity/Runtime/Plugins/Android/InstallReferrer.java'), read('capacitor/android/src/main/java/com/indieadnetwork/sdk/InstallReferrer.java'), 'copy the one you changed over the other');
});
