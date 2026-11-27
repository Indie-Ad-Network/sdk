import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pick, eligible, wanted, cardFor, DAY } from '../core/pick.js';
import { validate } from '../core/catalogue.js';

const NOW = Date.UTC(2026, 10, 10, 12);
const cat = validate({
  apps: {
    tcb: { name: 'Game One', studio: 'ours', own: true, rating: '4+', ios: { id: 1 } },
    pr: { name: 'Game Three', studio: 'ours', own: true, rating: '4+', ios: { id: 2 } },
    rodeo: { name: 'Partner Two', studio: 'theirs', rating: '9+', ios: { id: 3 } },
  },
  creatives: [
    { id: 'tcb-15', app: 'tcb', kind: 'video', secs: 15, src: 'a.mp4', aspect: '9:16' },
    { id: 'tcb-30-wide', app: 'tcb', kind: 'video', secs: 30, src: 'b.mp4', aspect: '16:9' },
    { id: 'pr-play', app: 'pr', kind: 'playable', secs: 30, src: 'p.html' },
    { id: 'rodeo-15', app: 'rodeo', kind: 'video', secs: 15, src: 'r.mp4', aspect: '9:16' },
    { id: 'tcb-xmas', app: 'tcb', kind: 'video', secs: 15, src: 'x.mp4', aspect: '9:16', from: '2026-12-01', to: '2026-12-27' },
  ],
});
const base = { catalogue: cat, host: 'tca', rating: '9+', now: NOW, aspect: '9:16' };
const ids = o => eligible({ ...base, ...o }).map(c => c.id).sort();

test('the catalogue itself is whole', () => assert.deepEqual(cat.dropped, []));

test('one for a platform alone is shown only there, a test among them; one that says none, on both', () => {
  const both = validate({ apps: cat.apps, creatives: [...cat.creatives, { id: 'pr-android', app: 'pr', kind: 'video', secs: 15, src: 'pa.mp4', os: 'android' }] });
  const on = o => ids({ catalogue: both, ...o });
  assert.ok(on({ os: 'android' }).includes('pr-android'));
  assert.ok(!on({ os: 'ios' }).includes('pr-android'));
  assert.ok(!on({ os: 'ios', test: true }).includes('pr-android'));
  assert.ok(on({ os: 'ios' }).includes('tcb-15') && on({ os: 'android' }).includes('tcb-15'));
});

test('in date', () => {
  assert.deepEqual(ids(), ['pr-play', 'rodeo-15', 'tcb-15', 'tcb-30-wide']);
  assert.deepEqual(ids({ now: Date.UTC(2026, 11, 5) }), ['pr-play', 'rodeo-15', 'tcb-15', 'tcb-30-wide', 'tcb-xmas']);
  assert.deepEqual(ids({ now: Date.UTC(2026, 11, 27) }), ['pr-play', 'rodeo-15', 'tcb-15', 'tcb-30-wide']);
});

// a player's history with these games resting: shown too often with no store tap
const resting = (...games) => ({ shown: {}, apps: Object.fromEntries(games.map(id => [id, { n: 0, rests: 1, until: NOW + 1000 }])) });
test('never the host itself, nor a game that is resting; and what else is on the device is never asked', () => {
  assert.deepEqual(ids({ host: 'tcb' }), ['pr-play', 'rodeo-15']);
  assert.deepEqual(ids({ history: resting('pr', 'rodeo') }), ['tcb-15', 'tcb-30-wide']);
  assert.deepEqual(ids({ installed: new Set(['pr', 'rodeo']) }), ids(), 'a caller that still says which games are installed is not listened to');
});

test('nothing rated above the host; no partner ads for a player under 13', () => {
  assert.deepEqual(ids({ rating: '4+' }), ['pr-play', 'tcb-15', 'tcb-30-wide']);
  assert.deepEqual(ids({ age: 12 }), ['pr-play', 'tcb-15', 'tcb-30-wide']);
  assert.deepEqual(ids({ age: 13 }), ['pr-play', 'rodeo-15', 'tcb-15', 'tcb-30-wide']);
  // `under13` is the word on it where it's said: `own` only where it isn't
  const marked = validate({ creatives: cat.creatives, apps: { tcb: { name: 'a', own: true, under13: false, ios: { id: 1 } }, pr: { name: 'b', own: true, ios: { id: 2 } }, rodeo: { name: 'c', under13: true, ios: { id: 3 } } } });
  assert.deepEqual(ids({ catalogue: marked, rating: null, age: 12 }), ['pr-play', 'rodeo-15']);
});

test("no longer than the placement takes, and only the kinds it takes", () => {
  assert.deepEqual(ids({ placement: { maxSecs: 15 } }), ['rodeo-15', 'tcb-15']);
  assert.deepEqual(ids({ placement: { kinds: ['playable'] } }), ['pr-play']);
});

test('twice in 24 hours is the cap; a day on it shows again', () => {
  const history = { shown: { 'tcb-15': [NOW - 1000, NOW - DAY + 1000], 'rodeo-15': [NOW - DAY - 1, NOW - 5] } };
  assert.deepEqual(ids({ history }), ['pr-play', 'rodeo-15', 'tcb-30-wide']);
});

test("a developer's test: the host's own, games resting and creatives at their cap all play", () => {
  const history = { ...resting('pr', 'rodeo'), shown: { 'tcb-15': [NOW - 1000, NOW - 2000] } };
  const all = ['pr-play', 'rodeo-15', 'tcb-15', 'tcb-30-wide'];
  assert.deepEqual(ids({ host: 'tcb', history, test: true }), all);
  assert.deepEqual(ids({ host: 'tcb', history: resting('pr', 'rodeo'), test: false }), []);
  assert.equal(cardFor({ ...base, host: 'tcb', history: resting('pr', 'rodeo'), test: true, rand: () => 0 }).app, 'tcb');
});

test('a test still keeps to the dates, the ratings, and what the placement takes and is ready', () => {
  assert.deepEqual(ids({ rating: '4+', test: true }), ['pr-play', 'tcb-15', 'tcb-30-wide']);
  assert.deepEqual(ids({ placement: { maxSecs: 15 }, ready: c => c.app !== 'rodeo', test: true }), ['tcb-15']);
});

test('only what is ready to play', () => {
  assert.deepEqual(ids({ ready: c => c.kind === 'playable' }), ['pr-play']);
});

test('never the same one twice running, unless it is all there is', () => {
  for (let i = 0; i < 20; i++) assert.notEqual(pick({ ...base, history: { last: 'tcb-15' }, rand: () => i / 20 }).id, 'tcb-15');
  assert.equal(pick({ ...base, placement: { kinds: ['playable'] }, history: { last: 'pr-play' } }).id, 'pr-play');
});

test("by weight: a game of the host's own studio counts double there and nowhere else, a video of the wrong shape half", () => {
  // the hosts are in the catalogue too, which is how whose they are is known: tca ours, rodeo2 theirs
  const catalogue = validate({ creatives: cat.creatives, apps: { ...cat.apps, tca: { name: 'Game Two', studio: 'ours', ios: { id: 4 } }, rodeo2: { name: 'Partner Four', studio: 'theirs', ios: { id: 5 } } } });
  const count = (aspect, n, host = 'tca') => {
    const seen = {};
    for (let i = 0; i < n; i++) { const id = pick({ ...base, catalogue, host, aspect, rand: () => (i + 0.5) / n }).id; seen[id] = (seen[id] ?? 0) + 1; }
    return seen;
  };
  assert.deepEqual(count('9:16', 1200), { 'tcb-15': 400, 'tcb-30-wide': 200, 'pr-play': 400, 'rodeo-15': 200 });
  assert.deepEqual(count('16:9', 1100), { 'tcb-15': 200, 'tcb-30-wide': 400, 'pr-play': 400, 'rodeo-15': 100 });
  // in another studio's game `own` counts for nothing, and that studio's own game is the one that counts double
  assert.deepEqual(count('9:16', 900, 'rodeo2'), { 'tcb-15': 200, 'tcb-30-wide': 100, 'pr-play': 200, 'rodeo-15': 400 });
  assert.equal(cardFor({ ...base, catalogue, host: 'rodeo2', rand: () => 0.6 }).app, 'rodeo');   // of tcb, pr, rodeo × 2: the still card likewise
  assert.deepEqual(count('9:16', 700, 'elsewhere'), { 'tcb-15': 200, 'tcb-30-wide': 100, 'pr-play': 200, 'rodeo-15': 200 });
});

test('nothing to show: null, and the card is any game the player may see', () => {
  assert.equal(pick({ ...base, ready: () => false }), null);
  assert.equal(cardFor({ ...base, history: resting('tcb', 'rodeo') }).app, 'pr');
  assert.equal(cardFor({ ...base, history: resting('tcb', 'pr', 'rodeo') }), null);
  assert.deepEqual(cardFor({ ...base, age: 9, rand: () => 0 }), { id: 'tcb-card', app: 'tcb', kind: 'card' });
});

test('weights that come to nothing still give one, not an error', () => {
  const none = { ...cat, creatives: cat.creatives.map(c => ({ ...c, weight: 0 })) };
  assert.ok(pick({ catalogue: none, host: 'x', now: Date.parse('2026-06-01'), rand: () => 0.5 }));
});

test("a video marked overrun is let into a placement shorter than it; no other is, nor a playable so marked", () => {
  const cat = validate({ apps: { a: { name: 'A', ios: { id: 1 } } }, creatives: [
    { id: 'long', app: 'a', kind: 'video', secs: 45, src: 'l.mp4', overrun: true }, { id: 'plain', app: 'a', kind: 'video', secs: 45, src: 'p.mp4' },
    { id: 'said-not', app: 'a', kind: 'video', secs: 45, src: 'n.mp4', overrun: false }, { id: 'fits', app: 'a', kind: 'video', secs: 30, src: 'f.mp4' },
    { id: 'play', app: 'a', kind: 'playable', secs: 45, src: 'p.html', overrun: true }] }, 'https://x.test/c.json');
  const ids = placement => eligible({ catalogue: cat, host: 'h', placement }).map(c => c.id);
  assert.deepEqual(ids({ maxSecs: 30 }), ['long', 'fits']);
  assert.deepEqual(ids({ maxSecs: 60 }), ['long', 'plain', 'said-not', 'fits', 'play']);
  assert.deepEqual(ids({ maxSecs: 30, kinds: ['playable'] }), []);
});

test('a placement\'s least time, and who fits it: skipFrom and minSecs', async () => {
  const { leastOf } = await import('../core/pick.js'), { leastSaid } = await import('../core/exchange.js');
  assert.deepEqual([leastOf({}), leastOf({ minSecs: 15 }), leastOf({ format: 'interstitial' }), leastOf({ format: 'interstitial', skipAfter: 8 }), leastOf({ format: 'interstitial', skipAfter: 8, minSecs: 0 }), leastOf({ format: 'interstitial', minSecs: 40 })], [null, 15, 5, 8, 0, 15]);
  // a video kept to its own shape of screen isn't shown on the other; one not so kept is, and a game that hasn't said its shape gets both
  const cuts = { apps: { a: { name: 'A', ios: { id: 1 }, android: { package: 'a' } } }, creatives: [{ id: 'tall', app: 'a', kind: 'video', secs: 15, aspect: '9:16', aspectOnly: true, src: 'x' }, { id: 'wide', app: 'a', kind: 'video', secs: 15, aspect: '16:9', src: 'x' }] };
  const shown = aspect => eligible({ catalogue: cuts, host: 'h', aspect }).map(c => c.id).sort();
  assert.deepEqual([shown('9:16'), shown('16:9'), shown(null)], [['tall', 'wide'], ['wide'], ['tall', 'wide']]);
  const { validate } = await import('../core/catalogue.js');   // a playable's too: read, and kept to its shape
  const read = validate({ version: 1, apps: { a: { name: 'A', ios: { id: 1 } } }, creatives: [{ id: 'p', app: 'a', kind: 'playable', secs: 30, src: 'p.html', aspect: '9:16', aspectOnly: true }] }, 'https://x.example/c.json');
  assert.deepEqual([read.dropped, read.creatives[0].aspectOnly, eligible({ catalogue: read, host: 'h', aspect: '16:9' }).length, eligible({ catalogue: read, host: 'h', aspect: '9:16' }).length], [[], true, 0, 1]);
  // a playable's earliest leaving, said as `minSecs` and read as `skipFrom`: it fits an interstitial of that time or more, and a slot too short for its whole time
  const plays = validate({ version: 1, apps: { a: { name: 'A', ios: { id: 1 } } }, creatives: [{ id: 'p5', app: 'a', kind: 'playable', secs: 30, src: 'p.html', minSecs: 5 }, { id: 'p10', app: 'a', kind: 'playable', secs: 30, src: 'q.html', minSecs: 10 }, { id: 'bad', app: 'a', kind: 'playable', secs: 30, src: 'r.html', minSecs: 40 }] }, 'https://x.example/c.json');
  assert.deepEqual([plays.creatives.map(c => [c.id, c.skipFrom, 'minSecs' in c]), plays.dropped.length], [[['p5', 5, false], ['p10', 10, false], ['bad', undefined, false]], 1]);
  const fits = placement => eligible({ catalogue: plays, host: 'h', placement }).map(c => c.id).sort();
  assert.deepEqual([fits({ format: 'interstitial' }), fits({ format: 'interstitial', minSecs: 10 }), fits({ maxSecs: 15 }), fits({ maxSecs: 8 })], [['bad', 'p5'], ['bad', 'p10', 'p5'], ['p10', 'p5'], ['p5']]);
  const { skipAtOf } = await import('../core/pick.js');   // Skip at the game's time, 12 s in at the latest: whatever it's handed
  assert.deepEqual([0, 3, 5, 10, 12, 13, 15, 40].map(skipAtOf), [0, 3, 5, 10, 12, 12, 12, 12]);
  const catalogue = { apps: { a: { name: 'A', ios: { id: 1 }, android: { package: 'a' } } }, creatives: [
    { id: 'plain', app: 'a', kind: 'video', secs: 30, src: 'x' }, { id: 'early', app: 'a', kind: 'video', secs: 30, skipFrom: 5, src: 'x' }, { id: 'late', app: 'a', kind: 'video', secs: 30, skipFrom: 10, src: 'x' }] };
  const ids = placement => eligible({ catalogue, host: 'h', placement }).map(c => c.id).sort();
  assert.deepEqual(ids({ format: 'interstitial' }), ['early', 'plain']);                       // 5 s: one not to be left before 10 isn't shown
  assert.deepEqual(ids({ format: 'interstitial', minSecs: 10 }), ['early', 'late', 'plain']);
  assert.deepEqual(ids({ minSecs: 0 }), ['early', 'late', 'plain']);                           // rewarded: the later of the two is its time, and all are shown
  assert.deepEqual(ids({ maxSecs: 15 }), ['early', 'late']);                                   // too long for it, unless it may be left by then
  assert.deepEqual(ids({ maxSecs: 8 }), ['early']);
  // 5 meets 5: a time is the same as another within SLACK, so neither's rounding keeps a creative out of a slot it fits
  const near = skipFrom => eligible({ catalogue: { apps: catalogue.apps, creatives: [{ id: 'v', app: 'a', kind: 'video', secs: 30, skipFrom, src: 'x' }] }, host: 'h', placement: { format: 'interstitial' } }).length;
  assert.deepEqual([near(5), near(5.04), near(4.96), near(5.1), near(0)], [1, 1, 1, 0, 1]);
  assert.equal(eligible({ catalogue: { apps: catalogue.apps, creatives: [{ id: 'v', app: 'a', kind: 'video', secs: 15.03, src: 'x' }] }, host: 'h', placement: { maxSecs: 15 } }).length, 1);
  const cat = { exchange: { hosts: { h: { placements: { between: { minSecs: 12 }, bad: { minSecs: -1 } } } } } };
  assert.deepEqual([leastSaid(cat, 'h', 'between'), leastSaid(cat, 'h', 'bad'), leastSaid(cat, 'h', 'other'), leastSaid({}, 'h', 'between')], [12, null, null, null]);
  const game = { exchange: { hosts: { h: { minSecs: { interstitial: 8 }, placements: { between: { minSecs: 12 } } } } } };   // the game's, for a kind; a placement's own before it
  assert.deepEqual([leastSaid(game, 'h', 'between', 'interstitial'), leastSaid(game, 'h', 'loading', 'interstitial'), leastSaid(game, 'h', 'coins', 'rewarded'), leastSaid(game, 'h', 'coins')], [12, 8, null, null]);
  assert.equal(leastSaid({ exchange: { hosts: { h: { minSecs: { interstitial: 8 }, placements: { between: { minSecs: -1 } } } } } }, 'h', 'between', 'interstitial'), 8);   // one that can't be read is as none said
});

test("a developer's test sees every kind: a kind first, each as likely, and the likeliest of each downloaded ahead", () => {
  const seen = test => { const kinds = {}; for (let i = 0; i < 100; i++) { const k = pick({ ...base, test, rand: () => (i + 0.5) / 100 }).kind; kinds[k] = (kinds[k] ?? 0) + 1; } return kinds; };
  assert.deepEqual(seen(true), { playable: 50, video: 50 });   // one playable among three videos, half the time all the same
  assert.ok(seen(false).playable < 50);                         // a player's: by weight, as ever
  const placements = { coins: { format: 'rewarded' } };
  const few = cat2 => wanted({ ...base, catalogue: cat2, placements, keep: 2, test: true }).map(c => c.kind).sort();
  const many = validate({ apps: cat.apps, creatives: [
    ...['a', 'b', 'c'].map(x => ({ id: `pr-${x}`, app: 'pr', kind: 'playable', secs: 30, src: `${x}.html`, weight: 3 })),
    { id: 'rodeo-wide', app: 'rodeo', kind: 'video', secs: 15, src: 'w.mp4', aspect: '16:9' },
  ] });
  assert.deepEqual(few(many), ['playable', 'video']);   // the one video, a wrong shape and light, is downloaded all the same
  assert.deepEqual(wanted({ ...base, catalogue: many, placements, keep: 2 }).map(c => c.kind), ['playable', 'playable']);   // and for a player, not
});
