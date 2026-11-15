# Status

Where the package stands, what was put off, and what it can't do. Anything a review turns up that isn't done there and then goes in **Put off**, with why, so it isn't lost.

## Built

| What | State |
|---|---|
| **The core**: player, store links, pick, catalogue, MRAID shim | Node tests; checked in headless Chrome and in a Capacitor app on an Android phone |
| **The cache** (`core/cache.js`): creatives downloaded ahead into IndexedDB and played from the device; the catalogue from the server, then its last copy, then one shipped with the game | Node tests; checked in headless Chrome and on an Android phone |
| **The Capacitor plugin** (`capacitor/`): App Store sheet, installed-game check (Android), metered-network check | Android checked on a phone with real taps. **iOS builds and installs, but nobody has yet tapped through it**: the App Store sheet and sound on a video want checking by hand |
| **Analytics** (`core/analytics.js`, `core/wire.js`, `ingest/`): daily counts in a Cloudflare Worker and D1, nothing about a player | Node tests; running in production |
| **The Unity package** (`unity/`): the player as one page in the package's own web view, the App Store sheet, the installed-game (Android) and metered-network checks, a build step for `<queries>` | The page checked in headless Chrome, driven as Unity drives it; the C#, Java and Objective-C compiled or syntax-checked. **Never run in Unity or on a device**: wants checking on both platforms |
| **Interstitials** (`format: 'interstitial'`) | Checked in headless Chrome |
| **Languages**: the player's own words in 19 languages (`strings/`, `core/locale.js`) | Node tests |
| **The exchange** (`core/exchange.js`, the ingest's `GET /mix`): the share of a host's slots the network asks for, raised by what its studio owes other studios in showings | Node tests; `/mix` running in production. Not yet used by a released game |
| **The admin** (`/dashboard` on the ingest Worker; `/admin`, as it was, sends on to it): sign-in by Cloudflare Access, studios and members, games found on the stores, creatives uploaded, the catalogue kept in D1 and R2 and served by the Worker, a dashboard | Node tests; running in production behind Cloudflare Access |

## Put off

Each is worth doing, but not where it was found.

| What | Why it matters | Why not yet |
|---|---|---|
| **Owed-first in Unity** (`HouseAds.Wants`): `web/host.js` already sends each placement's `owed` (how many games) with its share; `Wants` should answer yes when it isn't 0, and `Show` then keep to the games owed (`show({ among })`). Better, have the page send `turn()`'s own verdict, so the rule isn't written twice | The web core shows a game owed before any paid ad (0.2.6); a Unity game still only rolls the share, so a debt is paid off more slowly there | Added for a Capacitor game's paid network; the Unity side wants compiling and a run in Unity, with the game that has one |
| **Owed-first has no limit of its own**: any debt, however small, takes every ready slot until it's paid. The limits on the player do hold (each creative's `capPerDay`, the game's rest, `perDay`: tested), so that is at most a creative's cap a day from each of the owed game's creatives | A studio one showing in debt shows no paid ads to a player with an ad ready | `mix()` knows how much is owed; a threshold in the catalogue's `exchange`, when a real debt shows what's fair |
| **A paid showing isn't counted by the package** (`via: 'paid'` is the game's to count) | The report can't say what share of a game's slots the house really got | Wants a new event in `core/wire.js` and a column in the ingest: a format change, with the next one |
| **Tuning in the catalogue**: an optional `rules: { ownBoost, capPerDay }` read by `pick.js`, the constants as defaults | Retuning the own/partner mix or the default cap now needs a release of every game, which the catalogue exists to avoid | A new field in the schema: wants deciding with a real case, not guessed |
| **One clock in the player**: wall time gated by `waits` for video too, instead of following `video.currentTime` | Two clocks mean every new state is handled twice; a video whose `play()` is refused twice leaves the ring standing still. Keep playing made it worse: where a playable is in its life is spread over `frame`, `overtime` (resting, kept), `granted` and the `rest` asked of `endPlayable`, read in `grant`, the clock (twice), `wait`, `heard` (twice) and `keepPlaying`, with the ring, the earned label and the store button shown and hidden by hand in two of them. One state for a showing (playing, resting, kept, over) and one place that moves it would carry both | Changes how the ring behaves on a stalled video; wants testing on real phones, both platforms. Before the next state is added (a follow-up for someone who played on and didn't tap the store, say), and after the first games have run this on devices |
| **Mount the player before a playable's page is fetched** | Without the cache, the player sees nothing between the tap and the page arriving | Only matters where IndexedDB is unavailable |
| **`show()` should warn on a placement that was never registered** | An unknown placement silently gets no `maxSecs` limit and the generic reward text | Small; decide between warn and throw |
| **A 9:16 cut tool** (master → 9:16 and 16:9, 15 s and 30 s, with ffmpeg) | Wide videos play letterboxed in portrait games | Creative work |
| **Let the host say when to download** (an `idle()` option, or `ads.prefetch()` called from menus) | A fill straight after boot or an ad can land mid-game: a multi-MB fetch, a hash and an IndexedDB write beside a 60 fps game | Wants measuring on slow phones first |
| **Split `tools/publish` into the rule and the transport** | Files first, catalogue last, CORS open and the catalogue uncached are the package's rules; FTPS by curl and Apache's `.htaccess` are one host's | When someone publishes a folder some other way |
| **One native call for "which of these are installed"** | Several bridge calls where one would do | Asked once each time the game comes to the front, so cheap enough |
| **`store_open`'s `via` from what the shell did**, not what was planned | On iOS a sheet that can't load falls back to the App Store app, but the event still says `sheet` | Needs the plugin to answer |
| **By country** | Which markets watch and tap is the first thing a soft launch asks | Multiplies the rows the report reads; add it as a small table of its own when a report wants it |
| **The package says which of its files a game ships** (a `runtime` list, or a small manifest) | A game with no bundler copies the package's folder into its build, and must leave out the tests, tools, native sources and `ingest/` | Wants agreeing across the games that take the package |
| **Installs in the report** | The report stops at store taps; installs are in App Store Connect and Play Console | A script pulling both by campaign, once there are campaigns to pull |
| **Median, not mean, for when people leave** | "Left early at N s" is an average, which a few long stays skew | Daily counts can't give a median; would need a small histogram per creative |
| **A playable seen in the admin before it's saved** | A video is previewed at upload; a playable is taken on trust until someone sees it in a game | Wants the player itself on the admin's page |
| **The old report (`/report`, `REPORT_KEY`) retired** | Two reports of the same counts, and one behind a shared key | Once the admin's dashboard has been used for a while |
| **Custom poster, and a file replaced in place** | The poster is the frame at one second; a wrong one means a new creative | Small |
| **An admin's approval before a creative goes live** | A member can point its game at any store id or `https://` tracking link, and upload any playable | Fit for studios that know each other; wanted before the network is wider |
| **A key per studio for what's posted to the ingest** | `/mix` trusts the counts, which anyone can post: a studio that wanted to be owed more could say so | The same |

## Known limits

- **The exchange counts showings, not their worth**: an interstitial closed at 5 s and a rewarded video watched to the end are one each, and a studio's games share one debt.
- **Sound on a video** depends on the tap that opened the ad still counting as a gesture. Where it doesn't, the video starts silent with a 🔇 button.
- **A playable's countdown** starts at the frame's `load` event; a playable that fetches more after that is still counted from there. MRAID has no "I'm ready" signal.
- **Installs of other studios' games can't be measured** from here (no advertising ID, and this isn't a signed SKAdNetwork network): exchanges are counted in views and taps.
- **A catalogue published as a folder of static files on Cloudflare can't be streamed on iOS**: Cloudflare's static files don't answer byte ranges. It doesn't arise while the cache works, and a catalogue kept in the admin doesn't have the limit.
- **The admin's Google Play search reads Play's search page**: Play has no search API. When Google changes the page, that column comes back empty with a note and the package is typed by hand. Both stores are searched as the US sees them.
- **A studio sees the names of every game in the network** (they're in the catalogue anyway) and how often its own games were shown in each.
- **The first ad after a first install is a still card** if it's asked for before the first download finishes: nothing streams.
