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
// ingest's, in the header SIGNATURE: ingest/src/store.js), so whoever can stand between a player
// and the server, false certificate and all, still can't hand the game ads of their own: what
// isn't signed is as if the server hadn't answered. The catalogue names each creative's file by
// its sha256 (cache.js checks it), so the signature covers those too.

const KINDS = ['video', 'playable'];
const ASPECTS = ['9:16', '16:9'];
// What's read of a creative as the type it should be, with no second look (pick.js, cache.js): a creative with
// one of these as something else is dropped, where it would have stopped, or skewed, every ad.
const strings = x => Array.isArray(x) && x.every(s => typeof s === 'string'), count = x => Number.isFinite(x) && x >= 0;
const TYPED = { langs: [strings, 'a list of strings'], hosts: [strings, 'a list of strings'], weight: [count, 'a number, 0 or more'], capPerDay: [count, 'a number, 0 or more'], bytes: [count, 'a number, 0 or more'] };
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

export const EMPTY = Object.freeze({ version: 0, pt: null, exchange: null, apps: {}, creatives: [], dropped: [] });

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
    creatives.push({ ...c, src, poster: url(c.poster) });
  }
  const exchange = raw.exchange && typeof raw.exchange === 'object' ? raw.exchange : null;   // exchange.js reads it, and trusts none of it
  return { version: raw.version ?? 1, pt: raw.pt ?? null, exchange, apps, creatives, dropped };
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
const KEY = 'houseAds.catalogue';
export async function loadCatalogue({ url, fallback = null, fetch, storage, signedBy: key = null, timeout = 4000, patience = 1500 }) {
  const warn = why => { console.warn(`[house-ads] ${why}`); return null; };
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
