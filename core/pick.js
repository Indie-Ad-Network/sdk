// ---------- which creative, for this placement, now ----------
// Pure: everything it needs is passed in, so the rules are tested in Node (test/pick.test.mjs).
//
// Nothing at all once the player has been shown `perDay` house ads in 24 h (exchange.js).
// Otherwise a creative is out if any of these says so, in this order:
//   1. out of its dates, or for the other  5. shown `capPerDay` times in 24 h
//      platform (`os`)
//   2. it advertises the host itself       6. not ready to play (`ready(creative)`: the cache's word)
//   3. rated above the host; or not one    7. longer than the placement takes (`maxSecs`: but a video marked `overrun`, or one
//                                              that may be left by then, `skipFrom`), or not a kind it takes; or for an
//                                              interstitial, not to be left before a later second than the game's (`minSecs`)
//      for a player under 13, who is one   8. the one shown last, if there's another
//   4. its game is resting: shown too often with no store tap (history.js)
// Of those left, one by weight: its own `weight`, a game of the host's own studio × OWN_BOOST, and a video of the
// wrong shape for the screen × WRONG_SHAPE (it plays letterboxed: worse, but not nothing; one marked `aspectOnly` isn't shown at all), and
// `boost[app]` where the exchange says a game is owed showings (exchange.js).
//
// `among`, a set of games: only theirs (index.js, when a game owed showings goes first), and
// under every rule above: being owed lifts no cap and ends no rest.
//
// `test`, a developer trying the ads out, drops the rules about this player and this host: 2, 4, 5,
// `perDay` and a creative's own `hosts`. So the host's own ads play too, on a device that has every game. And it sees
// every kind there is, not mostly the commonest: each kind's weights are made to add up to one, so a video and a playable
// are as likely as each other, and each is by weight within its kind; and the likeliest of each kind is among those
// downloaded ahead (`wanted`).
import { studioOf } from './catalogue.js';

export const DAY = 864e5;

const OWN_BOOST = 2, WRONG_SHAPE = 0.5, CAP_PER_DAY = 2;
const CHILD = 13;
export const isChild = age => age != null && age < CHILD;   // by the game's own word: only games fit for one, and no way out to the web
const ageOf = rating => parseInt(rating, 10) || 0;   // '9+' → 9; none → 0, fit for anyone

// a showing counts against the cap for a day
export const recent = (times, now) => (times ?? []).filter(t => now - t < DAY);
// how many house ads this player has been shown in 24 h, of every creative
export const shownToday = (history, now) => Object.values(history?.shown ?? {}).reduce((n, times) => n + recent(times, now).length, 0);
// a game whose ads this player has been shown too often with no store tap: not shown them until `until`
export const resting = (history, app, now) => (history?.apps?.[app]?.until ?? 0) > now;

// The apps this player may be shown at all: rules 2–4.
function appOk(app, { host, rating, age, history, now, test = false }) {
  if (!app || (!test && app.id === host)) return false;
  if (rating != null && ageOf(app.rating) > ageOf(rating)) return false;
  if (isChild(age) && !app.under13) return false;
  return test || !resting(history, app.id, now);
}

// The least time a placement holds a player to an ad, in seconds: the game's to say (`minSecs`). An interstitial's
// was `skipAfter` before 0.6.3, still read, and is SKIP_SECS where neither is said; never more than SKIP_MOST, which
// is as long as Google Play lets a full-screen ad go unclosable. A rewarded ad's is null where the game says none: its
// creative's own time rules then (player.js).
export const SKIP_SECS = 5, SKIP_MOST = 15;
// When an interstitial's video shows Skip, for a placement that holds the player `least` seconds: at that time, and SKIP_BY in at the
// latest. Skip takes the video to its end, where ✕ is HOLD_SECS later: so the way out is never later than SKIP_MOST.
export const HOLD_SECS = 3, SKIP_BY = SKIP_MOST - HOLD_SECS;
export const skipAtOf = least => Math.min(SKIP_BY, Math.max(0, least));
// Two times within SLACK seconds are the same time: a creative that may be left at 5 fits a 5 s slot, however either was rounded on its way here.
export const SLACK = 0.05;
const secsOr = (v, otherwise) => Number.isFinite(v) && v >= 0 ? v : otherwise;
export const leastOf = (placement = {}) => placement.format === 'interstitial' ? Math.min(SKIP_MOST, secsOr(placement.minSecs, secsOr(placement.skipAfter, SKIP_SECS))) : secsOr(placement.minSecs, null);

// cut for the other shape of screen than the one it would be shown on; one that says no shape, or a screen that says none, never is
const wrongShape = (c, aspect) => !!c.aspect && !!aspect && c.aspect !== aspect;

export function eligible({ catalogue, host, placement = {}, rating, age, history, lang = null, now = Date.now(), ready = () => true, test = false, perDay = null, among = null, aspect = null, os = null }) {
  if (!test && perDay != null && shownToday(history, now) >= perDay) return [];
  const least = placement.format === 'interstitial' ? leastOf(placement) : null;
  return catalogue.creatives.filter(c => {
    const app = catalogue.apps[c.app];
    if (among && !among.has(c.app)) return false;
    if ((c.from && now < Date.parse(c.from)) || (c.to && now >= Date.parse(c.to))) return false;
    if (c.os && os && c.os !== os) return false;   // for one platform alone: 'ios' or 'android' (0.6.18 on; the server gives a release before none of these)
    if (!appOk(app, { host, rating, age, history, now, test })) return false;
    if (!test && c.hosts && !c.hosts.includes(host)) return false;
    if (c.langs && lang && !c.langs.some(l => String(l).toLowerCase().split('-')[0] === lang.toLowerCase().split('-')[0])) return false;   // a creative with words in it, for those who read them
    if (rating != null && c.rating && ageOf(c.rating) > ageOf(rating)) return false;
    if (!test && recent(history?.shown?.[c.id], now).length >= (c.capPerDay ?? CAP_PER_DAY)) return false;
    if (!ready(c)) return false;
    if (placement.kinds && !placement.kinds.includes(c.kind)) return false;
    // cut for one shape of screen, and its studio would have it shown on no other (`aspectOnly`): without that, the wrong shape only halves its weight
    if (c.aspectOnly && wrongShape(c, aspect)) return false;
    // an interstitial's time is the game's to say: a creative that mustn't be left before a later second than that isn't shown there
    if (c.skipFrom != null && least != null && c.skipFrom > least + SLACK) return false;
    // longer than the placement takes: unless it says it may be left by then (`skipFrom`), or may run on past it (`overrun`, a video's alone)
    return !(placement.maxSecs && c.secs > placement.maxSecs + SLACK && !c.overrun && !(c.skipFrom != null && c.skipFrom <= placement.maxSecs + SLACK));
  });
}

const weighted = (list, weightOf, rand) => {
  let at = rand() * list.reduce((sum, x) => sum + weightOf(x), 0);
  for (const x of list) if ((at -= weightOf(x)) < 0) return x;
  return list[list.length - 1];   // by index: the oldest web views a game of ours runs on have no at()
};
// a game of the host's own studio, in any studio's games: its own come first there, and nowhere else
const appWeight = (catalogue, host, app) => studioOf(catalogue, app) === studioOf(catalogue, host) ? OWN_BOOST : 1;

const creativeWeight = (c, o) => (c.weight ?? 1) * appWeight(o.catalogue, o.host, c.app) * (o.boost?.[c.app] ?? 1) * (wrongShape(c, o.aspect) ? WRONG_SHAPE : 1);

// One of them, by weight; `rand` is Math.random's shape. null when there's nothing to show.
export function pick(o) {
  let list = eligible(o);
  if (list.length > 1) list = list.filter(c => c.id !== o.history?.last);
  if (!list.length) return null;
  const ofKind = {};
  if (o.test) for (const c of list) ofKind[c.kind] = (ofKind[c.kind] ?? 0) + creativeWeight(c, o);
  return weighted(list, c => creativeWeight(c, o) / (ofKind[c.kind] ?? 1), o.rand ?? Math.random);
}

// The `keep` creatives to have downloaded and ready, most wanted first: each placement's
// likeliest (so none is left with nothing it can show), then the likeliest of the rest.
// `placements` is the host's { name: { maxSecs, kinds } }; the rest as for eligible().
export function wanted({ placements = {}, keep = 3, ...o }) {
  const byWeight = list => [...list].sort((a, b) => creativeWeight(b, o) - creativeWeight(a, o));
  const each = Object.values(placements);
  const lists = (each.length ? each : [{}]).map(placement => byWeight(eligible({ ...o, placement })));
  const out = new Set(lists.map(list => list[0]).filter(Boolean)), all = byWeight(new Set(lists.flat()));
  if (o.test) for (const kind of new Set(all.map(c => c.kind))) out.add(all.find(c => c.kind === kind));   // a developer's test: each kind ready to see
  for (const c of all) out.add(c);
  return [...out].slice(0, keep);
}

// With nothing to play, a game to put on the still card: any the player may be shown, whatever
// its creatives' caps and whether or not their files are here (not one resting). null when there is none.
export function cardFor({ catalogue, host, rating, age, history, now = Date.now(), rand = Math.random, test = false }) {
  const apps = Object.values(catalogue.apps).filter(a => appOk(a, { host, rating, age, history, now, test }));
  if (!apps.length) return null;
  const app = weighted(apps, a => appWeight(catalogue, host, a.id), rand).id;
  return { id: `${app}-card`, app, kind: 'card' };
}
