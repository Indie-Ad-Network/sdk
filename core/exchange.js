// ---------- the exchange: how many of a host's ad slots the network asks for ----------
// A host game has other ads it could show (a paid network's), so it asks the package, each
// time: of my ad slots, what share do you want? The answer is the catalogue's to give, so it
// changes with no release of any game:
//
//   "exchange": { "share": 0.1, "max": 0.6, "full": 2000, "days": 30, "perDay": 3,
//                 "fatigue": { "after": 6, "rest": 14, "grow": 2 },
//                 "hosts": { "mygame": { "share": 0.15, "perDay": 2,
//                                        "placements": { "saveMe": { "share": 0 } } } } }
//
//   share       what's asked of a host that owes no one: our own games shown to our own players
//   max         what's asked of a host whose studio owes `full` showings or more
//   full        the debt at which `max` is reached; under it, the share rises with the debt
//   days        how far back showings count
//   perDay      the most house ads one player is shown in a day (24 h) in one game; none: no limit
//   fatigue     a game whose ads a player has been shown `after` times without a store tap rests
//               (isn't shown them) for `rest` days, and `grow` times longer each time again, up to
//               MAX_REST. A store tap starts it over. Counted on the device (history.js), as the
//               day's showings are: the ingest knows nothing of any one player
//   hosts       any of the above, except days, for one host; and
//   placements  in a host, share / max for one of its placements. A placement given a share and
//               no max stays at that share, whatever is owed: one held to 0 stays at 0
//
// The debt is between studios: another studio's games showing ours puts us in theirs, and our
// games showing theirs pays it off. So a studio that has been shown more than it has shown is
// asked for more of its slots until it's square. The count is the ingest's (it has every
// game's showings; ingest/src/worker.js answers GET /mix?host=…), which is why this is pure:
// the ingest runs mix() over its rows, and a game with no ingest to ask runs it over none,
// which gives `share`.
//
// A game owed showings is also likelier to be the one picked: `boost` (pick.js).

import { studioOf } from './catalogue.js';

const BOOST = 3;   // a game whose studio is owed `full` or more: its weight × (1 + BOOST)
export const FATIGUE = { after: 6, rest: 14, grow: 2 };   // what a catalogue that says nothing gets; after: 0 turns it off
export const MAX_REST = 180;                              // days: the longest a game rests
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const num = (v, otherwise) => Number.isFinite(v) ? v : otherwise;

// The catalogue's settings as this host has them (and for one of its placements, if named); a
// catalogue that says nothing asks for nothing, limits nothing, and rests a game by FATIGUE.
export function settings(catalogue, host, placement = null) {
  const all = catalogue?.exchange ?? {}, own = all.hosts?.[host] ?? {}, place = (placement != null && own.placements?.[placement]) || {};
  const of = (key, otherwise) => num(own[key], num(all[key], otherwise));
  const share = clamp(num(place.share, of('share', 0)), 0, 1);
  const max = clamp(num(place.max, Number.isFinite(place.share) ? share : of('max', share)), share, 1);
  const perDay = of('perDay', null);
  const tired = { ...FATIGUE, ...(all.fatigue ?? {}), ...(own.fatigue ?? {}) };
  const fatigue = { after: Math.max(0, Math.round(num(tired.after, FATIGUE.after))), rest: clamp(num(tired.rest, FATIGUE.rest), 0, MAX_REST), grow: clamp(num(tired.grow, FATIGUE.grow), 1, 10) };
  return { share, max, full: Math.max(1, of('full', 1000)), days: clamp(Math.round(num(all.days, 30)), 1, 365),
    perDay: perDay == null ? null : Math.max(0, Math.round(perDay)), fatigue };
}
// the share of `s` at a debt of `owed`
const shareAt = (s, owed) => +(s.share + (s.max - s.share) * Math.min(1, owed / s.full)).toFixed(3);


// `rows`: [{ host, app, shows }], the showings of `app` in `host` over the settings' days.
// → { share: 0–1, owed: showings this host's studio owes, owedTo: [the games it owes them to],
//     boost: { app: weight× }, placements: { name: share } for each placement the host's settings name }
export function mix({ catalogue, host, rows = [] }) {
  const s = settings(catalogue, host), mine = studioOf(catalogue, host);
  const net = new Map();   // studio → what they've shown of ours, less what we've shown of theirs
  for (const r of rows) {
    const from = studioOf(catalogue, r.host), to = studioOf(catalogue, r.app), n = Math.max(0, num(r.shows, 0));
    if (from === to) continue;   // a studio's own games in its own games: no one's debt
    if (to === mine) net.set(from, (net.get(from) ?? 0) + n);
    else if (from === mine) net.set(to, (net.get(to) ?? 0) - n);
  }
  let owed = 0;
  const boost = {}, owedTo = [];
  for (const n of net.values()) if (n > 0) owed += n;
  for (const app of Object.keys(catalogue.apps)) {
    const n = net.get(studioOf(catalogue, app)) ?? 0;
    if (n > 0) { owedTo.push(app); boost[app] = +(1 + BOOST * Math.min(1, n / s.full)).toFixed(2); }
  }
  const placements = {};
  for (const p of Object.keys(catalogue?.exchange?.hosts?.[host]?.placements ?? {})) placements[p] = shareAt(settings(catalogue, host, p), owed);
  return { share: shareAt(s, owed), owed, owedTo, boost, placements };
}

// What a server said, as far as it can be believed: shares within 0–1, boosts that are numbers, games by id.
export function believed(answer) {
  if (!answer || !Number.isFinite(answer.share)) return null;
  const boost = {}, placements = {};
  for (const [app, n] of Object.entries(answer.boost ?? {})) if (Number.isFinite(n) && n > 0) boost[app] = Math.min(n, 1 + BOOST);
  for (const [p, n] of Object.entries(answer.placements ?? {})) if (Number.isFinite(n)) placements[p] = clamp(n, 0, 1);
  // the games owed: as said; or, by a server from before it said so, those it made likelier
  const owedTo = Array.isArray(answer.owedTo) ? answer.owedTo.filter(a => typeof a === 'string') : Object.keys(boost).filter(a => boost[a] > 1);
  return { share: clamp(answer.share, 0, 1), boost, placements, owedTo };
}
// Whose slot this is, for a host with a paid network too: `demand` is index.js demand()'s answer.
//   'owed'   a game we owe showings has an ad ready: it comes first, whatever the share
//   'share'  the house's share of the slots came up (`rand`, Math.random's shape)
//   null     the paid network's
// Nothing ready to show is never a reason to pass over a paid ad.
export function turn(demand, rand = Math.random) {
  if (!demand?.available) return null;
  if (demand.owed?.length) return 'owed';
  return rand() < demand.share ? 'share' : null;
}
// a placement's share of what was believed: its own, or the host's
export const shareOf = (answer, placement) => answer.placements?.[placement] ?? answer.share;
