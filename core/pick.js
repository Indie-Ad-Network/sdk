// ---------- which creative, for this placement, now ----------
// Pure: everything it needs is passed in, so the rules are tested in Node (test/pick.test.mjs).
//
// Nothing at all once the player has been shown `perDay` house ads in 24 h (exchange.js).
// Otherwise a creative is out if any of these says so, in this order:
//   1. out of its dates                    5. shown `capPerDay` times in 24 h
//   2. it advertises the host itself       6. not ready to play (`ready(creative)`: the cache's word)
//   3. rated above the host; or not one    7. longer than the placement takes (`maxSecs`), or not a kind it takes
//      for a player under 13, who is one   8. the one shown last, if there's another
//   4. its game is already installed, or resting: shown too often with no store tap (history.js)
// Of those left, one by weight: its own `weight`, a game of the host's own studio × OWN_BOOST, and a video of the
// wrong shape for the screen × WRONG_SHAPE (it plays letterboxed: worse, but not nothing), and
// `boost[app]` where the exchange says a game is owed showings (exchange.js).
//
// `among`, a set of games: only theirs (index.js, when a game owed showings goes first), and
// under every rule above: being owed lifts no cap and ends no rest.
//
// `test`, a developer trying the ads out, drops the rules about this player and this host: 2, 4, 5,
// `perDay` and a creative's own `hosts`. So the host's own ads play too, on a device that has every game.
import { studioOf } from './catalogue.js';

export const DAY = 864e5;

const OWN_BOOST = 2, WRONG_SHAPE = 0.5, CAP_PER_DAY = 2, CHILD = 13;
const ageOf = rating => parseInt(rating, 10) || 0;   // '9+' → 9; none → 0, fit for anyone

// a showing counts against the cap for a day
export const recent = (times, now) => (times ?? []).filter(t => now - t < DAY);
// how many house ads this player has been shown in 24 h, of every creative
export const shownToday = (history, now) => Object.values(history?.shown ?? {}).reduce((n, times) => n + recent(times, now).length, 0);
// a game whose ads this player has been shown too often with no store tap: not shown them until `until`
export const resting = (history, app, now) => (history?.apps?.[app]?.until ?? 0) > now;

// The apps this player may be shown at all: rules 2–4.
function appOk(app, { host, rating, age, installed, history, now, test = false }) {
  if (!app || (!test && app.id === host)) return false;
  if (rating != null && ageOf(app.rating) > ageOf(rating)) return false;
  if (age != null && age < CHILD && !app.under13) return false;
  return test || (!installed?.has(app.id) && !resting(history, app.id, now));
}

export function eligible({ catalogue, host, placement = {}, rating, age, installed, history, lang = null, now = Date.now(), ready = () => true, test = false, perDay = null, among = null }) {
  if (!test && perDay != null && shownToday(history, now) >= perDay) return [];
  return catalogue.creatives.filter(c => {
    const app = catalogue.apps[c.app];
    if (among && !among.has(c.app)) return false;
    if ((c.from && now < Date.parse(c.from)) || (c.to && now >= Date.parse(c.to))) return false;
    if (!appOk(app, { host, rating, age, installed, history, now, test })) return false;
    if (!test && c.hosts && !c.hosts.includes(host)) return false;
    if (c.langs && lang && !c.langs.some(l => String(l).toLowerCase().split('-')[0] === lang.toLowerCase().split('-')[0])) return false;   // a creative with words in it, for those who read them
    if (rating != null && c.rating && ageOf(c.rating) > ageOf(rating)) return false;
    if (!test && recent(history?.shown?.[c.id], now).length >= (c.capPerDay ?? CAP_PER_DAY)) return false;
    if (!ready(c)) return false;
    if (placement.kinds && !placement.kinds.includes(c.kind)) return false;
    return !(placement.maxSecs && c.secs > placement.maxSecs);
  });
}

const weighted = (list, weightOf, rand) => {
  let at = rand() * list.reduce((sum, x) => sum + weightOf(x), 0);
  for (const x of list) if ((at -= weightOf(x)) < 0) return x;
  return list[list.length - 1];   // by index: the oldest web views a game of ours runs on have no at()
};
// a game of the host's own studio, in any studio's games: its own come first there, and nowhere else
const appWeight = (catalogue, host, app) => studioOf(catalogue, app) === studioOf(catalogue, host) ? OWN_BOOST : 1;

const creativeWeight = (c, o) => (c.weight ?? 1) * appWeight(o.catalogue, o.host, c.app) * (o.boost?.[c.app] ?? 1) * (c.aspect && o.aspect && c.aspect !== o.aspect ? WRONG_SHAPE : 1);

// One of them, by weight; `rand` is Math.random's shape. null when there's nothing to show.
export function pick(o) {
  let list = eligible(o);
  if (list.length > 1) list = list.filter(c => c.id !== o.history?.last);
  if (!list.length) return null;
  return weighted(list, c => creativeWeight(c, o), o.rand ?? Math.random);
}

// The `keep` creatives to have downloaded and ready, most wanted first: each placement's
// likeliest (so none is left with nothing it can show), then the likeliest of the rest.
// `placements` is the host's { name: { maxSecs, kinds } }; the rest as for eligible().
export function wanted({ placements = {}, keep = 3, ...o }) {
  const byWeight = list => [...list].sort((a, b) => creativeWeight(b, o) - creativeWeight(a, o));
  const each = Object.values(placements);
  const lists = (each.length ? each : [{}]).map(placement => byWeight(eligible({ ...o, placement })));
  const out = new Set(lists.map(list => list[0]).filter(Boolean));
  for (const c of byWeight(new Set(lists.flat()))) out.add(c);
  return [...out].slice(0, keep);
}

// With nothing to play, a game to put on the still card: any the player may be shown, whatever
// its creatives' caps and whether or not their files are here (not one resting). null when there is none.
export function cardFor({ catalogue, host, rating, age, installed, history, now = Date.now(), rand = Math.random, test = false }) {
  const apps = Object.values(catalogue.apps).filter(a => appOk(a, { host, rating, age, installed, history, now, test }));
  if (!apps.length) return null;
  const app = weighted(apps, a => appWeight(catalogue, host, a.id), rand).id;
  return { id: `${app}-card`, app, kind: 'card' };
}
