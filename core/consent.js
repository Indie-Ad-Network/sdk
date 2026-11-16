// ---------- has the player agreed? ----------
// In the UK and the EEA, keeping anything on a player's device for advertising wants their agreement first, and so
// does reading it back. The game is the one with a screen to ask on, so it asks, and says what was answered:
// `consent` in createIndieAds (index.js). Without it nothing is kept there: ads are streamed, what's been shown is
// remembered only until the game is closed, and what an earlier session kept is taken away.
//
// A game that asks with a consent platform (Google's, or any other built on the IAB's Transparency and Consent
// Framework) needn't work the answer out itself. The platform keeps two things where any code in the app can read
// them, by the framework's own names: whether the law applies to this player at all (IABTCF_gdprApplies: 1 or 0),
// and what they agreed to, a character a purpose (IABTCF_PurposeConsents: "1" first for purpose 1, "Store and/or
// access information on a device", which is this). In a browser the same is asked of the platform's __tcfapi.

// → true (agreed, or not somewhere it must be asked), false (asked, and refused or not answered for this), or null:
// no platform has said, and the game must decide by its own means.
export const fromTcf = (applies, purposes) => applies == null ? null : !+applies || String(purposes ?? '')[0] === '1';

// What the consent platform says, where there is one to ask. `native`: an app shell's own reader ({ consent() } →
// { applies, purposes }: the Capacitor plugin's); else a browser's __tcfapi; else null. Never throws, never waits
// for a platform that isn't there: one that hasn't answered yet says null too, so ask again once it has.
export async function cmpConsent(native = null) {
  try {
    if (native?.consent) { const kept = await native.consent(); return fromTcf(kept?.applies, kept?.purposes); }
    const api = globalThis.__tcfapi;
    if (typeof api !== 'function') return null;
    return await new Promise(done => {
      const late = setTimeout(() => done(null), 1000);
      api('getTCData', 2, (data, ok) => { clearTimeout(late); done(ok && typeof data?.gdprApplies === 'boolean' ? fromTcf(data.gdprApplies, data.purpose?.consents?.[1] ? '1' : '') : null); });
    });
  } catch { return null; }
}
