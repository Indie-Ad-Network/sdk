# The server

What a game asks of the network's server, and what it sends there. The Indie Ad Network's own server (its admin, its catalogue, its counts) is kept in a repository of its own; this page is the whole of what the SDK knows of it, so a game can be pointed at any server that answers the same way. Everything here is over https: an address that's `http://` isn't asked (but for `localhost`).

A game needs none of it but the catalogue. With no `ingest` nothing is counted, with no `mix` the share is the catalogue's own, and with neither a player's report of an ad goes only to the game's `onEvent`.

| The game is given | It asks | For |
|---|---|---|
| `catalogue` | `GET <catalogue>?host=<game>&sdk=<release>` | What can be shown (`sdk` since 0.6.17) |
| `ingest` | `POST` to it | Counting what was shown |
| `mix` | `GET <mix>?host=<game>` | The share of a game's slots the network asks for |
| `reports` (or `/flag` beside the ingest) | `POST` to it | A player's report of an ad |

Every answer must carry `Access-Control-Allow-Origin: *`: an app's web view is another origin.

## The catalogue

One JSON document, as [`schema/catalogue.schema.json`](schema/catalogue.schema.json) describes it; `npm run validate -- path/to/catalogue.json` reads a file as the player will. It mustn't be cached for long: changing it is how what's shown changes.

- **Files.** Each creative's `src`, and each `poster`, `icon` and `art`, is a URL, or a path read against the catalogue's own. A creative carries its file's `bytes` and `sha256` (`tools/stamp-catalogue.mjs` writes them): the cache keeps a download only if they are its file's.
- **Videos want byte ranges.** iOS streams a video only from a server that answers `Range` requests. With the cache at work nothing streams, so it arises only where IndexedDB is unavailable.
- **The signature.** A game given the network's public key (`signedBy`; `catalogueKey` in Unity) uses the server's catalogue only if the answer has the header `x-catalogue-signature`: an ECDSA P-256 signature with SHA-256 over the body's bytes exactly as sent, `r` and `s` (64 bytes) in base64url. The key is the public point (65 bytes, base64url). Unsigned or wrongly signed is as no answer: the game goes on with the last catalogue it kept, or the one it shipped with. A served catalogue may also name the key in its own `signedBy`, which a game believes only from the copy it shipped with.

A catalogue can as well be a folder of static files with no server behind it: `tools/publish.mjs` sends one by FTPS, with the headers it needs.

## What's counted

`core/wire.js` is the one definition of it. The game posts, as `text/plain` (so the browser asks no permission first):

```json
{ "v": 1, "host": "mygame", "os": "ios",
  "events": [{ "event": "show", "placement": "saveMe", "creative": "othergame-15", "app": "othergame", "kind": "video", "secs": 0 }] }
```

- `event` is one of `EVENTS` in `core/wire.js`, or `step` with a playable's own name for somewhere in it (`step`, at most 32 characters of letters, digits, `.`, `_` and `-`; a playable has at most 12).
- `kind` is `video`, `playable` or `card`; `os` is `ios` or `android`.
- A `store_open` says what was tapped, `from`: one of `FROM` in `core/wire.js`. `paid` has a placement and nothing else: the slot went to the game's paid network.
- Up to 50 events a batch. Nothing in it is about the player: no device or advertising id, no install or session id.

Answer `204`. On `429` or a `5xx` the batch is kept and sent again later; any other refusal and it's dropped. As a page closes, what's waiting goes by beacon, and no answer is read.

`v` changes only when this format does, and games already released go on sending the old one.

## The mix

`GET <mix>?host=<game>` is answered with what the network asks of that game's slots:

```json
{ "share": 0.25, "owedTo": ["othergame"], "boost": { "othergame": 2.5 }, "placements": { "saveMe": 0 } }
```

- `share`: 0–1, of the game's slots. Without it the answer isn't believed.
- `owedTo`: the games this game's studio owes showings, which go first when one of their ads is ready.
- `boost`: how many times likelier each of those is to be picked (at most 4).
- `placements`: a share for one placement, where the catalogue gives it its own.

`mix()` in `core/exchange.js` makes this answer from the catalogue and rows of `{ host, app, shows }`, so a server that has counted showings runs it over its counts. A game waits 1.5 s for the answer, then goes by the last one it had (for a week), then by the catalogue's `exchange` alone.

## A player's report of an ad

From the ⓘ beside the "Ad" label, at once, as `text/plain`:

```json
{ "v": 1, "sdk": "0.5.0", "host": "mygame", "os": "ios", "lang": "fr", "placement": "saveMe",
  "creative": "othergame-15", "app": "othergame", "kind": "video", "secs": 7, "message": "", "test": true }
```

`message` is what the player typed, up to 200 characters, or nothing: the one thing sent that a player wrote. `test` is there only from a developer's test showing. The answer isn't read.
