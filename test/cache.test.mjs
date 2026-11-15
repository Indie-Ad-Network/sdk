import { test } from 'node:test';
import assert from 'node:assert/strict';
import { plan, sameFile, openCache } from '../core/cache.js';
import { wanted } from '../core/pick.js';
import { validate } from '../core/catalogue.js';

const MB = 1e6;
const c = (id, bytes, more) => ({ id, src: `https://x/${id}`, bytes: bytes * MB, ...more });
const e = (id, bytes, at, more) => ({ id, src: `https://x/${id}`, sha256: null, bytes: bytes * MB, at, ...more });

test('the same file: by its sha256 when the catalogue gives one, wherever it lives; else by its URL', () => {
  assert.ok(sameFile({ src: 'https://old/a.mp4', sha256: 'abc' }, { src: 'https://new/a.mp4', sha256: 'abc' }));
  assert.ok(!sameFile({ src: 'https://x/a.mp4', sha256: 'abc' }, { src: 'https://x/a.mp4', sha256: 'def' }));
  assert.ok(sameFile({ src: 'https://x/a.mp4', sha256: null }, { src: 'https://x/a.mp4' }));
  assert.ok(!sameFile({ src: 'https://old/a.mp4', sha256: null }, { src: 'https://new/a.mp4' }));
});

test('fetch what is wanted and not here, in order; leave the rest alone', () => {
  const creatives = [c('a', 4), c('b', 8), c('d', 4)];
  assert.deepEqual(plan({ entries: [e('a', 4, 1)], creatives, wanted: [creatives[1], creatives[0], creatives[2]] }), { drop: [], fetch: [creatives[1], creatives[2]] });
});

test('what left the catalogue, or changed its file, goes', () => {
  const creatives = [c('a', 4, { sha256: 'new' }), c('b', 8)];
  const out = plan({ entries: [e('a', 4, 1, { sha256: 'old' }), e('gone', 4, 2), e('b', 8, 3)], creatives, wanted: [creatives[0]] });
  assert.deepEqual(out, { drop: ['a', 'gone'], fetch: [creatives[0]] });
});

test('room is made from the unwanted shown longest ago, and only as much as is needed', () => {
  const creatives = [c('a', 20), c('b', 20), c('d', 20), c('n', 25)];
  const entries = [e('a', 20, 300), e('b', 20, 100), e('d', 20, 200)];
  assert.deepEqual(plan({ entries, creatives, wanted: [creatives[3]], budget: 60 * MB }), { drop: ['b', 'd'], fetch: [creatives[3]] });
  assert.deepEqual(plan({ entries, creatives, wanted: [creatives[3]], budget: 90 * MB }), { drop: [], fetch: [creatives[3]] });
});

test('a wanted one is never dropped for another; one that will not fit waits, a smaller one behind it does not', () => {
  const creatives = [c('a', 30), c('b', 30), c('big', 40), c('small', 5)];
  const entries = [e('a', 30, 1), e('b', 25, 2)];
  assert.deepEqual(plan({ entries, creatives, wanted: [creatives[0], creatives[1], creatives[2], creatives[3]], budget: 60 * MB }), { drop: [], fetch: [creatives[3]] });
});

test('a size the catalogue does not say is taken as a 30 s video', () => {
  const creatives = [{ id: 'a', src: 'https://x/a' }, { id: 'b', src: 'https://x/b' }];
  assert.deepEqual(plan({ entries: [], creatives, wanted: creatives, budget: 10 * MB }).fetch, [creatives[0]]);
});

test("wanted: every placement's likeliest first, then the likeliest of the rest, `keep` in all", () => {
  const cat = validate({
    apps: { tcb: { name: 'G1', own: true, ios: { id: 1 } }, rodeo: { name: 'Rodeo', ios: { id: 2 } } },
    creatives: [
      { id: 'tcb-30', app: 'tcb', kind: 'video', secs: 30, src: 'a', weight: 3 },
      { id: 'tcb-play', app: 'tcb', kind: 'playable', secs: 30, src: 'b', weight: 2 },
      { id: 'rodeo-15', app: 'rodeo', kind: 'video', secs: 15, src: 'c' },
      { id: 'tcb-15', app: 'tcb', kind: 'video', secs: 15, src: 'd', weight: 0.25 },
    ],
  });
  const base = { catalogue: cat, host: 'tca', now: 0 };
  const ids = o => wanted({ ...base, ...o }).map(x => x.id);
  assert.deepEqual(ids({}), ['tcb-30', 'tcb-play', 'rodeo-15']);
  // the 15 s placement can only take the short ones: its best is kept, though two longer ones outweigh it
  assert.deepEqual(ids({ placements: { saveMe: { maxSecs: 30 }, jobs: { maxSecs: 15 } }, keep: 2 }), ['tcb-30', 'rodeo-15']);
  assert.deepEqual(ids({ placements: { saveMe: { maxSecs: 30 }, jobs: { maxSecs: 15 } } }), ['tcb-30', 'rodeo-15', 'tcb-play']);
  assert.deepEqual(ids({ installed: new Set(['tcb']) }), ['rodeo-15']);
});

// As much of IndexedDB as the cache uses: two stores, requests that succeed a moment later.
function fakeIndexedDB() {
  const stores = {};
  const later = (req, result) => { queueMicrotask(() => { req.result = result; req.onsuccess?.(); }); return req; };
  const store = name => ({
    getAll: () => later({}, [...stores[name].values()]), get: key => later({}, stores[name].get(key)),
    put: (value, key = value.id) => { stores[name].set(key, value); return later({}); }, delete: key => { stores[name].delete(key); return later({}); },
  });
  const db = { createObjectStore: name => { stores[name] = new Map(); }, transaction: () => { const tx = { objectStore: store }; setTimeout(() => tx.oncomplete?.()); return tx; } };
  return { open: () => { const req = {}; queueMicrotask(() => { req.result = db; if (!Object.keys(stores).length) req.onupgradeneeded?.(); req.onsuccess?.(); }); return req; } };
}

test('a fill with nothing to do does not stand in for every fill after it', async () => {
  const had = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB');
  Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: fakeIndexedDB() });
  try {
    const asked = [], creatives = [c('a', 1), c('b', 1)];
    const fetch = async url => { asked.push(url); return { ok: true, blob: async () => new Blob([new ArrayBuffer(MB)], { type: 'video/mp4' }) }; };
    const cache = await openCache({ fetch });
    assert.deepEqual(await cache.fill({ creatives, wanted: [] }), [], 'nothing wanted: nothing to do');
    assert.deepEqual(await cache.fill({ creatives, wanted: [creatives[0]] }), ['a']);
    assert.deepEqual(await cache.fill({ creatives, wanted: [creatives[0]] }), [], 'here already');
    assert.deepEqual(await cache.fill({ creatives, wanted: creatives }), ['b'], 'and the next one still comes');
    assert.ok(cache.has(creatives[0]) && cache.has(creatives[1]));
    assert.deepEqual(asked, ['https://x/a', 'https://x/b']);
    // while one is under way, it is the one returned
    const more = [...creatives, c('d', 1)], first = cache.fill({ creatives: more, wanted: more });
    assert.equal(cache.fill({ creatives: more, wanted: more }), first);
    assert.deepEqual(await first, ['d']);
  } finally { if (had) Object.defineProperty(globalThis, 'indexedDB', had); else delete globalThis.indexedDB; }
});
