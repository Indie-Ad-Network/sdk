import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fromTcf, cmpConsent } from '../core/consent.js';
import { createHouseAds } from '../core/index.js';
import { forget } from '../core/history.js';

test("a consent platform's answer: not needed or agreed is yes, asked and not agreed is no, nothing said is nobody's word", () => {
  assert.equal(fromTcf(0, ''), true, 'the law does not ask here');
  assert.equal(fromTcf(1, '1000000000'), true, 'purpose 1, storing on the device, agreed');
  assert.equal(fromTcf(1, '0111111111'), false, 'everything but purpose 1');
  assert.equal(fromTcf(1, ''), false, 'asked, and nothing agreed');
  assert.equal(fromTcf('1', '1'), true, 'a number kept as text');
  assert.equal(fromTcf(null, '1'), null);
  assert.equal(fromTcf(undefined), null);
});

test("cmpConsent: an app shell's reader, else a browser's __tcfapi, else null; and it never throws", async () => {
  assert.equal(await cmpConsent({ consent: async () => ({ applies: 1, purposes: '10' }) }), true);
  assert.equal(await cmpConsent({ consent: async () => ({ applies: 1, purposes: '01' }) }), false);
  assert.equal(await cmpConsent({ consent: async () => ({ purposes: '' }) }), null, 'no platform has said');
  assert.equal(await cmpConsent({ consent: async () => { throw new Error('no plugin'); } }), null);
  assert.equal(await cmpConsent(), null, 'no platform here');
  const was = globalThis.__tcfapi;
  try {
    globalThis.__tcfapi = (cmd, v, cb) => cb({ gdprApplies: true, purpose: { consents: { 1: true } } }, true);
    assert.equal(await cmpConsent(), true);
    globalThis.__tcfapi = (cmd, v, cb) => cb({ gdprApplies: true, purpose: { consents: { 1: false, 2: true } } }, true);
    assert.equal(await cmpConsent(), false);
    globalThis.__tcfapi = (cmd, v, cb) => cb({ gdprApplies: false }, true);
    assert.equal(await cmpConsent(), true);
    globalThis.__tcfapi = (cmd, v, cb) => cb(null, false);
    assert.equal(await cmpConsent(), null);
  } finally { globalThis.__tcfapi = was; }
});

// a storage that says what was done to it
const recording = seed => { const m = new Map(Object.entries(seed)), wrote = []; return { wrote, get length() { return m.size; }, key: i => [...m.keys()][i] ?? null, getItem: k => m.get(k) ?? null, setItem: (k, v) => { wrote.push(k); m.set(k, String(v)); }, removeItem: k => { m.delete(k); }, keys: () => [...m.keys()] }; };
globalThis.document ??= { hidden: false, addEventListener() {} };
globalThis.innerWidth ??= 400; globalThis.innerHeight ??= 800;
const catalogue = { version: 1, apps: { a: { name: 'A', studio: 's', ios: { id: 1 } }, b: { name: 'B', studio: 't', ios: { id: 2 } } }, creatives: [{ id: 'b-15', app: 'b', kind: 'video', secs: 15, src: 'https://x.test/b.mp4' }] };

test("without consent nothing is kept: the game's storage is left alone but for what was kept before, which goes", async () => {
  const kept = recording({ 'houseAds.a': '{"shown":{}}', 'houseAds.outbox': '[]', 'houseAds.catalogue': '{}', 'the.games.own': 'save' });
  const ads = createHouseAds({ host: 'a', os: 'ios', catalogue, consent: false, storage: kept, ingest: 'https://x.test/e', fetch: async () => { throw new Error('offline'); }, placements: { tile: { maxSecs: 30 } } });
  ads.offered('tile'); await ads.demand('tile');
  await new Promise(ok => setTimeout(ok, 2200));   // past the moment the offer is sent, or put by for later
  assert.deepEqual(kept.keys(), ['the.games.own'], 'its own keys gone, the game\'s untouched');
  assert.deepEqual(kept.wrote, [], 'and nothing written since: an offer waiting to be sent waits in memory');
  const agreed = recording({});
  const yes = createHouseAds({ host: 'a', os: 'ios', catalogue, storage: agreed, cache: false, ingest: 'https://x.test/e', fetch: async () => { throw new Error('offline'); }, placements: { tile: { maxSecs: 30 } } });
  yes.offered('tile'); await yes.demand('tile');
  await new Promise(ok => setTimeout(ok, 2200));
  assert.ok(agreed.wrote.includes('houseAds.outbox'), 'with consent (the usual), as ever');
});

test('forget takes out only what is this package\'s own', () => {
  const s = recording({ 'houseAds.mix.a': '1', 'houseAdsNot': '2', other: '3', 'houseAds.catalogue.sig': '4' });
  forget(s);
  assert.deepEqual(s.keys(), ['houseAdsNot', 'other']);
});
