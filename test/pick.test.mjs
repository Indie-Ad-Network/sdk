import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pick, eligible, cardFor, DAY } from '../core/pick.js';
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

test('in date', () => {
  assert.deepEqual(ids(), ['pr-play', 'rodeo-15', 'tcb-15', 'tcb-30-wide']);
  assert.deepEqual(ids({ now: Date.UTC(2026, 11, 5) }), ['pr-play', 'rodeo-15', 'tcb-15', 'tcb-30-wide', 'tcb-xmas']);
  assert.deepEqual(ids({ now: Date.UTC(2026, 11, 27) }), ['pr-play', 'rodeo-15', 'tcb-15', 'tcb-30-wide']);
});

test('never the host itself, nor a game already installed', () => {
  assert.deepEqual(ids({ host: 'tcb' }), ['pr-play', 'rodeo-15']);
  assert.deepEqual(ids({ installed: new Set(['pr', 'rodeo']) }), ['tcb-15', 'tcb-30-wide']);
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

test("a developer's test: the host's own, games installed and creatives at their cap all play", () => {
  const history = { shown: { 'tcb-15': [NOW - 1000, NOW - 2000] } };
  const all = ['pr-play', 'rodeo-15', 'tcb-15', 'tcb-30-wide'];
  assert.deepEqual(ids({ host: 'tcb', installed: new Set(['pr', 'rodeo']), history, test: true }), all);
  assert.deepEqual(ids({ host: 'tcb', installed: new Set(['tcb', 'pr', 'rodeo']), test: false }), []);
  assert.equal(cardFor({ ...base, host: 'tcb', installed: new Set(['tcb', 'pr', 'rodeo']), test: true, rand: () => 0 }).app, 'tcb');
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
  assert.equal(cardFor({ ...base, catalogue, host: 'rodeo2', installed: new Set(['tca']), rand: () => 0.6 }).app, 'rodeo');   // of tcb, pr, rodeo × 2: the still card likewise
  assert.deepEqual(count('9:16', 700, 'elsewhere'), { 'tcb-15': 200, 'tcb-30-wide': 100, 'pr-play': 200, 'rodeo-15': 200 });
});

test('nothing to show: null, and the card is any game the player may see', () => {
  assert.equal(pick({ ...base, ready: () => false }), null);
  assert.equal(cardFor({ ...base, installed: new Set(['tcb', 'rodeo']) }).app, 'pr');
  assert.equal(cardFor({ ...base, installed: new Set(['tcb', 'pr', 'rodeo']) }), null);
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
