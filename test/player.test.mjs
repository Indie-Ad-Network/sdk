import { test } from 'node:test';
import assert from 'node:assert/strict';
import { play } from '../core/player.js';

// Exercise the player's timing and navigation with a controlled media clock.
// Browser checks cover the rendered control; these cover reward/exit transitions.
function showing(t, creative, options = {}) {
  let now = 0, tick, video, frame, host;
  const listeners = new Map(), nodes = new Map(), events = [];
  class Element {
    constructor(tag = 'div', selector = '') {
      this.tag = tag; this.selector = selector; this.hidden = true; this.disabled = false;
      this.listeners = new Map(); this.attributes = new Map(); this.currentTime = 0;
      this.clientWidth = 390; this.clientHeight = 844; this.contentWindow = { postMessage() {} };
      this.style = { setProperty() {} };
      const classes = new Set();
      this.classList = { add: v => classes.add(v), remove: v => classes.delete(v), contains: v => classes.has(v), toggle(v, on) { if (on) classes.add(v); else classes.delete(v); } };
    }
    addEventListener(type, fn) { const set = this.listeners.get(type) ?? new Set(); set.add(fn); this.listeners.set(type, set); }
    removeEventListener() {}
    dispatch(type) { for (const fn of this.listeners.get(type) ?? []) fn(); }
    setAttribute(key, value) { this.attributes.set(key, value); }
    removeAttribute(key) { this.attributes.delete(key); }
    getAttribute(key) { return this.attributes.get(key) ?? null; }
    attachShadow() { return root; }
    querySelector(selector) { return nodes.get(selector) ?? null; }
    querySelectorAll() { return []; }
    insertBefore() {}
    getBoundingClientRect() { (this.flushes ??= []).push(this.style.transition); return {}; }   // a style flush: what the transition was as it happened
    remove() { this.removed = true; }
    load() {}
    pause() { this.paused = true; }
    play() { this.paused = false; return Promise.resolve(); }
    matches(selectors) { return selectors.split(',').some(s => s.trim() === this.selector); }
    closest(selector) { return selector === 'button' && this.tag === 'button' ? this : null; }
    click() { if (!this.disabled) for (const fn of root.listeners.get('click') ?? []) fn({ target: this }); }
  }
  const root = new Element();
  for (const selector of ['.stage', '.end', '.cta-panel', '.ring', '.ring b', '.left', '.more', '.go', '.ask', '.info']) nodes.set(selector, new Element(['.ring', '.more', '.go'].includes(selector) ? 'button' : 'div', selector));
  nodes.get('.ring').disabled = true;
  const document = {
    hidden: false, body: { append(el) { host = el; } }, addEventListener(type, fn) { listeners.set(type, fn); }, removeEventListener(type) { listeners.delete(type); },
    createElement(tag) { const el = new Element(tag); if (tag === 'video') video = el; if (tag === 'iframe') frame = el; return el; },
  };
  const globals = { document, performance: { now: () => now }, setInterval: fn => { tick = fn; return 1; }, clearInterval: () => { tick = null; },
    addEventListener: (type, fn) => listeners.set(type, fn), removeEventListener: type => listeners.delete(type) };
  for (const [key, value] of Object.entries(globals)) {
    const old = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
    t.after(() => { if (old) Object.defineProperty(globalThis, key, old); else delete globalThis[key]; });
  }
  const result = play({ creative: { kind: 'video', secs: 30, endCardMode: 'orientation', endCardSecs: 0, src: 'https://example.test/video.mp4', ...creative }, app: { name: 'Test' }, emit: (name, data) => events.push({ name, ...data }), ...options });
  frame?.dispatch('load');
  return { result, events, root, nodes, get video() { return video; }, get frame() { return frame; }, resize() { listeners.get('resize')?.(); }, get closed() { return !!host.removed; },
    get ring() { return nodes.get('.ring'); }, get label() { return nodes.get('.ring b').textContent; },
    click() { nodes.get('.ring').click(); },
    advance(seconds) { for (let elapsed = 0; elapsed < seconds - 0.0001; elapsed += 0.1) { now += 100; tick?.(); } },
    visibility(hidden) { document.hidden = hidden; listeners.get('visibilitychange')?.(); },
    escape() { listeners.get('keydown')?.({ key: 'Escape', preventDefault() {} }); },
    complete() { listeners.get('message')({ source: frame.contentWindow, data: { houseAds: 'complete' } }); },
  };
}

test('the player has one timer/skip/close control and closes after natural completion', async t => {
  const s = showing(t);
  assert.doesNotMatch(s.root.innerHTML, /class="(?:x|skip)"/);
  assert.doesNotMatch(s.root.innerHTML, /class="earned"/);
  assert.equal(s.ring.disabled, true);
  s.video.dispatch('ended');
  assert.equal(s.ring.getAttribute('aria-label'), 'Close'); assert.equal(s.ring.disabled, false);
  assert.equal(s.events.filter(e => e.name === 'reward').length, 1);
  s.click(); assert.equal(s.closed, true); assert.equal((await s.result).granted, true);
});

test('an early reward offers Skip before X, including static final-frame creatives', async t => {
  const s = showing(t, { skipFrom: 5, ownCard: true });
  s.video.currentTime = 5; s.advance(0.1);
  assert.equal(s.ring.classList.contains('skippable'), true);
  s.click();
  assert.equal(s.closed, false); assert.equal(s.ring.getAttribute('aria-label'), 'Close');
  assert.equal(s.video.currentTime, 29.95); assert.equal(s.video.paused, true);
  assert.equal(s.events.filter(e => e.name === 'reward').length, 1);
  s.click(); await s.result; assert.equal(s.closed, true);
});

test('interstitial Skip becomes the endcard hold timer, then X without a reward', async t => {
  const s = showing(t, { endCardSecs: 3 }, { format: 'interstitial', least: 2 });
  s.video.currentTime = 2; s.advance(0.1);
  assert.equal(s.ring.classList.contains('skippable'), true);
  s.click();
  assert.equal(s.ring.disabled, true); assert.equal(s.label, 3);
  s.advance(2.8); assert.equal(s.ring.disabled, true); assert.equal(s.closed, false);
  s.advance(0.3); assert.equal(s.ring.getAttribute('aria-label'), 'Close');
  assert.equal(s.events.some(e => e.name === 'reward'), false);
  s.click(); await s.result; assert.equal(s.closed, true);
});

test('a naturally completed interstitial offers X immediately', async t => {
  const s = showing(t, {}, { format: 'interstitial' });
  s.video.dispatch('ended'); assert.equal(s.ring.getAttribute('aria-label'), 'Close');
  assert.equal(s.events.some(e => e.name === 'reward'), false);
  s.click(); await s.result;
});

test('a playable completed early keeps its countdown on the endcard until earned', async t => {
  const s = showing(t, { kind: 'playable', secs: 5 }, { html: '<html></html>' });
  s.complete(); assert.equal(s.nodes.get('.end').hidden, false); assert.equal(s.ring.disabled, true);
  s.advance(4.8); assert.equal(s.ring.disabled, true);
  s.advance(0.4); assert.equal(s.ring.getAttribute('aria-label'), 'Close');
  assert.equal(s.events.filter(e => e.name === 'reward').length, 1);
  s.click(); await s.result;
});

test('an interstitial playable reaches its endcard through the same Skip control', async t => {
  const s = showing(t, { kind: 'playable', secs: 10 }, { format: 'interstitial', least: 2, html: '<html></html>' });
  s.advance(2.1); assert.equal(s.ring.classList.contains('skippable'), true);
  s.click(); assert.equal(s.closed, false); assert.equal(s.ring.getAttribute('aria-label'), 'Close');
  assert.equal(s.nodes.get('.end').hidden, false);
  assert.equal(s.events.some(e => e.name === 'reward'), false);
  s.click(); await s.result;
});

test('a failed video counts down its fallback card before enabling X', async t => {
  const s = showing(t);
  s.video.dispatch('error'); assert.equal(s.ring.disabled, true);
  s.advance(5.1); assert.equal(s.ring.getAttribute('aria-label'), 'Close');
  s.click(); assert.equal((await s.result).kind, 'card');
});

test('a video failing after its reward offers X on the fallback card', async t => {
  const s = showing(t, { skipFrom: 5 });
  s.video.currentTime = 5; s.advance(0.1);
  s.video.dispatch('error'); assert.equal(s.ring.getAttribute('aria-label'), 'Close');
  s.click(); await s.result;
  assert.equal(s.events.filter(e => e.name === 'reward').length, 1);
});

test('Keep playing leaves the unified close control available', async t => {
  const s = showing(t, { kind: 'playable', secs: 5, keepPlaying: true }, { html: '<html></html>' });
  s.advance(5.1); assert.equal(s.ring.getAttribute('aria-label'), 'Close');
  s.nodes.get('.more').click();
  assert.equal(s.nodes.get('.end').hidden, true);
  assert.equal(s.ring.hidden, false); assert.equal(s.ring.getAttribute('aria-label'), 'Close');
  s.click(); await s.result;
});

for (const type of ['large', 'compact', 'custom']) test(`a playable that may be played on, styled ${type}, ends on the large card with Keep playing under its store button`, async t => {
  const s = showing(t, { kind: 'playable', secs: 5, keepPlaying: true, endCardCta: { type, image: 'https://example.test/button.png' } }, { html: '<html></html>', link: { url: 'https://example.test/app', via: 'sheet' }, ctaText: 'Get' });
  const markup = s.root.innerHTML, panel = markup.indexOf('class="cta-panel');
  assert.ok(panel > 0);
  assert.equal(markup.split('class="more"').length, 2); assert.ok(markup.indexOf('class="more"') > panel);
  assert.doesNotMatch(markup, /class="placed/);
  s.advance(5.1);
  assert.equal(s.nodes.get('.cta-panel').hidden, false); assert.equal(s.nodes.get('.more').hidden, false);
  s.nodes.get('.more').click();
  assert.equal(s.nodes.get('.cta-panel').hidden, true); assert.equal(s.nodes.get('.end').hidden, true);
  assert.equal(s.events.filter(e => e.name === 'keep_playing').length, 1);
  s.advance(120.1);
  assert.equal(s.nodes.get('.cta-panel').hidden, false); assert.equal(s.nodes.get('.more').hidden, true);
  s.click(); await s.result;
});

test('a playable that may not be played on keeps the end card style it asks for', async t => {
  const s = showing(t, { kind: 'playable', secs: 5, endCardCta: { type: 'compact' } }, { html: '<html></html>', link: { url: 'https://example.test/app', via: 'sheet' } });
  assert.doesNotMatch(s.root.innerHTML, /class="cta-panel/);
  assert.equal(s.root.innerHTML.split('class="more"').length, 2);   // still there, hidden, for what reads it
});

for (const format of ['rewarded', 'interstitial']) test(`${format} natural endings default to a three-second endcard timer`, async t => {
  const s = showing(t, { endCardSecs: undefined }, { format });
  s.video.dispatch('ended');
  assert.equal(s.ring.disabled, true); assert.equal(s.label, 3);
  assert.equal(s.events.filter(e => e.name === 'reward').length, format === 'rewarded' ? 1 : 0);
  s.escape(); assert.equal(s.closed, false);
  s.advance(2.8); assert.equal(s.ring.disabled, true);
  s.advance(0.3); assert.equal(s.ring.getAttribute('aria-label'), 'Close');
  s.click(); await s.result;
});

test('endcard time is configurable and pauses while the ad is hidden', async t => {
  const s = showing(t, { loop: { from: 20 }, endCardSecs: 1.5 });
  s.video.dispatch('ended'); assert.equal(s.ring.disabled, true);
  s.advance(0.5); s.visibility(true); s.advance(10);
  assert.equal(s.ring.disabled, true);
  s.visibility(false); s.advance(1.1); assert.equal(s.ring.getAttribute('aria-label'), 'Close');
  s.click(); await s.result;
  assert.equal(s.events.filter(e => e.name === 'reward').length, 1);
});

test('an endcard shown before the reward waits for the longer remaining timer', async t => {
  const s = showing(t, { kind: 'playable', secs: 2, endCardSecs: 5 }, { html: '<html></html>' });
  s.complete(); s.advance(2.1);
  assert.equal(s.events.filter(e => e.name === 'reward').length, 1);
  assert.equal(s.ring.disabled, true);
  s.advance(3); assert.equal(s.ring.getAttribute('aria-label'), 'Close');
  s.click(); await s.result;
});


for (const format of ['rewarded', 'interstitial']) test(`${format} creatives without display settings use the current UI and default endcard timer`, async t => {
  const s = showing(t, { endCardMode: undefined, endCardSecs: undefined }, { format });
  assert.doesNotMatch(s.root.innerHTML, /class="(?:x|skip|earned)"/);
  s.video.dispatch('ended');
  assert.equal(s.label, 3);
  assert.equal(s.ring.disabled, true);
  s.advance(3.1);
  assert.equal(s.ring.getAttribute('aria-label'), 'Close');
  assert.equal(s.ring.disabled, false);
  s.click();
  await s.result;
  assert.equal(s.events.filter(e => e.name === 'reward').length, format === 'rewarded' ? 1 : 0);
});

test("the ring snaps full for the end card's countdown, rather than tweening back up", async t => {
  const s = showing(t, { endCardSecs: 3 }, { format: 'rewarded' });
  const arc = s.nodes.get('.left');
  s.video.currentTime = 29.9; s.advance(0.5);
  assert.deepEqual(arc.flushes ?? [], [], 'nothing snaps while the video counts down');
  s.video.dispatch('ended');
  assert.equal(s.label, 3);
  assert.equal(arc.style.strokeDashoffset, -0);
  assert.deepEqual(arc.flushes, ['none'], 'the end card countdown starts full without a transition');
  assert.equal(arc.style.transition, '', 'and its countdown tweens as ever');
  s.advance(1);
  assert.deepEqual(arc.flushes, ['none'], 'the end card countdown runs down smoothly');
  s.advance(2.2); s.click(); await s.result;
});

for (const format of ['rewarded', 'interstitial']) {
  test(`${format} video ring tracks full duration before and after skip unlocks`, async t => {
    const s = showing(t, {}, { format, least: 5 });
    const arc = s.nodes.get('.left'), circumference = 2 * Math.PI * 19;
    assert.equal(s.label, 5);
    s.video.currentTime = 2; s.advance(0.1);
    assert.equal(s.label, 3);
    assert.ok(Math.abs(arc.style.strokeDashoffset / circumference + 2 / 30) < 1e-9);
    s.video.currentTime = 5; s.advance(0.1);
    assert.equal(s.ring.getAttribute('aria-label'), 'Skip');
    assert.equal(s.label, '');
    assert.ok(Math.abs(arc.style.strokeDashoffset / circumference + 5 / 30) < 1e-9);
    s.video.currentTime = 20; s.advance(0.1);
    assert.ok(Math.abs(arc.style.strokeDashoffset / circumference + 20 / 30) < 1e-9);
    s.video.dispatch('ended'); s.click(); await s.result;
  });
}

test('a playable keeps its size while the store is over it, whichever way the screen turns', async t => {
  let closeStore;
  const ad = showing(t, { kind: 'playable', secs: 30 }, { html: '<p></p>', link: { url: 'https://example.test/app', via: 'sheet' }, openStore: () => new Promise(done => { closeStore = done; }) });
  const stage = ad.nodes.get('.stage');
  stage.clientWidth = 844; stage.clientHeight = 390;
  ad.nodes.get('.go').click();
  assert.match(ad.frame.style.cssText, /width: 844px; height: 390px;.*scale\(1\)/);
  stage.clientWidth = 390; stage.clientHeight = 844; ad.resize();
  assert.match(ad.frame.style.cssText, /width: 844px; height: 390px;.*scale\(2\.16/);   // 844 / 390: filling the portrait screen, its own shape kept
  closeStore(); await new Promise(setImmediate);
  assert.equal(ad.frame.style.cssText, '');
});
