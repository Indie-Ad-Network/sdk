// ---------- the ad player ----------
// A full-screen layer over the host game that plays one creative and resolves when it's
// closed: { granted, watchedSecs }. It promises the player two things, always in the same
// places: how long is left (the ring, top right) and a way out (✕, top left).
//
//   video     the ring follows the video; at its end, the reward, and an end card with the store button.
//             One marked `ownEndCard` ends on a card of its own making: the player's isn't put over
//             it, the video rests on its last frame, and a tap anywhere on the video, from its first
//             frame to that one, opens the store
//   playable  an MRAID page in a sandboxed frame (mraidShim.js), under the bar (in landscape the bar lies over its top), for `secs`;
//             When its time is up, or it says it's done (mraid.close()), it stops and the end
//             card stands in its place, as after a video. One done before its time waits out the
//             rest of the countdown on the card, unless it's marked `finishEarly`: then the reward is there and then.
//             One marked `keepPlaying` is only paused under the card when its time is up, and
//             the card offers Keep playing: for up to KEEP_SECS more, with a store button where
//             the ✓ was, until ✕ (or that time, or the page saying it's done) ends it
//   card      a still: the game's art, its line, the store button, for a few seconds. What shows when
//             nothing else can, and what a video that won't play turns into
//
// Two formats. `rewarded` (the default) is the player's choice, and watching to the end of the
// countdown earns the host's reward. `interstitial` is the host's choice, between two things
// the player was doing: there's no reward and nothing to forfeit, the ring counts `skipAfter`
// seconds, and then ✕ appears and closes at once. Until then there is no ✕ to press.
//
// The "Ad" label is a button, with an ⓘ beside the word: it stops the clock and says whose ad this is (the
// network: a circle of developers who know each other), by what it was chosen, and takes a report of it, with a
// few words if the player has any (`report`, from index.js: to the ingest's /flag, for the dashboard). Apple asks
// both of an app with ads (App Store Review Guidelines 2.5.18).
//
// ✕ before the reward stops everything and asks (leaving forfeits it); after, it closes at once.
// So does the ✓ the ring turns into, and the words beside it: they look like a way on, so they are one.
// The clock counts only time on screen: hidden, or asking, or with the store open, it waits.
// The reward's state is shape and symbol, not hue alone: an emptying ring with a number,
// then a filled disc with a ✓ and the words.
//
// In a shadow root, so the host's CSS can't reach in, and this CSS can't leak out.
import { withShim } from './mraidShim.js';
import { STEP, STEP_NAME, STEPS_MAX, SDK } from './wire.js';
import { stringsFor, say } from './locale.js';

const R = 19, C = 2 * Math.PI * R;   // the ring
const TICK = 100, GAP = 250;         // ms: the clock's step; a longer gap was time off screen, not time watched
const CARD_SECS = 5;                 // how long the still card stands in for a creative
const SKIP_SECS = 5;                 // an interstitial: how long before it can be closed
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
.video .bar, .card .bar { position: absolute; top: 0; left: 0; right: 0; background: linear-gradient(#000a, #0000); }
.playable .bar { background: #10202f; }
@media (orientation: landscape) {   /* a screen wider than tall has the least to give in height, and a solid bar across it takes of that: it lies over the playable's top, which a playable keeps clear, and what's between its buttons is the playable's to touch */
  .playable .bar { position: absolute; top: 0; left: 0; right: 0; padding-top: calc(4px + env(safe-area-inset-top)); padding-bottom: 14px; background: linear-gradient(#0009, #0000); pointer-events: none; }
  .playable .bar button { pointer-events: auto; }
  .tag { visibility: hidden; }   /* and the game's name not written across the game: it's on the card, and behind the ⓘ */
}
.x { width: 44px; height: 44px; flex: none; border: 2px solid #fff; border-radius: 50%; background: #000a; color: #fff; font: 700 20px/1 system-ui, sans-serif; padding: 0; }
.tag { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 13px; text-shadow: 0 1px 3px #000; }
.about { flex: none; display: flex; align-items: center; gap: 5px; height: 44px; margin: 0 -4px; padding: 0 4px; border: 0; background: none; color: inherit; text-shadow: 0 1px 3px #000; }
.about i { font-style: normal; opacity: .75; letter-spacing: .1em; text-transform: uppercase; font-size: 11px; padding: 2px 5px; border: 1px solid #fff9; border-radius: 4px; }
.about b { width: 18px; height: 18px; border: 1.5px solid #fffc; border-radius: 50%; font: italic 700 12px/15px Georgia, "Times New Roman", serif; text-align: center; opacity: .9; }
.earned { padding: 7px 12px; border: 0; border-radius: 999px; background: #fff; color: #10202f; font-weight: 800; font-size: 14px; white-space: nowrap; }
.ring { position: relative; width: 44px; height: 44px; flex: none; padding: 0; border: 0; background: none; color: inherit; }
.ring svg { position: absolute; top: 0; right: 0; bottom: 0; left: 0; transform: rotate(-90deg); }
.ring circle { fill: #000a; stroke: #fff4; stroke-width: 4; }
.ring .left { fill: none; stroke: #fff; stroke-linecap: round; stroke-dasharray: ${C}; transition: stroke-dashoffset ${TICK}ms linear; }
.ring b { position: absolute; top: 0; right: 0; bottom: 0; left: 0; display: flex; align-items: center; justify-content: center; font: 800 17px/1 system-ui, sans-serif; font-variant-numeric: tabular-nums; }
.ring.done circle { fill: #1f9d3a; stroke: #fff; }
.ring.done .left { stroke: none; }
.ring.done b { font-size: 24px; }
.get { height: 44px; flex: none; display: flex; align-items: center; gap: 8px; padding: 4px 16px 4px 4px; border: 0; border-radius: 999px; background: #1f6fd6; color: #fff; font-weight: 900; font-size: 15px; line-height: 1; white-space: nowrap; box-shadow: 0 2px 8px #0006; }
.get:not(:has(img)) { padding-left: 16px; }
.stage { position: relative; flex: 1; min-height: 0; overflow: hidden; }
.blur { position: absolute; top: -40px; right: -40px; bottom: -40px; left: -40px; background: center / cover no-repeat; filter: blur(24px) brightness(.55); }
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
.end .more { margin-top: 0; padding: 12px 28px; border: 2px solid #fff; background: #0004; font-size: 17px; box-shadow: none; }
.acts { display: contents; }
@media (orientation: landscape) and (max-height: 500px) {   /* a phone on its side: the card's things one under another are taller than the screen, the store's banner across its foot besides. Side by side: the icon, the words, the buttons */
  .end { display: grid; grid-template-columns: auto minmax(0, 21em) auto; grid-template-areas: "icon name acts" "icon line acts" "icon studio acts"; align-content: center; column-gap: 20px; row-gap: 4px;
    text-align: start; padding: 56px calc(24px + env(safe-area-inset-right)) 16px calc(24px + env(safe-area-inset-left)); }
  .end.under { padding-bottom: calc(118px + env(safe-area-inset-bottom)); }
  .end img { grid-area: icon; width: 80px; height: 80px; } .end h1 { grid-area: name; font-size: 22px; } .end p { grid-area: line; font-size: 14px; } .end small { grid-area: studio; }
  .acts { grid-area: acts; display: flex; flex-direction: column; gap: 10px; }
  .end button { margin-top: 0; padding: 14px 28px; font-size: 17px; } .end .more { padding: 10px 22px; font-size: 15px; }
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
.info small { font-weight: 500; font-size: 11px; opacity: .6; overflow-wrap: anywhere; }
.info textarea { flex: none; width: 100%; padding: 10px 12px; border: 1px solid #10202f66; border-radius: 12px; background: #fff; color: #10202f; font: 500 16px/1.3 inherit; font-family: inherit; resize: none; user-select: text; -webkit-user-select: text; }
.info .send { background: #10202f; color: #fff; }
.info em { font-style: normal; font-weight: 800; font-size: 16px; color: #1f7a30; }
[hidden] { display: none !important; }
`;

// creative: { kind, secs, src, poster, line, finishEarly, keepPlaying, ownEndCard }; app: the game's record; `html` a playable's
// page, already fetched; `link` from storeLinks (null: no store button); `openStore(link)` may
// return a promise that settles when the store is put away; `emit(event, fields)` for analytics.
// `report({ message, secs, kind })`: the player has reported this ad, in these words (or none).
// `banner(link | null)`, where the shell has one: the store's own banner for the game (iOS: the
// App Store's overlay, with its Get button), put up at the foot of the screen while the ad
// stands ended, over the end card or a video's own, and taken away with null.
// Resolves { granted, watchedSecs, kind }: `kind` is what was shown in the end, 'card' if it came to that;
// `granted` of an interstitial says only that it stayed up until it could be closed.
export function play({ creative, app, html, link, ctaText, reward, format = 'rewarded', skipAfter = SKIP_SECS, muted = false, emit = () => {}, openStore, banner = null, report = null, words = stringsFor('en') }) {
  const { t } = words;   // the player's own words, in the player's language (locale.js)
  const doc = document;
  let { kind } = creative;
  const host = doc.createElement('div'), root = host.attachShadow({ mode: 'open' });
  host.id = 'house-ads';
  host.style.cssText = 'position:fixed;top:0;right:0;bottom:0;left:0;z-index:2147483647';
  const icon = app.icon ? `<img src="${esc(app.icon)}" alt="">` : '';
  root.innerHTML = `<style>${CSS}</style>
<div class="layer ${kind}" lang="${esc(words.lang)}" dir="${words.rtl ? 'rtl' : 'ltr'}">
  <div class="bar">
    <button class="x" aria-label="${esc(t.close)}"${format === 'interstitial' ? ' hidden' : ''}>✕</button>
    <button class="about" aria-label="${esc(t.about)}"><i>${esc(t.ad)}</i><b aria-hidden="true">i</b></button>
    <span class="tag">${esc(app.name)}</span>
    <button class="earned" hidden>${esc(reward ? say(t.earned, { reward }) : t.earnedPlain)}</button>
    <button class="ring" role="timer" disabled><svg viewBox="0 0 44 44"><circle cx="22" cy="22" r="${R}"/><circle class="left" cx="22" cy="22" r="${R}"/></svg><b></b></button>
    ${link && kind === 'playable' && creative.keepPlaying ? `<button class="get go" hidden>${icon}<span>${esc(ctaText)}</span></button>` : ''}
  </div>
  <div class="stage" data-loading="${esc(t.loading)}">
    <div class="end${app.art ? ' art' : ''}" hidden>${icon}<h1>${esc(app.name)}</h1><p>${esc(creative.line ?? app.line)}</p>${app.studioName ? `<small>${esc(app.studioName)}</small>` : ''}<div class="acts">${link ? `<button class="go">${esc(ctaText)}</button>` : ''}<button class="more" hidden>${esc(t.keepPlaying)}</button></div></div>
  </div>
  ${link ? `<button class="store go" hidden>${icon}<span>${esc(app.name)}</span><em>${esc(ctaText)}</em></button>` : ''}
  <div class="ask" hidden><div><b>${esc(t.leaveTitle)}</b><span>${esc(reward ? say(t.miss, { reward }) : t.missPlain)}</span><button class="keep">${esc(t.keep)}</button><button class="leave">${esc(t.leave)}</button></div></div>
  <div class="info" hidden><div role="dialog" aria-label="${esc(t.about)}"><b>${esc(NETWORK)}</b><span>${esc(t.network)}</span><span>${esc(t.chosen)}</span>
    ${report ? `<textarea rows="2" maxlength="${WORDS_MAX}" placeholder="${esc(t.reportAsk)}" aria-label="${esc(t.reportAsk)}"></textarea><button class="send">${esc(t.report)}</button><em hidden>${esc(t.reported)}</em>` : ''}
    <small>${esc([app.name, creative.id, `v${SDK}`].filter(Boolean).join(' · '))}</small><button class="shut">${esc(t.close)}</button></div></div>
</div>`;
  const $ = sel => root.querySelector(sel);
  const stage = $('.stage'), end = $('.end'), ring = $('.ring'), number = $('.ring b'), arc = $('.left');
  if (app.art) end.style.setProperty('--art', cssUrl(app.art));

  let total = creative.secs, elapsed = 0, shownLeft = null, granted = false, closed = false, video = null, frame = null;
  // a `keepPlaying` playable past its time: 'resting' under the end card, then 'kept' when the player plays on
  let overtime = null;
  const rewarded = format !== 'interstitial';
  const need = () => rewarded ? total : Math.min(skipAfter, total);   // seconds until the way out is free
  const secs = () => Math.round(elapsed);
  const waits = new Set();   // why the clock stands still: 'hidden', 'ask', 'info', 'store', 'loading'
  let finish;
  const result = new Promise(done => { finish = done; });

  const draw = () => {
    if (granted) return;
    const left = Math.ceil(Math.max(0, need() - elapsed));
    if (left !== shownLeft) number.textContent = shownLeft = left;
    arc.style.strokeDashoffset = C * Math.min(1, elapsed / need());
  };
  function grant() {
    if (granted) return;
    granted = true;
    if (!rewarded) { ring.hidden = true; $('.x').hidden = false; return; }   // free to go: nothing earned, and the clock runs on for how long they stayed
    if (!(kind === 'playable' && creative.keepPlaying)) clearInterval(clock);   // nothing left to count; but one that may be played on counts on, for how long it was
    ring.classList.add('done'); number.textContent = '✓';
    ring.disabled = false; ring.removeAttribute('role'); ring.setAttribute('aria-label', t.done);   // a button now: the way back to the game
    $('.earned').hidden = false;
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
  // the ad stands ended: on the player's card, or (`card` false) on a video's own
  function endCard(card = true) { if (card) end.hidden = false; $('.store')?.setAttribute('hidden', ''); $('.sound')?.remove(); storeBanner(true); }
  // the video gone, and its decoder and download with it; `video` is null first, so its last events are heard by no one
  const dropVideo = () => { const v = video; if (!v) return; video = null; v.pause(); v.removeAttribute('src'); v.load(); v.remove(); };
  // what the playable is told (mraidShim.js hears it): whether it's seen, and how loud it may be
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
      if (rewarded && granted) { ring.hidden = false; $('.earned').hidden = false; }   // the ✓ back, where the store button was
    }
    endCard();
  }
  // Keep playing: the card goes, the page is told it's seen and heard again, and the ✓ (or, for an
  // interstitial, the place it was) is a store button; ✕ is the way out
  function keepPlaying() {
    if (overtime !== 'resting') return;   // only then is there a card to put away, and a page under it
    overtime = 'kept';
    end.hidden = true; storeBanner(false);
    if ($('.get')) { ring.hidden = true; $('.earned').hidden = true; $('.get').hidden = false; }
    total = elapsed + KEEP_SECS;
    toFrame('volume', muted ? 0 : 100); toFrame('viewable', !waits.size);
    emit('keep_playing', { secs: secs() });
  }
  // the still card in the creative's place, for CARD_SECS more
  function toCard() { dropVideo(); kind = 'card'; total = Math.min(total || Infinity, elapsed + CARD_SECS); endCard(); }
  function close() {
    if (closed) return;
    closed = true; storeBanner(false);
    clearInterval(clock); doc.removeEventListener('visibilitychange', seen); removeEventListener('message', heard); doc.removeEventListener('keydown', key, true);
    dropVideo(); host.remove();
    finish({ granted, watchedSecs: secs(), kind });
  }
  // the clock stands still for any reason in `waits`; the creative with it
  function wait(why, on) {
    const was = waits.size > 0;
    if (on) waits.add(why); else waits.delete(why);
    const now = waits.size > 0;
    if (was === now) return;
    if (video && !video.ended) { if (now) video.pause(); else video.play().catch(() => {}); }
    if (overtime !== 'resting') toFrame('viewable', !now);   // one paused under the card stays paused
  }
  const seen = () => wait('hidden', doc.hidden);

  let last = performance.now();
  const clock = setInterval(() => {
    const now = performance.now(), dt = Math.min(now - last, GAP) / 1000;
    last = now;
    if (video) elapsed = video.currentTime;
    else if (!waits.size && !(granted && rewarded && overtime !== 'kept')) elapsed += dt;
    if (!granted && elapsed >= need()) { if (rewarded) elapsed = total; grant(); }
    if (frame && overtime !== 'resting' && elapsed >= total) endPlayable({ rest: !overtime });   // its time is up (an interstitial's playable runs on past its ✕, to here): a rest the first time, the end if it was played on
    draw();
  }, TICK);

  // ---- the creative ----
  if (kind === 'video') {
    if (creative.poster) { stage.insertAdjacentHTML('afterbegin', '<div class="blur"></div>'); $('.blur').style.backgroundImage = cssUrl(creative.poster); }
    video = doc.createElement('video');
    Object.assign(video, { src: creative.src, playsInline: true, preload: 'auto', muted, poster: creative.poster ?? '' });
    video.setAttribute('playsinline', ''); video.setAttribute('webkit-playsinline', '');
    stage.insertBefore(video, end);
    $('.store')?.removeAttribute('hidden');
    const quartiles = [0.25, 0.5, 0.75];
    const on = (event, f) => { const v = video; v.addEventListener(event, () => { if (video === v) f(); }); };   // not after it's dropped
    on('loadedmetadata', () => { if (isFinite(video.duration) && video.duration > 0) total = video.duration; });
    on('timeupdate', () => { while (quartiles.length && video.currentTime >= quartiles[0] * total) emit(`q${quartiles.shift() * 100}`); });
    // one that ends on its own card: all of it is the store button, and at its end it's left standing, with nothing of the player's over it
    const own = !!creative.ownEndCard;
    if (own && link) { video.classList.add('go'); video.addEventListener('click', store); }
    on('ended', () => { emit('q100'); elapsed = total; grant(); endCard(!own); });
    // a video that won't play is no reason to keep the player waiting
    on('error', () => { emit('fail', { why: 'video' }); toCard(); });
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
    frame.setAttribute('sandbox', 'allow-scripts');   // scripts, and nothing else: no origin, no popups, no navigation
    frame.setAttribute('allow', 'autoplay');
    frame.srcdoc = withShim(html); html = null;   // the frame has it now: no second copy held for the length of the ad
    stage.insertBefore(frame, end);
    wait('loading', true);   // the countdown is for playing, not for the page arriving
    frame.addEventListener('load', () => { toFrame('volume', muted ? 0 : 100); wait('loading', false); });
  } else toCard();

  // ---- what the playable says ----
  const steps = new Set();   // what the playable has said it reached (mraidShim.js)
  const errors = new Set();  // and what it has said went wrong
  function heard(e) {
    if (!frame || e.source !== frame.contentWindow || overtime === 'resting') return;   // paused under the card, it has nothing to say
    const type = e.data?.houseAds;
    if (type === 'open') store();                                   // its own URL is ignored: the catalogue's link, never the playable's
    else if (type === 'touch') emit('first_touch', { secs: secs() });
    else if (type === 'step') { const name = e.data.name; if (STEP_NAME.test(name) && !steps.has(name) && steps.size < STEPS_MAX) { steps.add(name); emit(STEP, { step: name, secs: secs() }); } }   // once a showing each
    else if (type === 'error') { const message = String(e.data.message).slice(0, 200); if (!errors.has(message) && errors.size < ERRORS_MAX) { errors.add(message); emit('fail', { why: 'playable', message }); } }   // each once, and few
    else if (type === 'complete') {
      if (overtime === 'kept') endPlayable();   // played on, and now done: the card, for good
      else if (granted) close();
      else { emit('complete', { secs: secs() }); if (creative.finishEarly) grant(); endPlayable(); }   // done before its time: the card, and the reward now if that's its to say, else when the countdown is out
    }
  }
  addEventListener('message', heard);

  // ---- the buttons ----
  async function store() {
    if (!link || waits.has('store')) return;
    emit('store_open', { via: link.via });
    const under = bannered; storeBanner(false);   // the sheet is the whole store: no banner beside it
    wait('store', true);
    try { await openStore(link); } catch { /* the store didn't open: carry on */ }
    wait('store', false);
    if (under && !closed) storeBanner(true);
  }
  function ask() {
    if (granted) return close();
    if (!rewarded) return;   // not yet: there's nothing to ask about
    $('.ask').hidden = false; wait('ask', true);
  }
  // Whose ad this is, and a report of it: over everything, the clock stopped, and the store's banner out of its way
  let underInfo = false;
  function info(on) {
    const panel = $('.info');
    if (panel.hidden === !on) return;
    panel.hidden = !on; wait('info', on);
    if (on) { underInfo = bannered; storeBanner(false); } else if (underInfo && !closed) storeBanner(true);
  }
  function send(button) {
    const box = $('.info textarea'), message = box.value.replace(/\s+/g, ' ').trim().slice(0, WORDS_MAX);
    box.hidden = button.hidden = true; $('.info em').hidden = false;   // once a showing
    try { report({ message, secs: secs(), kind }); } catch (err) { console.error(err); }
  }
  // what's typed there is the player's to the network, not the game's to act on
  for (const type of ['keydown', 'keyup', 'keypress']) $('.info textarea')?.addEventListener(type, e => { if (e.key !== 'Escape') e.stopPropagation(); });
  const key = e => { if (e.key === 'Escape') { e.preventDefault(); if ($('.info').hidden) ask(); else info(false); } };
  root.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) { if (e.target.matches('.info')) info(false); return; }   // beside the panel: away with it
    if (b.matches('.about')) info(true);
    else if (b.matches('.shut')) info(false);
    else if (b.matches('.send')) send(b);
    else if (b.matches('.x, .ring, .earned')) ask();   // any way out: free once the reward is earned, asked about before
    else if (b.matches('.go')) store();
    else if (b.matches('.more')) keepPlaying();
    else if (b.matches('.keep')) { $('.ask').hidden = true; wait('ask', false); emit('exit_kept', { secs: secs() }); }
    else if (b.matches('.leave')) { emit('exit_early', { secs: secs() }); close(); }
  });
  doc.addEventListener('keydown', key, true);
  doc.addEventListener('visibilitychange', seen);

  doc.body.append(host);
  draw(); seen();
  return result;
}
