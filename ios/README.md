# Indie Ad Network for native iOS games

The SDK for a game whose iOS side is Objective-C, Swift or C++ under a thin UIKit layer: no Unity, no web view of the game's own. It's the same player the [Unity package](../unity/README.md) plays (`core/`, as one page), in a WKWebView laid over the game's view, with the same API in Objective-C. [android/](../android/README.md) is the same for Android.

- `IndieAds/`: the SDK. Objective-C with ARC, iOS 15 on, no dependencies (WebKit and StoreKit are the system's).
- `Sample/`: a game with three buttons (Interstitial, Rewarded, More games) over a view redrawn every frame, in test mode against the live catalogue.

## Add it

Drag the `IndieAds` folder into the game's Xcode project (Copy items if needed; the game's target ticked), so its `.m` files are compiled and `IndieAdsPlayer.html` is copied as a resource. If the game's target doesn't use modules, link `WebKit.framework` and `StoreKit.framework`. Or add this folder as a local Swift package (File › Add Package Dependencies… › Add Local…).

**The privacy manifest.** `PrivacyInfo.xcprivacy` says what the SDK does for Apple's privacy report: no tracking and no identifier of any kind; each ad's events (advertising data) and a player's report of an ad (other user content), linked to no one; and why it reads user defaults (a consent platform's answer) and the system's clock (the time between two things in the app). A Swift package brings it as it is. With the files dragged in, Xcode reads only the app's own: if the game has none, keep this one in its target as the app's; if it has one, copy these entries into it and take this file out of the target.

Ship a copy of the catalogue as the resource `indie-ads-catalogue.json`: it's what a first run with no server shows, and its `signedBy` is the key the server's catalogue is checked against.

## Use

```objc
#import "IndieAds.h"

IndieAdsConfig* config = [IndieAdsConfig new];
config.host = @"mygame";
config.rating = @"4+";
config.catalogueUrl = @"https://indieadnetwork.com/catalogue.json";
config.ingestUrl = @"https://indieadnetwork.com/e";   // the SDK's analytics, or nil
config.mixUrl = @"https://indieadnetwork.com/mix";    // who is owed what, or nil for the catalogue's own word
IndieAdPlacement* coins = [IndieAdPlacement rewarded:@"FreeCoins"];
coins.reward = @"100 coins";
IndieAdPlacement* levelEnd = [IndieAdPlacement interstitial:@"LevelEnd"];
levelEnd.minSecs = 5;
config.placements = @[coins, levelEnd];
[IndieAds setDelegate:self];   // indieAdsShown: pause the game's sound; indieAdsHidden: resume it
[IndieAds startWithViewController:gameViewController config:config];
```

Then, at each ad break:

```objc
[IndieAds showIfWanted:@"FreeCoins" done:^(IndieAdResult* result) {
    if (result.granted) [self giveCoins:100];
    else if (!result.shown) [self showPaidAd];   // not the network's turn, or nothing appeared
}];
```

`showIfWanted:` is the whole of a slot: it decides whose turn it is (a game your studio owes showings first, else the share, rolled once), shows the network's ad on its turn, and calls back exactly once, on the main thread, whatever happens. `result.via` is `@"house"` when the network's ad was shown. A game that decides for itself asks `wants:` and then calls `show:`, which returns NO when nothing will be shown (and then calls nothing back). The rest is as the [Unity package](../unity/README.md) says: `demandFor:`, `offered:`, `setTest:`, `setConsent:`, `cmpConsent`, `moreGamesUrl`, `showMoreGames:`, `shutdown`, and on the delegate `indieAdsEvent:` and `indieAdsDemandChanged`. `setMuted:` and `setLanguage:` take what Unity asks through a function, for the next ad. `getInstallCampaign:` is Android's, and always nil here.

### Threads

Every method may be called from any thread: a C++ game's render thread as well as the main thread. The work is done on the main thread, and every block and delegate method is called there, so a game that runs its logic on its own thread hands results back to it. `show:` from another thread answers at once from what it can know; if the main thread then can't show, `done` is called with `shown` NO.

### The view

The ads are laid over the whole of the view controller's view given to `startWithViewController:`, above whatever the game draws with (Metal, GL, UIKit). The SDK follows the app by itself (going to the background and back, memory warnings); a game forwards nothing. An ad's store button opens the App Store's sheet over the game, and its end card the App Store's banner.

## The sample

Open `Sample/Sample.xcodeproj`, choose a team under Signing & Capabilities, and run it on a phone. Or from the command line:

```
xcodebuild -project Sample/Sample.xcodeproj -target Sample -sdk iphoneos -allowProvisioningUpdates DEVELOPMENT_TEAM=<your team>
xcrun devicectl device install app --device <phone> Sample/build/Debug-iphoneos/Sample.app
xcrun devicectl device process launch --device <phone> --console com.indieadnetwork.sample
```

Interstitial and More games are tapped on the main thread; Rewarded is shown from the game's own thread. The log on screen (and the console: `[IndieAdsSample]`, `[IndieAds]`) is everything the SDK says. Launched with `-autoplay interstitial`, `rewarded` or `more`, it taps that button itself once the catalogue is in. It's in test mode: every ad can be shown, and nothing is counted.

## Inside

`IndieAds.m` is the Unity package's `IndieAds.cs` in Objective-C (and android/'s `IndieAds.java`): it says the same things to the page (`web/host.js`), and keeps it alive the same way (asked if it's there as the game comes back, made again when its process ends or it's put away for memory, an ad that never starts given up). `IndieAdsWebView.m` and `IndieAdsDevice.m` are the Unity package's `NativeWebView.mm` and `IndieAdsNative.mm` without Unity. `IndieAdsPlayer.html` is written by `tools/build-player.mjs` beside the Unity package's, and `npm test` checks they're the same page, and that the version is the repository's.
