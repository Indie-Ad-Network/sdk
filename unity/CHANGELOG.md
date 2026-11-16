# Changelog

Every release of the Indie Ad Network SDK (called house-ads until 0.5.0, and HouseAds in its code until 0.6.0): the whole repository, not only the Unity package. What the network's server does is its own to say, and isn't logged here.

The repository has one version, [Semantic Versioning](https://semver.org), and a release is the tag `vX.Y.Z` (a Unity game takes it as `…/sdk.git?path=/unity#vX.Y.Z`). Before 1.0.0 a minor version may break a game that takes it, and a patch may not. `npm test` fails if the packages' versions differ or the newest entry here isn't that version.

Two numbers are not this one, and change only when a format does: `VERSION` in `core/wire.js` (what games send the ingest) and the catalogue's `version`. Games already released go on sending and reading the old ones.

## [0.6.2] - 2026-11-16

How a creative that brings its own end card is shown. Nothing to do to take it.

### Added
- **`ownCard`: a creative ends on a card of its own.** A video rests on its last frame with the store button alone over it: the usual button in the player's language, or the creative's own picture of it (`storeButton`), and nothing else of the player's, no dimming, icon or line. The video itself opens nothing when tapped, unless `tap.whole` says from when. A playable with a card and a store button of its own (`mraid.open()`) is left to show them: its time up, the reward is in and it plays on until it's closed or says it's done, and no card of the player's is put over it.

- **A report of an ad says why.** "Report this ad" behind the ⓘ now asks what's wrong, one of five to be picked (it didn't play or froze; it couldn't be closed; it's inappropriate; it's misleading; something else), with the box for a few words kept under them. The pick goes with the report as `reason` (`core/wire.js` `REASONS`), to a game's `onEvent` too. In every language the player speaks.

### Changed
- **`ownEndCard` is how that was said before, and it made the whole video a store button from its first frame.** Players tapped through without meaning to: a video marked so was tapped several times as often as any other creative. It still means what it did, for a catalogue that says it; the network's server now says `ownCard`. A game on a release before this one doesn't know `ownCard`, and shows such a creative with the usual end card.

## [0.6.1] - 2026-11-16

### Added
- **"More indie games from this network" behind an ad's ⓘ**, where the network has a page of its games (`more` in the catalogue, an https address): it opens that page for the game showing the ad, outside the game, by the same way a store link is opened. It isn't offered to a player the game has said is under 13, and a catalogue without `more` shows no such line: nothing to do to take it, and nothing changes for a network that doesn't serve one. In every language the player speaks (`seeMore` in `strings/`).

### Changed
- **A game says which game it is when it asks for the catalogue**: `?host=<its id>` on the catalogue's address, as it already says to the mix. A server can then give each game a list of its own; one that serves a plain file takes no notice. It says nothing about the player. Nothing to do to take it.

## [0.6.0] - 2026-11-16

The code takes the network's name: `HouseAds` is `IndieAds`. Nothing an ad does has changed, and the old names still work in this release, with a warning, so a game can take it first and rename after. They go in the release after this one. 0.5.1 was never tagged, so what it lists below comes with this release too.

### To take it
- **A Unity game renames when it likes**: `using HouseAdsNetwork;` becomes `using IndieAdNetwork;`, and `HouseAds`, `HouseAdsConfig`, `HouseAdPlacement`, `HouseAdFormat`, `HouseAdResult`, `HouseAdDemand`, `HouseAdEvent` and `IHouseAdsWebView` each have `IndieAd` where they had `HouseAd`. Until it does, the old names compile as they are and Unity says of each that it's obsolete. Three things have no old name: a variable declared as `HouseAdFormat` (the values `HouseAdFormat.Rewarded` and `.Interstitial` still work), `NativeWebView` and `HouseAdsNative` used by name, and an assembly definition that names `HouseAdsNetwork` rather than pointing at it (it's `IndieAdNetwork` now).
- **`Resources/house-ads-catalogue.json` can stay**: the package looks for `indie-ads-catalogue.json` first and the old name after.
- **A Capacitor app changes its dependency's name** to `indie-ads-capacitor` in `package.json` (the root package is `indie-ads`) and runs `npx cap sync`: the plugin is `IndieAds`. `createHouseAds` is still exported beside `createIndieAds`.
- **A minified Android build keeps `com.indieadnetwork.sdk.**`**, as before: the package of the Java hasn't changed.

### Changed
- **Every name a game types has `IndieAds` for `HouseAds`**: `createIndieAds`, and in Unity the namespace `IndieAdNetwork` with `IndieAds`, `IndieAdsConfig` and the rest. The logs are `[IndieAds]` in Unity and `[indie-ads]` on the web.

### Not changed
- **What's kept on a player's device keeps its names** (`houseAds.…` in storage, the `house-ads` database), so a player's history and downloaded ads carry over an update.
- **What a playable says and hears keeps its names**: `window.houseAds.step()`, the `houseAds` messages and the `<meta name="house-ads">` tag. Playables already made, and games already released, go on as they are.

## [0.5.1] - 2026-11-16

For a player's privacy: what else is on their device is no longer asked, a playable can ask for nothing outside itself, and a game says whether the player agreed to anything being kept. It takes things out of 0.5.0, which no game shipped, so it's a patch all the same.

### To take it
- **A Unity game needs nothing done**: the build no longer adds the catalogue's games to the Android manifest's `<queries>`. A manifest kept by hand that has them still: take them out.
- **A Capacitor app runs `npx cap sync`**, and once `node tools/native-queries.mjs --android …/AndroidManifest.xml`, which takes out the `<queries>` that tool wrote for older releases. It no longer writes any.

### Added
- **A game says whether the player has agreed to things being kept on their device**: `consent` in `createHouseAds`, `HouseAdsConfig.consent` and `HouseAds.SetConsent` in Unity. The UK and the EEA ask it for advertising. Without it nothing is kept or read there: ads stream, what's been shown is remembered until the game closes, and what an earlier session kept is taken away. True unless said, so a game that says nothing is as it was: **one with players in the UK or the EEA must say.** In Unity the web view is kept between ads while there's no consent, since what's been shown is remembered in it alone.
- **`cmpConsent()` (`HouseAds.CmpConsent()` in Unity) reads a consent platform's answer**, for a game that asks with Google's User Messaging Platform or any other on the IAB's Transparency and Consent Framework: whether the law applies to this player, and whether they agreed to purpose 1, storing on the device. The Capacitor plugin has a `consent` call for it (`npx cap sync`). [Consent](../README.md#consent) has what to set up.

### Removed
- **Android is no longer asked which of the network's games are installed.** It was asked so that a game a player has wasn't advertised to them, and the answer never left the device; but which games someone has is theirs to know, and reading it for advertising is the kind of thing the law in the UK and the EEA wants a player's agreement for. iOS hasn't been asked since 0.3.0. A game's daily cap and its rest (shown too often with no store tap) are what spare a player who already has it, as on iOS.
- With it go `HouseAdsNative.IsInstalled` (Unity), the Capacitor plugin's `isInstalled`, `isInstalled` in `createHouseAds`'s `native` option (one given is not called), and `installed` in `core/pick.js`.
- `tools/native-queries.mjs` only takes out what it wrote before.

### Changed
- **A playable can ask for nothing outside itself.** Its frame was already kept from the game's page, its storage and its windows; now its page is also given a policy that lets it load only what's written into it (inline, `data:` and `blob:`). MRAID asks no such thing, so a playable made for another network that fetches a font, a script or a picture, or calls its maker's server, goes without: as it would with no signal. `playable-kit/tools/check.mjs` already says of a page that it "reaches outside itself". One thing can't be forbidden a frame, sending itself to another address: the player empties a frame that does, and says so (`fail`, `why: "playable"`).
- **Unity: the page asks the game for what it can't know with `{ type: 'device' }`**, where it sent the catalogue's games (`{ type: 'apps' }`), and is answered with whether the network costs the player and no more. The page and the package go together, so nothing is to be done.

## [0.5.0] - 2026-11-16

The SDK in its own repository and under its own name, and a creative that says how it's shown. (There is no 0.4.0.)

### To take it
- **A Unity game changes its package**: remove `com.thevoxelagents.house-ads` from `Packages/manifest.json` and add `https://github.com/Indie-Ad-Network/sdk.git?path=/unity#v0.5.0`, which is `com.indieadnetwork.sdk`. **A minified Android build keeps `com.indieadnetwork.sdk.**`** where it kept `com.thevoxelagents.houseads.**`. Nothing in a game's code changes.
- **A web or Capacitor game points its submodule or dependency at the new repository** (the plugin is its `capacitor/` folder, as before). A Capacitor app runs `npx cap sync`: the plugin's Android side is `com.indieadnetwork.sdk`.
- Nothing else: every creative already in a catalogue plays as it did.

### Added
- **A creative may dress the end card.** `endCard` is art of its own for portrait and landscape screens, shown whole in place of the icon and line; `storeButton` puts the store button where the creative wants it, as a picture for each store or in the player's words, with a pulse if asked. For a video or a playable. Where the art can't be had the card is the usual one.
- **A video may say how it's shown.** `backdrop: "video"` blurs its own picture behind it where it doesn't fill the screen; `fade` brings the end card up over its last seconds; `loop` plays it on from a second of it at its end, silent, with the store button over it; `tap` says when the store button is there and from when a tap anywhere on the video opens the store.
- **A video may be shown in a placement shorter than it**, if marked `overrun`. The reward comes at the placement's `maxSecs` and the video plays on; ✕ or ✓ after that goes to its end card (or its loop), and from there out. None of these shortens the wait for a reward.
- **The cache keeps a creative's end card art and its button's picture** for the player's store beside what it plays, so a dressed card is there with no signal.
- **Three things more are counted**: a `store_open` says what was tapped (`from`: the ad itself, the player's store button, or the end card's); `skip`, a video left for its end once its reward was in; and `paid`, a slot `show({ paid })` gave the game's paid network. All go to `onEvent`. A server from before 0.5.0 leaves them out.
- [The server](../SERVER.md): what a game asks of the network's server, for anyone who would answer in its place. [Creatives](../CREATIVES.md#dressing-the-end-card-and-how-a-video-is-shown) has each new field.

### Changed
- **A video on screen that doesn't move for 12 seconds gives way to the still card**, as one that can't be played does (`fail`, with `why: "stall"`). Before, the countdown stood still for as long as the player waited. This one is for every video.
- **In a Unity game the screen stays on while an ad is up.**
- **The SDK has a repository of its own: `https://github.com/Indie-Ad-Network/sdk`.** It begins at 0.3.5, as released; the releases before it are below. The network's server (the admin, the catalogue, the counts) is kept apart.
- **The Unity package is `com.indieadnetwork.sdk`**, where it was `com.thevoxelagents.house-ads`, and its Android side with the Capacitor plugin's is `com.indieadnetwork.sdk` too: see "To take it".
- What a playable's page says of itself is read by `playable-kit/tools/page-says.js`, and the prompt that cuts a video from a trailer is `creative-prompt.txt`: both were the server's files.

## [0.3.5] - 2026-11-14

### Changed
- **A playable that closes itself always ends on the end card.** Before, `mraid.close()` before the playable's time was up did nothing unless the creative was marked Finish early, so a playable made for another network had a close of its own that seemed broken. Now a close always takes the playable away and shows the end card. Finish early only decides when the reward comes: with it, at the close; without it, the countdown runs on over the card and the reward comes when it is out. `complete` is counted for both.
- **Finish early and Keep playing are filled in from the playable when it is uploaded.** The upload form reads the file: Keep playing starts ticked if the page pauses when told it isn't viewable, Finish early only if the page's `<meta name="house-ads">` tag asks for it, and Seconds from the tag. Whoever uploads may change either, and a box the page's code can't bear out can't be ticked. The playable kit writes the tag (`page({ settings })`). See [Hosting a playable](../PLAYABLE_HOST.md#settings-from-the-page).

## [0.3.4] - 2026-11-14

### Changed
- **The bar lies over a playable on every screen wider than tall.** In 0.3.3 that was only a phone held sideways (a screen up to 500 px high); a tablet in landscape still had the solid bar across its shorter side. Now any landscape screen has the bar over the playable's top and the game's name left out of it. The side-by-side end card is still only for a screen up to 500 px high, where the stacked one doesn't fit.

## [0.3.3] - 2026-11-14

### Changed
- **On a phone held sideways, the bar lies over a playable instead of above it.** The bar was a solid strip across the top that took a seventh of the screen's height from the game. In landscape on a phone (a screen up to 500 px high) it is now drawn over the top of the playable on a fade, as it always was over a video, and a touch between its buttons goes to the playable. A playable should keep what matters out of the top 12% of its frame, as before. The game's name is left out of the bar in this shape, for videos too: it is on the end card and behind the ⓘ. Portrait and tablets are as they were.
- **The end card fits a phone held sideways.** Its icon, name, line, studio and buttons were one under another, taller than the screen, and the App Store's banner across the foot covered the buttons. In landscape on a phone they are side by side: the icon, the words, then the buttons one above the other, clear of the banner.

### Added
- **The playable kit films an ad as a video.** `playable-kit/tools/record.mjs` plays a built playable in headless Chrome and writes an MP4 as [Creatives](../CREATIVES.md) asks for one, with the ad's own sound; `template/play.mjs` is who plays it. See the kit's README.

## [0.3.2] - 2026-11-13

### Changed
- **A game counts double only in its own studio's games.** `own` in the catalogue made a game twice as likely to be picked in every game that showed house ads, another studio's included: the network's own games ahead of everyone's, everywhere. Now a game is weighted double where the host is of the same `studio` (a studio's games come first in its own games), and as any other everywhere else. A host that isn't in the catalogue, or has no `studio` there, favours none. Games already released go on weighting `own` double until they take this release.
- **Who may be shown to a player under 13 is said on its own:** `under13` on a game. `own` said that too. Where `under13` is left out, `own` still says it, so a catalogue from before reads as it did; a game released before 0.3.2 reads only `own`. The dashboard asks the two apart (an admin's to say), and its catalogue says `under13` either way of a game that's `own`.
- `own` is left meaning what it otherwise did: the network's own game, whose App Store links carry the catalogue's provider token.

## [0.3.1] - 2026-11-13

### Changed
- **A report from a test showing is sent, marked as a test.** In 0.3.0 a developer's test showing sent no report, and a development build with no `ingestUrl` (so as to count nothing) had nowhere to send one, so the way a report goes couldn't be tried before release. Now a report goes whenever there's somewhere to send it, with `test: true` from a test showing. The dashboard keeps those apart: they're left out of the ⚠️ count, the bar across the Dashboard and the marks on creatives, and the Reports tab lists them only under "Show test reports". Migration `0008_flag_tests.sql`: **run `npm run migrate` in `ingest/` before deploying the Worker.**

### Added
- **Where reports go, on its own:** `reports` in `createHouseAds`, `HouseAdsConfig.reportUrl` in Unity: the ingest's `/flag`. Left out, it's `/flag` beside the ingest, as before. A development build that leaves the ingest out can set it and see its test reports arrive.

## [0.3.0] - 2026-11-13

Apple compliance, security, and ad reporting.

### Added
- **A player can report an ad.** The "Ad" label has an ⓘ beside it and is a button: it stops the ad's clock and says whose ad this is (the Indie Ad Network), what it was chosen by, and takes a report, with up to 200 characters if the player types any. Apple asks both of an app with ads (App Store Review Guidelines 2.5.18). The game hears the event `report` (with `message`); with an ingest it goes to `POST /flag` with the ad, the game, the placement, the platform, the language and this release, and nothing about the player. In all 21 languages. Nothing to do in a game.
- **A signed catalogue.** The network's server signs the catalogue (ECDSA P-256), and a game given the public key (`signedBy` in `createHouseAds`, `HouseAdsConfig.catalogueKey` in Unity; the dashboard shows it under Network) uses the server's catalogue only if the signature is the network's: someone between a player and the server, false certificate and all, can't serve ads of their own. Unsigned or wrongly signed is as no answer: the last catalogue kept, or the one shipped. The key is also in every catalogue the server gives, and a game takes it from the copy it ships with: **download the shipped catalogue again once the server signs, and there is nothing else to set.** A game with no key takes the catalogue as before.

### Changed
- **https, and nothing else.** A catalogue, ingest or mix address that's `http://` isn't used (said in the console), nor a creative, picture or tracking link a catalogue names; `localhost` is let be, for a developer's own server. Every address the docs have ever given is https, so nothing to do unless a game's wasn't.

### Removed
- **iOS is no longer asked which games are installed.** Apple's review guidelines (5.1.2 iv) say not to collect which other apps are on a device for advertising, and that was this check's purpose, though the answer never left the device. Gone from Unity (`canOpenURL` in the native side, and the build step that wrote each game's URL scheme to `LSApplicationQueriesSchemes`) and from the Capacitor plugin (`isInstalled` on iOS); `tools/native-queries.mjs --ios` now only takes out what it wrote before. On iOS a game the player has may be advertised to them: its creatives' daily cap and its rest after showings with no store tap are what limit that. Android is unchanged. A catalogue's `ios.scheme` is read by nothing from here on. `HouseAdsNative.IsInstalled` takes the Android package alone.
- **To do in a game that takes it:** an Xcode project that Unity appends to, or an `Info.plist` kept by hand, still lists the schemes an older release put in `LSApplicationQueriesSchemes`: take them out (a build that replaces the project has none).

## [0.2.9] - 2026-11-13

### Changed
- **Nothing is logged unless the game asks** (Unity): `HouseAdsConfig.log` now covers the package's warnings (an ad that never started, a web view lost, an unreadable message, nothing on the device to open a store link) as well as what the page says, and on Android the web view's console, the player's and a playable's, which went to logcat whatever the setting. `NativeWebView.LogConsole` (off by default) is the console's switch for a view made outside HouseAds, and `HouseAds.Init` sets it from `log`. iOS never wrote a web view's console to the device log. Nothing to change in a game that takes it, unless it wants those warnings: set `log`.

## [0.2.8] - 2026-11-12

### Added
- **A paid network beside the house's ads, in the order the package says** (the web core: a page, or a Capacitor app). `ads.show(placement, { paid })` takes the game's other network as a function and decides whose slot it is: a game this studio owes showings goes first, if one of its ads is ready; else the house's share of the slots, by chance; else the paid network, and if that has none to show, a house ad after all. The answer's `via` is `'house'` or `'paid'`. `ads.demand()` also gives `owed`, the games owed among those this player could be shown; `show(placement, { among })` keeps a showing to the games named, for a game that decides the order itself; and `turn()` (core/exchange.js) is the rule on its own. The ingest's `/mix` now names the games owed (`owedTo`); from a server not yet deployed with it, they're the games it made likelier. Unity's `HouseAds.Wants` is as it was, the share by chance with no owed-first yet, though the page now tells it how many games are owed.

## [0.2.7] - 2026-11-12

A tidying of 0.2.6, by a second review. Nothing to change in a game that takes it.

### Changed
- **The mix is asked beside the catalogue, not after it.** An ad on a network that answers nothing starts after 1.5 s, not 3; on one that answers, a round trip sooner.
- **What's wanted is downloaded whenever the game says what the device is**, not only at launch and after an ad: a game opened on mobile data fills its cache once it's back at the front on Wi-Fi (Unity).
- **A creative's `weight`, `capPerDay` and `bytes`** are checked as `langs` and `hosts` are: one that isn't a number, 0 or more, drops its creative.
- **Less held in memory**: a playable's page isn't kept a second time for the length of its ad, and a downloaded video isn't copied before it's stored.

### Fixed
- `npm test` fails if `core/` or `web/` uses a method or CSS the oldest web views haven't (`.at()`, `replaceAll`, `inset`…), which 0.2.6 took out by hand.

## [0.2.6] - 2026-11-12

Ten things a review of the SDK found. Nothing to change in a game that takes it.

### Fixed
- **Creatives stopped being downloaded after a download with nothing to do.** Once everything wanted was already on the device, the cache took that finished download for one still under way, and every one after it did nothing: for as long as the page lived, a creative at its daily cap was never replaced by the next, and ads ended on the still card (`cache_miss`). A web or Capacitor game, and a Unity game with `keepWebView`.
- **iOS: creatives downloaded on mobile data at launch** (Unity). The first answer to "does this network cost the player?" was always no, because the system hadn't yet said; and the first answer is the one the downloads at launch go by. It's now asked as the game starts, and the first answer waits for it (300 ms at most; not known by then is taken as yes).
- **`HouseAds.Offered` was lost while the web view was put away** (Unity), which with `keepWebView` off is most of the time between ads: offers went uncounted, and the opt-in rate read too high. The page is made again to hear it, as for `SetTest`, and isn't put away until the offer is on its way.
- **An ad asked for on a network that answers nothing timed out** (Unity, "the ad never started"). The player waited 4 s for the catalogue and 4 s more for the mix before using the copies it already had; a Unity game gives an ad 6 s to start. With a catalogue in hand (the last one fetched, or the one shipped) the server is now waited on for 1.5 s, and the mix for 1.5 s; what either sends later is kept for next time.
- **A playable could open a store, or another app, with no tap** (Unity), by sending its own frame to an `itms-apps:`, `market:` or other app's link: the web view handed any such link to the system. Only the player's own page may now; a frame's is refused.
- **A playable that throws every frame** sent a `fail` for each, 60 a second, which pushed the showing's own events out of the queue. A showing now counts each different error once, three at most. And the queue, when full while a batch was being sent, could drop events not yet sent in place of those that were.
- **`langs` or `hosts` given as a word, not a list**, in a hand-written catalogue stopped every ad in every game. Such a creative is now dropped and named, as any bad entry is.
- **A landscape game on Android downloaded portrait cuts** (Unity; likely, not seen on a device): the web view, not yet shown, has no size, and was taken for portrait. The game now says which way its screen is.
- **A playable with two `mraid` `ready` listeners was started twice**: each was called once for every listener there was.
- **The player on iOS 14.0–14.4 and Android System WebView 80–86** was laid out with CSS those can't read (`inset`), so an ad could be heard and not seen; and `Array.prototype.at`, which iOS before 15.4 hasn't, could stop an ad when every weight was 0.

## [0.2.5] - 2026-11-12

### Added
- **The App Store's banner over the end card** (Unity, iOS 14 and up). When an ad stands ended, on the end card or on a video's own, the App Store's overlay for the game comes up at the foot of the screen: its icon, its name and a Get button that installs it without the player leaving, with the same campaign and provider tokens as the sheet. The end card keeps its own button, clear of the banner, and opening the sheet takes the banner away while it's up. It goes when the ad closes or is played on. Only for a game with an App Store id and no tracking link; nothing changes on Android, in a browser, or in a Capacitor app, whose shell has no `banner` yet. A tap on the banner is Apple's to count (the campaign report), not a `store_open`; that it was put up is the event `store_banner`, once a showing, a column on the dashboard (migration 0006, to run before the Worker is deployed).

## [0.2.4] - 2026-11-12

### Added
- **A video with an end card of its own.** A video marked `ownEndCard` in the catalogue (a tick in the admin) ends on its own last frame: the player's end card isn't put over it, and the store button under it goes. A tap anywhere on the video, from its first frame, opens the store, as the button does. The reward, the countdown and ✕ are as for any video; one that won't play still becomes the player's card. A game on an earlier release shows the player's end card over it, as before.

### Fixed
- **The end card names the studio.** Under the game's line it showed the studio's id (`tva`), which the catalogue's `studio` is, for the exchange to count by. The catalogue now carries the studio's name beside it, `studioName`, and the card shows that, or nothing where there is none. A game on an earlier release goes on showing the id.

## [0.2.3] - 2026-11-12

### Added
- **`HouseAds.OnShown` and `HouseAds.OnHidden`** (Unity): an ad is on screen, and has gone, whoever called `Show`. The game keeps running under the ad's web view, so its music plays on unless the game pauses it: one place now does, for every ad. `OnHidden` comes before `Show`'s `done`, and only after an `OnShown`.

## [0.2.2] - 2026-11-11

### Changed
- **The button's words are of the link it opens.** A game with a tracking link and a page of its own, not on the player's store, had the tracking link under the page's words ("Sign up"); the words are the store's now, as the link is. `cta()` takes the link chosen as a last argument, and without it answers as before.

### Internal
- The player tells a playable what it's told from one place, and its time is up by one rule, not two. Nothing a game or a playable sees is different.

## [0.2.1] - 2026-11-11

### Added
- **Test mode**, for a developer trying the ads out: `test: () => true` in `createHouseAds`, `HouseAdsConfig.test` or `HouseAds.SetTest` in Unity (`houseAdsHost.test(on)` in the page). The game's own ads, games already installed and creatives at their daily cap all play, and nothing is sent to the ingest. `ads.prefetch()` downloads what it makes wanted.
- **Keep playing.** A playable marked `keepPlaying` in the catalogue (a tick in the admin) is paused under the end card when its time is up, not taken away: told it isn't viewable, and its volume 0. The card offers Keep playing, which brings it back for up to 2 minutes more, with the store button where the ✓ was and ✕ the way out. A new event, `keep_playing`, counted by the ingest (migration `0004`, run before the Worker is deployed) and shown in the dashboard as Played on. Only for a playable that pauses when told: one that didn't would go on under the card until the ad closed.
- **A share per placement.** In the catalogue's `exchange`, a game's `placements` give one of its placements its own share (and max): `{ "tcw": { "placements": { "FreeCoins": { "share": 0 } } } }`. One given a share and no max stays at it, whatever is owed. `GET /mix` answers them as `placements`, and `demand(placement)` (`HouseAds.Demand`) gives the placement's.
- **A day's limit.** `perDay`, for the network or one game: the most house ads a player is shown in 24 hours in that game. Counted on the device.
- **Fatigue.** A game whose ads a player has been shown 6 times with no store tap rests for 14 days, twice as long each time again, up to 180 days; a store tap starts it over. When every game rests, nothing is available, and a game's paid network has its slots back. `fatigue: { after, rest, grow }` in the `exchange`, for the network or one game; `after: 0` turns it off. Counted on the device, in the history it already kept.
- **A game not on a store.** A game's record may have `web: { url, label }`: its own page, https, opened in the browser where the game isn't on the player's store, or on none yet (a prototype with a playtest to join). The button says one of `signUp`, `playtest`, `wishlist`, `learnMore`, in the player's language, and the page's address takes the tracking link's macros. Counted as `store_open`. A game with only a page is dropped by SDKs before this one, as on neither store. In the admin: Website, in a game's form.
- **A playable's funnel.** A playable says how far a showing got with `window.houseAds?.step('board2')`: once a showing each, a dozen names a playable. A new event, `step`, with the name and the seconds it was reached at, counted by the ingest, and drawn on the dashboard under Playables: impressions, the first touch, each step in the order reached, the store tap.

### Changed
- **A playable ends as a video does.** When its time is up, or it says it's done, it stops and the end card takes its place (the game's icon, name, line and store button). It used to run on under the ✓. It's taken off the page, not asked to pause, so nothing of it goes on playing or sounding.

### Fixed
- **Android: playables and videos draw.** The build step makes the game's activity hardware accelerated, which Unity's manifest turns off. Unaccelerated, the web view drew in software: a playable's canvas stayed blank and a video showed one frame while its sound played.

## [0.2.0] - 2026-11-11

### Added
- **Interstitials.** A placement with `format: 'interstitial'`: no reward, ✕ after `skipAfter` seconds (5), and nothing shown when nothing is ready.
- **The exchange.** `ads.demand(placement)` answers a game with a paid ad network to show instead: how many creatives this player could be shown, and what share of the game's slots the network asks for. The share is the catalogue's `exchange` settings, or with `mix: url` the ingest's new `GET /mix`, which raises it with what the game's studio owes other studios in showings, and makes the games it owes likelier to be picked.
- **The Unity package** (`unity/`): `HouseAds.Init`, `Demand`, `Wants`, `Show`; the App Store sheet; the installed-game and metered-network checks; build steps that write `LSApplicationQueriesSchemes` and `<queries>` from the catalogue the game ships.
- **`NativeWebView`**: the system's web view over a Unity game (WKWebView, `android.webkit.WebView`), which the ads play in and a game can use for its other pages.
- **Languages.** The player's own words in 19 languages, with Latin America's Spanish apart from Spain's and Portugal's Portuguese apart from Brazil's (`strings/`, `core/locale.js`). The device's language, or the game's: `lang` (`HouseAdsConfig.language` in Unity), whose region is filled in from the device. Arabic reads right to left. A catalogue's `line` may be given per language, and a creative may be kept to some languages (`langs`).
- `web/host.js` and `tools/build-player.mjs`: `core/` as one page for a native game's web view.
- `ads.catalogue`, `ads.settled()`, `ads.refresh()`.
- A shipped catalogue may be given as an object: `catalogue: [url, object]`.

### Changed
- `show()` also resolves `shown`: whether anything was put in front of the player.
- `cta()` takes the words to use as a fourth argument (English without).

### For a game taking this version
- Nothing changes for a game that only shows rewarded ads: a catalogue with no `exchange` asks for no share, and `show()` is as it was.
- A minified Android build of a Unity game must keep `com.thevoxelagents.houseads.**`.

## [0.1.0] - 2026-11-10

The first version, untagged: the player (15 s and 30 s videos, MRAID playables, the still card), the pick, store links, the catalogue and its schema, the cache, the Capacitor plugin, and analytics with its ingest and report.
