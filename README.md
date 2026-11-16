# The Indie Ad Network SDK

Rewarded ads and interstitials for our own and our friends' games, for any game to drop in. No dependencies, no ad SDK, nothing of a third party's running in the game.

- **15 s and 30 s videos, and playables.** A playable is one HTML file written to MRAID 2/3, the ad networks' standard, so the playables a studio already makes for user acquisition drop in unchanged.
- **A countdown and a way out, always in the same places.** The ring (top right) says how long is left; ✕ (top left) leaves. Leaving before the end asks first, and forfeits the reward.
- **One store-link format.** Each game is one record with both stores in it; the link is built for the platform at the tap: the partner's tracking link, the App Store sheet, `market://`, or plain https. A game not on the player's store, or on none yet (a prototype, a playtest), gives its own page instead: `web: { url, label }`, the button saying Sign up, Join the playtest, Wishlist or Learn more in the player's language.
- **The reward never depends on there being an ad.** With nothing ready, a still card plays for a few seconds.

## Where to find things

| You want to | Read |
|---|---|
| Put ads in a web or Capacitor game | This page: [Use](#use), [In a Capacitor app](#in-a-capacitor-app) |
| Put ads in a Unity game | [Unity](unity/README.md) |
| Ask a player's consent, where the law wants it | [Consent](#consent) |
| Make a video or a playable for your game | [Creatives](CREATIVES.md) |
| Build a playable with a narrator | [The playable kit](playable-kit/README.md) |
| Run these playables in another ad player | [Hosting a playable](PLAYABLE_HOST.md) |
| Know what a game asks of the network's server | [The server](SERVER.md) |
| See what changed in a release | [Changelog](unity/CHANGELOG.md) |

## Use

```js
import { createIndieAds } from './vendor/sdk/core/index.js';

const ads = createIndieAds({
  host: 'mygame',              // this game's id in the catalogue: it's never advertised to itself
  rating: '9+',                // this game's age rating: nothing rated above it is shown
  catalogue: 'https://example.com/network/catalogue.json',
  placements: { saveMe: { maxSecs: 30 }, jobs: { maxSecs: 15 } },
  onEvent: e => console.log(e),
});

const { granted } = await ads.show('saveMe', { reward: '+3 ♥' });
if (granted) giveThePlayerTheirHearts();
```

`show()` resolves `{ granted, creative, app, kind, watchedSecs }` once the layer has closed. The game gives its own reward. Call it from the tap on the offer, so a video may start with sound.

A game with no bundler takes this repo as a git submodule and imports `core/index.js` directly; one with a bundler can take it as an npm git dependency.

## In a Capacitor app

Add `capacitor/` as a dependency (`"indie-ads-capacitor": "file:…/sdk/capacitor"`), run `npx cap sync`, and pass `native: capacitorNative()` (from `capacitor/index.js`). The app then shows the App Store sheet over the game, and doesn't download on mobile data. What else is on the device is never asked: a game's daily cap and its rest are what spare a player who already has it.

## In a Unity game

`unity/` is a UPM package (add by git URL with `?path=/unity`): the same player, in the package's own web view (the system's, on iOS and Android: no web-view plugin to buy), with `IndieAds.Wants(placement)` to hand for mixing with a paid network. See [Unity](unity/README.md).

## Interstitials

A placement with `format: 'interstitial'` is the game's choice, not the player's: no reward, no "Leave now?", and ✕ appears after `skipAfter` seconds (5). With nothing ready it shows nothing: `show()` resolves `{ shown: false }`, and the game carries on (or shows its paid network's).

```js
placements: { betweenLevels: { format: 'interstitial', maxSecs: 30, skipAfter: 5 } }
```

## Beside a paid ad network

A game with other ads to show (a paid network's) hands that network to `show()`, and whose slot it is is the package's to say:

```js
const { granted, via } = await ads.show('saveMe', { paid: () => myNetwork.showRewarded() });
```

`paid()` resolves `{ granted }` once its ad has been shown and closed, or `null` when it has none. Each time: a game this studio **owes** showings goes first, if one of its ads is ready; else the house's `share` of the slots, by chance; else the paid network, and if it has none, a house ad after all. `via` says which it was. A game owed is under every limit the others are (a creative's `capPerDay`, the game's rest, the player's `perDay`): past them its ad isn't ready, so it isn't first. To decide it yourself, ask without showing:

```js
const { share, available, owed } = await ads.demand('saveMe');
```

`available` is how many creatives this player could be shown here now: none if they have seen each as often as it may be shown today, or have seen the game's `perDay` of house ads today, or every game left is resting (below), or nothing is downloaded yet. `share` (0–1) is what the network asks of this placement's slots, and is 0 when nothing is available.

The share is the catalogue's to set, so it changes with no release of any game (`core/exchange.js`):

```json
"exchange": { "share": 0.1, "max": 0.6, "full": 2000, "days": 30, "perDay": 3,
              "fatigue": { "after": 6, "rest": 14, "grow": 2 },
              "hosts": { "mygame": { "share": 0.15, "perDay": 2, "placements": { "saveMe": { "share": 0 }, "between": { "share": 0.2 } } } } }
```

`share` is what's asked of a game that owes no one. With `mix: '<ingest>/mix'` the ingest answers instead, from the showings it has counted: a studio whose games have been shown by another studio's more than it has shown theirs **owes** the difference, and its games are asked for more of their slots, up to `max` at a debt of `full` showings, until it's square. The games it owes are also likelier to be the ones picked. A catalogue with no `exchange` asks for nothing.

A game may be given its own settings (`hosts`), and a placement of it its own share: one given a `share` and no `max` stays at that share whatever is owed, so a game's best-paying slot can be kept for its paid network with `0`.

Two limits keep a player from being shown the same few games' ads for months. Both are counted on the device, in the game's own storage, since the network keeps nothing about any one player:

- `perDay`: the most house ads a player is shown in 24 hours in one game. Left out, no limit.
- `fatigue`: a game whose ads a player has been shown `after` times with no tap on its store button **rests**, not shown to them, for `rest` days; each time again, `grow` times longer, up to 180 days. A store tap starts it over. When every game rests there is nothing available, and the host's paid network has all its slots. Left out, 6, 14 and 2; `after: 0` turns it off.

A developer's test (`test()`) is held to neither.

## Consent

In the UK and the EEA the law asks for a player's agreement before anything is kept on their device for advertising, or read from it. The SDK keeps ads downloaded ahead, which ads it has shown and when, and counts waiting to be sent. The game is the one with a screen to ask on, so the game asks, and tells the SDK what was answered:

```js
createIndieAds({ …, consent: false })   // the player hasn't agreed
```

Without consent nothing is kept there: ads are streamed (on mobile data too: there's nothing downloaded ahead), what's been shown is remembered only until the game closes, and what an earlier session kept is taken away, counts not yet sent among it. Left out, or `true`, it's as ever, so **a game with players in the UK or the EEA must say**. It's read once: when the answer changes, make the SDK again in a page loaded afresh. [Privacy](https://indieadnetwork.com/privacy) has what's kept and what's sent.

**A game with a consent platform** (Google's User Messaging Platform, or any other built on the IAB's Transparency and Consent Framework) needn't ask twice. The platform already knows whether the law applies to this player and what they agreed to, and `cmpConsent()` reads it: `true` (agreed, or somewhere that needn't be asked), `false`, or `null` where no platform has said.

```js
import { cmpConsent } from './vendor/sdk/capacitor/index.js';   // in a browser: from core/index.js

const agreed = await cmpConsent();   // once the platform's own dialog has been answered
const ads = createIndieAds({ …, consent: agreed ?? false });
```

What to set up in the platform, with Google's as the example (AdMob → Privacy & messaging):

1. **Make a European regulations message** for the app and publish it. It's what asks, and it's shown only to players the law covers.
2. **Leave "Store and/or access information on a device" in it.** That is the framework's purpose 1, the one this SDK goes by. It's in every such message unless taken out.
3. **Name Indie Ad Network where you list who shows ads in your game**: in your privacy policy, and in the message's ad partners if your platform lets you add one of your own. It isn't on Google's list or the IAB's.
4. **Ask before the SDK starts**: wait for the platform to say the dialog is done, then `cmpConsent()`.

**A game with no consent platform** asks in a dialog of its own: what's kept and why, a No as easy as the Yes, before the SDK starts, and a way to change the answer later in its settings.

## Languages

The player's own words ("Leave now?", "Play free"…) are in the player's language: 19 of them, with Latin America's Spanish apart from Spain's and Portugal's Portuguese apart from Brazil's. By default that's the device's language. A game with a language setting of its own says so, and only as much as it knows:

```js
createIndieAds({ …, lang: () => settings.language })   // 'fr', 'es', 'zh-Hant'…
```

"es" from the game on a phone set to es-MX is Latin America's Spanish: the region comes from the device. What watching earns (`reward`) is the game's own text, so the game translates it. In the catalogue, a `line` may be one string or one per language (`{ "en": "…", "es-419": "…" }`), and a creative with words in it can be kept to those who read them (`"langs": ["ru"]`). It goes by language alone ("es" is Latin America's too). Where a creative has a cut per language, the admin's creative form takes either "only for these languages" or, for the cut everybody else sees, "not for these languages": the catalogue it serves gives that one as `langs` too, every language the player has words in but those, so nobody is shown two of them and games already released follow it. `strings/README.md` says how the words are kept and how to add a language.

## The catalogue

One JSON file on a server, shared by every game, so changing what's shown never needs an app release. `schema/catalogue.schema.json` describes every field; `npm run validate -- path/to/catalogue.json` checks a file the way the player reads it.

```json
{
  "apps": {
    "othergame": { "name": "Other Game", "studio": "mystudio", "under13": true, "price": "free", "rating": "4+",
             "ios": { "id": 123456789 }, "android": { "package": "com.example.othergame" } }
  },
  "creatives": [
    { "id": "othergame-15", "app": "othergame", "kind": "video", "secs": 15, "aspect": "16:9",
      "src": "creatives/othergame-15.mp4", "poster": "creatives/othergame-15.jpg",
      "line": "Build the rail network of your dreams." }
  ]
}
```

Which creative shows is decided in `core/pick.js`: in date, not the host, not rated above it, not resting, under its daily cap, the right shape, no longer than the placement takes; then by weight, and never the same one twice running.

## Creatives

| Kind | Spec |
|---|---|
| Video | MP4, H.264 + AAC, 15 s or 30 s, about 2 Mbps. 9:16 (1080×1920) for portrait games, 16:9 for landscape. A poster JPG. |
| Playable | One self-contained HTML file, under 5 MB (8 MB at most; the admin warns over 5), MRAID 2/3. Its install button calls `mraid.open()`; if it has an end, it calls `mraid.close()`. |

The player draws the close button, the countdown and the end card (icon, line, store button), so a creative is all game: no "Download now", no end card of its own, and nothing that matters in the top 12% of the frame. A creative may dress that end card with art of its own and put the store button where it wants it, and a video may fade into it, loop at its end, or be shown in a shorter slot than its length: [Creatives](CREATIVES.md#dressing-the-end-card-and-how-a-video-is-shown) has each.

- **[Creatives](CREATIVES.md)** is the guide for a studio making them: the formats, a prompt that cuts a video from a store trailer, the flags, languages and uploading.
- **[The playable kit](playable-kit/README.md)** makes a playable of your own game, with a narrator's voice baked on your own computer.
- **[Hosting a playable](PLAYABLE_HOST.md)** is the contract between a playable and the player: the sandbox, the messages, `finishEarly`, `keepPlaying` and the funnel (`window.houseAds?.step('board2')`).

A video that ends on a card of its own (one already cut for another network) is marked `ownEndCard`, a tick in the admin: the player's card isn't put over it, and a tap anywhere on the video opens the store.

## Events

Each goes to `onEvent` as `{ event, host, placement, creative, app, kind, t, … }`:

`offer` · `show` · `q25` `q50` `q75` `q100` (video) · `first_touch` `step` `complete` (playable) · `reward` · `exit_kept` `exit_early` · `keep_playing` (playable) · `store_banner` · `store_open` · `skip` (a video shown in a placement shorter than it, left for its end once the reward was in) · `paid` (the slot went to the paid network) · `fail`

`store_open` says what was tapped, `from`: `creative` (the video itself, or a playable's own button), `button` (the player's store button beside the ad) or `card` (the end card's).

`report` is a player's report of the ad, from the ⓘ beside its "Ad" label, with `message` (what they typed, or nothing). With an ingest it also goes to the dashboard's Reports, with the ad, the placement, the language and this release.

With `ingest: '<url>'` they also go to the package's own analytics, so creatives can be compared across every game: the network's server ([what it's sent](SERVER.md)) keeps daily counts and nothing about a player. Call `ads.offered(placement)` when a placement's button is put in front of the player: shows over offers is the opt-in rate.

A player's report of an ad (the ⓘ on it) goes to `/flag` beside the ingest, or to `reports: '<url>'` if given: a development build that counts nothing can name it and see its reports arrive. One from a test showing (`test()`) is sent marked as a test, and the dashboard keeps it apart from players' reports.

## The cache

Create it at boot and it downloads the creatives likeliest to be shown (each placement's best, three in all), on a network that costs the player nothing, into IndexedDB; an ad then plays from the device, with or without a signal. Before the first download finishes, the still card plays instead: nothing streams. `tools/stamp-catalogue.mjs` writes each creative's `bytes` and `sha256` into the catalogue, which is how a file is known wherever it's hosted and how a bad download is refused.

`catalogue` can be `[server URL, shipped URL]`: the server's first, then the last copy fetched from it, then the one that shipped with the game.

## Publishing

The catalogue and its creatives are static files: host them anywhere that answers with `Access-Control-Allow-Origin: *` (an app's web view is another origin) and doesn't cache `catalogue.json`.

- **From the network's admin**: studios sign in, upload creatives and read a dashboard; the network's server keeps the catalogue and answers `catalogue.json` itself. Nothing to publish. That server is kept apart from this repository; [the server](SERVER.md) says what a game asks of it, for anyone who would answer in its place.
- **By FTPS**: `node tools/publish.mjs path/to/catalogue.json ftp://host/dir/ --upload` sends the catalogue and every file it names (credentials from `~/.netrc`), files first and the catalogue last, with an `.htaccess` for Apache that sets both headers.

Don't put "ads" in the hostname: network ad blockers refuse it.

## Rules to keep

- **https, and nothing else.** The catalogue, the ingest, the mix, and every file, picture and tracking link a catalogue names: one that's `http://` isn't asked for (but for `localhost`, a developer's own). With `signedBy: '<the network's public key>'` the server's catalogue is used only if the network signed it ([the server](SERVER.md#the-catalogue)), so nobody between a player and the server can serve ads of their own.

- **Reward watching, never installing or tapping the store button.** Both stores forbid incentivised installs.
- **Ads must suit the host's age rating**: set `rating`, and give each app its own in the catalogue.

## Tests

`npm test` (Node's own runner; the rules are pure and need no browser).

## Versions

One version for the whole repository, [Semantic Versioning](https://semver.org); a release is the tag `vX.Y.Z`. The [changelog](unity/CHANGELOG.md) has each one, and what a game taking it must do.

## Status

[STATUS.md](STATUS.md): what's built, what's next, and what was put off and why.
