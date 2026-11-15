// ---------- the cache ----------
// Creatives are downloaded ahead and played from the device: nothing streams when an ad is
// shown, so a video never stalls in front of the player and an ad works with no signal at
// all. A few are kept ready (index.js says which are wanted, and when the network is one to
// download on); the rest of the budget is the ones shown longest ago, which go first when
// room is needed.
//
// One store for every host: IndexedDB, which a browser, a Capacitor web view and a Unity web
// view all have. Where there isn't one that works (some private modes), openCache() gives a
// source of the same shape that keeps nothing and plays straight from the catalogue's URLs.
//
// A file is the same file by its sha256 when the catalogue gives one (so moving it to another
// URL costs no download), and by its URL when it doesn't.

const DB = 'house-ads', META = 'meta', BLOBS = 'blobs';
const BUDGET = 60e6;           // bytes kept, at most
const GUESS = 8e6;            // a creative whose size the catalogue doesn't say: a 30 s video's worth

export const sameFile = (entry, c) => c.sha256 ? entry.sha256 === c.sha256 : entry.src === c.src;

// What to delete and what to fetch. Pure (test/cache.test.mjs).
//   entries    what's kept: [{ id, src, sha256, bytes, at }], `at` when it was last shown or stored
//   creatives  the catalogue's, all of them
//   wanted     those to have ready, most wanted first
// Dropped: what's no longer in the catalogue, or is but with another file; then, only to make
// room for a wanted one, the unwanted shown longest ago. A wanted one that still won't fit waits.
export function plan({ entries, creatives, wanted, budget = BUDGET }) {
  const byId = new Map(creatives.map(c => [c.id, c]));
  const stale = e => !byId.has(e.id) || !sameFile(e, byId.get(e.id));
  const drop = entries.filter(stale).map(e => e.id), kept = entries.filter(e => !stale(e));
  const have = new Set(kept.map(e => e.id)), want = new Set(wanted.map(c => c.id));
  const spare = kept.filter(e => !want.has(e.id)).sort((a, b) => a.at - b.at);
  let used = kept.reduce((sum, e) => sum + e.bytes, 0);
  const fetch = [];
  for (const c of wanted) {
    if (have.has(c.id)) continue;
    const need = c.bytes ?? GUESS;
    while (used + need > budget && spare.length) { const e = spare.shift(); drop.push(e.id); used -= e.bytes; }
    if (used + need > budget) continue;
    fetch.push(c); used += need;
  }
  return { drop, fetch };
}

const done = req => new Promise((ok, no) => { req.onsuccess = () => ok(req.result); req.onerror = () => no(req.error); });
const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');

// A creative's file, checked against what the catalogue says of it. Throws if it isn't that.
async function download(c, fetch) {
  const res = await fetch(c.src, { cache: 'no-store' });   // this is the cache: no second copy in the browser's own
  if (!res.ok) throw new Error(`${c.id}: HTTP ${res.status}`);
  const blob = await res.blob();   // as a blob, and read into memory only to be checked: no second copy of a 25 MB video made of it
  if (c.bytes && blob.size !== c.bytes) throw new Error(`${c.id}: ${blob.size} bytes, not ${c.bytes}`);
  if (c.sha256 && globalThis.crypto?.subtle && hex(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())) !== c.sha256) throw new Error(`${c.id}: sha256 differs`);
  return blob;
}

// What the player plays a creative from: { src } a video's URL, or { html } a playable's page;
// release() when the ad is over. null if it can't be had.
const fromBlob = async (c, blob) => {
  if (c.kind !== 'video') return { html: await blob.text(), release() {} };
  const src = URL.createObjectURL(blob);
  return { src, release: () => URL.revokeObjectURL(src) };
};

// The source that keeps nothing: every creative is "here", and played from its URL.
const streaming = fetch => ({
  has: () => true,
  fill: async () => [],
  async media(c) {
    if (c.kind === 'video') return { src: c.src, release() {} };
    try { const res = await fetch(c.src); return res.ok ? { html: await res.text(), release() {} } : null; } catch { return null; }
  },
});

// `keep: false` for the streaming source outright.
export async function openCache({ fetch = globalThis.fetch?.bind(globalThis), now = Date.now, keep = true } = {}) {
  let db, meta;
  try {
    if (!keep) throw new Error('not kept');
    const open = indexedDB.open(DB, 1);
    open.onupgradeneeded = () => { open.result.createObjectStore(META, { keyPath: 'id' }); open.result.createObjectStore(BLOBS); };
    db = await done(open);
    meta = new Map((await done(db.transaction(META).objectStore(META).getAll())).map(e => [e.id, e]));
  } catch { return streaming(fetch); }

  // a write is kept only once its transaction has completed: a request's success comes before that
  const write = work => new Promise((ok, no) => {
    const tx = db.transaction([META, BLOBS], 'readwrite');
    tx.oncomplete = () => ok(); tx.onerror = tx.onabort = () => no(tx.error);
    work(tx.objectStore(META), tx.objectStore(BLOBS));
  });
  const remove = id => { meta.delete(id); return write((m, b) => { m.delete(id); b.delete(id); }); };
  const refused = new Set();   // files that weren't what the catalogue said, this session: not fetched again and again
  const fileKey = c => `${c.id} ${c.sha256 ?? c.src}`;
  let filling = null;

  return {
    // is this creative's file here? Synchronous: the pick asks it of every creative
    has: c => { const e = meta.get(c.id); return !!e && sameFile(e, c); },
    // its file to play from, and it counts as just used; null if it has gone (the system may clear storage)
    async media(c) {
      const e = meta.get(c.id);
      try {
        const blob = e && sameFile(e, c) ? await done(db.transaction(BLOBS).objectStore(BLOBS).get(c.id)) : null;
        if (!blob) { if (e) await remove(c.id); return null; }
        e.at = now(); write(m => m.put(e)).catch(() => {});
        return await fromBlob(c, blob);
      } catch { return null; }
    },
    // Bring the cache to what plan() says, one download at a time. A fill under way is the
    // one returned; a download that fails is left for the next fill. Resolves the ids fetched.
    // (`filling` is cleared once the fill has settled, and not inside it: one with nothing to do
    // ends before it's assigned, and clearing it there left it standing for good.)
    fill({ creatives, wanted }) {
      return filling ??= (async () => {
        const fetched = [];
        const todo = plan({ entries: [...meta.values()], creatives, wanted: wanted.filter(c => !refused.has(fileKey(c))) });
        for (const id of todo.drop) await remove(id);
        for (const c of todo.fetch) {
          try {
            const blob = await download(c, fetch), e = { id: c.id, src: c.src, sha256: c.sha256 ?? null, bytes: blob.size, at: now() };
            await write((m, b) => { b.put(blob, c.id); m.put(e); });
            meta.set(c.id, e); fetched.push(c.id);
          } catch (err) { if (/bytes, not|sha256/.test(err.message)) refused.add(fileKey(c)); console.warn(`[house-ads] not cached: ${err.message}`); }
        }
        return fetched;
      })().finally(() => { filling = null; });
    },
  };
}
