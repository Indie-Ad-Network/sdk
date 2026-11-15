// ---------- house-ads in a native game's web view ----------
// For a game that isn't a web page (Unity: unity/): the whole of core/ in one page
// (tools/build-player.mjs makes unity/Runtime/Resources/HouseAdsPlayer.html of this), which
// the game loads into a web view laid over itself. The game's native side calls
// `houseAdsHost` by evaluating JavaScript; the page answers through the one function the web
// view gives it, `window.nativeWebView.postMessage(string)` (unity/Runtime/NativeWebView.cs),
// with JSON: { k, items: [message] }.
//
// `k` is a key the game makes for each page and hands over in start(). A playable is someone
// else's code in a frame of this page, and on Android a frame can call postMessage too; it
// can't read this page, so it can't know the key, and the game hears only messages that have
// it. (Before start() there is no frame, and only 'loaded' is said.)
//
//   the game calls                              the page says
//   start(config)                               { type: 'loaded' }           the page is up: start() may be called
//   show(n, placement, reward, muted, lang)
//   …                                           { type: 'apps', apps }       the catalogue's games: which are installed? (Android's to answer; iOS isn't asked)
//   offered(placement)                          { type: 'demand', demand }   [{ placement, share, available, owed }] (core/index.js demand(); owed: how many games)
//   test(on)          a developer trying the ads out (core/index.js test())
//   device({ installed: [ids], metered })       { type: 'event', e }         every event of the player, for the game's analytics
//   storeClosed()                               { type: 'store', link }      open this store link; storeClosed() when it's put away
//                                               { type: 'banner', link }     the store's banner for link.id at the foot of the screen; no id: away
//   back()            the device's back button: the player's ✕
//                                               { type: 'done', n, … }       show(n)'s result
//                                               { type: 'idle' }             nothing under way: the web view may be put away
//
// The game is asked what a page can't know (which games are installed, whether the network
// costs the player) once the catalogue is in, and tells it again whenever it may have
// changed. `demand` is sent whenever it may have: so the game always has the answer to hand,
// without asking, when it must decide in one frame whose ad to show.
import { createHouseAds } from '../core/index.js';

const DEVICE_WAIT = 1500;   // ms to wait for the game's first word on what's installed
const IDLE_AFTER = 4000;    // ms of nothing before saying so: the analytics' last send is 2 s after an ad

let key = '';
const post = (type, fields) => window.nativeWebView?.postMessage(JSON.stringify({ k: key, items: [{ type, ...fields }] }));

let ads = null, placements = {}, muted = false, lang = null, testing = false, busy = 0, idleTimer = null;
let device = { installed: new Set(), metered: false }, deviceKnown, storeDone = null;
const known = new Promise(ok => { deviceKnown = ok; });

// flat, and all strings: for a native side with no more than a field-by-field JSON reader
const flat = link => ({ via: link?.via ?? '', url: link?.url ?? '', fallback: link?.fallback ?? link?.url ?? '', id: link?.sheet ? String(link.sheet.id) : '', ct: link?.sheet?.ct ?? '', pt: link?.sheet?.pt != null ? String(link.sheet.pt) : '' });
const native = {
  openStore: link => new Promise(done => { storeDone = done; post('store', { link: flat(link) }); }),
  banner: link => post('banner', { link: flat(link) }),   // an id: the App Store's banner for it; none: the banner away
  isInstalled: async app => { await known; return device.installed.has(app.id); },
  metered: async () => { await known; return device.metered; },
};

async function demand() {
  const out = [];
  for (const placement of Object.keys(placements)) { const { share, available, owed } = await ads.demand(placement); out.push({ placement, share, available, owed: owed.length }); }
  post('demand', { demand: out });
}
// what's available, said before and after something that changes it
const around = async change => { await demand(); await change; await demand(); };
// something is under way while `work` is; when nothing has been for a while, say so
async function during(work) {
  busy++; clearTimeout(idleTimer);
  try { return await work(); } catch (e) { console.error(e); } finally {
    if (!--busy) idleTimer = setTimeout(() => post('idle'), IDLE_AFTER);
  }
}

window.houseAdsHost = {
  // config: { key, lang, host, rating, os, catalogue (URL), shipped (the catalogue object the game shipped with, or null),
  //           ingest, reports, mix (URLs or null; reports: where a report of an ad goes, else /flag beside ingest), placements, age (the player's, or null), test (a developer trying the ads out),
  //           wide (the game's screen is wider than tall: a web view not yet shown can't see its own shape),
//           signedBy (the network's public key, or null: the server's catalogue is taken only if signed by it) }
  start(config) {
    if (ads) return;
    key = String(config.key ?? '');
    lang = config.lang ?? null;
    placements = config.placements ?? {};
    testing = !!config.test;
    ads = createHouseAds({
      host: config.host, rating: config.rating ?? null, os: config.os, placements,
      catalogue: config.shipped ? [config.catalogue, config.shipped] : config.catalogue,
      ingest: config.ingest ?? null, reports: config.reports ?? null, mix: config.mix ?? null, signedBy: config.signedBy ?? null,
      native, age: () => config.age ?? null, aspect: () => config.wide == null ? null : config.wide ? '16:9' : '9:16', muted: () => muted, lang: () => lang, test: () => testing,
      onEvent: e => post('event', { e }),
    });
    during(async () => {
      const cat = await ads.catalogue;
      post('apps', { apps: Object.values(cat.apps).map(a => ({ id: a.id, package: a.android?.package ?? null })) });
      setTimeout(deviceKnown, DEVICE_WAIT);   // a game that never answers: nothing is installed
      await around(ads.ready);   // what's already on the device can be shown at once; then what has just been downloaded
    });
  },
  device({ installed = [], metered = false } = {}) {
    device = { installed: new Set(installed), metered: !!metered };
    deviceKnown();
    if (ads) { ads.refresh(); during(() => around(ads.prefetch())); }   // and what's wanted downloaded, if the network no longer costs: the first word on that isn't the last
  },
  // `language`: the game's, if it has a setting of its own (null: the device's)
  show(n, placement, reward, isMuted, language) {
    muted = !!isMuted;
    lang = language ?? null;
    during(async () => {
      let result = { granted: false, shown: false };
      try { result = await ads.show(placement, reward ? { reward } : undefined); } finally { post('done', { n, ...result }); }
      await around(ads.settled());   // the one just shown may have reached its cap; then what's fetched in its place
    });
  },
  // under way until it's said: the page isn't put away with the offer still unsent
  offered(placement) { if (ads) during(async () => ads.offered(placement)); },
  // what's available changes with it, and what's wanted downloaded
  test(on) {
    testing = !!on;
    if (ads) during(() => around(ads.prefetch()));
  },
  storeClosed() { storeDone?.(); storeDone = null; },
  back() { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true })); },
};
post('loaded');
