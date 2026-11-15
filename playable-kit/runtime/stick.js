// pkStick: a floating touch stick. A ring and a dot appear wherever a finger lands (not in a corner); the
// ring closes to a point as the stick is pushed sideways, and it fades while the finger holds still. With
// nobody touching, it can show itself being pushed the way that's wanted. Arrow keys work too.
// (First built as the on-screen stick of The Gardens Between's phone versions.)
//
//   const stick = pkStick({ root: document.getElementById('ui'), onDown() { audio.wake(); narrator.did(); } });
//   stick.frame(dt);            // every frame
//   stick.x, stick.y            // -1..1
//   stick.hint(1);              // idle: show a push to the right (-1 left, 0 nothing)
//   stick.askTap(true);         // a short press now counts as a tap...
//   if (stick.tapped()) ...     // ...read (and cleared) here
//
// `root` should fill the page and have touch-action: none. Don't put a CSS filter (drop-shadow) on the stick:
// on some phones it leaves a dark trail wherever it has been.
function pkStick(o) {
  o = o || {};
  const root = o.root || document.body, colour = o.colour || '#fff';
  const el = (css, parent) => { const d = document.createElement('div'); d.style.cssText = css; (parent || root).appendChild(d); return d; };
  const joy = el('position:absolute;left:0;top:0;width:0;height:0;opacity:0;pointer-events:none;will-change:transform,opacity');
  const ring = el('position:absolute;border:2px solid ' + colour + ';border-radius:50%;box-sizing:border-box', joy);
  const mid = el('position:absolute;top:-1px;height:2px;opacity:.55;background:' + colour, joy);
  const dot = el('position:absolute;border-radius:50%;background:' + colour, joy);
  const clamp = (x, a, b) => x < a ? a : x > b ? b : x, smooth = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  const unit = () => clamp(Math.min(innerWidth, innerHeight) / 360, 1, 1.7);
  let x = 0, y = 0, id = null, keys = 0, downT = 0, downX = 0, downY = 0, travel = 0, still = 0, last = 0, alpha = 0;
  let hintDir = 0, hintT = 0, tapAsked = false, tap = false, lastInput = -9e9;
  function draw(px0, py0, vx, vy, a) {
    const u = unit(), k = clamp((Math.abs(vx) - .15) / .85, 0, 1), d = (120 - 117 * k) * u, r = 60 * u, h = 35 * u, px = v => v.toFixed(1) + 'px';
    joy.style.transform = 'translate(' + px(px0) + ',' + px(py0) + ')'; joy.style.opacity = a.toFixed(3);
    ring.style.width = ring.style.height = mid.style.width = px(d); ring.style.left = ring.style.top = mid.style.left = px(-d / 2);
    dot.style.width = dot.style.height = px(h); dot.style.left = px(vx * r - h / 2); dot.style.top = px(vy * r - h / 2);
  }
  const input = () => { lastInput = performance.now(); if (o.onInput) o.onInput(); };
  root.addEventListener('pointerdown', e => {
    if (o.onDown) o.onDown(e); input(); if (id !== null) return;
    id = e.pointerId; downT = performance.now(); downX = e.clientX; downY = e.clientY; travel = 0; x = y = 0; still = 0; alpha = 1;
    try { root.setPointerCapture(e.pointerId); } catch (err) { /* fine */ }
  });
  root.addEventListener('pointermove', e => {
    if (e.pointerId !== id) return;
    const r = 60 * unit(); let vx = (e.clientX - downX) / r, vy = (e.clientY - downY) / r; const l = Math.hypot(vx, vy);
    travel = Math.max(travel, l * r); if (l > 1) { vx /= l; vy /= l; }
    x = vx; y = vy; input();
  });
  const up = e => {
    if (e.pointerId !== id) return;
    if (tapAsked && travel < 14 && performance.now() - downT < 400) tap = true;   // a tap, not a push
    id = null; x = y = 0;
  };
  root.addEventListener('pointerup', up); root.addEventListener('pointercancel', up);
  addEventListener('keydown', e => {
    if (e.key === 'ArrowRight') keys = 1; else if (e.key === 'ArrowLeft') keys = -1; else if ((e.key === ' ' || e.key === 'Enter') && tapAsked) tap = true; else return;
    if (o.onDown) o.onDown(e); input();
  });
  addEventListener('keyup', e => { if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') keys = 0; });
  return {
    get x() { return clamp(x + keys, -1, 1); }, get y() { return y; }, get held() { return id !== null || keys !== 0; },
    // seconds since the player last did anything
    get idle() { return (performance.now() - lastInput) / 1000; },
    hint(dir) { hintDir = dir || 0; },
    askTap(on) { tapAsked = !!on; if (!on) tap = false; },
    tapped() { const t = tap; tap = false; return t; },
    frame(dt) {
      if (id !== null) {
        still = Math.abs(x - last) < .015 ? still + dt : 0; last = x;
        alpha += clamp((still > 1.4 ? .3 : 1) - alpha, -dt * 1.5, dt * 8);
        draw(downX, downY, x, y, alpha); hintT = 0;
      } else if (hintDir) {
        hintT += dt; const p = hintT % 2, v = smooth((p - .35) / .55) * hintDir, a = smooth(p / .25) * (1 - smooth((p - 1.5) / .4));
        const at = o.hintAt ? o.hintAt(innerWidth, innerHeight) : [innerWidth * .5, innerHeight * (innerWidth > innerHeight ? .76 : .8)];
        alpha = 0; draw(at[0], at[1], v, 0, a * .85);
      } else { alpha = Math.max(0, alpha - dt * 5); joy.style.opacity = alpha.toFixed(3); hintT = 0; }
    },
  };
}
