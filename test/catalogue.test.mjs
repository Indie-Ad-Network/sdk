import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validate, loadCatalogue } from '../core/catalogue.js';
import { withShim, shim } from '../core/mraidShim.js';
import { openHistory, memoryStorage as memory } from '../core/history.js';
import { DAY } from '../core/pick.js';

const BASE = 'https://example.com/house-ads/catalogue.json';
const good = { apps: { tcb: { name: 'G1', icon: 'icons/tcb.jpg', ios: { id: 1 } } }, creatives: [{ id: 'a', app: 'tcb', kind: 'video', secs: 15, src: 'creatives/a.mp4', poster: 'creatives/a.jpg' }] };

test("paths are read against the catalogue's own URL", () => {
  const cat = validate(good, BASE);
  assert.equal(cat.creatives[0].src, 'https://example.com/house-ads/creatives/a.mp4');
  assert.equal(cat.creatives[0].poster, 'https://example.com/house-ads/creatives/a.jpg');
  assert.equal(cat.apps.tcb.icon, 'https://example.com/house-ads/icons/tcb.jpg');
  assert.equal(cat.apps.tcb.id, 'tcb');
});

test('a bad entry is dropped and named; the rest stands', () => {
  const cat = validate({
    apps: { ...good.apps, ghost: { name: 'On no store' }, nameless: { ios: { id: 2 } } },
    creatives: [...good.creatives, { id: 'a', app: 'tcb', kind: 'video', secs: 15, src: 'x' }, { id: 'b', app: 'ghost', kind: 'video', secs: 15, src: 'x' },
      { id: 'c', app: 'tcb', kind: 'banner', secs: 15, src: 'x' }, { id: 'd', app: 'tcb', kind: 'video', secs: 90, src: 'x' }, { id: 'e', app: 'tcb', kind: 'video', secs: 15 },
      { id: 'f', app: 'tcb', kind: 'video', secs: 15, src: 'x', from: 'soon' }, { id: 'g', app: 'tcb', kind: 'video', secs: 15, src: 'x', aspect: '4:3' }, { app: 'tcb' }],
  }, BASE);
  assert.deepEqual(cat.creatives.map(c => c.id), ['a']);
  assert.deepEqual(Object.keys(cat.apps), ['tcb']);
  assert.equal(cat.dropped.length, 10);
  assert.deepEqual(validate(null).creatives, []);
});

const answer = body => async () => ({ ok: true, text: async () => JSON.stringify(body) });
const down = async () => { throw new Error('offline'); };

test("loading keeps the server's last good copy, and falls back to it", async () => {
  const storage = memory(), load = (fetch, more) => loadCatalogue({ url: BASE, fetch, storage, ...more });
  assert.equal((await load(answer(good))).creatives.length, 1);
  assert.equal((await load(down)).creatives[0].id, 'a');
  assert.equal((await load(async () => ({ ok: false, status: 404 }))).creatives.length, 1);
  assert.equal((await load(answer({ apps: {}, creatives: [] }))).creatives.length, 1, 'an emptied file keeps the copy');
  assert.equal((await load(down, { storage: memory() })).creatives.length, 0, 'nothing at all: empty, not an error');
  const hung = (url, { signal }) => new Promise((_, no) => signal.addEventListener('abort', () => no(new Error('aborted'))));
  assert.equal((await load(hung, { timeout: 20 })).creatives.length, 1, 'a hung request is given up on');
});

test("the order: the server's, then the copy last fetched from it, then the one shipped with the game", async () => {
  const storage = memory(), SHIPPED = 'https://game.example/ads/catalogue.json';
  const newer = { ...good, creatives: [{ ...good.creatives[0], id: 'newer' }] };
  const only = (up, body) => async url => { if (url !== up) throw new Error('offline'); return { ok: true, text: async () => JSON.stringify(body) }; };
  const load = fetch => loadCatalogue({ url: BASE, fallback: SHIPPED, fetch, storage });
  // a first run with the server away: the shipped one, its paths its own, and it isn't kept as the server's
  const first = await load(only(SHIPPED, good));
  assert.equal(first.creatives[0].src, 'https://game.example/ads/creatives/a.mp4');
  assert.equal(storage.getItem('houseAds.catalogue'), null);
  // the server answers: its catalogue, kept
  assert.equal((await load(only(BASE, newer))).creatives[0].id, 'newer');
  // offline after that: the server's copy, not the older shipped one
  const offline = await load(only(SHIPPED, good));
  assert.equal(offline.creatives[0].id, 'newer');
  assert.equal(offline.creatives[0].src, 'https://example.com/house-ads/creatives/a.mp4');
});

test("with a catalogue in hand, a server that answers nothing is waited on briefly, and what it sends late is kept", async () => {
  const storage = memory(), newer = { ...good, creatives: [{ ...good.creatives[0], id: 'newer' }] };
  await loadCatalogue({ url: BASE, fetch: answer(good), storage });
  let reply;
  const slow = () => new Promise(ok => { reply = () => ok({ ok: true, text: async () => JSON.stringify(newer) }); });
  const began = Date.now(), cat = await loadCatalogue({ url: BASE, fetch: slow, storage, patience: 20, timeout: 5000 });
  assert.equal(cat.creatives[0].id, 'a', 'the copy, not the wait');
  assert.ok(Date.now() - began < 1000);
  reply(); await new Promise(ok => setTimeout(ok, 5));
  assert.equal((await loadCatalogue({ url: BASE, fetch: down, storage })).creatives[0].id, 'newer', 'kept for next time');
  // one shipped as an object is in hand too; with nothing in hand, the server has its whole time
  assert.equal((await loadCatalogue({ url: BASE, fallback: good, fetch: slow, storage: memory(), patience: 20, timeout: 5000 })).creatives[0].id, 'a');
  const none = loadCatalogue({ url: BASE, fetch: slow, storage: memory(), patience: 20, timeout: 5000 });
  await new Promise(ok => setTimeout(ok, 60)); reply();
  assert.equal((await none).creatives[0].id, 'newer');
});

test("what's read as a list or a number and isn't one drops its creative, not every ad", () => {
  const c = more => ({ ...good.creatives[0], ...more });
  const cat = validate({ ...good, creatives: [c({ id: 'l', langs: 'fr' }), c({ id: 'h', hosts: 'tca' }), c({ id: 'n', langs: [1] }), c({ id: 'w', weight: '2' }), c({ id: 'b', bytes: '4000' }), c({ id: 'ok', langs: ['fr'], hosts: ['tca'], weight: 0, capPerDay: 3, bytes: 4000 })] }, BASE);
  assert.deepEqual(cat.creatives.map(x => x.id), ['ok']);
  assert.deepEqual(cat.dropped, ['creative l: langs must be a list of strings', 'creative h: hosts must be a list of strings', 'creative n: langs must be a list of strings', 'creative w: weight must be a number, 0 or more', 'creative b: bytes must be a number, 0 or more']);
});

test("the shim says 'ready' to each who asks, once, however many ask", async () => {
  const saved = Object.fromEntries(['window', 'parent', 'addEventListener', 'innerWidth', 'innerHeight'].map(k => [k, Object.getOwnPropertyDescriptor(globalThis, k)]));
  const win = { localStorage: { length: 0 }, sessionStorage: { length: 0 } };
  Object.assign(globalThis, { window: win, parent: { postMessage() {} }, addEventListener() {}, innerWidth: 320, innerHeight: 480 });
  try {
    shim();
    const heard = [];
    win.mraid.addEventListener('ready', () => heard.push('engine'));
    win.mraid.addEventListener('ready', () => heard.push('wrapper'));
    const gone = () => heard.push('gone'); win.mraid.addEventListener('ready', gone); win.mraid.removeEventListener('ready', gone);
    await new Promise(ok => setTimeout(ok, 5));
    assert.deepEqual(heard, ['engine', 'wrapper']);
  } finally { for (const [k, d] of Object.entries(saved)) if (d) Object.defineProperty(globalThis, k, d); else delete globalThis[k]; }
});

test("the shim goes in ahead of the playable's own scripts, and the network's mraid.js tag comes out", () => {
  const out = withShim('<!DOCTYPE html><html><head><meta charset="utf-8"><script src="mraid.js"></script><script>go()</script></head></html>');
  assert.ok(!out.includes('src="mraid.js"'));
  assert.ok(out.startsWith('<!DOCTYPE html><html><head><script>(function shim()'));
  assert.ok(out.indexOf('window.mraid') < out.indexOf('go()'));
  assert.ok(withShim('<div>bare</div>').startsWith('<script>'));
  assert.ok(withShim('<!doctype html><p>').startsWith('<!doctype html><script>'), 'never ahead of the doctype');
});

test('history: showings a day old stop counting; the last shown and the watched are kept', () => {
  const storage = memory(), h = openHistory(storage, 'houseAds.tca'), T = 1e12;
  h.shown('a', T); h.shown('b', T + 1000); h.shown('a', T + DAY + 500); h.watched('tcb'); h.watched('tcb');
  const back = openHistory(storage, 'houseAds.tca').get();
  assert.deepEqual(back, { shown: { b: [T + 1000], a: [T + DAY + 500] }, last: 'a', watched: { tcb: 2 }, apps: {} });
});

test("history: a game shown `after` times with no store tap rests, longer each time; a tap starts it over", () => {
  const storage = memory(), h = openHistory(storage, 'houseAds.tca'), T = 1e12, fatigue = { after: 3, rest: 14, grow: 2 };
  const show = (n, at) => { for (let i = 0; i < n; i++) h.shown('x', at + i, { app: 'tcb', fatigue }); };
  show(2, T);
  assert.deepEqual(h.get().apps.tcb, { n: 2, rests: 0, until: 0 });
  show(1, T + 10);
  assert.deepEqual(h.get().apps.tcb, { n: 0, rests: 1, until: T + 10 + 14 * DAY });
  show(3, T + 20 * DAY);
  assert.equal(h.get().apps.tcb.until, T + 20 * DAY + 2 + 28 * DAY);
  for (let k = 0; k < 6; k++) show(3, T + (k + 50) * DAY);
  assert.equal(h.get().apps.tcb.until, T + 55 * DAY + 2 + 180 * DAY, 'never longer than MAX_REST');
  h.tapped('tcb');
  assert.equal(openHistory(storage, 'houseAds.tca').get().apps.tcb, undefined);
  h.shown('y', T, { app: 'pr' });
  assert.equal(h.get().apps.pr, undefined, 'no fatigue given: nothing counted');
  h.shown('y', T, { app: 'pr', fatigue: { ...fatigue, after: 0 } });
  assert.equal(h.get().apps.pr, undefined, 'after: 0 is off');
});

test("a game on neither store stands if it has a page of its own, https; a page that isn't is left off a game that is on one", () => {
  const cat = validate({ apps: { proto: { name: 'Prototype', web: { url: 'https://studio.example/playtest', label: 'playtest' } }, bad: { name: 'Bad', web: { url: 'javascript:alert(1)' } },
    half: { name: 'Half', ios: { id: 1 }, web: { url: 'http://plain.example' } } }, creatives: [] }, BASE);
  assert.deepEqual(cat.apps.proto.web, { url: 'https://studio.example/playtest', label: 'playtest' });
  assert.equal('web' in cat.apps.half, false);
  assert.deepEqual(cat.dropped, ['app bad: on neither store, and no page of its own']);
});

test('a signed catalogue: the server signs, the game checks, and what is not the network\'s is as no answer', async () => {
  // as the network's server signs (SERVER.md): r and s over the text, base64url; and the public point of a secret
  const ECDSA = { name: 'ECDSA', namedCurve: 'P-256' }, secretOf = s => crypto.subtle.importKey('pkcs8', Buffer.from(s, 'base64'), ECDSA, true, ['sign']);
  const sign = async (secret, text) => Buffer.from(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, await secretOf(secret), new TextEncoder().encode(text))).toString('base64url');
  const publicKey = async secret => { const { d, ...open } = await crypto.subtle.exportKey('jwk', await secretOf(secret)); return Buffer.from(await crypto.subtle.exportKey('raw', await crypto.subtle.importKey('jwk', { ...open, key_ops: ['verify'] }, ECDSA, true, ['verify']))).toString('base64url'); };
  const { signedBy, loadCatalogue, SIGNATURE } = await import('../core/catalogue.js');
  const { memoryStorage } = await import('../core/history.js');
  const pair = async () => { const p = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']); return Buffer.from(await crypto.subtle.exportKey('pkcs8', p.privateKey)).toString('base64'); };
  const secret = await pair(), key = await publicKey(secret), other = await publicKey(await pair());
  const cat = name => JSON.stringify({ apps: { a: { name, ios: { id: 1 } } }, creatives: [{ id: 'one', app: 'a', kind: 'video', secs: 15, src: 'one.mp4' }] });
  const ours = cat('Ours'), sig = await sign(secret, ours);
  assert.equal(key.length, 87);
  assert.equal(await signedBy(key, ours, sig), true);
  for (const [k, t, s] of [[key, cat('Theirs'), sig], [other, ours, sig], [key, ours, ''], [key, ours, 'not a signature'], ['', ours, sig]]) assert.equal(await signedBy(k, t, s), false);

  const url = 'https://ads.example/catalogue.json', storage = memoryStorage();
  const server = (text, s) => async () => ({ ok: true, text: async () => text, headers: { get: h => h === SIGNATURE ? s : null } });
  const name = async (fetch, more) => Object.values((await loadCatalogue({ url, fetch, storage, signedBy: key, ...more })).apps)[0]?.name ?? null;
  assert.equal(await name(server(cat('Theirs'), sig)), null);                 // a middleman's catalogue under our signature: nothing
  assert.equal(await name(server(cat('Theirs'), null)), null);                // or under none
  assert.equal(await name(server(cat('Theirs'), null), { fallback: JSON.parse(cat('Shipped')) }), 'Shipped');   // the game's own, which it trusts as itself
  assert.equal(await name(server(ours, sig)), 'Ours');
  assert.equal(await name(server(cat('Theirs'), await sign(await pair(), cat('Theirs')))), 'Ours');   // signed, by someone else: the copy kept
  storage.setItem('houseAds.catalogue', cat('Theirs'));                       // a copy written over on the device: not ours either
  assert.equal(await name(async () => { throw new Error('offline'); }), null);
  assert.equal(Object.values((await loadCatalogue({ url, fetch: server(cat('Anyone'), null), storage: memoryStorage() })).apps)[0].name, 'Anyone');
  // the key from the catalogue the game shipped with, and never from the one the server sends
  const { createHouseAds } = await import('../core/index.js');
  const first = async (shipped, fetch) => Object.values((await createHouseAds({ host: 'h', catalogue: [url, shipped], storage: memoryStorage(), cache: false, fetch }).catalogue).apps)[0].name;
  const withKey = { ...JSON.parse(cat('Shipped')), signedBy: key }, theirs = JSON.stringify({ ...JSON.parse(cat('Theirs')), signedBy: other });
  assert.equal(await first(withKey, server(ours, sig)), 'Ours');
  assert.equal(await first(withKey, server(theirs, await sign(await pair(), theirs))), 'Shipped');
  assert.equal(await first(JSON.parse(cat('Shipped')), server(theirs, null)), 'Theirs');   // no key anywhere: as before   // a game with no key takes it as before
});

test('nothing over http: not the catalogue, not a file or link it names, not the ingest', async () => {
  const { secure, loadCatalogue } = await import('../core/catalogue.js');
  const { memoryStorage } = await import('../core/history.js');
  for (const ok of ['https://a.example/c.json', 'http://localhost:8787/c.json', 'http://127.0.0.1/c.json', 'capacitor://localhost/c.json', 'f/one.mp4']) assert.equal(secure(ok), true, ok);
  for (const no of ['http://a.example/c.json', 'HTTP://A.EXAMPLE/', 'http://localhost.evil.example/']) assert.equal(secure(no), false, no);
  let asked = 0;
  const raw = { apps: { a: { name: 'A', ios: { id: 1 }, icon: 'http://cdn.example/i.png', tracking: 'http://t.example/c' }, b: { name: 'B', ios: { id: 2 }, tracking: { ios: 'https://t.example/c' } } },
    creatives: [{ id: 'plain', app: 'a', kind: 'video', secs: 15, src: 'http://cdn.example/v.mp4' }, { id: 'fine', app: 'a', kind: 'video', secs: 15, src: 'v.mp4', poster: 'http://cdn.example/p.jpg' }] };
  const fetch = async () => { asked++; return { ok: true, text: async () => JSON.stringify(raw), headers: { get: () => null } }; };
  assert.equal((await loadCatalogue({ url: 'http://ads.example/catalogue.json', fetch, storage: memoryStorage() })).creatives.length, 0);
  assert.equal(asked, 0);
  const cat = await loadCatalogue({ url: 'https://ads.example/catalogue.json', fetch, storage: memoryStorage() });
  assert.deepEqual(cat.creatives.map(c => [c.id, c.src, c.poster]), [['fine', 'https://ads.example/v.mp4', null]]);
  assert.deepEqual([cat.apps.a.icon, cat.apps.a.tracking, cat.apps.b.tracking], [null, undefined, { ios: 'https://t.example/c' }]);
  const { createHouseAds } = await import('../core/index.js');
  const went = [], ads = createHouseAds({ host: 'h', catalogue: { apps: {}, creatives: [] }, ingest: 'http://ingest.example/e', mix: 'http://ingest.example/mix', storage: memoryStorage(), cache: false, fetch: async u => { went.push(String(u)); return { ok: false }; } });
  const quiet = console.error; console.error = () => {}; try { ads.offered('p'); await new Promise(r => setTimeout(r, 2200)); } finally { console.error = quiet; }
  assert.deepEqual(went, []);
});
