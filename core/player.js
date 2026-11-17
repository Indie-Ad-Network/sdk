// ---------- the ad player ----------
// A full-screen layer over the host game that plays one creative and resolves when it's
// closed: { granted, watchedSecs }. It promises the player two things, always in the same
// place: a top-right countdown becomes Skip, then ✕ once its end can be closed.
//
//   video     the ring follows the video; at its end, the reward, and an end card with the store button.
//             What a creative may ask besides (catalogue.js; none of it unless it does):
//               backdrop 'video'  its own picture, blurred, behind it where it doesn't fill the screen
//               fade              the card comes up, and the sound goes down, over its last seconds
//               loop { from }     at its end it plays on from there, silent, the store button over it, and no card
//               tap               when the store button is there, and from when a tap anywhere on it opens the store
//               overrun           shown in a placement shorter than it (`limit`), the reward comes at the placement's
//                                 time and the video plays on; ✕ or ✓ then is to its end (the card, or the loop), not out
//             One that stands still for STALL_SECS, as one that can't be played, gives way to the still card.
//             One marked `ownCard` ends on a card of its own making: the video rests on its last frame with
//             nothing of the player's over it but the store button (its usual words, or the creative's picture
//             of it), and the video itself is no button unless `tap.whole` says from when.
//             `ownEndCard` is how that was said before 0.6.2, and still means what it did: no button, and a tap
//             anywhere on the video, from its first frame to its last, opens the store. A server no longer
//             says it, since players tapped through without meaning to.
//   playable  an MRAID page in a sandboxed frame (mraidShim.js), under the bar (in landscape the bar lies over its top), for `secs`;
//             When its time is up, or it says it's done (mraid.close()), it stops and the end
//             card stands in its place, as after a video. One done before its time waits out the
//             rest of the countdown on the card, unless it's marked `finishEarly`: then the reward is there and then.
//             One marked `ownCard` has an end card and a store button of its own (mraid.open()): its time up,
//             the reward is in and it plays on, with no card of the player's, until ✕ or it says it's done.
//             One marked `keepPlaying` is only paused under the card when its time is up, and
//             the card offers Keep playing: for up to KEEP_SECS more, with a store button where
//             the ✓ was, until ✕ (or that time, or the page saying it's done) ends it
//   the end card  the game's icon, name and line, and the store button. A creative may dress it (catalogue.js): `endCard`,
//             art for the screen's shape in place of those, fitted whole over a blur of itself; and `storeButton`, where
//             the button is and, for the player's store, a picture of it (else the player's own words), with a pulse if
//             asked. Where the art can't be had the card is the player's own again. A card so dressed has no banner of
//             the store's under it, and over a video's loop the button stands alone.
//   card      a still: the game's art, its line, the store button, for a few seconds. What shows when
//             nothing else can, and what a video that won't play turns into
//
// Two formats. `rewarded` (the default) is the player's choice, and watching to the end of the
// countdown earns the host's reward. `interstitial` is the host's choice, between two things
// the player was doing: there's no reward and nothing to forfeit. The game says the least time it
// holds the player (`least`: 5 s unless it says). A video shows Skip at that time, 12 s in at the
// latest (pick.js skipAtOf): Skip takes it to its end, the end card or whatever it ends on, and ✕ is
// there after the configured minimum endcard time (3 s by default). Natural endings
// use the same minimum. The timer and reward eligibility must both finish before ✕.
// A rewarded video's reward comes at the game's time, if it says one (`least`), or at the creative's
// own earliest (`skipFrom`), and with both at the later; with neither, at its end. A reward in
// before a video's end, Skip takes it to its end card, then ✕ closes it.
// A rewarded playable's reward is at its own time, whatever the game's.
//
// The "Ad" label is a button, with an ⓘ beside the word: it stops the clock and says whose ad this is (the
// network: a circle of developers who know each other), by what it was chosen, and takes a report of it, with a
// few words if the player has any (`report`, from index.js: to the ingest's /flag, for the dashboard). Apple asks
// both of an app with ads (App Store Review Guidelines 2.5.18).
//
// The single control is disabled until eligible, then offers Skip while the ad is still
// playing and ✕ once it stands ended. Escape or platform back can still ask to leave early.
// The clock counts only time on screen: hidden, or asking, or with the store open, it waits.
// The number counts down to skip eligibility; the ring tracks the full video even after Skip appears.
//
// In a shadow root, so the host's CSS can't reach in, and this CSS can't leak out.
import { withShim } from './mraidShim.js';
import { STEP, STEP_NAME, STEPS_MAX, SDK, REASONS } from './wire.js';
import { leastOf, skipAtOf, HOLD_SECS } from './pick.js';   // default minimum time on the endcard
import { stringsFor, say } from './locale.js';
import { controlText } from './controlText.js';
import { CONTROL_FONT } from './controlFont.js';
import { CONTROL_THEME as UI } from './controlTheme.js';
import { MARK } from './mark.js';
import { SKIP_ICON, CLOSE_ICON } from './controlIcons.js';

const R = UI.radius, C = 2 * Math.PI * R;   // the ring
const TICK = 100, GAP = 250;         // ms: the clock's step; a longer gap was time off screen, not time watched
const CARD_SECS = 5;                 // how long the still card stands in for a creative
const STALL_SECS = 12;               // a video on screen and not moving for this long isn't going to
const KEEP_SECS = 120;               // how long a playable may be played on past its time, at most
const NETWORK = 'Indie Ad Network';  // whose ads these are: a name, the same in every language
const WORDS_MAX = 200;               // a report's own words, at most
const ERRORS_MAX = 3;                // a playable's errors counted in one showing: one that throws every frame says so 60 times a second
const esc = s => String(s ?? '').replace(/[&<>"']/g, ch => `&#${ch.charCodeAt(0)};`);
const cssUrl = u => `url("${String(u).replace(/["\\\n]/g, '')}")`;

// No `inset`, and nothing else newer than the oldest web views a game of ours runs on (iOS 14.0's,
// Android's System WebView 80): there a rule they can't read is a layer with no size, and an ad heard but not seen.
const CSS = `
:host { all: initial; }
* { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
button { font-family: inherit; cursor: pointer; }
.layer { position: fixed; top: 0; right: 0; bottom: 0; left: 0; background: #000; color: #fff; font: 600 15px/1.3 "Avenir Next", "Segoe UI", system-ui, sans-serif;
  display: flex; flex-direction: column; user-select: none; -webkit-user-select: none; touch-action: manipulation; }
.bar { direction: ltr; display: flex; align-items: center; gap: 10px; padding: calc(8px + env(safe-area-inset-top)) calc(10px + env(safe-area-inset-right)) 8px calc(10px + env(safe-area-inset-left)); z-index: 3; }
.video .bar, .card .bar { position: absolute; top: 0; left: 0; right: 0; background: none; }
.playable .bar { background: #10202f; }
@media (orientation: landscape) {   /* a screen wider than tall has the least to give in height, and a solid bar across it takes of that: it lies over the playable's top, which a playable keeps clear, and what's between its buttons is the playable's to touch */
  .playable .bar { position: absolute; top: 0; left: 0; right: 0; padding-top: calc(4px + env(safe-area-inset-top)); padding-bottom: 14px; background: none; pointer-events: none; }
  .playable .bar button { pointer-events: auto; }
}
.bar-space { flex: 1; }
.about { flex: none; display: flex; align-items: center; gap: ${UI.aboutGap}px; height: ${UI.size}px; margin: 0 -4px; padding: 0 4px; border: 0; background: none; color: rgb(${Math.round(UI.aboutTextGrey * 255)},${Math.round(UI.aboutTextGrey * 255)},${Math.round(UI.aboutTextGrey * 255)}); text-shadow: none; }
.about i { position: relative; display: flex; align-items: center; height: ${UI.aboutSize}px; padding: 0 ${UI.tagPadding}px; font: 900 ${UI.adSize}px/1 "IndieAdsCairoBlack", system-ui, sans-serif; letter-spacing: .1em; text-transform: uppercase; background: rgba(0,0,0,${UI.backgroundAlpha}); border-radius: ${UI.tagRadius}px; }
.about b { display: flex; align-items: center; justify-content: center; width: ${UI.aboutSize}px; height: ${UI.aboutSize}px; background: rgba(0,0,0,${UI.backgroundAlpha}); border-radius: 50%; }
.about b span { font: italic 700 ${UI.infoSize}px/1 Georgia, "Times New Roman", serif; text-align: center; }
.ring { position: relative; width: ${UI.size}px; height: ${UI.size}px; flex: none; padding: 0; border: 0; background: none; color: inherit; }
.ring::before { content: ""; position: absolute; top: 50%; left: 50%; width: ${UI.timerBackgroundSize}px; height: ${UI.timerBackgroundSize}px; transform: translate(-50%, -50%); border-radius: 50%; background: rgba(0,0,0,${UI.backgroundAlpha}); }
.ring > svg { position: absolute; top: 0; right: 0; bottom: 0; left: 0; transform: rotate(-90deg); }
.ring circle { fill: none; stroke: #fff; stroke-width: ${UI.stroke}; }
.ring .left { fill: none; stroke: #fff; stroke-linecap: round; stroke-dasharray: ${C}; transition: stroke-dashoffset ${TICK}ms linear; }
.ring.skippable b, .ring.closable b { background: center / ${UI.iconSize}px ${UI.iconSize}px no-repeat; }
.ring.skippable b { background-image: url("${SKIP_ICON}"); }
.ring.closable b { background-image: url("${CLOSE_ICON}"); }
.ring.closable .left { stroke-dashoffset: 0 !important; }
.ring.closable b { font-size: 22px; }
.ring b { position: absolute; top: 0; right: 0; bottom: 0; left: 0; display: flex; align-items: center; justify-content: center; font: 900 ${UI.numberSize}px/1 "IndieAdsCairoBlack", system-ui, sans-serif; font-variant-numeric: tabular-nums; }
/* Optical correction for the italic info glyph and countdown digits, measured
   against the iPhone circles. AD and the background skip/close icons stay put. */
.about b canvas, .ring b canvas { transform: translate(-.5px, -.5px); }
.get { height: 44px; flex: none; display: flex; align-items: center; gap: 8px; padding: 4px 16px 4px 4px; border: 0; border-radius: 999px; background: #1f6fd6; color: #fff; font-weight: 900; font-size: 15px; line-height: 1; white-space: nowrap; box-shadow: 0 2px 8px #0006; }
.get:not(:has(img)) { padding-left: 16px; }
.stage { position: relative; flex: 1; min-height: 0; overflow: hidden; }
.blur { position: absolute; top: -40px; right: -40px; bottom: -40px; left: -40px; background: center / cover no-repeat; filter: blur(24px) brightness(.55); }
canvas.blur { width: calc(100% + 80px); height: calc(100% + 80px); object-fit: cover; }
.playable .stage::before { content: attr(data-loading); position: absolute; top: 0; right: 0; bottom: 0; left: 0; display: flex; align-items: center; justify-content: center; opacity: .7; }
video, iframe { position: absolute; top: 0; right: 0; bottom: 0; left: 0; width: 100%; height: 100%; border: 0; }
video { object-fit: contain; }
video.go { cursor: pointer; }
.sound { position: absolute; left: calc(12px + env(safe-area-inset-left)); bottom: calc(76px + env(safe-area-inset-bottom)); z-index: 2; width: 44px; height: 44px; border: 0; border-radius: 50%; background: #000a; color: #fff; font-size: 20px; padding: 0; }
.store { position: absolute; z-index: 2; left: 50%; transform: translateX(-50%); bottom: calc(16px + env(safe-area-inset-bottom)); max-width: calc(100% - 24px);
  display: flex; align-items: center; gap: 10px; padding: 8px 16px 8px 8px; border: 0; border-radius: 999px; background: #fff; color: #10202f; font-weight: 800; font-size: 15px; line-height: 1.1; box-shadow: 0 4px 16px #0008; }
.store img, .end img, .get img { border-radius: 22%; background: #0002; }
.store img, .get img { width: 36px; height: 36px; }
.store span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.store em { font-style: normal; padding: 8px 12px; border-radius: 999px; background: #1f6fd6; color: #fff; white-space: nowrap; }
.end { position: absolute; top: 0; right: 0; bottom: 0; left: 0; z-index: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px; padding: 72px 24px 24px; text-align: center; background: #10202fd9; }
.end.under { padding-bottom: calc(132px + env(safe-area-inset-bottom)); }
.end.art { background: linear-gradient(#10202f66, #10202fee), var(--art) center / cover no-repeat; }
.end img { width: 96px; height: 96px; box-shadow: 0 6px 20px #0008; }
.end h1 { margin: 0; font-weight: 900; font-size: 26px; line-height: 1.15; }
.end p { margin: 0; max-width: 30em; font-size: 16px; opacity: .92; }
.end small { opacity: .7; font-size: 12px; }
.end button { margin-top: 8px; padding: 16px 34px; border: 0; border-radius: 999px; background: #1f6fd6; color: #fff; font-weight: 900; font-size: 19px; line-height: 1; box-shadow: 0 4px 0 #154f9c; }
.end .more, .cta-panel .more { margin-top: 0; padding: 12px 28px; border: 2px solid #fff; background: #0004; font-size: 17px; box-shadow: none; }
.acts { display: contents; }
/* a card dressed by its creative: its art whole, over a blur of itself; and the store button where it's asked for */
.end img.whole { display: block; position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: contain; object-position: center; border-radius: 0; box-shadow: none; background: none; }
.end:not(.dressed):not(.matched) img.whole, .end:not(.dressed):not(.matched) > .blur { display: none; }
/* Matching-orientation art changes only the picture. Keep the default layout for controls,
   including the space occupied by the details, and leave the store banner policy alone. */
.end.matched { background: #000; overflow: hidden; }
/* A video's still uses the video's full stage and leaves its backdrop showing through
   the same letterboxing. Its controls keep their normal layout above the picture. */
.end.matched.video-frame { background: none; }
.end.matched.video-frame > .blur { display: none; }
.end.matched.video-frame > .whole { grid-area: auto; }
.end.matched.video-frame:not(.cta-configured) > .acts, .end.matched.video-frame:not(.cta-configured) > .placed { display: none; }
.end.matched > img:not(.whole), .end.matched > h1, .end.matched > p, .end.matched > small { visibility: hidden; }
.end.matched .acts > button { position: relative; z-index: 1; }
.end.matched > .whole, .end.matched > .blur { pointer-events: none; }
.end.dressed { display: block; padding: 0; background: #000; overflow: hidden; }
.end.dressed > img:not(.whole), .end.dressed h1, .end.dressed p, .end.dressed small { display: none; }
.dressed .acts { position: absolute; left: 0; right: 0; bottom: calc(16px + env(safe-area-inset-bottom)); display: flex; justify-content: center; }
.end.bare { background: none; pointer-events: none; }   /* over a video's loop, or the card of its own it rests on: the button, and nothing else of the card's, its art neither */
.end.bare > :not(.placed) { display: none; }
.end .placed { position: absolute; margin: 0; padding: 0; border: 0; border-radius: 0; background: none; box-shadow: none; pointer-events: auto; }
.placed span { display: block; }
.placed img, .placed b { display: block; transition: transform .08s; }
.end .placed img { width: 100%; height: auto; border-radius: 0; background: none; box-shadow: none; }
.placed b { padding: .85em 1em; border-radius: 999px; background: #1f6fd6; color: #fff; font-weight: 900; line-height: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; box-shadow: 0 4px 0 #154f9c; }
.placed:active img, .placed:active b { transform: scale(.9); }   /* pressed: what's seen gives, what's touched stays its size */
@keyframes swell { 50% { transform: scale(var(--swell)); } }
.placed.pulse span { animation: swell var(--pace) ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) { .placed.pulse span { animation: none; } }
@media (orientation: landscape) and (max-height: 500px) {   /* a phone on its side: the card's things one under another are taller than the screen, the store's banner across its foot besides. Side by side: the icon, the words, the buttons */
  .end { display: grid; grid-template-columns: auto minmax(0, 21em) auto; grid-template-areas: "icon name acts" "icon line acts" "icon studio acts"; align-content: center; column-gap: 20px; row-gap: 4px;
    text-align: start; padding: 56px calc(24px + env(safe-area-inset-right)) 16px calc(24px + env(safe-area-inset-left)); }
  .end.under { padding-bottom: calc(118px + env(safe-area-inset-bottom)); }
  .end img { grid-area: icon; width: 80px; height: 80px; } .end h1 { grid-area: name; font-size: 22px; } .end p { grid-area: line; font-size: 14px; } .end small { grid-area: studio; }
  .acts { grid-area: acts; display: flex; flex-direction: column; gap: 10px; }
  .end button { margin-top: 0; padding: 14px 28px; font-size: 17px; } .end .more, .cta-panel .more { padding: 10px 22px; font-size: 15px; }
}
.ask, .info { position: absolute; top: 0; right: 0; bottom: 0; left: 0; z-index: 4; display: flex; align-items: center; justify-content: center; padding: 24px; background: #000c; }
.ask div, .info div { width: min(320px, 100%); max-height: 100%; overflow-y: auto; padding: 22px; border-radius: 20px; background: #fff; color: #10202f; text-align: center; display: flex; flex-direction: column; gap: 12px; }
.ask b, .info b { font-weight: 900; font-size: 22px; line-height: 1.25; }
.ask span { font-size: 16px; }
.ask button, .info button { flex: none; padding: 15px; border: 0; border-radius: 14px; font-weight: 800; font-size: 17px; line-height: 1; }
.ask .keep { background: #1f9d3a; color: #fff; }
.ask .leave, .info .shut { background: none; color: #10202f; text-decoration: underline; }
.info div { width: min(380px, 100%); }
.info span { font-weight: 500; font-size: 14px; line-height: 1.4; }
.info .mark { flex: none; align-self: center; width: 44px; height: 44px; border-radius: 22%; }
.info small { font-weight: 500; font-size: 11px; opacity: .6; overflow-wrap: anywhere; }
.info textarea { flex: none; width: 100%; padding: 10px 12px; border: 1px solid #10202f66; border-radius: 12px; background: #fff; color: #10202f; font: 500 16px/1.3 inherit; font-family: inherit; resize: none; user-select: text; -webkit-user-select: text; }
.info .send { background: #10202f; color: #fff; } .info .send:disabled { opacity: .35; }
.info .flag { padding: 10px; background: none; color: #10202f; font-size: 15px; text-decoration: underline; }
.info .why { display: flex; flex-direction: column; gap: 8px; }
/* a report being made: the panel is the reasons, the words and Send, and nothing else to scroll past; on a screen wider than tall, the reasons two abreast */
.info .reporting > .mark, .info .reporting > b, .info .reporting > span, .info .reporting > small, .info .reporting > .see { display: none; }
@media (orientation: landscape) { .info .reporting { width: min(620px, 100%); padding: 16px; gap: 8px; } .info .reporting .why { display: grid; grid-template-columns: 1fr 1fr; } .info .reporting .why > :last-child, .info .reporting .why > textarea { grid-column: 1 / -1; }
  .info .reporting .reason { padding: 10px 12px; } .info .reporting button { padding-top: 11px; padding-bottom: 11px; } }
.info .reason { padding: 12px 14px; border: 2px solid #10202f33; background: none; color: #10202f; font-weight: 700; font-size: 15px; line-height: 1.25; text-align: start; }
.info .reason[aria-pressed="true"] { border-color: #10202f; background: #10202f; color: #fff; }
.info .see { padding: 10px 4px; border-radius: 0; background: none; color: #10202f; font-weight: 800; font-size: 15px; line-height: 1.3; text-decoration: underline; }
.info em { font-style: normal; font-weight: 800; font-size: 16px; color: #1f7a30; }
/* Explicit CTA styles sit independently of the card's artwork or a looping video. */
.end.cta-configured { background: none; pointer-events: none; }
.end.cta-configured.art:not(.matched) { background: var(--art) center / cover no-repeat; }
.end.cta-configured > img:not(.whole), .end.cta-configured > h1, .end.cta-configured > p, .end.cta-configured > small, .end.cta-configured > .acts { display: none; }
.end.cta-configured.custom-failed > .placed { display: none; }
.cta-panel { position: absolute; top: 0; right: 0; bottom: 0; left: 0; z-index: 2; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px; padding: 72px 24px 24px; text-align: center; pointer-events: none; }
.cta-panel.darken { background: #0008; }
.cta-panel img { width: 96px; height: 96px; border-radius: 22%; box-shadow: 0 6px 20px #0008; }
.cta-panel h1 { margin: 0; font-weight: 900; font-size: 26px; }
.cta-panel p { margin: 0; max-width: 30em; font-size: 16px; }
.cta-panel small { opacity: .7; font-size: 12px; }
.cta-panel button { pointer-events: auto; margin-top: 8px; padding: 16px 34px; border: 0; border-radius: 999px; background: #1f6fd6; color: #fff; font-weight: 900; font-size: 19px; line-height: 1; box-shadow: 0 4px 0 #154f9c; }
@media (orientation: landscape) and (max-height: 500px) { .cta-panel { gap: 8px; padding: 52px 24px 16px; } .cta-panel img { width: 64px; height: 64px; } .cta-panel h1 { font-size: 22px; } .cta-panel button { padding: 12px 28px; } }
@keyframes cta-appear { from { opacity: 0; } to { opacity: 1; } }
.cta-enter { animation: cta-appear 0.5s ease-out both; }
@media (prefers-reduced-motion: reduce) { .cta-enter { animation: none; } }
[hidden] { display: none !important; }
`;

// creative: { kind, secs, src, poster, line, finishEarly, keepPlaying, ownCard, and what catalogue.js reads of how it's shown }; `limit`: the
// seconds at which the reward comes if that's before the creative's end: the caller's to give, and only for a video marked `overrun`; app: the game's record; `html` a playable's
// page, already fetched; `link` from storeLinks (null: no store button); `openStore(link)` may
// return a promise that settles when the store is put away; `emit(event, fields)` for analytics.
// `report({ reason, message, secs, kind })`: the player has reported this ad, for this reason (wire.js REASONS), in these words (or none).
// `banner(link | null)`, where the shell has one: the store's own banner for the game (iOS: the
// App Store's overlay, with its Get button), put up at the foot of the screen while the ad
// stands ended, over the end card or a video's own, and taken away with null.
// Resolves { granted, watchedSecs, kind }: `kind` is what was shown in the end, 'card' if it came to that;
// `granted` of an interstitial says only that it stayed up until it could be closed.
export function play({ creative, app, html, link, ctaText, reward, format = 'rewarded', least = null, limit = null, picture = null, muted = false, emit = () => {}, openStore, banner = null, report = null, more = null, words = stringsFor('en') }) {
  const { t } = words;   // the player's own words, in the player's language (locale.js)
  const doc = document;
  // Register on the document: @font-face inside a shadow root is not portable across web views.
  if (doc.head && !doc.getElementById('indie-ads-control-font')) {
    const font = doc.createElement('style');
    font.id = 'indie-ads-control-font';
    font.textContent = `@font-face { font-family: "IndieAdsCairoBlack"; src: url("${CONTROL_FONT}") format("truetype"); font-style: normal; font-weight: 900; font-display: swap; }`;
    doc.head.appendChild(font);
  }
  let { kind } = creative;
  const host = doc.createElement('div'), root = host.attachShadow({ mode: 'open' });
  host.id = 'indie-ads';
  host.style.cssText = 'position:fixed;top:0;right:0;bottom:0;left:0;z-index:2147483647';
  const icon = app.icon ? `<img src="${esc(app.icon)}" alt="">` : '';
  // the end card as its creative dresses it: its art, and the store button where it's put, as a picture for this store or in the player's words
  // (`picture`: the button's, for the player's store, if the creative has one)
  const matching = creative.endCardMode === 'orientation', failedArt = new Set();
  // A playable that may be played on ends on the large card, whatever style it asks for: Keep playing goes under its store button, where a
  // small or placed store button has no place for it
  const keeps = kind === 'playable' && !!creative.keepPlaying;
  const cta = creative.endCardCta && keeps ? { ...creative.endCardCta, type: 'large' } : creative.endCardCta;
  const custom = cta?.type === 'custom' && !!cta.image;
  let customFailed = false;
  const button = cta ? (custom ? { portrait: cta, landscape: cta, ...(cta.pulse && { pulse: { scale: (cta.pulse.maxSize ?? 105) / 100, secs: cta.pulse.secs ?? 1 } }) } : null) : creative.storeButton;
  const buttonPicture = cta ? (custom ? cta.image : null) : picture, inWords = `<b>${esc(ctaText)}</b>`;
  let arts = creative.endCard;   // null once its art has failed to come: the player's own card then
  const rests = kind === 'video' && !!creative.ownCard;   // a video that ends on a card of its own, and rests on it: the store button alone over its last frame
  const placed = link && (cta ? custom : ((!matching && arts) || button || rests)) ? `<button class="placed go${button?.pulse ? ' pulse' : ''}"><span>${buttonPicture ? `<img src="${esc(buttonPicture)}" alt="${esc(ctaText)}">` : inWords}</span></button>` : '';
  const keepOn = `<button class="more" hidden>${esc(t.keepPlaying)}</button>`;   // Keep playing, always there to be found: in the large card's buttons if it has one, else in the card's
  root.innerHTML = `<style>${CSS}</style>
<div class="layer ${kind}" lang="${esc(words.lang)}" dir="${words.rtl ? 'rtl' : 'ltr'}">
  <div class="bar">
    <button class="about" aria-label="${esc(t.about)}"><i><span>${esc(t.ad)}</span></i><b aria-hidden="true"><span>i</span></b></button>
    <span class="bar-space" aria-hidden="true"></span>
    ${link && keeps ? `<button class="get go" hidden>${icon}<span>${esc(ctaText)}</span></button>` : ''}
    <button class="ring" role="timer" disabled><svg viewBox="0 0 44 44"><circle class="left" cx="22" cy="22" r="${R}"/></svg><b></b></button>
  </div>
  <div class="stage" data-loading="${esc(t.loading)}">
    <div class="end${cta ? ' cta-configured' : ''}${app.art ? ' art' : ''}${kind === 'video' && matching ? ' video-frame' : ''}" hidden>${arts ? '<div class="blur"></div><img class="whole" alt="">' : ''}${icon}<h1>${esc(app.name)}</h1><p>${esc(creative.line ?? app.line)}</p>${app.studioName ? `<small>${esc(app.studioName)}</small>` : ''}<div class="acts">${link && !placed ? `<button class="go">${esc(ctaText)}</button>` : ''}${cta?.type === 'large' ? '' : keepOn}</div>${placed}</div>
    ${cta?.type === 'large' ? `<div class="cta-panel${cta.darken !== false ? ' darken' : ''}" hidden>${icon}<h1>${esc(app.name)}</h1><p>${esc(creative.line ?? app.line)}</p>${app.studioName ? `<small>${esc(app.studioName)}</small>` : ''}${link ? `<button class="go">${esc(ctaText)}</button>` : ''}${keepOn}</div>` : ''}
  </div>
  ${link ? `<button class="store go" hidden>${icon}<span>${esc(app.name)}</span><em>${esc(ctaText)}</em></button>` : ''}
  <div class="ask" hidden><div><b>${esc(t.leaveTitle)}</b><span>${esc(reward ? say(t.miss, { reward }) : t.missPlain)}</span><button class="keep">${esc(t.keep)}</button><button class="leave">${esc(t.leave)}</button></div></div>
  <div class="info" hidden><div role="dialog" aria-label="${esc(t.about)}"><img class="mark" src="${MARK}" alt="" width="44" height="44"><b>${esc(NETWORK)}</b><span>${esc(t.network)}</span><span>${esc(t.chosen)}</span>${more ? `<button class="see">${esc(t.seeMore)}</button>` : ''}
    ${report ? `<button class="flag">${esc(t.report)}</button><section class="why" hidden>${REASONS.map(r => `<button class="reason" data-why="${r}" aria-pressed="false">${esc(t[`why${r[0].toUpperCase()}${r.slice(1)}`])}</button>`).join('')}<textarea rows="2" maxlength="${WORDS_MAX}" placeholder="${esc(t.reportAsk)}" aria-label="${esc(t.reportAsk)}"></textarea><button class="send" disabled>${esc(t.send)}</button></section><em hidden>${esc(t.reported)}</em>` : ''}
    <small>${esc([app.name, creative.id, `v${SDK}`].filter(Boolean).join(' · '))}</small><button class="shut">${esc(t.close)}</button></div></div>
</div>`;
  const $ = sel => root.querySelector(sel);
  const stage = $('.stage'), end = $('.end'), ring = $('.ring'), number = $('.ring b'), arc = $('.left');
  if (app.art) end.style.setProperty('--art', cssUrl(app.art));
  // The card dressed for the screen as it is now, and again when it turns: the art for its shape (either stands in for the
  // other), and the button where that shape has it. Lengths are in 1/720 of the screen's shorter side; an edge it's set
  // against is the screen's safe one, a centre the screen's own.
  const drawn = $('.whole'), put = $('.placed');
  function dress() {
    if (!$('.info').hidden) return;   // a keyboard up over the report box is no turn of the screen; it's dressed again when that's put away
    const w = stage.clientWidth, h = stage.clientHeight, [shape, other] = w > h ? ['landscape', 'portrait'] : ['portrait', 'landscape'], unit = Math.min(w, h) / 720;
    const chosen = arts && (matching ? arts[shape] : (arts[shape] || arts[other]));
    const art = chosen && !failedArt.has(chosen) ? chosen : null;
    if (art && drawn.getAttribute('src') !== art) { drawn.src = art; $('.end .blur').style.backgroundImage = cssUrl(art); }
    end.classList.toggle('dressed', !!art && !matching);
    end.classList.toggle('matched', !!art && matching);
    if (kind === 'video' && matching && !end.hidden && !end.classList.contains('bare')) endLink();
    if (!put) return;
    const at = button?.[shape] ?? {}, [row, col] = (at.anchor ?? 'bottom-center').split('-'), width = (at.width ?? 360) * unit, s = put.style;
    // along one axis: from its centre, or in from the edge it's set against; → how far it's then moved back by its own size
    const along = (edge, start, n) => { const centred = edge === 'center' || edge === 'middle'; s[centred ? start : edge] = centred ? `calc(50% + ${n}px)` : `calc(${n}px + env(safe-area-inset-${edge}))`; return centred ? '-50%' : '0'; };
    s.left = s.right = s.top = s.bottom = '';
    s.transform = `translate(${along(col, 'left', (at.x ?? 0) * unit)}, ${along(row, 'top', (at.y ?? 128) * unit)})`;
    s.width = `${width}px`; s.fontSize = `${Math.max(14, width / 9)}px`;
  }
  if (button?.pulse) { put?.style.setProperty('--pace', `${button.pulse.secs ?? 1}s`); put?.style.setProperty('--swell', button.pulse.scale ?? 1.05); }
  $('.placed img')?.addEventListener('error', () => {
    if (custom) { customFailed = true; end.classList.add('custom-failed'); if (!end.hidden) endLink(end.classList.contains('bare') ? 'bare' : 'card'); }
    else $('.placed span').innerHTML = inWords;
  });   // no picture of it: the words
  drawn?.addEventListener('error', () => {
    if (matching) failedArt.add(drawn.getAttribute('src')); else arts = null;
    dress();
  });

  let total = creative.secs, elapsed = 0, granted = false, closed = false, video = null, frame = null;
  let over = false;   // a video's showing is past its playing: at its end, or left for it (an overrun video, once the reward is in)
  // a `keepPlaying` playable past its time: 'resting' under the end card, then 'kept' when the player plays on
  let overtime = null;
  const rewarded = format !== 'interstitial';
  // The least time the game holds the player to this ad (`least`, the placement's: pick.js leastOf, which is what a caller that says none gets).
  // A rewarded ad's is null where the game has said none.
  const min = least ?? leastOf({ format }), skipAt = skipAtOf(min);
  // Skip is offered at the placement's time. Every ending then waits out the
  // creative's minimum endcard time before its close control is enabled.
  const skips = () => !rewarded && !!video && !over;
  const endSecs = creative.endCardSecs ?? HOLD_SECS;
  let endRemaining = 0, endStarted = false, endLast = 0, offered = false;
  // Seconds until the way out is free. A rewarded ad's reward: at the game's time, where it says one, or the creative's own earliest (`skipFrom`),
  // and with both the later; with neither at its end (or at `limit`, for one marked `overrun`). The reward in before a video's end, Skip takes it to
  // its end card. An interstitial's Skip or ✕ uses the same control.
  const earns = creative.skipFrom != null ? Math.max(min ?? 0, creative.skipFrom) : min ?? limit ?? Infinity;
  // That earlier reward is for a creative that says it may be left early: any video, and a playable with a `skipFrom` of its own, which then
  // plays on to its time with the reward in (`early`). Another playable, or the still card, is over when its own time is, and its reward
  // comes there (a playable's sooner only by its own word, `finishEarly`): held to the game's time alone it would be cut short.
  const early = () => !!video || (kind === 'playable' && creative.skipFrom != null);
  const need = () => Math.min(total, rewarded ? (early() ? earns : Infinity) : skips() ? skipAt : min);
  const secs = () => Math.round(elapsed);
  const waits = new Set();   // why the clock stands still: 'hidden', 'ask', 'info', 'store', 'loading'
  let finish;
  const result = new Promise(done => { finish = done; });

  // One control stays at the top right throughout the ad. Reward eligibility and
  // the endcard are separate: Skip reaches the end; ✕ closes only once there.
  const atEnd = () => kind === 'video' ? over || !video : kind !== 'playable' || !frame || overtime != null || !!creative.ownCard;
  const draw = () => {
    const ready = (granted || (offered && !atEnd())) && endRemaining <= 0;
    const closing = ready && granted && atEnd();
    ring.hidden = false;
    ring.disabled = !ready;
    $('.more').disabled = endRemaining > 0;
    ring.classList.toggle('skippable', ready && !closing);
    ring.classList.toggle('closable', closing);
    const eligibleIn = granted ? 0 : Math.max(0, need() - elapsed);
    const endIsLonger = endRemaining > 0 && endRemaining >= eligibleIn;
    // Playback progress spans the entire video, independently of skip eligibility.
    const playingVideo = !!video && !over;
    const of = playingVideo ? total : endIsLonger ? endSecs : need();
    const gone = playingVideo ? elapsed : endIsLonger ? endSecs - endRemaining : elapsed;
    // A negative offset removes the arc clockwise from twelve o'clock, matching Unity.
    arc.style.strokeDashoffset = -C * (of > 0 ? Math.max(0, Math.min(1, gone / of)) : 1);
    if (ready) {
      ring.removeAttribute('role');
      ring.setAttribute('aria-label', closing ? t.close : t.skip);
      controlText(number, '', doc);   // SDK icons are centered inside the ring; aria-label names the action.
      return;
    }
    ring.setAttribute('role', 'timer'); ring.removeAttribute('aria-label');
    const left = Math.ceil(Math.max(eligibleIn, endRemaining));
    controlText(number, left, doc);
  };
  function offer() { if (offered) return; offered = true; draw(); }
  function grant() {
    if (granted) return;
    granted = true;
    if (atEnd()) startEndHold();
    if (!rewarded) { draw(); return; }
    draw();
    emit('reward', { secs: secs() });
  }
  // the store's own banner, where there is one for this link (a sheet's: the App Store's, by the game's id)
  let bannered = false, counted = false;
  function storeBanner(on) {
    if (!banner || !link?.sheet || on === bannered) return;
    bannered = on; end.classList.toggle('under', on);   // the card's own things keep clear of it
    try { banner(on ? link : null); } catch { /* no banner: the card's button is there */ }
    if (on && !counted) { counted = true; emit('store_banner', { secs: secs() }); }   // once a showing: asked for, which is all a page hears of it
  }
  // the ad stands ended, on `ends`: the player's 'card'; a video's 'own' last frame, nothing of the player's over it (as `ownEndCard` asks);
  // or 'bare', the store button alone over a video's loop or its own last frame, and no banner under that
  function startEndHold() {
    if (endStarted) return;
    endStarted = true; endRemaining = endSecs; endLast = performance.now();
  }
  function endCard(ends = 'card') {
    startEndHold();
    const alone = ends === 'bare';
    if (ends === 'card' || (alone && put)) end.hidden = false;   // `put`: the store button as the creative places it, which over a video stands in the bar's place
    end.classList.toggle('bare', alone);
    end.style.opacity = end.style.pointerEvents = '';   // whatever a fade left it at
    $('.sound')?.remove(); endLink(ends); draw();
  }
  // A custom video still and a loop share the same bottom app link. A missing image
  // restores the default card's action and native banner, including after rotation.
  function revealCta(element, show) {
    if (!element) return;
    const entering = show && element.hidden;
    element.hidden = !show;
    if (!show) element.classList.remove('cta-enter');
    else if (entering && cta?.fade > 0) {
      element.classList.add('cta-enter');
    }
  }
  function endLink(ends = 'card') {
    if (cta) {
      const type = cta.type === 'custom' && (!custom || customFailed) ? 'compact' : cta.type;
      revealCta($('.cta-panel'), type === 'large');
      revealCta($('.store'), type === 'compact');
      storeBanner(false);
      return;
    }
    const image = ends === 'card' && kind === 'video' && matching && end.classList.contains('matched');
    if ($('.store')) $('.store').hidden = !image && (ends !== 'bare' || !!put);
    storeBanner(ends === 'own' || (ends === 'card' && !put && !image));
  }
  // the video gone, and its decoder and download with it; `video` is null first, so its last events are heard by no one
  const dropVideo = () => { const v = video; if (!v) return; video = null; v.pause(); v.removeAttribute('src'); v.load(); v.remove(); };
  // what the playable is told (mraidShim.js hears it): whether it's seen, and how loud it may be
  // `houseAds` in what's said to a playable and heard from it is the SDK's name before 0.6.0, kept: playables already made say it (mraidShim.js)
  const toFrame = (type, value) => frame?.contentWindow?.postMessage({ houseAds: type, value }, '*');
  // A playable's time is up, or it has said it's done: it stops, and the end card takes its place.
  // Told first, for one that listens (not viewable, no sound); then taken away, frame and all,
  // which is the only stop a page of someone else's can't ignore: nothing goes on playing, or
  // sounding, under the card.
  // One marked `keepPlaying` is only paused, the first time: told, and left under the card, which
  // offers to play on. The second time (or if it was never shown) it goes as any other.
  function endPlayable({ rest = false } = {}) {
    const f = frame; if (!f) return;
    toFrame('viewable', false); toFrame('volume', 0);
    if (rest && creative.keepPlaying) {
      overtime = 'resting';
      $('.more').hidden = false;
    } else {
      frame = null; overtime = null;
      f.remove(); stage.removeAttribute('data-loading');   // nor "Loading…", which shows where there's no frame
      wait('loading', false);   // one gone before it had loaded: the clock isn't left waiting for a page that won't arrive
      $('.more').hidden = true; $('.get')?.setAttribute('hidden', '');
    }
    endCard();
  }
  // Keep playing: the card goes, the page is told it's seen and heard again, and the ✓ (or, for an
  // interstitial, the same space) offers the store link beside the unified close control
  function keepPlaying() {
    if (overtime !== 'resting' || endRemaining > 0) return;   // only then is there a card to put away, and a page under it
    overtime = 'kept';
    end.hidden = true; revealCta($('.cta-panel'), false); storeBanner(false);
    if ($('.get')) $('.get').hidden = false;
    total = elapsed + KEEP_SECS;
    toFrame('volume', muted ? 0 : 100); toFrame('viewable', !waits.size);
    emit('keep_playing', { secs: secs() }); draw();
  }
  // the still card in the creative's place, for CARD_SECS more
  function toCard() { dropVideo(); kind = 'card'; if (offered && !granted) offered = false; total = Math.min(total || Infinity, elapsed + CARD_SECS); endCard(); }
  // a video that won't play, or has stopped: no reason to keep the player waiting. The still card; or, the reward already in, the end card as it would have come
  function broken(why) { emit('fail', { why }); if (granted) { dropVideo(); endCard(); } else toCard(); }
  function close() {
    if (closed) return;
    closed = true; storeBanner(false);
    clearInterval(clock); removeEventListener('resize', dress); removeEventListener('resize', fill); doc.removeEventListener('visibilitychange', seen); removeEventListener('message', heard); doc.removeEventListener('keydown', key, true);
    dropVideo(); host.remove();
    finish({ granted, watchedSecs: secs(), kind });
  }
  // the clock stands still for any reason in `waits`; the creative with it
  function wait(why, on) {
    const was = waits.size > 0;
    if (on) waits.add(why); else waits.delete(why);
    const now = waits.size > 0;
    if (was === now) return;
    endLast = performance.now();
    if (video && !video.ended && (!over || creative.loop)) { if (now) video.pause(); else video.play().catch(() => {}); }   // not one left standing under its card
    if (overtime !== 'resting') toFrame('viewable', !now);   // one paused under the card stays paused
  }
  const seen = () => wait('hidden', doc.hidden);

  let last = performance.now();
  const clock = setInterval(() => {
    const now = performance.now(), dt = Math.min(now - last, GAP) / 1000;
    last = now;
    if (video) { if (!over) { elapsed = video.currentTime; during(dt); } }
    else if (!waits.size && !(granted && rewarded && overtime !== 'kept' && (!frame || elapsed >= total))) elapsed += dt;   // the reward in and its time up: nothing more to count, unless it's played on
    if (endRemaining > 0) {
      const endDt = Math.min(dt, Math.max(0, (now - endLast) / 1000));
      endLast = now;
      if (!waits.size) endRemaining = Math.max(0, endRemaining - endDt);
    }
    if (skips()) { if (skipAt < total && elapsed >= skipAt) offer(); }   // one shorter than that comes to its end first
    else if (!granted && elapsed >= need()) { if (rewarded && !video && need() >= total) elapsed = total; grant(); }   // its time out; or, sooner than that, a playable's reward, which plays on
    if (frame && overtime !== 'resting' && elapsed >= total && !creative.ownCard) endPlayable({ rest: !overtime });   // its time is up (an interstitial's playable runs on past its ✕, to here): a rest the first time, the end if it was played on
    draw();
    if (granted && rewarded && endRemaining <= 0 && (video ? over : !(kind === 'playable' && (creative.keepPlaying || elapsed < total)))) clearInterval(clock);
  }, TICK);

  // ---- the creative ----
  let during, toEnd, skip = () => {};   // a video's: what each tick of its playing does; and, the reward in and more of it to play, the way to its end (false: there's none to go to)
  if (kind === 'video') {
    const { tap = {}, loop, fade = 0 } = creative, ends = creative.ownEndCard ? 'own' : loop || rests ? 'bare' : 'card';   // what it ends on: the player's card; or the store button alone, over its loop or the card of its own it rests on
    if (creative.poster) { stage.insertAdjacentHTML('afterbegin', '<div class="blur"></div>'); $('.blur').style.backgroundImage = cssUrl(creative.poster); }
    video = doc.createElement('video');
    Object.assign(video, { src: creative.src, playsInline: true, preload: 'auto', muted, poster: creative.poster ?? '' });
    video.setAttribute('playsinline', ''); video.setAttribute('webkit-playsinline', '');
    stage.insertBefore(video, end);
    const quartiles = [0.25, 0.5, 0.75];
    const on = (event, f) => { const v = video; v.addEventListener(event, () => { if (video === v) f(); }); };   // not after it's dropped
    on('loadedmetadata', () => { if (isFinite(video.duration) && video.duration > 0) total = video.duration; });
    on('timeupdate', () => { while (!over && quartiles.length && video.currentTime >= quartiles[0] * total) emit(`q${quartiles.shift() * 100}`); });   // not once it's past its playing: one skipped to its end wasn't watched there
    // its own picture behind it, small and blurred, over the poster's (which stands wherever this can't be drawn); not where it fills the screen, and none of that would show
    if (creative.backdrop === 'video') on('loadedmetadata', () => {
      const shape = video.videoWidth / video.videoHeight, room = stage.clientWidth / stage.clientHeight;
      if (!(Math.abs(shape / room - 1) > 0.03)) return;
      const back = doc.createElement('canvas'), pen = back.getContext('2d');
      back.className = 'blur'; back.width = 64; back.height = Math.max(1, Math.round(64 / shape)); stage.insertBefore(back, video);
      const paint = () => { try { pen.drawImage(video, 0, 0, back.width, back.height); } catch { /* not a frame it can draw: the poster stays */ } };
      on('loadeddata', paint); on('timeupdate', paint);
    });
    // When a tap opens the store: on the button (from the start, unless `tap.button` says when), and anywhere on the video from `tap.whole`.
    // One marked `ownEndCard`, as was said before 0.6.2, is all store button, from its first frame to its last
    const from = when => when === 'end' ? Infinity : when, pill = $('.store'), buttonFrom = from(tap.button ?? 0), wholeFrom = ends === 'own' ? 0 : from(tap.whole);
    const whole = () => over || video.currentTime >= wholeFrom;
    let go = () => {};   // the video shown as something to tap, once it is
    if (link && wholeFrom != null) { go = () => video.classList.toggle('go', whole()); video.addEventListener('click', () => { if (whole()) store('creative'); }); }
    // Past its playing: the reward if it isn't in, and what it ends on: the card, its own last frame, or its loop
    const again = () => { video.muted = true; video.currentTime = loop.from; video.play().catch(() => broken('loop')); };
    // Reward eligibility is independent of the endcard's close timer.
    const videoOver = () => {
      over = true; grant();
      if (loop) again(); else video.pause();
      go(); endCard(ends);
    };
    toEnd = () => { if (!rewarded || over || ends === 'own') return false; emit('skip', { secs: secs() }); if (rests) { try { video.currentTime = Math.max(0, total - 0.05); } catch { /* keep its current frame if seeking is unavailable */ } } videoOver(); return true; };   // a static ending seeks its final frame before revealing the close action
    on('ended', () => { if (over) { if (loop) again(); return; } emit('q100'); elapsed = total; videoOver(); });
    // Skip: to its end, as if it had played there (its last frame is what one that rests on it shows)
    skip = () => { if (over || rewarded) return; emit('skip', { secs: secs() }); try { if (!loop) video.currentTime = total; } catch { /* where it is, then */ } videoOver(); };
    on('error', () => broken('video'));
    let at = -1, still = 0;
    during = dt => {
      const now = video.currentTime;
      // on screen and not moving: it isn't going to (a play() refused, a download that stopped)
      if (now !== at) { at = now; still = 0; } else if (!waits.size && (still += dt) >= STALL_SECS) return broken('stall');
      if (pill && cta?.during !== false && now >= buttonFrom) pill.hidden = false;
      go();
      const faded = fade ? Math.min(1, Math.max(0, (now - (total - fade)) / fade)) : 0;
      if (faded) {
        try { video.volume = 1 - faded; } catch { /* iOS keeps the volume to itself */ }
        if (ends === 'card') { end.hidden = false; end.style.opacity = faded; end.style.pointerEvents = 'none'; }   // the card coming up: to be seen, not yet to be touched
      }
    };
    // sound needs the tap that opened the ad to still count; where it doesn't, start silent and,
    // unless the host itself is muted, offer it
    video.play().catch(() => {
      if (!video) return;
      video.muted = true;
      if (!muted) { stage.insertAdjacentHTML('beforeend', `<button class="sound" aria-label="${esc(t.soundOn)}">🔇</button>`); $('.sound').onclick = () => { video.muted = false; $('.sound').remove(); }; }
      return video.play();
    }).catch(() => {});
  } else if (kind === 'playable') {
    frame = doc.createElement('iframe');
    frame.setAttribute('sandbox', 'allow-scripts');   // scripts, and nothing else: no origin, no popups, no navigating the game's page; and nothing fetched (mraidShim.js LOCKED)
    frame.setAttribute('allow', 'autoplay');
    frame.srcdoc = withShim(html); html = null;   // the frame has it now: no second copy held for the length of the ad
    stage.insertBefore(frame, end);
    wait('loading', true);   // the countdown is for playing, not for the page arriving
    let arrived = false;
    frame.addEventListener('load', () => {
      // a second arrival is the frame gone to another address, which nothing can forbid it: it's emptied, and said
      if (arrived) { if (frame.getAttribute('srcdoc')) { frame.setAttribute('srcdoc', ''); emit('fail', { why: 'playable', message: 'left its page' }); } return; }
      arrived = true; toFrame('volume', muted ? 0 : 100); wait('loading', false);
    });
  } else toCard();

  // ---- what the playable says ----
  const steps = new Set();   // what the playable has said it reached (mraidShim.js)
  const errors = new Set();  // and what it has said went wrong
  let said = false;          // it has said it's done
  function heard(e) {
    if (!frame || e.source !== frame.contentWindow || overtime === 'resting') return;   // paused under the card, it has nothing to say
    const type = e.data?.houseAds;
    if (type === 'open') store('creative');                                 // its own URL is ignored: the catalogue's link, never the playable's
    else if (type === 'touch') emit('first_touch', { secs: secs() });
    else if (type === 'step') { const name = e.data.name; if (STEP_NAME.test(name) && !steps.has(name) && steps.size < STEPS_MAX) { steps.add(name); emit(STEP, { step: name, secs: secs() }); } }   // once a showing each
    else if (type === 'error') { const message = String(e.data.message).slice(0, 200); if (!errors.has(message) && errors.size < ERRORS_MAX) { errors.add(message); emit('fail', { why: 'playable', message }); } }   // each once, and few
    else if (type === 'complete') {
      if (overtime === 'kept') endPlayable();   // played on, and now done: the card, for good
      else if (granted) { if (rewarded && frame && !creative.ownCard) endPlayable(); else ask(); }   // done, its reward already in: its end card if it was still playing, else out
      else {   // done before its time: the reward now if that's its to say, else when the countdown is out. On the card; but one with a card of its own is left on that, to be closed by ✓ or by its own close
        if (!said) { said = true; emit('complete', { secs: secs() }); }   // once a showing: one left on its own card may say it again
        if (creative.finishEarly) grant();
        if (!creative.ownCard) endPlayable();
      }
    }
  }
  addEventListener('message', heard);

  // The store's sheet may turn the screen under it (iOS: to portrait, over a landscape game), and a playable, paused, would
  // be stretched to the new shape. It's held at the size it had, filling the screen, until the store is put away.
  let held = null;   // the size it's kept at
  function hold(on) {
    held = on && frame ? [stage.clientWidth, stage.clientHeight] : null;
    (held ? addEventListener : removeEventListener)('resize', fill);
    fill();
  }
  function fill() {
    if (frame) frame.style.cssText = held ? `width: ${held[0]}px; height: ${held[1]}px; top: 50%; right: auto; bottom: auto; left: 50%; transform: translate(-50%, -50%) scale(${Math.max(stage.clientWidth / held[0], stage.clientHeight / held[1])});` : '';
  }

  // ---- the buttons ----
  // `tapped`: what was (wire.js FROM), sent as the event's `from`
  async function store(tapped) {
    if (!link || waits.has('store')) return;
    emit('store_open', { via: link.via, from: tapped });
    const under = bannered; storeBanner(false);   // the sheet is the whole store: no banner beside it
    wait('store', true); hold(true);
    try { await openStore(link); } catch { /* the store didn't open: carry on */ }
    hold(false); wait('store', false);
    if (under && !closed) storeBanner(true);
  }
  function ask() {
    // a video with more to play: to its end first, where the store button is; then out. A playable with time left and its reward in, likewise: its end card
    if (granted) { if (endRemaining > 0) return; if (frame && !overtime && !creative.ownCard) { emit('skip', { secs: secs() }); endPlayable(); } else if (!(video && toEnd())) close(); return; }
    if (!rewarded) return;   // not yet: there's nothing to ask about
    $('.ask').hidden = false; wait('ask', true);
  }
  // Whose ad this is, and a report of it: over everything, the clock stopped, and the store's banner out of its way
  let underInfo = false;
  function info(on) {
    const panel = $('.info');
    if (panel.hidden === !on) return;
    panel.hidden = !on; wait('info', on);
    if (on) { underInfo = bannered; storeBanner(false); } else { if (underInfo && !closed) storeBanner(true); dress(); }
  }
  // A report: why first, one of REASONS picked (a report with nothing said can't be acted on), then any words, then sent. Once a showing.
  let why = null;
  const pick = b => { why = b.dataset.why; for (const r of root.querySelectorAll('.reason')) r.setAttribute('aria-pressed', r === b); $('.send').disabled = false; };
  function send() {
    const message = $('.info textarea').value.replace(/\s+/g, ' ').trim().slice(0, WORDS_MAX);
    $('.why').hidden = true; $('.info em').hidden = false; $('.why').parentNode.classList.remove('reporting');
    try { report({ reason: why, message, secs: secs(), kind }); } catch (err) { console.error(err); }
  }
  // what's typed there is the player's to the network, not the game's to act on
  for (const type of ['keydown', 'keyup', 'keypress']) $('.info textarea')?.addEventListener(type, e => { if (e.key !== 'Escape') e.stopPropagation(); });
  const key = e => { if (e.key === 'Escape') { e.preventDefault(); if ($('.info').hidden) ask(); else info(false); } };
  root.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) { if (e.target.matches('.info')) info(false); return; }   // beside the panel: away with it
    if (b.matches('.about')) info(true);
    else if (b.matches('.shut')) info(false);
    else if (b.matches('.flag')) { b.hidden = true; $('.why').hidden = false; b.parentNode.classList.add('reporting'); }
    else if (b.matches('.reason')) pick(b);
    else if (b.matches('.send')) send();
    else if (b.matches('.see')) more();
    else if (b.matches('.ring')) { if (offered && !granted && endRemaining <= 0) skip(); else ask(); }   // any way out: free once the reward is earned, asked about before
    else if (b.matches('.go')) store(b.closest('.end, .cta-panel') ? 'card' : 'button');
    else if (b.matches('.more')) keepPlaying();
    else if (b.matches('.keep')) { $('.ask').hidden = true; wait('ask', false); emit('exit_kept', { secs: secs() }); }
    else if (b.matches('.leave')) { emit('exit_early', { secs: secs() }); close(); }
  });
  doc.addEventListener('keydown', key, true);
  doc.addEventListener('visibilitychange', seen);
  if (arts || put) addEventListener('resize', dress);

  doc.body.append(host);
  controlText($('.about i span'), t.ad, doc);
  controlText($('.about b span'), 'i', doc);
  draw(); seen(); dress();
  return result;
}
