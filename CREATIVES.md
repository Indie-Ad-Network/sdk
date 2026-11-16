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

So a creative is all game. Leave out "Download now" buttons, store badges and an end card of your own, and keep anything that matters out of the top 12% of the frame. (To change the card the player shows, see the next section: that is the player's card dressed, not one baked into your video.)

## Dressing the end card, and how a video is shown

From 0.5.0 a creative may say more about how it's shown. All of it is optional, set in the creative's form under **How it's shown**, and a game on an older release shows the creative the usual way.

| You give | What happens |
|---|---|
| **End card art** (`endCard`): a picture for portrait screens, one for landscape, or one of the two. The network's admin takes JPEG, PNG or WebP, 2 MB at most | It's shown whole in place of your icon and line, over a blur of itself where it doesn't fill the screen. Either stands in for the other. If it can't be had, the usual card is shown |
| **The store button's place** (`storeButton`): the edge or corner it's set against, its width, and how far in | The button is put there, on your art or on the usual card. The network's admin takes a place only with a picture of the button, for one store at least. Lengths are in 1/720 of the screen's shorter side, so it sits the same on a phone and a tablet. Left out: bottom centre, 360 wide, 128 up |
| **The store button as a picture**, one for each store | Your picture is the button. With none for the player's store it's in words, in the player's language: a picture's words are in one language only |
| **A pulse** | The button swells and settles, to be seen |

And for a video:

| You give | What happens |
|---|---|
| **Backdrop: itself** (`backdrop`) | Where the video doesn't fill the screen (a landscape video in a portrait game), its own picture is blurred behind it as it plays. Left out: its poster, blurred |
| **A fade** (`fade`), in seconds, 5 at most | Over the video's last seconds the end card comes up and the sound goes down (with a loop, only the sound). Left out: a cut |
| **A loop** (`loop`), from a second of the video | At its end the video plays on from there, silent, with the store button over it and no end card. Make the last seconds something that can go round |
| **When the store button is there** (`tap`) | From a second of the video, or only at its end. Left out: from the start |
| **A tap anywhere opens the store** (`tap`) | The same choice. Left out: never, and only the button does (but for a video marked as ending on its own card, where a tap anywhere always does) |
| **It may be shown in a shorter slot** (`overrun`) | A 45 second video may be shown where a game asks for 30. The reward comes at the game's 30 seconds and the video plays on; a player who leaves then goes by the end card, or the loop. Left out: it's shown only where it fits |

Nothing in this section shortens the wait for the reward. [The schema](schema/catalogue.schema.json) has every field as a catalogue carries it.

## Make a video

Cut it from your store trailer or your own footage: the 15 seconds that show the game best.

- **The frame at 1.0 s is the poster** players see before the video starts. Make it a clean picture of the game, not a fade or a caption.
- **Size comes first.** Phones download creatives ahead of time. Under 4 MB is a good 15 seconds.
- **Make both shapes.** A portrait game is shown the portrait cut, a landscape game the landscape one. With only one, it is shown in both: letterboxed in the other, and picked half as often there.

A coding agent can do the cutting. [The video prompt](#the-video-prompt) below goes into [Claude Code](https://claude.com/claude-code), or any agent that can run ffmpeg, in an empty folder. It finds the preview videos on your store pages (or takes footage you give it), cuts a 15 second portrait and landscape ad, and checks both against the format above.

**A video that ends on its own card**, one already cut for another network, is ticked so in the admin. The player's card isn't put over it: the video rests on its last frame with the store button over it, the usual one or a picture of your own. The video itself opens nothing when tapped, unless you say from when it should. **A playable with its own end card** is ticked likewise: the player puts no card over it, and it plays on, its reward in, until it's closed. Both are from SDK 0.6.2; a game on an older release shows the usual end card.

## Make a playable

A playable is a short piece of your game that the player really plays. There are two ways to get one:

- **One you already have.** A playable made for user acquisition on another network drops in unchanged. Its install button calls `mraid.open()`; if it has an end, it calls `mraid.close()`.
- **One made with the [playable kit](playable-kit/README.md).** A starter ad, a narrator who thinks aloud in your own voice, and tests against the real player.

What every playable should know:

- **It runs in a sandbox**: scripts, and nothing else. No network (what isn't written into the file isn't loaded: no font, script or picture from another address, no call to a server), no storage, no popups. The store link opened is the network's, never one the playable supplies.
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
