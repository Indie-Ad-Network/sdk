// ---------- the playable's side ----------
// A playable is one HTML file written for an ad network's web view, which hands it a global
// `mraid` (MRAID 2/3, the IAB's standard). Here the player is that web view: `shim` runs
// inside the playable's frame before anything of its own, and stands in for the network.
// So a partner's existing playable drops in unchanged.
//
// The frame is sandboxed with no origin of its own: it can run scripts and nothing else. It
// can't read the host game's page, storage or cookies, and can't open windows or navigate the
// game's page. And it can ask for nothing outside itself (LOCKED, below): no request leaves a
// player's device for anyone a playable's maker chose.
// All it can do is post these to the player (player.js), which decides what they're worth:
//   { houseAds: 'open' }       its install button: the player opens the store, with its own link
//   { houseAds: 'complete' }   it says it's done (mraid.close())
//   { houseAds: 'touch' }      the first touch
//   { houseAds: 'step', name } it got somewhere its maker wants counted (houseAds.step('board2')):
//                              once a showing each, a dozen names at most, for the admin's funnel
//   { houseAds: 'error', message }
// and hear { houseAds: 'viewable', value } and { houseAds: 'volume', value } from it.

export function shim() {
  const listeners = {};
  let viewable = true, volume = 100;
  const tell = (type, more) => parent.postMessage({ houseAds: type, ...more }, '*');
  const fire = (event, ...args) => { for (const f of [...(listeners[event] ?? [])]) try { f(...args); } catch (e) { console.error(e); } };
  const size = () => ({ width: innerWidth, height: innerHeight }), place = () => ({ x: 0, y: 0, ...size() });

  // with no origin, touching storage throws: a playable that remembers something gets a Map
  for (const name of ['localStorage', 'sessionStorage']) {
    try { void window[name].length; } catch {
      const m = new Map();
      Object.defineProperty(window, name, { configurable: true, value: {
        getItem: k => m.has(k) ? m.get(k) : null, setItem: (k, v) => { m.set(k, String(v)); }, removeItem: k => { m.delete(k); },
        clear: () => m.clear(), key: i => [...m.keys()][i] ?? null, get length() { return m.size; },
      } });
    }
  }

  window.mraid = {
    getVersion: () => '3.0', getState: () => 'default', isViewable: () => viewable, getPlacementType: () => 'interstitial',
    // 'ready' is said to each who asks, once: firing it to all for every one who asked started a playable with two listeners twice
    addEventListener(event, f) { (listeners[event] ??= []).push(f); if (event === 'ready') setTimeout(() => { if (listeners.ready.includes(f)) try { f(); } catch (e) { console.error(e); } }); },
    removeEventListener(event, f) { listeners[event] = (listeners[event] ?? []).filter(g => g !== f); },
    open: url => tell('open', { url: String(url ?? '') }),
    close: () => tell('complete'), unload: () => tell('complete'),
    useCustomClose() {}, expand() {}, resize() {}, setOrientationProperties() {}, setExpandProperties() {}, setResizeProperties() {},
    getOrientationProperties: () => ({ allowOrientationChange: false, forceOrientation: 'none' }),
    getExpandProperties: () => ({ ...size(), useCustomClose: true, isModal: true }),
    supports: () => false, getMaxSize: size, getScreenSize: size, getCurrentPosition: place, getDefaultPosition: place,
    getAudioVolume: () => volume, getCurrentAppOrientation: () => ({ orientation: innerWidth > innerHeight ? 'landscape' : 'portrait', locked: true }),
  };
  // not MRAID's: this network's own, for a playable written for it. `window.houseAds?.step('board2')` elsewhere does nothing
  window.houseAds = { step: name => tell('step', { name: String(name) }) };
  // the other networks' install calls, for a playable built for one of them
  window.install = () => tell('open');                                   // Mintegral
  window.FbPlayableAd = { onCTAClick: () => tell('open') };              // Meta
  window.ExitApi = { exit: () => tell('open') };                         // Google Ads

  addEventListener('message', e => {
    if (e.source !== parent) return;
    const { houseAds: type, value } = e.data ?? {};
    if (type === 'viewable' && value !== viewable) { viewable = value; fire('viewableChange', viewable); }
    if (type === 'volume') { volume = value; fire('audioVolumeChange', volume); }
  });
  addEventListener('pointerdown', () => tell('touch'), { once: true, capture: true });
  addEventListener('error', e => tell('error', { message: String(e.message) }));
  addEventListener('unhandledrejection', e => tell('error', { message: String(e.reason) }));
}

// What a playable's page may load: what's written into it (inline, data: and blob:), and nothing fetched. MRAID asks
// no such thing, and a playable made for another network may reach for a font or call home: here that fails, as it
// would with no signal, so that showing an ad tells nobody but this network that it was shown. The policy goes in
// ahead of everything of the page's own, which is the only place a page's policy holds for all of it. What it can't
// stop is the frame sending itself to another address: the player sees that and takes the frame away (player.js).
export const LOCKED = "default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' data: blob:; style-src 'unsafe-inline' data: blob:; img-src data: blob:; media-src data: blob:; font-src data: blob:; connect-src data: blob:; worker-src data: blob:; child-src data: blob:; form-action 'none'; base-uri 'none'";

// The playable's HTML with that policy and the shim in it, ahead of its own scripts, and the network's
// mraid.js tag (there is no such file here) out.
export function withShim(html) {
  const tag = `<meta http-equiv="Content-Security-Policy" content="${LOCKED}"><script>(${shim})()</script>`;
  const out = html.replace(/<script\b[^>]*\bsrc=["'][^"']*mraid\.js["'][^>]*>\s*<\/script>/gi, '');
  for (const after of [/<head\b[^>]*>/i, /<html\b[^>]*>/i, /<!doctype[^>]*>/i]) {
    const m = out.match(after);
    if (m) return out.slice(0, m.index + m[0].length) + tag + out.slice(m.index + m[0].length);
  }
  return tag + out;
}
