// ---------- what this player has been shown ----------
// Kept per host in the host's own storage: when each creative was shown (for its daily cap,
// and the host's `perDay`), which was last (never twice running), how many of each game's ads
// were watched to the end (a host can make a collection of it), and each game's fatigue
// (exchange.js): showings since its last store tap, how many times it has rested, and until
// when it rests now. Nothing here leaves the device.
import { recent, DAY } from './pick.js';
import { MAX_REST } from './exchange.js';

export function openHistory(storage, key) {
  let h;
  try { h = JSON.parse(storage.getItem(key)); } catch { /* unreadable: start again */ }
  h = { shown: {}, last: null, watched: {}, apps: {}, ...h };
  const save = () => { try { storage.setItem(key, JSON.stringify(h)); } catch { /* full or private: it lasts the session */ } };
  return {
    get: () => h,
    // a creative of `app` shown; with `fatigue` ({ after, rest, grow }), the `after`th showing
    // since a store tap rests the game: rest × grow^(times it has rested) days, at most MAX_REST
    shown(id, now, { app = null, fatigue = null } = {}) {
      for (const [k, times] of Object.entries(h.shown)) {   // a day on, a showing no longer counts
        h.shown[k] = recent(times, now);
        if (!h.shown[k].length) delete h.shown[k];
      }
      (h.shown[id] ??= []).push(now); h.last = id;
      if (app && fatigue?.after > 0) {
        const a = h.apps[app] ??= { n: 0, rests: 0, until: 0 };
        if (++a.n >= fatigue.after) { a.until = now + Math.min(MAX_REST, fatigue.rest * fatigue.grow ** a.rests) * DAY; a.rests++; a.n = 0; }
      }
      save();
    },
    // the player tapped through to the game's store page: its fatigue starts over
    tapped(app) { if (h.apps[app]) { delete h.apps[app]; save(); } },
    watched(app) { h.watched[app] = (h.watched[app] ?? 0) + 1; save(); },
  };
}

export function memoryStorage() {
  const m = new Map();
  return { getItem: k => m.get(k) ?? null, setItem: (k, v) => { m.set(k, String(v)); }, removeItem: k => { m.delete(k); } };
}
// localStorage where there is one that works; a Map's worth of memory where there isn't
export function safeStorage() {
  try { const s = globalThis.localStorage; s.setItem('houseAds.probe', '1'); s.removeItem('houseAds.probe'); return s; } catch { return memoryStorage(); }
}
