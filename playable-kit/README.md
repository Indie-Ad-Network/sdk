# Playable kit

Make a playable ad for your own game: a short piece of the game the player really plays, with a narrator who thinks aloud like someone on a let's-play. It builds to one HTML file that the network's player runs as it is.

The kit is four small runtime scripts, a build library, a voice pipeline that runs on your own computer, a recorder that films the ad as a video, and a starter ad to copy. It has no packages to install.

For video ads, and what every creative needs, see [Creatives](../CREATIVES.md).

## What you need

| For | Needs |
|---|---|
| Building and testing | Node 22+, ffmpeg, Chrome |
| Baking the voice | Python 3.10+, about 2 GB of disk plus several GB of models, downloaded once. Fastest on Apple silicon or a CUDA card |
| Recording your voice sample | A microphone |

Paths below are from this repository's root. `<kit>` is wherever `playable-kit/` lies from your ad.

## Quick start

```
cp -r playable-kit/template my-game/playable-ad
cd my-game/playable-ad
PLAYABLE_KIT=<kit> node build.mjs
open dist/playable.html
```

That is a working ad with captions and no voice. `PLAYABLE_KIT` says where the kit is; or set `KIT` at the top of `build.mjs` once. On a Mac, `SCRATCH_VOICE=Samantha node build.mjs` gives every line a computer voice, to judge the timing before baking.

Then, in order: make the game, write the lines, bake the voice, test, upload.

## What's in an ad

| File | What it is |
|---|---|
| `src/lines.mjs` | Every line the narrator says, by key |
| `src/lines.i18n.mjs` | The same lines in other languages (optional) |
| `src/game.js` | The ad itself |
| `src/page.html` | The page it is put into |
| `build.mjs` | Builds `dist/playable.html`, and one page for each other language |
| `play.mjs` | Plays the ad while it is filmed for a video (optional) |
| `vo/recorded/` | The voice takes, `<key>.wav` |
| `vo/direction.json` | Per-line voice settings (optional) |

Commit all of those except `dist/` and `.cache/`. Never commit your voice sample.

## 1. Make the game

Take one moment of your game that shows its one idea, and make it playable in 20 to 40 seconds. `template/src/game.js` shows the shape to keep:

- **One clock that stands still while paused.** Everything is timed from it, the narrator included.
- **Lines tied to what the player does**, not to the clock.
- **A funnel step** at each thing worth counting.
- **`host.done()`** when the ad reaches its end.

The runtime, each file documented at its top:

| Script | Gives you |
|---|---|
| `runtime/host.js` | `pkHost`: start, pause, volume, funnel steps, done |
| `runtime/audio.js` | `pkAudio`: sounds and looping music from clips inside the page |
| `runtime/narrator.js` | `pkNarrator`: the voice queue, captions, stall lines |
| `runtime/stick.js` | `pkStick`: a touch stick that appears wherever a finger lands (optional) |

The page may fetch nothing: pictures, sound and fonts all go in as base64 (`b64`, `dataURI` and `mp3` in `tools/build.mjs`). Draw no close button, countdown, store badge or end card: the player draws those. Keep the top 12% of the frame clear.

## 2. Write the lines

The voice is someone playing and reacting out loud.

- **Open in the first frame, then never go quiet.** Queue a second line straight behind the first. Write filler ("Okay, okay...", "but now what?") to bridge the gaps.
- **Short, present tense, first person.** 1 to 8 words, most with an interjection.
- **Say the game's one idea aloud, early**, as it happens: "I push... and time moves!"
- **Only claim what has happened.** A line fires on the player's action, never on a timer.
- **Build tension, then pay it off.** "Come on, come on..." then "Yes! Got it!"
- **End on wanting more, not on a call to action.** "Okay... what's next?" The end card does the selling.
- **Write stall lines** for a player who does nothing: three or so, said in turn after 4.5 seconds idle.
- **Write lines for the wrong turn** too. They are often the funniest.

A line with no `pool` is part of the script: said once, in the order written, and never after a later one, so a fast player skips lines instead of hearing stale ones. A line with a `pool` comes round again.

```js
hook:    { text: 'Okay, okay... what do we have here?', note: 'Cold open. Keen.' },
stall_1: { pool: 'stall', text: 'I just need to swipe to move.' },
```

`text` is the caption and what the voice says. `say` overrides what the voice is given. `note` is direction for a human reader.

## 3. Bake the voice

Everything here runs on your computer. Nothing is uploaded.

**Set up, once.** This installs [Chatterbox](https://github.com/resemble-ai/chatterbox) (the voice) and Whisper (which checks each take's words) into `~/.cache/playable-kit/voice-venv`:

```
sh <kit>/tools/setup-voice.sh
```

**Record a sample of your voice**, about 20 seconds. The script shows a passage to read:

```
node <kit>/tools/record-voice.mjs voice.reference.wav
```

Read it the way the ad should sound. The voice copies your energy, so a flat reading gives a flat ad. Use `--list` and `--device` to choose a microphone, or `--from recording.m4a` to use a recording you have. Only clone a voice whose owner agreed.

**Bake**, from your ad's folder, then build:

```
sh <kit>/tools/bake-vo.sh --ref voice.reference.wav
node build.mjs
```

Only new or changed lines are rendered. Each take is heard back by Whisper and tried again on another seed if the words are wrong or it runs long.

**Direct it:**

- **Punctuation is the direction.** "..." pauses; "!" and "?!" lift. Spell out what is spoken: "Oh my god", not "OMG".
- **Whisper checks words, not delivery.** Listen to every take.
- **For a flat line, audition seeds** and pin the best in `vo/direction.json`:

```
sh <kit>/tools/bake-vo.sh --ref voice.reference.wav hook --audition 5
```

```json
{ "hook": { "seed": 1443802901, "exaggeration": 1.0 } }
```

The defaults are `exaggeration` 0.9 and `cfg_weight` 0.3, which read lively. A recording of your own works as well: put it in `vo/recorded/<key>.wav`.

## Languages

Each language is a page of its own, uploaded as its own creative.

1. Add the language to `src/lines.i18n.mjs`: every line by the same key, rewritten in that language rather than translated word for word.
2. Bake it: `sh <kit>/tools/bake-vo.sh --ref voice.reference.wav --lang es`
3. `node build.mjs` writes `dist/playable.es.html`.
4. In the admin, set that creative to "Only for these languages", and list them under "Not for these languages" on the English one.

- **The voice** is Chatterbox's multilingual model with your sample, so it is you with an accent. Have a native speaker listen before it goes live.
- **Lines run longer** in some languages. Check the timing of each page.
- **Fonts:** check that yours has the language's letters. Many have no Cyrillic.
- A language Chatterbox doesn't speak can still have captions, or takes recorded by a person.

## Portrait and landscape

The ad is shown in whatever shape the host game is, so it must work in both.

- **Lay out from the frame's size** (`innerWidth`, `innerHeight`), every frame or on `resize`. Never assume a shape.
- **Design for the short side.** Scale by `Math.min(width, height)`, and move the camera or the board, not the text size.
- **Keep the top 12% clear** in both shapes, and captions away from where thumbs rest.
- **`pkStick` appears where the finger lands**, so it needs no layout.
- **Test both**: the tests below take a size, and a narrow or wide browser window shows the same.

## The funnel

`host.step('name')` counts how far each showing got. The dashboard shows them as a funnel: Impressions, Touched it, your steps in the order they were reached on average, then Tapped the store.

- At most 12 names an ad. Letters, digits, `.` `-` `_`; 32 characters.
- Each is counted once a showing, with the second it was reached.

The player adds `show`, `first_touch`, `complete`, `reward` and `store_open` itself.

### A funnel you can read

A good funnel is a staircase: every row is smaller than the one above, and the biggest drop tells you which moment of the ad to fix. Five rules get you there.

- **A step is something the player did.** If the narrator, a demo or a timer can reach it with nobody touching, it counts people who weren't playing, and the row comes out bigger than "Touched it". Fire steps only from the player's own input, or only once they have touched.
- **Each step can only be reached through the one before.** Then each row is a part of the row above and the percentages read as "of those who got this far". An ad with one path gives this for free. One with branches needs steps on the trunk, not the branches.
- **One step for each idea understood, in the order the ad teaches them.** First move, the twist, using the twist, the payoff, the end. Four to seven is plenty; a step every few seconds is about right.
- **Number them**: `1_walk`, `2_freeze`, `3_rewind`, `4_end`. The dashboard orders rows by when they were reached, so the numbers don't sort anything, but they show at a glance when a row is out of place, which means a step isn't measuring what you thought.
- **Leave out what the player already counts.** No step for the ad appearing or the first touch: those are the top two rows.

Mistakes, hints and help are not steps. "Made a wrong move" or "the narrator stepped in" happen to some players and not others, at any point, so as rows they break the staircase. If you want them, give them a prefix that sets them apart (`x_wrong_move`, `x_helped`) and read each as a rate of its own, not as a stage.

A funnel that reads:

| Step | Reached | |
|---|---|---|
| Impressions | 177 | |
| Touched it | 101 | 57% |
| `1_walk` | 89 | 50% |
| `2_freeze` | 66 | 37% |
| `4_rewind` | 31 | 18% |
| `7_end` | 13 | 7% |

Half the players who see the freeze never work out the rewind: that is the moment to make clearer.

One that doesn't:

| Step | Reached | |
|---|---|---|
| Touched it | 50 | 52% |
| `played` | 49 | 51% |
| `solved_1` | 83 | 86% |
| `refused` | 25 | 26% |
| `helped` | 1 | 1% |
| `solved_2` | 63 | 66% |

`solved_1` is bigger than "Touched it" because the narrator solves the first puzzle while nobody is playing. `played` repeats the first touch. `refused` and `helped` are things that happened along the way, not stages. Nothing here says where players give up.

Check it before you upload: play the ad once without touching it and it should reach no step at all (`tools/selftest.mjs` checks the template this way), then play it through and the steps should come in number order.

## The creative's flags

Boxes on the admin's upload form, filled in from the page: pass them to `page({ settings: { secs: 60, finishEarly: true, keepPlaying: true } })` and the build writes them into its head, where the admin reads them when the file is picked ([Settings from the page](../PLAYABLE_HOST.md#settings-from-the-page)). The build says what the form will start as (`admin   60 s, Finish early on, Keep playing on`), and refuses a page that asks for Finish early when its code never ends itself. Whoever uploads may still change a box.

| Flag | What it does | Ask for it when |
|---|---|---|
| `secs` | How long the ad runs before its time is up (5 to 60). Fills the admin's Seconds, which may be changed | Always. Set it a little longer than a slow player takes |
| `finishEarly` | `host.done()` gives the reward at once, with the end card it always shows | The ad has an end, and reaching it is worth the reward. Off unless asked for |
| `keepPlaying` | When time is up the ad rests under the end card, and the player may play on for up to 2 minutes | On by itself; say `false` only if the ad can't be played past its time |

`host.done()` before time is up always ends the ad on the end card. With "finish early" the reward comes with it; without, the player waits out the countdown on the card. With "keep playing" the page is kept alive when time is up, so it must stop and go silent when told it isn't viewable: `pkHost`'s `onPause`. [PLAYABLE_HOST.md](../PLAYABLE_HOST.md) has the whole contract.

## Test

```
node <kit>/tools/check.mjs dist/playable.html
node <kit>/tools/serve.mjs dist/playable.html
```

`check.mjs` checks the size, that the page reaches for nothing outside itself, the step names, and that it pauses when told. `serve.mjs` plays it inside the network's real player; the address it prints takes `?secs=30&finishEarly=1&keepPlaying=1&muted=1`, and `&wait=1` for sound in a browser.

`tools/cdp.mjs` drives headless Chrome for tests of your own: open at a size, swipe, read the page's state, take pictures. `tools/record.mjs` is built on it. `tools/selftest.mjs` is an example, and tests the kit itself.

No test can hear. Listen to the ad, on a phone, before you upload it.

## A video of it

A game that shows videos, not playables, can still show your ad: film it being played.

```
node <kit>/tools/record.mjs dist/playable.html ad.mp4 --play play.mjs
```

That plays the ad in headless Chrome and writes a 30-second 1920×1080 MP4 with the ad's own voice and sound, as [Creatives](../CREATIVES.md) asks for a video.

| Option | What it sets | Default |
|---|---|---|
| `--play play.mjs` | Who plays the ad. Without it nobody touches the ad | nobody |
| `--secs 15` | The video's length | 30 |
| `--size 1080x1920` | The video's pixels. The ad is laid out at a third of them | 1920x1080 |
| `--from 2` | Seconds of the start to leave out | 0 |
| `--gpu` | For a WebGL ad | off |

`play.mjs` exports one function that touches the page the way a player would. The template's shows the shape:

- **Wait on the ad's state, not the clock.** Have the ad say how it is going (`window.__ad` in the template) and read it with `page.eval`.
- **Be quick on most moves and slow on one or two**, so a stall line and the hint are in the video too.
- **Fit the length.** If a whole playthrough is longer than the video, choose where it stops. A video that ends mid-thought still makes sense; one that ends mid-word doesn't.

Things to know:

- **No finger is drawn.** Pieces move by themselves unless the ad draws a touch of its own, as `pkStick` does.
- **Only WebAudio is heard**, which is what `pkAudio` plays. An `<audio>` element is not recorded.
- **It runs in real time**, so a 30-second video takes 30 seconds. Leave the computer alone while it runs: a busy one drops frames, and the report says how many were drawn.
- **Watch and listen to the video** before uploading it. The frame at 1.0 s is its poster.

## Upload

In the admin: Creatives, new creative for your game, kind **playable**, the file `dist/playable.html`, then a line for the end card: Seconds and the flags are filled in from the page. The file may be up to 8 MB; under 5 MB is better, since phones download it ahead of time.
