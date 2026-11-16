# The player's words

Everything the ad player itself says, one file per language. `en.json` is the original; a new string starts there.

| Key | Where it's seen |
|---|---|
| `ad` | The small label before the advertised game's name, top of the ad |
| `earned`, `earnedPlain` | Beside the ✓ when the countdown ends. `{reward}` is the game's own words for the reward ("+3 ♥"), already in the player's language |
| `leaveTitle`, `miss`, `missPlain`, `keep`, `leave` | The question asked when ✕ is pressed before the reward: title, what's lost, and the two buttons |
| `keepPlaying` | On the end card of a playable that may be played on past its time (`keepPlaying` in the catalogue) |
| `playFree`, `get`, `preorder`, `preregister` | The store button: a free game; a paid one (never a price); not out yet, on the App Store; not out yet, on Google Play |
| `signUp`, `playtest`, `wishlist`, `learnMore` | The button of a game with a page of its own and not on the player's store (`web.label` in the catalogue): a sign-up, a playtest, a wishlist, or anything else |
| `whyBroken`, `whyStuck`, `whyInappropriate`, `whyMisleading`, `whyOther`, `send` | Once "Report this ad" is pressed: what's wrong with it, one to be picked (it didn't play or froze; it couldn't be closed; it's inappropriate; it's misleading; something else), and the button that sends the report |
| `about`, `network`, `chosen`, `reportAsk`, `report`, `reported` | The ⓘ beside the ad's label, and its panel: the button's name for screen readers; whose ad this is ("Indie Ad Network" stays as it is in every language); what it was chosen by; the box for a few words; the report button; the thanks |
| `seeMore` | In the ⓘ's panel, where the network has a page of its games: the link to it, under the words about whose ad this is |
| `loading` | While a playable's page arrives |
| `close`, `done`, `soundOn` | Read by screen readers only: ✕, the ✓, the 🔇 button |
| `skip` | The button that takes an interstitial's video to its end, top right, with ▸ after it. One short word |

## Languages and regions

- A file named for a language alone has every key: `fr.json`, `ja.json`.
- A file named for a region of one holds **only what differs** from its language's file, and takes the rest from it: `es-419.json` (Latin America) over `es.json` (Spain), `pt-PT.json` (Portugal) over `pt.json` (Brazil). So one correction to a shared string is made once.
- Chinese is two languages here, by script: `zh-Hans.json`, `zh-Hant.json`.
- Which file a player gets is `core/locale.js`: `es-MX`, `es-AR`, `es-US` → `es-419`; `pt-AO` → `pt-PT`; `zh-TW`, `zh-HK` → `zh-Hant`; anything unknown → `en`.

## After a change

`node tools/build-strings.mjs` writes `core/strings.js` (what the player reads: a browser can't be asked to import JSON everywhere yet), then `node tools/build-player.mjs` for the Unity page. `npm test` fails if a language lacks a key, a translation has lost its `{reward}`, or `core/strings.js` is stale.

## To add a language

Copy `en.json` to `<code>.json`, translate, run the two tools. A right-to-left language is also named in `RTL` in `core/locale.js`.

The translations of 2026-11-11 were written by Claude, not by native speakers: each wants a read by one before it's relied on.
