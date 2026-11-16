# Hosting an Indie Ad Network playable in another ad player

For someone adding playable support to their own in-house ad network, so that a playable built
for the Indie Ad Network runs in it unchanged. It describes the contract between the playable (one HTML
page) and the host (the ad player around it): how the page is run, the messages each side
sends, the two flags a creative carries, and the analytics that come out.

The reference implementation is two files in this repository: `core/mraidShim.js` (about 80
lines, injected into the playable) and the playable parts of `core/player.js`. Copying the shim
as it is gets most of this for free.

To make a playable rather than host one, start with the [playable kit](playable-kit/README.md): its
runtime does the playable's side of everything here.

## 1. What a playable is

- One self-contained HTML file: scripts, pictures, sound and fonts all inline. It makes no
  network requests. Under 5 MB is the aim; 8 MB is the most the network's admin accepts.
- Written to MRAID 2/3: it expects a global `mraid` object to exist before its own scripts run.
- It draws no close button, countdown, or end card of its own. The host draws those.

The creative's record carries, beside the file:

| Field | Type | Meaning |
|---|---|---|
| `kind` | `'playable'` | as against `'video'` |
| `secs` | number, 5–60 | how long it plays before its time is up |
| `finishEarly` | boolean | a playable that ends itself before `secs` earns the reward then, not when the countdown is out (section 5) |
| `keepPlaying` | boolean | when time is up, the player may choose to play on (section 6) |

### Settings from the page

The network's admin has a box for each of `finishEarly` and `keepPlaying`, and fills them in when a file is
picked from what the page says and does (`playable-kit/tools/page-says.js`). The page may say what it wants in its head:

```html
<meta name="house-ads" content='{"secs":60,"finishEarly":true,"keepPlaying":false}'>
```

| Field | The form starts with it | It can't be ticked unless |
|---|---|---|
| `finishEarly` | ticked only if the tag says `"finishEarly": true` | the page calls `mraid.close()` |
| `keepPlaying` | ticked, unless the tag says `"keepPlaying": false` | the page listens for `viewableChange`, since it must stand still under the end card |
| `secs` | fills Seconds | |

The tag is a hint and the form decides: whoever uploads may change a box, within what the code can do, and the
Worker refuses a box the page's code doesn't bear out. A creative already saved keeps its boxes until a new file
is picked or one is changed.

The two start differently on purpose. A page with no tag, a playable made for another network say, starts
without Finish early: there `mraid.close()` is often the page's own ✕, and the reward for one tap of it would be
too cheap. Its close is kept to all the same: the end card shows, and the countdown runs on over it. It starts
with Keep playing if it pauses when told, which is only an offer to a player whose time ran out mid-play.

The playable kit writes the tag (`page({ settings })`) and refuses to build a page whose tag asks for Finish
early when its code never closes.

## 2. How the host runs it

1. Take the HTML as a string. Remove any `<script src="…mraid.js">` tag (there is no such file).
2. Insert the shim as an inline `<script>` straight after `<head>` (else after `<html>`, else
   after the doctype, else at the very start), so it runs before anything of the playable's.
3. Show it in `<iframe sandbox="allow-scripts" allow="autoplay">` with the result as `srcdoc`.
   The sandbox has no origin: no cookies, no storage, no popups, no navigation. The player also gives
   the page a policy ahead of everything of its own (`LOCKED` in `core/mraidShim.js`), so it loads only
   what's written into it and nothing fetched: do the same, and a playable can tell no one it was shown.
4. Because storage throws in that sandbox, the shim replaces `localStorage` and
   `sessionStorage` with in-memory stand-ins when touching them throws.
5. The frame sits **below** the host's bar (close button, countdown), not under it, so the
   playable has its whole frame to itself.
6. The countdown doesn't run until the frame's `load` event.

## 3. What the playable says to the host

Every message is `parent.postMessage({ houseAds: <type>, …fields }, '*')`. The host accepts a
message only when `event.source` is the frame's own window.

| `houseAds` | Other fields | Sent when the playable… | What the host does |
|---|---|---|---|
| `'open'` | `url` | calls `mraid.open(url)` (its install button) | opens the store with **the host's own link**; the playable's URL is ignored |
| `'complete'` | none | calls `mraid.close()` or `mraid.unload()` | see sections 5 and 6 |
| `'touch'` | none | gets its first `pointerdown` (the shim listens, once, in capture) | emits `first_touch` |
| `'step'` | `name` | calls `window.houseAds.step('board2')` | emits `step` (section 8) |
| `'error'` | `message` | has an uncaught error or unhandled rejection | emits `fail` with the message, cut to 200 characters: each different message once a showing, three at most |

The shim also maps other networks' install calls to `'open'`: `window.install()` (Mintegral),
`FbPlayableAd.onCTAClick()` (Meta), `ExitApi.exit()` (Google Ads).

`window.houseAds.step` is the one call that isn't MRAID. A playable should call it as
`window.houseAds?.step('name')`, so it does nothing on a network without it.

## 4. What the host says to the playable

`frame.contentWindow.postMessage({ houseAds: <type>, value }, '*')`. The shim turns each into
the MRAID event a playable already listens for.

| `houseAds` | `value` | MRAID side | Sent when |
|---|---|---|---|
| `'viewable'` | boolean | `mraid.isViewable()`, event `viewableChange(bool)` | the countdown pauses or resumes: app hidden, the "leave and lose the reward?" question up, the store open; and `false` when time is up |
| `'volume'` | `0` or `100` | `mraid.getAudioVolume()`, event `audioVolumeChange(n)` | on frame load (`0` if the host is muted, else `100`); `0` when time is up; restored on Keep playing |

**The playable must pause and go silent on `viewableChange(false)` and resume on `true`.** With
`keepPlaying` the frame is not removed when time is up, so this is the only thing stopping it.

The rest of the `mraid` object the shim provides, all fixed answers:

- `getVersion()` → `'3.0'`; `getState()` → `'default'`; `getPlacementType()` → `'interstitial'`
- `addEventListener(event, f)` / `removeEventListener`; a `'ready'` listener is called on the
  next tick, each one once
- `getMaxSize`, `getScreenSize` → the frame's `{ width, height }`; `getCurrentPosition`,
  `getDefaultPosition` → the same with `x: 0, y: 0`
- `getCurrentAppOrientation()` → `{ orientation: 'portrait' | 'landscape', locked: true }`
- `supports()` → `false`; `useCustomClose`, `expand`, `resize`, `setOrientationProperties`,
  `setExpandProperties`, `setResizeProperties` → do nothing

## 5. Time, reward, and `finishEarly`

- The clock counts only time on screen. It stands still while the frame loads, the app is
  hidden, the leave question is up, or the store is open.
- **Rewarded:** the reward is earned when the clock reaches `secs`. Closing before that asks
  first, and leaving forfeits it.
- **Interstitial:** no reward. A close button appears after 5 seconds; the playable runs on
  until `secs` if the player stays.
- **Time up (clock reaches `secs`), no `keepPlaying`:** the host sends `viewable: false` and
  `volume: 0`, removes the frame, and shows its own end card (icon, name, one line, store
  button).

What `'complete'` from the playable does, first match wins:

| State | Result |
|---|---|
| playing on after Keep playing | frame removed, end card for good |
| reward already earned | the ad closes |
| otherwise (before `secs`) | emits `complete`, frame removed, end card. With `finishEarly` the reward is granted now; without, the countdown runs on over the card and the reward comes at `secs` |

## 6. `keepPlaying`

When the clock reaches `secs` on a creative with `keepPlaying`:

1. **Resting.** The host sends `viewable: false` and `volume: 0`, but **keeps the frame**. The
   end card shows over it with an extra "Keep playing" button. The reward (if rewarded) has
   been earned at this point. Messages from the playable are ignored while resting.
2. **Kept.** If the player presses Keep playing: the card hides, the host sends the volume back
   and `viewable: true`, emits `keep_playing`, and allows up to **120 more seconds**. The
   earned-reward tick in the bar becomes a store button; the close button closes at once.
3. **Over.** After those 120 seconds, or on `'complete'` from the playable, the frame is
   removed and the end card shows for good, without the Keep playing button.

If the player doesn't press it, the ad ends from the end card as any other.

## 7. Analytics events

Each event is `{ event, placement, creative, app, kind, secs }`. `secs` is whole seconds of
on-screen time when it happened; `kind` is `'playable'`. They are sent in batches as
`{ v: 1, host, os, events: [...] }`, where `host` is the game showing the ad and `app` the game
advertised.

| `event` | When | Extra |
|---|---|---|
| `show` | the ad appeared | |
| `first_touch` | the playable's first touch | |
| `step` | a named step was reached (section 8) | `step: 'board2'` |
| `complete` | the playable ended itself before `secs` | |
| `reward` | the reward was earned | |
| `keep_playing` | the player pressed Keep playing | |
| `store_open` | the store was opened, from the playable or the end card | |
| `exit_kept` | asked "leave?", the player stayed | |
| `exit_early` | asked "leave?", the player left | |
| `fail` | the playable threw | `why: 'playable'`, `message` |

## 8. The funnel

- `window.houseAds.step(name)`: `name` matches `/^[\w.-]{1,32}$/`.
- The host emits each name **once per showing**, and at most **12 names per showing**. Anything
  else is dropped without a word.
- The server keeps a creative to 12 distinct names in all, ever. A renamed step counts as a new
  one, so names should stay stable across builds.
- Stored per `(creative, step, day, host, app)`: `n`, the showings that reached it, and the sum
  of `secs`, from which the average time it was reached.
- Drawn per creative as: `show` → `first_touch` → each step, ordered by average `secs` →
  `store_open`. Each stage is its count and its share of `show`.

Example names from a three-puzzle playable: `played`, `solved_1`, `solved_2`, `solved_3`,
`refused`, `dead_end`, `helped`.

## 9. Checks for a host

- A page that calls `mraid.open()` opens the store with the host's link, whatever URL it passes.
- Hide the app mid-ad: the playable gets `viewableChange(false)`, the countdown stops; both
  resume on return.
- A muted host: the playable hears `audioVolumeChange(0)` on load.
- `mraid.close()` before `secs`: the end card at once; the reward with it if `finishEarly`, else when the countdown is out.
- With `keepPlaying`: time up pauses the page under the card; Keep playing resumes it with
  sound; 120 seconds later the frame is gone.
- `houseAds.step('a')` twice in one showing is one `step` event; a 13th name is dropped.
- A page that touches `localStorage` doesn't throw.
