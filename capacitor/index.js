// ---------- indie-ads in a Capacitor app ----------
// What the app shell can do that a web page can't, as createIndieAds' `native` option:
//
//   createIndieAds({ …, native: capacitorNative() })
//
//   openStore   iOS: the App Store sheet over the game (SKStoreProductViewController, with the
//               campaign and provider tokens), resolving when it's put away, so the player
//               never leaves; a tracking link, or a product the sheet can't load, opens
//               outside. Android: Google Play, by market://
//   consent     what a consent platform has kept of the player's answer, by the IAB framework's names
//               ({ applies, purposes }: core/consent.js reads it; cmpConsent(), below, is the way to ask)
//   metered     whether the network costs the player (cellular, a hotspot, Low Data Mode):
//               creatives aren't downloaded ahead on one
//
// Add this folder to the app as a dependency ("indie-ads-capacitor": "file:…/indie-ads/capacitor")
// and run `npx cap sync`. In a browser, or an app without the plugin, this is {}: the web's ways.
// The plugin is reached as the native bridge hands it to the page (Capacitor.Plugins), so a
// game with no bundler needs no @capacitor/core import.

import { cmpConsent as fromCmp } from '../core/consent.js';

export function capacitorNative(Capacitor = globalThis.Capacitor) {
  if (!Capacitor?.isNativePlatform?.() || !Capacitor.isPluginAvailable?.('IndieAds')) return {};
  const plugin = Capacitor.Plugins.IndieAds;
  return {
    openStore: link => plugin.openStore({
      url: link.url, fallback: link.fallback ?? link.url,
      ...(link.sheet && { id: String(link.sheet.id), ct: link.sheet.ct, ...(link.sheet.pt != null && { pt: String(link.sheet.pt) }) }),
    }),
    metered: async () => (await plugin.network()).metered,
    consent: () => plugin.consent(),
  };
}

// Has the player agreed to things being kept on their device, by the app's consent platform (Google's, or any on the
// IAB's framework)? true, false, or null where no platform has said. For createIndieAds' `consent`:
//
//   const agreed = await cmpConsent();                       // after the platform's own dialog has been answered
//   createIndieAds({ …, consent: agreed ?? myOwnAnswer, native: capacitorNative() })
export const cmpConsent = (Capacitor = globalThis.Capacitor) => fromCmp(capacitorNative(Capacitor));
