# The Indie Ad Network SDK in a Unity game

The package's player (`core/`, as one page: `Runtime/Resources/IndieAdsPlayer.html`) in the package's own web view, with a say in how its ads are mixed with a paid network's.

## Set up

Add the package by its git URL. In Unity: Window → Package Manager → **+** → *Add package from git URL…*, and paste:

```
https://github.com/Indie-Ad-Network/sdk.git?path=/unity#v0.6.9
```

What follows the `#` is the release (`CHANGELOG.md` has each): it's how a game stays on the version it was tested with. Then:

1. If the Android build is minified, keep the web view's Java side, which is reached by name: `-keep class com.indieadnetwork.sdk.** { *; }` in `proguard-user.txt`.
2. Ship a copy of the catalogue as `Resources/indie-ads-catalogue.json` (`house-ads-catalogue.json`, its name before 0.6.0, is still read). It's what a first run with no server shows. The package never asks what else is on a device, so nothing is added to the Android manifest's `<queries>` or to `Info.plist`.

## Use

```csharp
IndieAds.Init(new IndieAdsConfig {
    host = "mygame", rating = "4+",
    catalogueUrl = "https://play.example.com/catalogue.json",
    ingestUrl = "https://play.example.com/e",      // the package's analytics, or null
    // reportUrl: where a player's report of an ad goes; left out, /flag beside ingestUrl. A development build with no
    // ingestUrl can set it ("https://play.example.com/flag") to see its test reports arrive, kept apart on the dashboard
    mixUrl = "https://play.example.com/mix",       // who is owed what, or null for the catalogue's own word
    // catalogueKey: the network's public key. Left out, it's the one in the catalogue you ship (step 2), if the server signs
    language = () => MyGame.LanguageCode,           // if the game has a language setting; left out, the device's
    placements = new[] {
        new IndieAdPlacement { id = "FreeCoins" },
        new IndieAdPlacement { id = "Loading", format = IndieAdFormat.Interstitial },
    },
});

// before each ad: whose is it?
if (IndieAds.Wants("FreeCoins")) {
    IndieAds.Show("FreeCoins", result => {
        if (!result.shown) { /* nothing appeared: the paid network's after all */ }
        else if (result.granted) { /* the reward */ }
    });
} else { /* the paid network's */ }
```

`IndieAds.Demand(placement)` is `{ share, available }`, always to hand (the page sends it whenever it may have changed): `available` is how many creatives this player could be shown there now, and `share` what the network asks of that placement's slots (the game's share, or the placement's own), 0 when nothing is available, or when the player has had the game's `perDay` of house ads today or every game left is resting (the root README's exchange). `Wants` rolls it. The share is the catalogue's `exchange` (`core/exchange.js`), or with `mixUrl` the ingest's count of what's owed between studios.

`IndieAds.OnEvent` hears every event of the player, for the game's own analytics.

## Consent

In the UK and the EEA the law asks for a player's agreement before anything is kept on their device for advertising ([the SDK's README](../README.md#consent) has what, and what to set up in a consent platform). Say what was answered:

```csharp
IndieAds.Init(new IndieAdsConfig { …, consent = IndieAds.CmpConsent() ?? false });

// and when the answer changes (the platform's dialog answered, or changed in your settings):
IndieAds.SetConsent(IndieAds.CmpConsent() ?? false);
```

`IndieAds.CmpConsent()` reads what the game's consent platform has kept (Google's User Messaging Platform, or any other on the IAB's framework): `true` where the player agreed or needn't be asked, `false`, or `null` where no platform has said, as in the Editor. A game with no platform passes its own dialog's answer. Without consent nothing is kept on the device: ads stream, and what's been shown is remembered only until the game closes (the web view is kept between ads for it, whatever `keepWebView` says). `consent` is true unless said, so a game with players in the UK or the EEA must say, and at `Init`: a page made before the answer has already kept things.

`IndieAds.OnShown` and `IndieAds.OnHidden` say an ad is on screen and has gone, whoever showed it: a game pauses its music and sound on the one and resumes them on the other, once, rather than in every place that calls `Show`. The ad plays in a web view over the game, which keeps running under it (no other activity or window takes the app's place, as a paid network's ad does), so nothing else quiets the game. `OnHidden` comes before `Show`'s `done`, and only for an ad that appeared. `IndieAds.Offered(placement)` when a placement's button is put in front of the player.

## Session lifecycle

Call `IndieAds.Shutdown()` on Unity's main thread when a player logs out, opts out of ads, or before initializing a different player/profile. It hides and disposes the ad and More games web views, dismisses this session's iOS App Store sheet, removes the store banner and restores the game's sleep timeout. An outstanding `Show` completes once with `granted = false`; `shown` says whether the ad had appeared. For an ad that appeared, `OnHidden` comes before the completion callback. With no active ad, neither is called.

Shutdown is safe to repeat. `IsInitialised` and `IsShowing` become false before callbacks; a callback may call `Init` for the next session. `Init` otherwise keeps its existing behavior: another call while initialized is ignored. Event subscriptions survive shutdown, so owners still unsubscribe when destroyed. Destroying the SDK's GameObject also cleans up its session.

Shutdown does not erase persistent storage or change storage consent. Use `SetConsent` for that choice; a store opened outside the game cannot be closed by the SDK. Invalidate the game's pending reward/account ownership before shutdown, since its completion callback runs synchronously.

## The web view

`NativeWebView` is the system's own web view laid over the game (WKWebView on iOS, `android.webkit.WebView` on Android; `Runtime/Plugins/`), with no third-party plugin between. The ads play in it, and it's plain enough for a game's other pages:

```csharp
NativeWebView view = NativeWebView.Create();            // null in the Editor and on other platforms
view.PageFinished += url => view.SetVisible(true);
view.PageFailed += (code, message) => { /* a network error (negative), or an HTTP status of 400 or more */ };
view.SetFrame(NativeWebView.UnitRectOf(panelRectTransform));   // fractions of the screen; left alone, it's all of it
view.LoadUrl("https://example.com/help");
// SetAlpha, Stop, Evaluate(javascript), MessageReceived (the page's window.nativeWebView.postMessage(string)), Dispose
```

A game with a web view it would rather the ads used gives it as `IndieAdsConfig.createWebView` (`IIndieAdsWebView`).

## What to know

For the ads themselves, see [Creatives](../CREATIVES.md) and the [playable kit](../playable-kit/README.md); for the catalogue, placements and events, [the SDK](../README.md).

- **The player speaks the player's language** (`strings/README.md` has the list). `language` wants only what the game knows: "es" on a phone set to es-MX becomes Latin America's Spanish by itself. The reward's words (`IndieAdPlacement.reward`) are the game's own, so the game translates those.

- **The web view is put away between ads** (it costs tens of MB) once the page says it's idle, and made again for the next ad. `keepWebView = true` keeps it.
- **The game isn't paused for you.** The ad is a view over the game, which goes on running under it: pause, and quiet, your own game from `Show` until its callback.
- **An ad that hasn't started in `showTimeout` seconds (6) is given up**: the callback gets `shown == false`.
- **A playable can't speak for the page.** It runs in a sandboxed frame, and though a frame can reach `postMessage` on Android, the game acts only on messages carrying a key made for each page and given to the page alone; on iOS only the page's own frame is heard at all.
- **A "More games" button of your own**: `IndieAds.ShowMoreGames()` opens the network's page of the games yours shows the ads of (the page an ad's ⓘ leads to) in the device's browser; `IndieAds.ShowMoreGames(IndieAdsOpenIn.Game)` opens it in a web view over your game, which the page's own ✕ (or the back button) closes. `IndieAds.GetMoreGamesURL()` is the address alone, to open your own way. All three have nothing until the catalogue is in, a moment after `Init`, and for a player you've said is under 13 (`age`): show the button when `GetMoreGamesURL()` isn't null.
- **In the Editor there is no web view, so a stand-in plays** (0.6.3 on; `Runtime/EditorAds.cs`). In Play mode `Show` answers true and an ad goes up over the Game view: one of the catalogue's videos, the real file, played by Unity's own VideoPlayer, shown as its creative asks (its end card's art, where its store button sits and the picture of it, a pulse, a card of its own, a fade, a loop, when a tap opens the store), with the countdown, the close and the store button drawn by the stand-in. `Demand`, `Wants`, the callbacks, `OnShown`/`OnHidden` and `OnEvent` come as on a phone, so a game's own code can be tried. Two buttons under its label are for testing: the ad's end now, and "nothing was shown". Opt-in endcard settings also select large or compact actions, their fixed 0.5-second fade, matching-orientation art and the unified countdown/Skip/close control with its minimum ending time. It is not the player: no playables, no blur behind a video that doesn't fill the screen, no WebP pictures (Unity reads JPEG and PNG), no caps, resting or languages, the share is the catalogue's with nothing owed, and nothing is sent to the ingest. With no video that fits, a rewarded placement gets a card that counts down and an interstitial shows nothing. The game's own controls under it still take clicks, as they don't on a device. It needs the Video, IMGUI and UnityWebRequest modules (Image Conversion for pictures), which a new project has; without them the Editor is as before, `Show` false. Nothing of it is in a build.
- **Trying the ads out**: `IndieAdsConfig.test`, or `IndieAds.SetTest(true)` from a debug menu, plays the game's own ads too, games that are resting, and past a creative's daily cap. Nothing it shows is sent to the ingest, so it never counts in what studios owe each other. Never turn it on in a player's game.
- After a change to `core/` or `web/`: `node tools/build-player.mjs`, and commit the page it writes.
