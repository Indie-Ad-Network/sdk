// The smallest ad the kit makes: push a dot to a ring while a narrator thinks aloud. Replace the game; keep
// the shape: one clock that stands still when paused, lines tied to what the player does, a funnel step at
// each thing worth counting, and host.done() at the end.
//   ?auto=1 plays itself (for tests); window.__ad says how it's going.
(() => {
  'use strict';
  const DATA = window.__AD__, AUTO = /[?&#]auto=1/.test(location.href);
  const cv = document.getElementById('c'), g = cv.getContext('2d'), capEl = document.getElementById('cap');
  const events = [], log = what => events.push(T.toFixed(2) + ' ' + what);
  let T = 0, last = 0, x = 0, pushed = false, won = 0, audio, narrator, stick;

  const host = pkHost({
    onStart({ paused, volume }) {
      audio = pkAudio({ clips: DATA.vo, first: 'hook', log });
      audio.setVolume(volume); if (paused) audio.setPaused(true);
      narrator = pkNarrator({ lines: DATA.lines, audio, now: () => T, log, shuffle: false,
        caption(c) { capEl.textContent = c ? c.text : capEl.textContent; capEl.classList.toggle('on', !!c); } });
      stick = pkStick({ root: document.getElementById('ui'), onDown() { audio.wake(); }, onInput() { narrator.did(); } });
      narrator.say('hook'); narrator.say('hook2', { keep: true });   // the cold open, and a second line straight behind it
      last = performance.now(); requestAnimationFrame(frame);
    },
    onPause(on) { audio.setPaused(on); last = performance.now(); },
    onVolume(v) { audio.setVolume(v); },
  });

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.max(0, Math.min(.05, (now - last) / 1000)); last = now;   // never a negative first step, never a leap
    if (host.paused) return;
    T += dt;
    const push = AUTO ? (T > 1 ? 1 : 0) : stick.x;
    if (!won) {
      x = Math.max(0, Math.min(1, x + push * dt * .35));
      if (push > .2 && !pushed) { pushed = true; host.step('1_pushed'); narrator.say('moved'); }   // said once it has happened, not on a timer
      if (x > .6) narrator.say('close');
      if (x >= 1) { won = T; host.step('2_there'); narrator.say('there', { cut: true }); narrator.say('next', { keep: true }); }
      else narrator.stall('stall');
      stick.hint(pushed ? 0 : 1);
    } else if (T - won > 3.4 && !narrator.busy()) { host.step('3_end'); host.done(); }
    stick.frame(dt); narrator.tick(); draw();
  }

  function draw() {
    const w = cv.width = innerWidth * devicePixelRatio, h = cv.height = innerHeight * devicePixelRatio, r = Math.min(w, h) * .05, x0 = w * .15, x1 = w * .85, y = h * .5;
    g.fillStyle = '#17324a'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#fff'; g.lineWidth = r * .15; g.beginPath(); g.arc(x1, y, r * 1.5, 0, 7); g.stroke();
    g.fillStyle = won ? '#8fe3a4' : '#ffd166'; g.beginPath(); g.arc(x0 + (x1 - x0) * x, y, r, 0, 7); g.fill();
  }

  window.__ad = { get T() { return T; }, get x() { return x; }, get done() { return host.finished; }, get paused() { return host.paused; }, events, steps: host.steps };
  host.begin();
})();
