import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mix, settings, believed, turn } from '../core/exchange.js';
import { validate } from '../core/catalogue.js';
import { pick, eligible, cardFor } from '../core/pick.js';
import { createHouseAds } from '../core/index.js';
import { memoryStorage } from '../core/history.js';

const raw = {
  exchange: { share: 0.1, max: 0.6, full: 1000, hosts: { tca: { share: 0.2 } } },
  apps: {
    tcb: { name: 'Game One', studio: 'Voxel', own: true, ios: { id: 1 } },
    tca: { name: 'Game Two', studio: 'Voxel', own: true, ios: { id: 2 } },
    pone: { name: 'Partner One', studio: 'Super', ios: { id: 3 } },
    rodeo: { name: 'Partner Two', studio: 'StudioB', ios: { id: 4 } },
  },
  creatives: [
    { id: 'tca-15', app: 'tca', kind: 'video', secs: 15, src: 'a.mp4' },
    { id: 'pone-15', app: 'pone', kind: 'video', secs: 15, src: 'b.mp4' },
    { id: 'rodeo-15', app: 'rodeo', kind: 'video', secs: 15, src: 'c.mp4' },
  ],
};
const catalogue = validate(raw);

test('a catalogue that says nothing asks for nothing; a host may have its own settings', () => {
  assert.equal(settings(validate({ apps: {}, creatives: [] }), 'tcb').share, 0);
  assert.deepEqual(settings(catalogue, 'tcb'), { share: 0.1, max: 0.6, full: 1000, days: 30, perDay: null, fatigue: { after: 6, rest: 14, grow: 2 } });
  assert.equal(settings(catalogue, 'tca').share, 0.2);
  assert.equal(settings(validate({ ...raw, exchange: { share: 7, max: -1 } }), 'tcb').share, 1);
});

test('owing no one, the share is the floor', () => {
  assert.deepEqual(mix({ catalogue, host: 'tcb' }), { share: 0.1, owed: 0, owedTo: [], boost: {}, placements: {} });
  // our own games in our own games are no one's debt
  assert.equal(mix({ catalogue, host: 'tcb', rows: [{ host: 'tca', app: 'tcb', shows: 5000 }] }).share, 0.1);
});

test('shown more by another studio than we have shown theirs: the share rises with the debt, to the max', () => {
  const half = mix({ catalogue, host: 'tcb', rows: [{ host: 'pone', app: 'tcb', shows: 700 }, { host: 'tca', app: 'pone', shows: 200 }] });
  assert.equal(half.owed, 500);
  assert.equal(half.share, 0.35);
  assert.deepEqual(half.boost, { pone: 2.5 });   // the game we owe is likelier to be the one shown
  assert.equal(mix({ catalogue, host: 'tcb', rows: [{ host: 'pone', app: 'tca', shows: 9000 }] }).share, 0.6);
});

test('what one studio owes us is no credit against what we owe another', () => {
  const m = mix({ catalogue, host: 'tcb', rows: [{ host: 'tcb', app: 'rodeo', shows: 800 }, { host: 'pone', app: 'tcb', shows: 300 }] });
  assert.equal(m.owed, 300);
  assert.deepEqual(Object.keys(m.boost), ['pone']);
});

test("a server's answer is believed only as far as it's a share and some weights", () => {
  assert.equal(believed({ share: 'lots' }), null);
  assert.deepEqual(believed({ share: 3, boost: { a: 99, b: 'x', c: 2 } }), { share: 1, boost: { a: 4, c: 2 }, placements: {}, owedTo: ['a', 'c'] });
  assert.deepEqual(believed({ share: 0.1, placements: { a: 0, b: 2, c: 'x' } }).placements, { a: 0, b: 1 });
});

const placed = validate({ ...raw, exchange: { share: 0.1, max: 0.6, full: 1000, perDay: 4, fatigue: { after: 5 },
  hosts: { tcb: { share: 0.2, perDay: 2, fatigue: { rest: 7 }, placements: { coins: { share: 0 }, between: { share: 0.3, max: 0.5 }, ramp: { max: 0.9 } } } } } });

test("a placement's own share: held where given alone, rising to its own max where given one", () => {
  assert.equal(settings(placed, 'tcb', 'coins').share, 0);
  assert.equal(settings(placed, 'tcb', 'coins').max, 0);
  assert.equal(settings(placed, 'tcb', 'elsewhere').share, 0.2);
  assert.deepEqual(mix({ catalogue: placed, host: 'tcb' }).placements, { coins: 0, between: 0.3, ramp: 0.2 });
  const owed = mix({ catalogue: placed, host: 'tcb', rows: [{ host: 'pone', app: 'tcb', shows: 9000 }] });
  assert.deepEqual([owed.share, owed.placements], [0.6, { coins: 0, between: 0.5, ramp: 0.9 }]);
  assert.deepEqual(mix({ catalogue: placed, host: 'tca' }).placements, {}, "another host's placements are its own");
});

test('a day\'s limit and fatigue: the network\'s, a host\'s over it', () => {
  assert.deepEqual([settings(placed, 'tcb').perDay, settings(placed, 'tcb').fatigue], [2, { after: 5, rest: 7, grow: 2 }]);
  assert.deepEqual([settings(placed, 'tca').perDay, settings(placed, 'tca').fatigue], [4, { after: 5, rest: 14, grow: 2 }]);
  assert.equal(settings(validate({ ...raw, exchange: { fatigue: { rest: 9999, grow: 0 } } }), 'tcb').fatigue.rest, 180);
});

test("the day's limit: once a player has seen it, nothing more today; a test is no player", () => {
  const now = Date.UTC(2026, 10, 11), o = { catalogue: placed, host: 'tcb', now, perDay: 2 };
  assert.equal(eligible({ ...o, history: { shown: { 'pone-15': [now - 1000] } } }).length, 3);
  assert.equal(eligible({ ...o, history: { shown: { 'pone-15': [now - 1000], 'rodeo-15': [now - 2000] } } }).length, 0);
  assert.equal(eligible({ ...o, history: { shown: { 'pone-15': [now - 864e5 - 1], 'rodeo-15': [now - 2000] } } }).length, 3, 'a day on, it counts no more');
  assert.equal(eligible({ ...o, test: true, history: { shown: { 'pone-15': [now - 1000], 'rodeo-15': [now - 2000] } } }).length, 3);
});

test('a resting game is shown nowhere, nor on the still card, until its rest is over', () => {
  const now = Date.UTC(2026, 10, 11), history = { shown: {}, apps: { pone: { n: 0, rests: 1, until: now + 1000 } } };
  const ids = o => eligible({ catalogue, host: 'tcb', now, history, ...o }).map(c => c.id);
  assert.deepEqual(ids(), ['tca-15', 'rodeo-15']);
  assert.deepEqual(ids({ now: now + 1000 }), ['tca-15', 'pone-15', 'rodeo-15']);
  assert.deepEqual(ids({ test: true }), ['tca-15', 'pone-15', 'rodeo-15']);
  assert.notEqual(cardFor({ catalogue, host: 'tcb', now, history })?.app, 'pone');
});

test('a boosted game is picked more often', () => {
  const o = { catalogue, host: 'tcb', now: Date.UTC(2026, 10, 11) };
  const count = boost => { let n = 0, i = 0; const rand = () => (i++ % 100) / 100; for (let k = 0; k < 100; k++) if (pick({ ...o, boost, rand }).app === 'pone') n++; return n; };
  assert.ok(count({ pone: 4 }) > count({}) + 20);
});

// ---- demand(): the question a host with other ads asks ----
globalThis.document ??= { hidden: false, addEventListener() {} };
globalThis.innerWidth ??= 400; globalThis.innerHeight ??= 800;
const ads = more => createHouseAds({ host: 'tcb', os: 'ios', catalogue: raw, cache: false, storage: memoryStorage(), fetch: async () => { throw new Error('offline'); },
  placements: { tile: { maxSecs: 30 }, short: { maxSecs: 10 } }, ...more });

test('demand: what this player could be shown here, and the share asked for; no share of nothing', async () => {
  assert.deepEqual(await ads().demand('tile'), { share: 0.1, available: 3, apps: ['tca', 'pone', 'rodeo'], owed: [] });
  assert.deepEqual(await ads().demand('short'), { share: 0, available: 0, apps: [], owed: [] });
  const all = { isInstalled: async () => true };   // a shell from 0.5.0 or before, which could say what's on the device: not asked
  assert.deepEqual(await ads({ native: all }).demand('tile'), { share: 0.1, available: 3, apps: ['tca', 'pone', 'rodeo'], owed: [] });
});

test("demand: the ingest's answer when there is one, the last it gave when there isn't", async () => {
  const storage = memoryStorage();
  const answering = async url => String(url).includes('/mix?host=tcb') ? { ok: true, json: async () => ({ share: 0.5, boost: { pone: 3 } }) } : Promise.reject(new Error('offline'));
  assert.equal((await ads({ mix: 'https://x.test/mix', fetch: answering, storage }).demand('tile')).share, 0.5);
  assert.equal((await ads({ mix: 'https://x.test/mix', storage }).demand('tile')).share, 0.5);
  assert.equal((await ads({ mix: 'https://x.test/mix' }).demand('tile')).share, 0.1);
});

test("demand: a placement's own share; nothing once today's limit is seen, or every game rests", async () => {
  const placedAds = more => ads({ catalogue: { ...raw, exchange: { share: 0.1, hosts: { tcb: { perDay: 1, placements: { tile: { share: 0 } } } } } }, ...more });
  assert.equal((await placedAds().demand('tile')).share, 0);
  assert.equal((await placedAds({ placements: { other: { maxSecs: 30 } } }).demand('other')).share, 0.1);
  const seen = memoryStorage(); seen.setItem('houseAds.tcb', JSON.stringify({ shown: { 'pone-15': [Date.now() - 1000] } }));
  assert.deepEqual(await placedAds({ storage: seen, placements: { other: { maxSecs: 30 } } }).demand('other'), { share: 0, available: 0, apps: [], owed: [] });
  const tired = memoryStorage(), until = Date.now() + 864e5;
  tired.setItem('houseAds.tcb', JSON.stringify({ apps: { tca: { until }, pone: { until }, rodeo: { until } } }));
  assert.deepEqual(await ads({ storage: tired }).demand('tile'), { share: 0, available: 0, apps: [], owed: [] });
  const placedMix = async url => String(url).includes('/mix') ? { ok: true, json: async () => ({ share: 0.5, placements: { tile: 0.05 } }) } : Promise.reject(new Error('offline'));
  assert.equal((await ads({ mix: 'https://x.test/mix', fetch: placedMix }).demand('tile')).share, 0.05);
  assert.equal((await ads({ mix: 'https://x.test/mix', fetch: placedMix }).demand('short')).share, 0, 'nothing available: no share');
});

// ---- a host with a paid network too: whose slot it is ----
test('turn: a game owed comes first, then the share by chance, else the paid network; nothing ready is always the paid network', () => {
  assert.equal(turn({ share: 0, available: 2, owed: ['pone'] }, () => 0.99), 'owed', 'whatever the share');
  assert.equal(turn({ share: 0.3, available: 2, owed: [] }, () => 0.29), 'share');
  assert.equal(turn({ share: 0.3, available: 2, owed: [] }, () => 0.3), null);
  assert.equal(turn({ share: 1, available: 0, owed: [] }, () => 0), null);
  assert.equal(turn(null), null);
});

const owing = async url => String(url).includes('/mix') ? { ok: true, json: async () => ({ share: 0.1, owedTo: ['pone'], boost: { pone: 1 } }) } : Promise.reject(new Error('offline'));
test('demand: the games owed showings, of those this player could be shown', async () => {
  assert.deepEqual((await ads({ mix: 'https://x.test/mix', fetch: owing }).demand('tile')).owed, ['pone']);
  const older = async url => String(url).includes('/mix') ? { ok: true, json: async () => ({ share: 0.1, boost: { pone: 2.5, rodeo: 1 } }) } : Promise.reject(new Error('offline'));
  assert.deepEqual((await ads({ mix: 'https://x.test/mix', fetch: older }).demand('tile')).owed, ['pone'], 'a server from before owedTo: those it made likelier');
  assert.equal(pick({ catalogue, host: 'tcb', now: Date.UTC(2026, 10, 11), among: new Set(['pone']), rand: () => 0 }).app, 'pone', 'the game owed, not merely likelier');
});

test("a game owed goes first only within the limits: its creatives' caps, its rest, the player's perDay", async () => {
  const mixUrl = 'https://x.test/mix', t = Date.now() - 1000;
  const stored = history => { const s = memoryStorage(); s.setItem('houseAds.tcb', JSON.stringify(history)); return s; };
  // what demand() says is owed, and whose the slot then is (the roll is not the house's: share 0.1)
  const slot = async more => {
    let asked = 0;
    const o = { mix: mixUrl, fetch: owing, rand: () => 0.5, ...more };
    const { owed } = await ads(o).demand('tile');
    const out = owed.length ? null : await ads(o).show('tile', { paid: async () => { asked++; return { granted: true }; } });
    return [owed, out?.via ?? null, asked];
  };
  assert.deepEqual(await slot(), [['pone'], null, 0], 'owed, and within every limit: first');
  assert.deepEqual(await slot({ storage: stored({ shown: { 'pone-15': [t] } }) }), [['pone'], null, 0], 'shown once today, of 2');
  assert.deepEqual(await slot({ storage: stored({ shown: { 'pone-15': [t, t] } }) }), [[], 'paid', 1], 'its only creative has been shown as often as it may be today');
  const capped = { ...raw, creatives: raw.creatives.map(c => c.app === 'pone' ? { ...c, capPerDay: 1 } : c) };
  assert.deepEqual(await slot({ catalogue: capped, storage: stored({ shown: { 'pone-15': [t] } }) }), [[], 'paid', 1], "the creative's own capPerDay");
  assert.deepEqual(await slot({ storage: stored({ apps: { pone: { until: Date.now() + 864e5 } } }) }), [[], 'paid', 1], 'the game is resting');
  const daily = { ...raw, exchange: { ...raw.exchange, perDay: 1 } };
  assert.deepEqual(await slot({ catalogue: daily, storage: stored({ shown: { 'tca-15': [t] } }) }), [[], 'paid', 1], "the player's house ads for today are seen");
  // and a showing kept to the games owed is picked under the same limits
  const now = Date.UTC(2026, 10, 11), among = new Set(['pone']);
  assert.equal(pick({ catalogue, host: 'tcb', now, among, history: { shown: { 'pone-15': [now - 1, now - 2] } } }), null);
  assert.equal(pick({ catalogue, host: 'tcb', now, among, history: { apps: { pone: { until: now + 1 } } } }), null);
  assert.equal(pick({ catalogue, host: 'tcb', now, among, perDay: 1, history: { shown: { 'tca-15': [now - 1] } } }), null);
});

test("show({ paid }): the paid network's slot is the paid network's, and says so", async () => {
  let asked = 0;
  const paid = async () => { asked++; return { granted: true }; };
  const out = await ads({ rand: () => 0.5 }).show('tile', { paid });   // share 0.1: not the house's
  assert.deepEqual([out.granted, out.shown, out.via, out.creative, asked], [true, true, 'paid', null, 1]);
  const left = await ads({ rand: () => 0.5 }).show('tile', { paid: async () => ({ granted: false }) });
  assert.deepEqual([left.granted, left.via], [false, 'paid'], 'left early: its own word');
  // and it's counted: `paid`, of the placement, with no creative of ours
  const heard = [];
  await ads({ rand: () => 0.5, onEvent: e => heard.push([e.event, e.placement, e.creative]) }).show('tile', { paid });
  assert.deepEqual(heard, [['paid', 'tile', null]]);
  assert.equal((await ads({ rand: () => 0.5 }).show('short', { paid })).via, 'paid', 'nothing of the house ready here');
});

test('an interstitial with nothing to show shows nothing, and grants nothing', async () => {
  const none = ads({ placements: { between: { format: 'interstitial', maxSecs: 10 } } });
  assert.deepEqual(await none.show('between'), { granted: false, shown: false, via: null, creative: null, app: null, kind: null, watchedSecs: 0 });
});
