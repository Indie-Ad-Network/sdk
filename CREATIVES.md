# Creatives

What an ad on the network is made of, and how to make one for your game. A creative is a video or a playable; each game can have several, and the network picks between them.

## Formats

| Kind | What to upload |
|---|---|
| Video | MP4, H.264 + AAC. 15 or 30 seconds. 1080×1920 for portrait games, 1920×1080 for landscape; one of each is best. About 2 Mbps, 25 MB at most |
| Playable | One self-contained HTML file, written to MRAID 2/3. Under 5 MB is the aim; 8 MB at most |
| With either | One line about the game for the end card, 140 characters at most. Your icon comes from the store |

## What the player adds

The network's player draws these over and after every creative, always in the same places:

- **A close button** (top left) and **a countdown** (top right).
- **The end card**: your icon, your line and the store button.

So a creative is all game. Leave out "Download now" buttons, store badges and an end card of your own, and keep anything that matters out of the top 12% of the frame.

## Make a video

Cut it from your store trailer or your own footage: the 15 seconds that show the game best.

- **The frame at 1.0 s is the poster** players see before the video starts. Make it a clean picture of the game, not a fade or a caption.
- **Size comes first.** Phones download creatives ahead of time. Under 4 MB is a good 15 seconds.
- **Make both shapes.** A portrait game is shown the portrait cut, a landscape game the landscape one.

A coding agent can do the cutting. [The video prompt](#the-video-prompt) below goes into [Claude Code](https://claude.com/claude-code), or any agent that can run ffmpeg, in an empty folder. It finds the preview videos on your store pages (or takes footage you give it), cuts a 15 second portrait and landscape ad, and checks both against the format above.

**A video that ends on its own card**, one already cut for another network, is ticked "own end card" in the admin. The player's card isn't put over it, and a tap anywhere on the video opens the store.

## Make a playable

A playable is a short piece of your game that the player really plays. There are two ways to get one:

- **One you already have.** A playable made for user acquisition on another network drops in unchanged. Its install button calls `mraid.open()`; if it has an end, it calls `mraid.close()`.
- **One made with the [playable kit](playable-kit/README.md).** A starter ad, a narrator who thinks aloud in your own voice, and tests against the real player.

What every playable should know:

- **It runs in a sandbox**: scripts, and nothing else. No network, no storage, no popups. The store link opened is the network's, never one the playable supplies.
- **It can report a funnel.** `window.houseAds?.step('board2')` counts how far each showing got, and the dashboard draws the steps between first touch and store tap. On another network the call does nothing.
- **It carries two flags**, boxes on the upload form that are filled in from the page when it's picked: "finish early" (reaching the end gives the reward at once; without it the end card shows and the countdown runs on), ticked only if its `<meta name="house-ads">` tag asks for it, and "keep playing" (the player may play on when time is up), ticked if it pauses when told it isn't viewable, unless the tag says not ([Settings from the page](PLAYABLE_HOST.md#settings-from-the-page)).

The [playable kit](playable-kit/README.md#the-funnel) explains the funnel and the flags. [Hosting a playable](PLAYABLE_HOST.md) is the whole contract, for a playable written by hand or another ad player that wants to run these.

## Languages

A creative can be for some languages only. Upload each language's cut as its own creative and set "Only for these languages" on it; on the cut everybody else sees, list them under "Not for these languages". The line for the end card may be given per language too.

## Upload

Sign in to the admin, open **Creatives**, and add one for your game: the file, its kind, its length in seconds, the flags and the line. Watch it once in the admin's preview before it goes live.

A playable that is live can be tried in any browser at `/play/<your game's id>`: the newest one, whatever build it is. It's a link to share: it runs in the network's own player, with the countdown and the end card, and where it's posted it shows the game's art and "A playable ad for your game on the Indie Ad Network". Nothing is counted there.

## The video prompt

Fill in the first two lines. The text is [`creative-prompt.txt`](creative-prompt.txt) in the repository.
