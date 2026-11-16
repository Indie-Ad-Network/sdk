// ---------- house-ads in a Capacitor app ----------
// What the app shell can do that a web page can't, as createHouseAds' `native` option:
//
//   createHouseAds({ …, native: capacitorNative() })
//
//   openStore   iOS: the App Store sheet over the game (SKStoreProductViewController, with the
//               campaign and provider tokens), resolving when it's put away, so the player
//               never leaves; a tracking link, or a product the sheet can't load, opens
//               outside. Android: Google Play, by market://
//   metered     whether the network costs the player (cellular, a hotspot, Low Data Mode):
//               creatives aren't downloaded ahead on one
//
// Add this folder to the app as a dependency ("house-ads-capacitor": "file:…/house-ads/capacitor")
// and run `npx cap sync`. In a browser, or an app without the plugin, this is {}: the web's ways.
// The plugin is reached as the native bridge hands it to the page (Capacitor.Plugins), so a
// game with no bundler needs no @capacitor/core import.

export function capacitorNative(Capacitor = globalThis.Capacitor) {
  if (!Capacitor?.isNativePlatform?.() || !Capacitor.isPluginAvailable?.('HouseAds')) return {};
  const plugin = Capacitor.Plugins.HouseAds;
  return {
    openStore: link => plugin.openStore({
      url: link.url, fallback: link.fallback ?? link.url,
      ...(link.sheet && { id: String(link.sheet.id), ct: link.sheet.ct, ...(link.sheet.pt != null && { pt: String(link.sheet.pt) }) }),
    }),
    metered: async () => (await plugin.network()).metered,
  };
}
