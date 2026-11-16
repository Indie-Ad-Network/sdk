// ---------- the package's own analytics ----------
// Every event the player emits, sent to an ingest (the network's server: SERVER.md)
// so creatives can be compared across every game that shows them. The
// host game's own analytics hears the same events through `onEvent`; this is beside that.
//
// What's sent is the event and what it was about (wire.js): the placement, the creative, the
// game advertised, and the seconds watched. Nothing about the player: no device or
// advertising id, no install or session id, nothing from the host's save. The ingest keeps
// only daily counts.
//
// The reporter decides when: a moment after the last event (so an ad's events go together),
// and as the page is hidden (by beacon: a page being closed can't wait for an answer). What
// can't be sent waits in `storage`, so a player offline is counted when they're back.
import { VERSION, FIELDS } from './wire.js';
import { OURS } from './keys.js';

const KEY = OURS + 'outbox', BATCH = 50, KEEP = 300;   // at most KEEP wait; the oldest go first
const SOON = 2000;                                       // ms after the last event

export function createReporter({ url, host, os, storage, fetch = globalThis.fetch?.bind(globalThis) }) {
  let queue = [], sending = false, timer = null;
  try { queue = JSON.parse(storage.getItem(KEY)) ?? []; } catch { /* unreadable: start empty */ }
  const keep = () => { try { storage.setItem(KEY, JSON.stringify(queue)); } catch { /* full or private: they last the session */ } };
  const body = events => JSON.stringify({ v: VERSION, host, os, events });
  const next = () => queue.slice(0, BATCH);
  // by what they are, not where: report() may have dropped the oldest while the batch was away
  const sent = batch => { const gone = new Set(batch); queue = queue.filter(e => !gone.has(e)); keep(); };

  // Send what's waiting, a batch at a time; what can't be sent stays for next time.
  async function flush() {
    clearTimeout(timer); timer = null;
    keep();
    if (sending) return;
    sending = true;
    try {
      while (queue.length) {
        const batch = next();
        // text/plain: a "simple" request, so the browser asks the ingest no permission first
        const res = await fetch(url, { method: 'POST', body: body(batch), headers: { 'content-type': 'text/plain' }, keepalive: true });
        if (res.status >= 500 || res.status === 429) break;   // the ingest is having a bad day: later
        if (!res.ok) console.warn(`[indie-ads] ingest refused a batch: HTTP ${res.status}`);   // for good: not sent for ever
        sent(batch);
      }
    } catch { /* offline: next time */ } finally { sending = false; }
  }
  // the page is going: hand the browser what's waiting, and take its word that it'll go
  function last() {
    clearTimeout(timer); timer = null;
    keep();
    if (sending || !queue.length) return;
    const batch = next();
    try { if (navigator.sendBeacon?.(url, new Blob([body(batch)], { type: 'text/plain' }))) sent(batch); } catch { /* no beacon here: next time */ }
  }
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => { if (document.hidden) last(); });

  return {
    report(e) {
      queue.push(Object.fromEntries(FIELDS.filter(k => e[k] != null).map(k => [k, e[k]])));
      if (queue.length > KEEP) queue.splice(0, queue.length - KEEP);
      clearTimeout(timer);
      timer = setTimeout(flush, SOON);
      timer.unref?.();   // Node (the tests): not a reason to stay running
    },
    flush,
  };
}
