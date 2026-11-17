// ---------- the catalogue ----------
// What can be shown: the games (one record each, storeLinks.js) and their creatives. One file
// on a server, shared by every game that shows house ads, so changing what's shown never needs
// an app release. schema/catalogue.schema.json describes every field.
//
// A bad entry is dropped and named in `dropped`, never fatal: one partner's typo mustn't take
// every ad down. The last good copy is kept, for when there's no network.
//
// Whose catalogue it is. Everything is asked for over https and nothing over http (`secure`): the
// catalogue, and each file, picture and link it names. And a game that knows the network's public
// key (`signedBy`) takes a catalogue from the server only with the network's signature on it (the
// ingest's, in the header SIGNATURE), so whoever can stand between a player
// and the server, false certificate and all, still can't hand the game ads of their own: what
// isn't signed is as if the server hadn't answered. The catalogue names each creative's file by
// its sha256 (cache.js checks it), so the signature covers those too.

const KINDS = ['video', 'playable'];
const ASPECTS = ['9:16', '16:9'];
// What's read of a creative as the type it should be, with no second look (pick.js, cache.js): a creative with
// one of these as something else is dropped, where it would have stopped, or skewed, every ad.
const strings = x => Array.isArray(x) && x.every(s => typeof s === 'string'), count = x => Number.isFinite(x) && x >= 0;
const TYPED = { langs: [strings, 'a list of strings'], hosts: [strings, 'a list of strings'], weight: [count, 'a number, 0 or more'], capPerDay: [count, 'a number, 0 or more'], bytes: [count, 'a number, 0 or more'] };
// How a creative asks to be shown, beyond the player's own way (0.5.0): endCard, storeButton, and for a video loop,
// tap, overrun, fade, backdrop, (0.6.3) skipFrom and (0.6.8) aspectOnly, each as schema/catalogue.schema.json describes it (test/catalogue.test.mjs holds
// these to the schema's bounds). Each is optional, and none is a reason to lose an ad: one that can't be read is left
// out and named in `dropped`, and the creative plays as it would without it. What's left unsaid is the player's to
// fill in. A release from before 0.5.0 reads none of them, and plays the creative its own way.
const BAD = Symbol('bad'), obj = x => !!x && typeof x === 'object' && !Array.isArray(x), between = (v, lo, hi) => Number.isFinite(v) && v >= lo && v <= hi;
const ANCHOR = /^(top|middle|bottom)-(left|center|right)$/, SHAPES = ['portrait', 'landscape'], STORES = ['ios', 'android'];
const when = v => v === 'end' || count(v);
const place = p => obj(p) && (p.anchor == null || ANCHOR.test(p.anchor)) && (p.width == null || between(p.width, 64, 1000)) && ['x', 'y'].every(k => p[k] == null || between(p[k], -1280, 1280));
const only = (o, keys) => Object.fromEntries(keys.filter(k => o[k] != null).map(k => [k, o[k]]));
const ANY = {
  endCardSecs: v => between(v, 0, 30) ? v : BAD,
  endCardCta(v, c, file) {
    if (!obj(v) || !['large', 'compact', 'custom'].includes(v.type)) return BAD;
    if (v.during != null && typeof v.during !== 'boolean' || v.darken != null && typeof v.darken !== 'boolean') return BAD;
    if (v.fade != null && typeof v.fade !== 'boolean' && !between(v.fade, 0, 5)) return BAD;
    const common = { type: v.type, ...only(v, ['during']), ...(v.fade != null && { fade: v.fade === true || v.fade > 0 ? 0.5 : 0 }) };
    if (v.type === 'large') return { ...common, darken: v.darken ?? true };
    if (v.type === 'compact') return common;
    const image = file(v.image), pulse = v.pulse;
    if (!image || !place(v)) return BAD;
    if (pulse != null && !(obj(pulse) && (pulse.maxSize == null || between(pulse.maxSize, 100, 200)) && (pulse.secs == null || between(pulse.secs, 0.1, 60)))) return BAD;
    return { ...common, image, ...only(v, ['anchor', 'width', 'x', 'y']), ...(pulse && { pulse: { maxSize: pulse.maxSize ?? 105, secs: pulse.secs ?? 1 } }) };
  },
  // a playable's `skipFrom`, by the name a release from 0.6.3 to 0.6.7 doesn't take for a video's alone (validate gives it back as `skipFrom`)
  minSecs: (v, c) => count(v) && v <= c.secs + 0.05 ? v : BAD,
  aspectOnly: v => typeof v === 'boolean' ? v : BAD,   // a video's or a playable's: kept to the shape of screen it says (`aspect`)
  endCard(v, c, file) {
    if (!obj(v)) return BAD;
    const art = { portrait: file(v.portrait), landscape: file(v.landscape) };
    return (art.portrait || art.landscape) && SHAPES.every(s => v[s] == null || art[s]) ? art : BAD;   // one given and unreadable: not half a card
  },
  storeButton(v, c, file) {
    if (!obj(v)) return BAD;
    const pulse = v.pulse === true ? {} : v.pulse || null, picture = { ios: file(v.ios), android: file(v.android) };
    if (STORES.some(s => v[s] != null && !picture[s]) || SHAPES.some(s => v[s] != null && !place(v[s]))) return BAD;
    if (pulse && !(obj(pulse) && (pulse.secs == null || between(pulse.secs, 0.1, 60)) && (pulse.scale == null || between(pulse.scale, 1, 2)))) return BAD;
    return { ...picture, ...Object.fromEntries(SHAPES.filter(s => v[s]).map(s => [s, only(v[s], ['anchor', 'width', 'x', 'y'])])), ...(pulse && { pulse: only(pulse, ['secs', 'scale']) }) };
  },
};
const VIDEO = {
  endCardMode: v => v === 'orientation' ? v : BAD,
  loop: (v, c) => obj(v) && count(v.from) && v.from < c.secs ? { from: v.from } : BAD,
  tap: v => obj(v) && (v.button != null || v.whole != null) && ['button', 'whole'].every(k => v[k] == null || when(v[k])) ? only(v, ['button', 'whole']) : BAD,
  overrun: v => typeof v === 'boolean' ? v : BAD,
  fade: v => between(v, 0, 5) ? v : BAD,
  skipFrom: (v, c) => count(v) && v <= c.secs + 0.05 ? v : BAD,   // pick.js SLACK: its length as near as that
  backdrop: v => ['poster', 'video'].includes(v) ? v : BAD,
};
const SHOWN = Object.entries({ ...ANY, ...VIDEO });
// → `c` with these as the player reads them; each one that can't be read left out, and named by `left(field, why)`
function shown(c, url, left) {
  const file = u => typeof u === 'string' ? url(u) : null, out = { ...c };
  for (const [k, read] of SHOWN) {
    if (c[k] == null) continue;
    const v = k in VIDEO && c.kind !== 'video' ? left(k, 'is a video\'s') : read(c[k], c, file);
    if (v === BAD) left(k, 'can\'t be read');
    if (v === BAD || v === undefined) delete out[k]; else out[k] = v;
  }
  return out;
}
// Every file a creative names, as [field, URL or null]: the one list of them, for whoever publishes or keeps them (tools/lib.mjs)
export const filesOf = c => [['src', c.src], ['poster', c.poster], ...SHAPES.map(s => [`endCard.${s}`, c.endCard?.[s]]), ...STORES.map(s => [`storeButton.${s}`, c.storeButton?.[s]]), ['endCardCta.image', c.endCardCta?.image]];

// Not http, unless it's this machine (a developer's own server). A relative path is as secure as what it's read against.
const LOCAL = ['localhost', '127.0.0.1', '[::1]'];
export function secure(url, base = globalThis.location?.href) {
  let u; try { u = new URL(url, base); } catch { return true; }   // not a URL on its own: a path, read against something that is checked
  return u.protocol !== 'http:' || LOCAL.includes(u.hostname);
}

// The header a signed catalogue's signature comes in, and whether `sig` is `key`'s over `text`. ECDSA P-256 with
// SHA-256, which every web view a game runs in has (the oldest have no Ed25519). `key` is the public point (65 bytes)
// and `sig` r and s (64), each in base64 or base64url. No WebCrypto here (a page not served securely): not signed.
export const SIGNATURE = 'x-catalogue-signature';
const bytes = s => Uint8Array.from(atob(String(s).trim().replace(/-/g, '+').replace(/_/g, '/')), ch => ch.charCodeAt(0));
export async function signedBy(key, text, sig) {
  try {
    const point = await crypto.subtle.importKey('raw', bytes(key), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    return await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, point, bytes(sig), new TextEncoder().encode(text));
  } catch { return false; }
}

export const EMPTY = Object.freeze({ version: 0, pt: null, more: null, exchange: null, apps: {}, creatives: [], dropped: [] });

// Whose game `id` is: what the exchange counts by, and the pick favours a host's own by. A game with no studio named is its own.
export const studioOf = (catalogue, id) => catalogue.apps[id]?.studio || id;
// `raw` as parsed JSON; `base` the catalogue's own URL, which its relative paths are read against.
export function validate(raw, base) {
  const dropped = [], apps = {}, creatives = [], seen = new Set();
  const url = u => { if (!u || !secure(u, base ?? undefined)) return null; try { return base ? new URL(u, base).href : u; } catch { return null; } };   // https, or nothing
  const why = (what, id, reason) => { dropped.push(`${what} ${id}: ${reason}`); };
  if (!raw || typeof raw !== 'object') return { ...EMPTY, dropped: ['catalogue: not an object'] };

  for (const [id, a] of Object.entries(raw.apps ?? {})) {
    if (!a || typeof a.name !== 'string' || !a.name) { why('app', id, 'no name'); continue; }
    const { web, ...rest } = a, page = typeof web?.url === 'string' && /^https:\/\/\S+$/.test(web.url);   // a page of its own, opened on a player's device: https, and nothing else
    if (!a.ios?.id && !a.android?.package && !page) { why('app', id, 'on neither store, and no page of its own'); continue; }
    const links = typeof a.tracking === 'string' ? [a.tracking] : Object.values(a.tracking ?? {});
    if (links.some(l => typeof l !== 'string' || !/^https:\/\/\S+$/.test(l))) { delete rest.tracking; dropped.push(`app ${id}: its tracking link isn't https, and is left out`); }   // the store's own link instead
    apps[id] = { ...rest, ...(page && { web }), id, own: !!a.own, under13: !!(a.under13 ?? a.own), icon: url(a.icon), art: url(a.art) };
  }
  for (const c of Array.isArray(raw.creatives) ? raw.creatives : []) {
    const id = c?.id;
    if (typeof id !== 'string' || !id) { why('creative', '?', 'no id'); continue; }
    if (seen.has(id)) { why('creative', id, 'id used twice'); continue; }
    if (!apps[c.app]) { why('creative', id, `no such app "${c.app}"`); continue; }
    if (!KINDS.includes(c.kind)) { why('creative', id, `kind "${c.kind}"`); continue; }
    if (!(c.secs >= 5 && c.secs <= 60)) { why('creative', id, 'secs must be 5–60'); continue; }
    if (c.aspect && !ASPECTS.includes(c.aspect)) { why('creative', id, `aspect "${c.aspect}"`); continue; }
    if ((c.from && isNaN(Date.parse(c.from))) || (c.to && isNaN(Date.parse(c.to)))) { why('creative', id, 'from/to is not a date'); continue; }
    const odd = Object.keys(TYPED).find(k => c[k] != null && !TYPED[k][0](c[k]));
    if (odd) { why('creative', id, `${odd} must be ${TYPED[odd][1]}`); continue; }
    const src = url(c.src);
    if (!src) { why('creative', id, 'no src'); continue; }
    seen.add(id);
    const read = shown(c, url, (field, reason) => { dropped.push(`creative ${id}: ${field} ${reason}, and is left out`); });
    // the earliest second it may be left at is `skipFrom` to everything after this, whichever kind it is and whichever name said it
    if (read.minSecs != null) { read.skipFrom ??= read.minSecs; delete read.minSecs; }
    creatives.push({ ...read, src, poster: url(c.poster) });
  }
  const exchange = raw.exchange && typeof raw.exchange === 'object' ? raw.exchange : null;   // exchange.js reads it, and trusts none of it
  const more = typeof raw.more === 'string' && /^https:\/\/\S+\/$/.test(raw.more) ? raw.more : null;   // the network's page of its games, for the ⓘ's link to more games (index.js): https, and ending in a / so a game's id after it is a page of that site's and no other's
  return { version: raw.version ?? 1, pt: raw.pt ?? null, more, exchange, apps, creatives, dropped };
}

// What `promise` resolves to if it does within `ms`, else null: for an answer worth having but not worth waiting on.
export const within = (promise, ms) => new Promise(ok => {
  const timer = setTimeout(ok, ms, null);
  timer.unref?.();   // Node (the tests): not a reason to stay running
  promise.then(value => { clearTimeout(timer); ok(value); });
});

// The catalogue, from the first of these that has one with something in it:
//   `url`       the server's; what it gives is kept in `storage`. With `signedBy` (the network's public key), only
//               if it's signed by it; and nothing is asked of a server that isn't https
//   that copy   so a player offline has the last one fetched, not an older one (its signature kept and checked with it)
//   `fallback`  one that shipped with the game, for a first run with no server: its URL, or the
//               catalogue itself as an object (its paths are then read against `url`)
// Each fetch has `timeout` ms, body and all. But with a catalogue already in hand (the copy, or
// one shipped as an object) the server is waited on for `patience` ms and no longer: an ad asked
// for on a network that answers nothing mustn't stand waiting on it. What the server then sends
// is kept all the same, for next time. Never rejects: at worst, an empty catalogue.
import { OURS } from './keys.js';
const KEY = OURS + 'catalogue';
export async function loadCatalogue({ url, fallback = null, fetch, storage, signedBy: key = null, timeout = 4000, patience = 1500 }) {
  const warn = why => { console.warn(`[indie-ads] ${why}`); return null; };
  // `sign`: the server's, which must be the network's if the game knows its key; a file shipped with the game is the game's own
  const get = async (from, sign) => {
    if (!secure(from)) return warn(`the catalogue isn't asked for over http (${from})`);
    const stop = new AbortController(), timer = setTimeout(() => stop.abort(), timeout);
    try {
      const res = await fetch(from, { cache: 'no-cache', signal: stop.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text(), sig = sign && key ? res.headers?.get(SIGNATURE) ?? '' : null;
      if (sig != null && !await signedBy(key, text, sig)) return warn("the server's catalogue isn't signed by the network: not used");
      const cat = validate(JSON.parse(text), from);
      return cat.creatives.length ? { cat, text, sig } : null;   // an emptied file doesn't count
    } catch { return null; } finally { clearTimeout(timer); }
  };
  const full = cat => cat?.creatives.length ? cat : null;
  let kept = null;
  try {
    const text = storage.getItem(KEY), from = storage.getItem(`${KEY}.url`);
    if (text && secure(from) && (!key || await signedBy(key, text, storage.getItem(`${KEY}.sig`) ?? ''))) kept = full(validate(JSON.parse(text), from));
  } catch { /* no copy */ }
  const shipped = fallback?.apps ? full(validate(fallback, url)) : null, here = kept ?? shipped;
  const asked = get(url, true).then(got => {
    if (got) try { if (storage.getItem(KEY) !== got.text || (got.sig && storage.getItem(`${KEY}.sig`) !== got.sig)) { storage.setItem(KEY, got.text); storage.setItem(`${KEY}.url`, url); if (got.sig) storage.setItem(`${KEY}.sig`, got.sig); } } catch { /* full, or private mode: no copy this time */ }
    return got?.cat ?? null;
  });
  const got = await (here ? within(asked, patience) : asked);
  if (got ?? here) return got ?? here;
  return (fallback && !fallback.apps && (await get(fallback))?.cat) || EMPTY;
}
