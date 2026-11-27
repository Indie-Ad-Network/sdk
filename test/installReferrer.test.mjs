import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// One InstallReferrer.java, in each package that builds it: Capacitor's Gradle, the native SDK's and Unity's each want it in their own place.
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test("Capacitor's, the native Android SDK's and Unity's InstallReferrer.java are the same file", () => {
  const unity = read('unity/Runtime/Plugins/Android/InstallReferrer.java');
  assert.equal(unity, read('capacitor/android/src/main/java/com/indieadnetwork/sdk/InstallReferrer.java'), 'capacitor: copy the one you changed over the others');
  assert.equal(unity, read('android/indieads/src/main/java/com/indieadnetwork/sdk/InstallReferrer.java'), 'android: copy the one you changed over the others');
});
