# Indie Ad Network for native Android games

The SDK for a game whose Android side is Java, Kotlin or C++ under a thin Java layer: no Unity, no web view of the game's own. It's the same player the [Unity package](../unity/README.md) plays (`core/`, as one page), in the system's web view laid over the game's activity, with the same API in Java.

- `indieads/`: the SDK, an AAR (`com.indieadnetwork.sdk`), minSdk 21, no dependencies.
- `sample/`: a game with three buttons over an OpenGL ES surface (Interstitial, Rewarded, More games), in test mode against the live catalogue.

## Add it

Build the AAR (the Android SDK's path in `local.properties`, or `ANDROID_HOME`):

```
./gradlew :indieads:assembleRelease      # → indieads/build/outputs/aar/indieads-release.aar
```

Put it in the game's `libs/` and add `implementation files('libs/indieads-release.aar')`. Its manifest brings `INTERNET`, `ACCESS_NETWORK_STATE` and a `<queries>` for Google Play (to read the install campaign); its R8 rule keeps what the page calls. Or include `indieads/` as a module of the game's own build, from a checkout of this repository: it takes the player and `InstallReferrer.java` from `../unity/` as it builds.

Google Play's Data safety form is the game's to fill in: the SDK sends each ad's events and a player's report of an ad (with any words they write), with no identifier of any kind and linked to no one, and shares nothing for tracking. The iOS SDK's `PrivacyInfo.xcprivacy` says the same for Apple.

Ship a copy of the catalogue as the asset `indie-ads-catalogue.json` (`src/main/assets/`): it's what a first run with no server shows, and its `signedBy` is the key the server's catalogue is checked against.

## Use

```java
IndieAdsConfig config = new IndieAdsConfig();
config.host = "mygame";
config.rating = "4+";
config.catalogueUrl = "https://indieadnetwork.com/catalogue.json";
config.ingestUrl = "https://indieadnetwork.com/e";   // the SDK's analytics, or null
config.mixUrl = "https://indieadnetwork.com/mix";    // who is owed what, or null for the catalogue's own word
config.placements = new IndieAdPlacement[] {
    IndieAdPlacement.rewarded("FreeCoins").maxSecs(30).reward("100 coins"),
    IndieAdPlacement.interstitial("LevelEnd").maxSecs(30).minSecs(5),
};
IndieAds.setListener(new IndieAds.Listener() {
    @Override public void onShown() { /* pause the game's sound */ }
    @Override public void onHidden() { /* and resume it */ }
});
IndieAds.init(activity, config);   // in the activity's onCreate
```

Then, at each ad break:

```java
if (IndieAds.wants("FreeCoins")) {                 // the house's slot: rolls the network's share, once per ad
    IndieAds.show("FreeCoins", result -> {
        if (result.granted) giveCoins(100);
    });
} else {
    // the paid network's ad
}
```

`show` returns false when nothing will be shown, and `done` isn't called; otherwise `done` is called once, when the ad has closed or failed to appear (`result.shown` false: show the paid network's instead). The rest is as the [Unity package](../unity/README.md) says, method for method in camelCase: `demand`, `offered`, `setTest`, `setConsent`, `cmpConsent`, `getMoreGamesUrl`, `showMoreGames(OpenIn.GAME)`, `getInstallCampaign`, `shutdown`, and on the listener `onEvent` and `onDemandChanged`. `setMuted` and `setLanguage` take what Unity asks through a function, for the next ad.

### Threads

Every method may be called from any thread: a C++ game's GL thread, through its Java layer, as well as the main thread. The work is done on the main thread, and every callback and listener method is called there, so a game that runs its logic on its own thread hands results back to it (`glSurfaceView.queueEvent`, or its own queue). `show` from another thread answers at once from what it can know; if the main thread then can't show, `done` is called with `shown` false.

### The activity

The ads are laid over the activity given to `init`, above whatever the game draws with (a `GLSurfaceView`, a `SurfaceView`, views), and cover the whole of it: a game that's full screen has them full screen. The SDK follows the activity by itself (its pause and resume, the system's memory warnings); a game doesn't forward anything. When the activity is destroyed the SDK shuts down, so a game whose activity is made again (on rotation, without `configChanges`) calls `init` again from the new one's `onCreate`.

The back button, with an ad up, is the ad's ✕ (rewarded: "Leave now?"), and never reaches the game; with predictive back (Android 13 on) too.

## The sample

```
./gradlew :sample:installDebug
```

Interstitial and More games are tapped on the main thread; Rewarded is shown from the GL thread. The log on screen (and logcat, tags `IndieAds` and `IndieAdsSample`) is everything the SDK says. It's in test mode: every ad can be shown, and nothing is counted.

## Inside

`IndieAds.java` is the Unity package's `IndieAds.cs`, in Java, and `AdWebView.java` its `NativeWebView.java` without Unity: they say the same things to the page (`web/host.js`), and keep it alive the same way (asked if it's there as the game comes back, made again when it's lost or put away for memory, an ad that never starts given up). `Wire.java` is what's said, tested on the JVM (`./gradlew :indieads:testDebugUnitTest`). `InstallReferrer.java` is Unity's, taken as the AAR is built, as the player is, and the version is the repository's (`npm test` again).
