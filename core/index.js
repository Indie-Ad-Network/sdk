// ---------- house ads ----------
// Rewarded ads for our own and our friends' games, for any game to drop in:
//
//   const ads = createHouseAds({
//     host: 'tca',                                   // this game's id in the catalogue: never advertised to itself
//     rating: '9+',                                  // this game's age rating: nothing rated above it is shown
//     catalogue: 'https://…/house-ads/catalogue.json',
//     placements: { saveMe: { maxSecs: 30, reward: '+3 ♥' }, jobs: { maxSecs: 15, reward: 'a speed-up' } },
//     onEvent: e => myAnalytics(e),                  // every event, for the host's own analytics
//     ingest: 'https://…workers.dev/e',              // and to the package's own (analytics.js): how creatives compare
//   });
//   const { granted } = await ads.show('saveMe');
//   if (granted) …the host gives its own reward
//
// Call ads.offered('saveMe') when a placement's button is put in front of the player: shows
// over offers is how many chose to watch.
//
// Create it early (at boot, when idle): it fetches the catalogue and downloads a few creatives
// ahead, on a network that costs the player nothing, so nothing streams when an ad is shown
// (cache.js).
//
// The reward never depends on there being an ad: with nothing ready, a still card of one of
// the games plays for a few seconds; with no catalogue at all, it's granted at once.
// Leaving before the countdown ends forfeits it.
//
// A placement says the longest creative it takes (`maxSecs`), the kinds (`kinds`), and what
// watching earns, as the player is told it (`reward`). One with `format: 'interstitial'` is
// the host's choice, not the player's (player.js): no reward, closable after `skipAfter`
// seconds (5), and with nothing ready it shows nothing at all.
//
// A host with other ads to show (a paid network's) hands its network to show(), and whose
// slot it is is the package's to say:
//
//   const { granted, via } = await ads.show('saveMe', { paid: () => myNetwork.showRewarded() });
//
// `paid()` resolves { granted } once its ad has been shown and closed, or null (or rejects) when
// it has none to show. The order, each time (exchange.js turn()):
//   1. a game we owe showings (the ingest's /mix says which), if one of its ads is ready: that
//   2. else the house's share of the slots, by chance
//   3. else the paid network's; and if it has none, a house ad after all, the still card at worst
// `via` is 'house' or 'paid'. Every limit on what a player is shown still holds, for a game
// owed as for any other: a creative's `capPerDay`, a game's rest, the player's `perDay`. Past
// them it isn't ready, so it isn't first (test/exchange.test.mjs), and the slot is rolled for. ads.demand('saveMe') is the same
// question without the showing, for a host that would sooner do it itself:
//
//   const { share, available, owed } = await ads.demand('saveMe');
//   if (owed.length) …ads.show('saveMe', { among: owed })
//
// `available` is how many creatives this player could be shown here, now: none if they have
// every game, have seen each as often as it may be shown today, have seen the host's `perDay`
// of house ads today, or have been shown the rest so often, with no store tap, that they're
// resting (pick.js, history.js). `share` is what the network asks of this placement's slots
// (exchange.js): the catalogue's word, or with `mix: '<url>'` the ingest's, which knows what's
// owed between studios. It is 0 when nothing is available. `owed` is the games among them whose
// studios this host's owes showings.
//
// Every address is https: one that's http (but for this machine's own, a developer's) is not asked, and said so in
// the console. `signedBy: '<the network's public key>'` takes the server's catalogue only with the network's
// signature on it (catalogue.js): the key is the dashboard's to give, under Network. Left out, the key is the one in
// the catalogue shipped with the game, if that has one (`signedBy`, which a signing server writes into what it serves).
//
// `catalogue` is the server's URL, or [the server's, one shipped with the game] (its URL, or
// the object itself; catalogue.js says in what order they're used), or the catalogue itself as an object.
//
// The player's own words are in the player's language (strings/, locale.js): the device's, or
// the game's if it has a setting of its own: `lang: 'fr'`, or `lang: () => settings.language`.
// A language alone is enough: its region is taken from the device ("es" on a phone set to
// es-MX is Latin America's Spanish). The catalogue's `line`s may be given per language too.
//
// Optional: `os` ('ios' | 'android'; guessed), `native` (what the app shell does better than a
// page can, e.g. the Capacitor plugin: any of { openStore(link), metered(), banner(link | null) }),
// `age()` (the player's reported age, or null), `muted()`, `aspect()` ('16:9' | '9:16' | null: the
// screen's shape, for a page that can't yet see its own), `cache: false` (keep nothing, always
// stream), `storage`, `fetch`, `now`, `rand`.
//
// `consent: false` where the player hasn't agreed to anything being kept on their device (the UK and the EEA ask
// it for advertising: consent.js, whose cmpConsent() reads a consent platform's answer). Nothing is then kept
// there, nor read back: ads stream, what's been shown is remembered until the game closes, and what an earlier
// session kept is taken away, counts not yet sent among it. Left out, or true: as ever. It's read once: when the
// answer changes, make this again in a page loaded afresh (one made before goes on as it was until its page goes).
//
// `test()`, true while a developer is trying the ads out: the host's own ads, games that are
// resting and creatives at their daily cap all count (pick.js), and nothing is sent to the
// ingest, so a test showing is never counted as one a studio owes or is owed. ads.prefetch()
// downloads what that makes wanted. A player's report of an ad is still sent, marked as a test,
// so the way a report goes can be tried before release; the dashboard keeps those apart.
//
// `reports`: where a player's report of an ad is sent (the ingest's /flag); left out, /flag beside
// `ingest`. A game that counts nothing from its own development builds (no `ingest` there) can
// still name it, and see its test reports arrive.
import { loadCatalogue, validate, within, secure, filesOf } from './catalogue.js';
import { pick, eligible, cardFor, wanted } from './pick.js';
import { mix as mixOf, believed, shareOf, turn, settings as settingsOf } from './exchange.js';
import { storeLink, cta } from './storeLinks.js';
import { openHistory, safeStorage, memoryStorage, forget } from './history.js';
import { openCache, forgetCache } from './cache.js';
import { createReporter } from './analytics.js';
import { VERSION, SDK } from './wire.js';
import { play } from './player.js';
import { stringsFor, localised } from './locale.js';

export { storeLink, cta } from './storeLinks.js';
export { validate } from './catalogue.js';
export { cmpConsent } from './consent.js';

const guessOs = () => /android/i.test(navigator.userAgent) ? 'android' : 'ios';   // a desktop browser gets the App Store's web page
// The screen's shape: the page's own, once it has been laid out. A web view not yet shown hasn't (0 × 0), which is
// when the first creatives are chosen for download: then the shell's word (`aspect()`), or the screen's.
const shape = told => { const seen = innerWidth > 0 && innerHeight > 0; if (!seen && told) return told; const [w, h] = seen ? [innerWidth, innerHeight] : [screen.width, screen.height]; return w > h ? '16:9' : '9:16'; };
// a page's own ways, where the shell gives none
const WEB = {
  openStore: link => void open(link.fallback ?? link.url, '_blank', 'noopener'),
  metered: () => { const c = navigator.connection; return !!c && (c.saveData || c.type === 'cellular'); },   // where the browser says
};

export function createHouseAds({ host, rating = null, catalogue, placements = {}, onEvent, ingest: ingestAt = null, reports: reportsAt = null, mix: mixFrom = null, signedBy = null, lang = null, os = guessOs(), native = {}, age = () => null, muted = () => false, aspect = () => null,
  test = () => false, consent, cache: wantsCache = true, storage: given, fetch = globalThis.fetch?.bind(globalThis), now = Date.now, rand = Math.random }) {
  // Has the player agreed to anything being kept on the device (consent.js)? Said once, here: a game whose player
  // changes their mind makes this again. Without it: memory for storage, nothing cached, and what was kept before taken away.
  const agreed = consent !== false, keep = agreed && wantsCache, storage = agreed ? given ?? safeStorage() : memoryStorage();
  if (!agreed) { forget(given); forgetCache(); }
  const https = (what, u) => { if (u == null || secure(String(u))) return u; console.error(`[house-ads] ${what} isn't https, and isn't used: ${u}`); return null; };
  const ingest = https('ingest', ingestAt), mixUrl = https('mix', mixFrom);
  const shell = { ...WEB, ...native }, inApp = !!native.openStore;
  const history = openHistory(storage, `houseAds.${host}`);
  const reporter = ingest ? createReporter({ url: String(ingest), host, os, storage, fetch }) : null;
  // an event, to the host's analytics and the package's own: what happened, and to which creative of which game
  const tell = (event, placement, creative, app, fields) => {
    const e = { event, host, placement, creative: creative?.id ?? null, app: app?.id ?? null, kind: creative?.kind ?? null, t: now(), ...fields };
    try { onEvent?.(e); } catch (err) { console.error(err); }
    if (!test()) reporter?.report(e);   // a developer's test showing is no studio's to count
  };
  // A player's report of an ad (player.js): to the host's analytics, and to `reports` (or /flag beside the ingest's /e),
  // with what was showing and which release showed it. Sent once, now: a report isn't kept for later as counts are.
  // A test showing's goes too, marked: it's how a developer sees that reports arrive (the dashboard keeps them apart).
  const flagUrl = https('reports', reportsAt) ?? (() => { try { return ingest ? new URL('flag', new URL(String(ingest), globalThis.location?.href)).href : null; } catch { return null; } })();
  const reported = (placement, creative, app, locale, { message, secs, kind }) => {
    const about = { host, placement, creative: creative.id, app: app.id, kind, secs, message };
    try { onEvent?.({ event: 'report', ...about, t: now() }); } catch (err) { console.error(err); }
    if (flagUrl) Promise.resolve().then(() => fetch(flagUrl, { method: 'POST', body: JSON.stringify({ v: VERSION, sdk: SDK, os, lang: locale, ...about, ...test() && { test: true } }), headers: { 'content-type': 'text/plain' }, keepalive: true })).catch(() => { /* offline: it isn't told */ });
  };
  const [url, fallback] = [catalogue].flat();
  // The network's key: the game's word, or the one in the catalogue it shipped with (a signed server puts its public key in
  // every catalogue it serves, so a copy taken for shipping brings it). Never the one in a catalogue just fetched: that's the thing in doubt.
  const key = signedBy ?? (typeof fallback?.signedBy === 'string' && fallback.apps ? fallback.signedBy : null);
  const loaded = catalogue?.apps ? Promise.resolve(validate(catalogue)) : loadCatalogue({ url: String(url), fallback: fallback?.apps ? fallback : fallback && String(fallback), fetch, storage, signedBy: key });
  loaded.then(cat => cat.dropped.forEach(d => console.warn(`[house-ads] dropped ${d}`)));
  // beside what a creative plays: what dresses its end card, with the button's picture for this store and not the other's
  const dressing = c => filesOf(c).filter(([field, url]) => url && (field.startsWith('endCard.') || field === `storeButton.${os}`));
  const cached = openCache({ fetch, now, keep, more: dressing });
  let showing = false;
  const words = () => stringsFor(typeof lang === 'function' ? lang() : lang, globalThis.navigator?.languages ?? []);

  // What the network asks of this host, and which games it owes: the ingest's answer, then the
  // last one it gave (for a week: a debt long paid mustn't be asked for for ever), then the
  // catalogue's own. Asked at the start, beside the catalogue, and again when the game comes back
  // to the front. The ingest is waited on for MIX_PATIENCE and no longer (there is always an older
  // answer to go by, and an ad asked for mustn't stand waiting); what it says after that is used from then on.
  const MIX_KEY = `houseAds.mix.${host}`, MIX_KEEP = 7 * 864e5, MIX_AGE = 6e5, MIX_PATIENCE = 1500;
  let mixAt = 0, mixed;
  async function askMix() {
    const stop = new AbortController(), timer = setTimeout(() => stop.abort(), 4000);
    try {
      const res = await fetch(`${mixUrl}${String(mixUrl).includes('?') ? '&' : '?'}host=${encodeURIComponent(host)}`, { signal: stop.signal });
      const answer = res.ok && believed(await res.json());
      if (answer) { try { storage.setItem(MIX_KEY, JSON.stringify({ ...answer, at: now() })); } catch { /* full or private */ } return answer; }
    } catch { /* offline, or no such server: the last answer */ } finally { clearTimeout(timer); }
    return null;
  }
  async function loadMix() {
    const at = mixAt = now();
    if (mixUrl) {
      const asked = askMix(), answer = await within(asked, MIX_PATIENCE);
      if (answer) return answer;
      asked.then(a => { if (a && mixAt === at) mixed = Promise.resolve(a); });   // late, and still the latest asked: better than what's below
      try { const kept = JSON.parse(storage.getItem(MIX_KEY)), last = now() - kept.at < MIX_KEEP && believed(kept); if (last) return last; } catch { /* none kept */ }
    }
    return believed(mixOf({ catalogue: await loaded, host }));
  }
  mixed = loadMix();

  // The game is back at the front, as the page sees it or as the host says (a day gone by): the mix is asked again if it's old.
  // What else is on the device is never asked: which games a player has is theirs to know.
  const refresh = () => { if (mixUrl && now() - mixAt > MIX_AGE) mixed = loadMix(); };
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  // who the player is and where things stand, to the pick
  const audience = async cat => ({ catalogue: cat, host, rating, age: age(), history: history.get(), now: now(), aspect: shape(aspect()), rand, boost: (await mixed).boost, lang: words().locale, test: !!test(), perDay: settingsOf(cat, host).perDay });
  // a playable's page, handed on and no longer held here: megabytes, for the length of the ad
  const page = media => { const html = media?.html; if (html != null) media.html = null; return html; };
  const nothing = granted => ({ granted, shown: false, via: null, creative: null, app: null, kind: null, watchedSecs: 0 });

  // Download what's wanted next, if the network costs the player nothing. Resolves the ids fetched.
  async function prefetch() {
    const [cat, cache] = await Promise.all([loaded, cached]);
    if (!keep) return [];   // nothing is kept, so nothing is downloaded ahead: the network needn't be asked about
    try { if (await shell.metered()) return []; } catch { /* can't tell: go ahead */ }
    return cache.fill({ creatives: cat.creatives, wanted: wanted({ ...await audience(cat), placements }) });
  }
  let settled;   // the latest download: demand() is truest after it
  const refetch = () => (settled = prefetch().catch(e => { console.warn(`[house-ads] ${e.message}`); return []; }));
  const ready = refetch();

  // What there is to show this player in this placement now, and what share of the host's
  // slots the network asks for. Only creatives whose files are here count: an ad that would
  // be the still card is no reason to pass over a paid one.
  async function demand(placement) {
    const [cat, cache, answer] = await Promise.all([loaded, cached, mixed]);
    const list = eligible({ ...await audience(cat), placement: placements[placement], ready: c => cache.has(c) });
    const apps = [...new Set(list.map(c => c.app))];
    return { share: list.length ? shareOf(answer, placement) : 0, available: list.length, apps, owed: apps.filter(a => answer.owedTo.includes(a)) };
  }

  // `paid`: the host's other network, for the slots that aren't the house's (see the top).
  // `among`: only these games' ads (ids), for a host that decides the order itself from demand()
  async function show(placement, { reward = placements[placement]?.reward, paid = null, among = null } = {}) {
    const { format = 'rewarded', skipAfter } = placements[placement] ?? {}, interstitial = format === 'interstitial';
    if (showing) return nothing(false);
    showing = true;
    let media = null;
    among &&= new Set(among);
    try {
      if (paid) {
        const asked = await demand(placement), whose = turn(asked, rand);
        if (whose === 'owed') among = new Set(asked.owed);   // the game owed, not merely likelier
        else if (!whose) {
          const out = await Promise.resolve().then(paid).catch(err => { console.warn(`[house-ads] paid: ${err?.message ?? err}`); return null; });
          if (out) { tell('paid', placement); return { ...nothing(!!out.granted && !interstitial), shown: true, via: 'paid' }; }   // counted, as a slot the house didn't take
        }   // it had none: a house ad after all
      }
      const [cat, cache] = await Promise.all([loaded, cached]), who = { ...await audience(cat), placement: placements[placement], among };
      // the pick, of those whose files are here; one whose file has gone is passed over for the next
      const gone = new Set();
      let creative;
      while ((creative = pick({ ...who, ready: c => !gone.has(c.id) && cache.has(c) }))) {
        if ((media = await cache.media(creative))) break;
        gone.add(creative.id);
      }
      const missed = !creative && !!pick(who);   // there was one to show, had its file been here
      if (!creative && interstitial) return nothing(false);   // no still card between two things the player was doing
      creative ??= cardFor(who);
      const app = creative && cat.apps[creative.app];
      const emit = (event, fields) => { if (event === 'store_open' && app) history.tapped(app.id); tell(event, placement, creative, app, fields); };
      if (!creative) { emit('fail', { why: 'nothing' }); emit('reward', { secs: 0 }); return nothing(true); }

      if (creative.kind !== 'card') history.shown(creative.id, now(), { app: creative.app, fatigue: test() ? null : settingsOf(cat, host).fatigue });   // a developer's test tires no game
      emit('show');
      if (missed) emit('cache_miss');
      const link = storeLink(app, { os, native: inApp, host, campaign: creative.campaign, creative: creative.id, placement, pt: app.own ? cat.pt : null });
      const said = words(), inWords = x => ({ ...x, line: localised(x.line, said.locale) });
      // as it's on the device: the file it plays, and what dresses its card, each from the cache where it's there
      const here = (field, url) => media?.files?.[field] ?? url;
      const local = { ...creative, ...(media?.src && { src: media.src }), ...(creative.endCard && { endCard: Object.fromEntries(Object.entries(creative.endCard).map(([shape, url]) => [shape, here(`endCard.${shape}`, url)])) }) };
      const { granted, watchedSecs, kind } = await play({ creative: inWords(local), app: inWords(app), html: page(media), link, ctaText: cta(app, os, now(), said.t, link), reward, format, skipAfter, picture: here(`storeButton.${os}`, creative.storeButton?.[os] ?? null), limit: creative.overrun ? who.placement?.maxSecs : null, muted: muted(), emit, openStore: shell.openStore, banner: shell.banner, report: r => reported(placement, creative, app, said.locale, r), words: said });
      if (granted && kind !== 'card') history.watched(app.id);
      return { granted: granted && !interstitial, shown: true, via: 'house', creative: creative.id, app: app.id, kind, watchedSecs };
    } finally {
      showing = false;
      media?.release();
      refetch();   // what's wanted next has changed
    }
  }

  return {
    // the catalogue as it was read (never rejects: at worst, an empty one)
    catalogue: loaded,
    // resolves once the catalogue is in and what's wanted first is downloaded: the ids fetched
    ready,
    // the same, of the latest download: after an ad, what's wanted next is fetched
    settled: () => settled,
    show,
    demand,
    // the host knows something changed that a page can't see (the app back at the front)
    refresh,
    // download what's wanted now (after test() changes, say); resolves the ids fetched, as settled() then does
    prefetch: refetch,
    // a placement's button is in front of the player (once per time it's put there)
    offered: placement => tell('offer', placement),
    // how many of each game's ads this player has watched to the end: { tcb: 3, … }
    watched: () => ({ ...history.get().watched }),
  };
}
