// pkAudio: the ad's sound, from clips the build put in the page as base64 (mp3).
//
//   const audio = pkAudio({ clips: { hook: '<base64>', music: '<base64>', ... }, first: 'hook', log });
//   audio.play('click', { vol: .8, rate: 1 });     // null if it can't sound right now (never queued for later)
//   audio.loop('music', { vol: .5, bed: true });   // starts when its clip is in; `bed` ducks under the voice
//   audio.setVolume(v); audio.setPaused(on); audio.wake();   // wake(): it wakes itself on touches too (below)
//
// What was learnt the hard way:
// - The first thing heard (`first`, the opening line) is decoded alone, before anything else is asked of
//   the decoder. All at once left the opening silent for seconds.
// - Each sound can play as soon as its own clip is in; nothing waits for the whole set.
// - A sound started on a sleeping context would wait, and they'd all go off together when it woke: so
//   play() gives null instead. The narrator (narrator.js) knows how to wait and to join late.
// - iOS lets sound start only in a touch's end, and Chrome only once a touch has ended (a finger's
//   pointerdown doesn't count in either): an ad that woke it on pointerdown alone stayed silent on an
//   iPhone. So it wakes itself on the end of every touch, click and key, whatever the ad listens to.
function pkAudio(o) {
  o = o || {};
  const clips = o.clips || {}, buffers = {}, waiting = {}, log = o.log || (() => {});
  let AC = null, master = null, bed = null, vol = 1, paused = false, asked = -9e9, seen = null;
  const loops = [];   // their handles, to start again on a new context
  // A context and its two gains. Again when a web view has broken the last (wake): decoded clips are
  // no context's, so they carry over; the loops start again on the new one.
  function build() {
    try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { AC = null; return; }
    master = AC.createGain(); master.connect(AC.destination);
    bed = AC.createGain(); bed.connect(master);
    master.gain.value = o.mute ? 0 : vol;
    seen = { t: AC.currentTime, at: performance.now(), moved: false };   // nothing until its clock is seen to move
    const ac = AC;
    log('audio ' + AC.state); AC.onstatechange = () => { log('audio ' + ac.state); if (ac === AC && ac.state === 'running') seen.at = performance.now(); };   // a clock still while suspended isn't broken: it gets 0.3 s from now
  }
  build();
  const bytes = s => { const b = atob(s.slice(s.indexOf(',') + 1)), a = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return a.buffer; };
  function one(name, then) {
    const end = b => { buffers[name] = b; (waiting[name] || []).forEach(f => f(b)); delete waiting[name]; if (then) then(); };
    try { const p = AC.decodeAudioData(bytes(clips[name]), b => end(b), () => end(null)); if (p && p.catch) p.catch(() => {}); } catch (e) { end(null); }
  }
  if (AC) {
    const names = Object.keys(clips), first = clips[o.first] ? o.first : names[0];
    if (first) one(first, () => names.forEach(n => { if (n !== first) one(n); }));
  }
  // 'running' isn't to be believed: iOS's web view can say it with its clock stopped, and every sound
  // started then waits, to go off all together when the clock moves (it did, in a game's ad player,
  // after the app had been away and back). So sound only once the clock has been seen to move, and
  // while it has in the last 0.3 s.
  function ticking() {
    if (!AC || AC.state !== 'running') return false;
    const now = performance.now();
    if (AC.currentTime !== seen.t) seen = { t: AC.currentTime, at: now, moved: true };
    return seen.moved && now - seen.at < 300;
  }
  const resume = () => { try { const p = AC.resume(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* the next wake */ } };
  function play(name, p) {
    p = p || {};
    if (!AC || !buffers[name] || paused || !ticking()) return null;
    const src = AC.createBufferSource(), gain = AC.createGain();
    src.buffer = buffers[name]; src.loop = !!p.loop; src.playbackRate.value = p.rate || 1; gain.gain.value = p.vol == null ? 1 : p.vol;
    src.connect(gain); gain.connect(p.bed ? bed : master);
    try { src.start(AC.currentTime + (p.delay || 0), p.offset || 0); } catch (e) { return null; }
    return { gain: gain.gain, stop(fade) { try { gain.gain.setTargetAtTime(0, AC.currentTime, (fade || .08) / 3); src.stop(AC.currentTime + (fade || .08) + .05); } catch (e) { /* already over */ } } };
  }
  const api = {
    get ctx() { return AC; }, play,
    has: name => !!clips[name],
    // undefined: still decoding. null: it won't decode (or there's no sound at all). Else the buffer.
    state: name => (AC ? buffers[name] : null),
    running: () => ticking(),
    whenReady(name, f) { if (!AC || !clips[name]) return; if (buffers[name] !== undefined) f(buffers[name]); else (waiting[name] = waiting[name] || []).push(f); },
    // A loop starts once its clip is in and the context runs; until then it keeps trying on each wake().
    loop(name, p) {
      const h = { node: null, stop(fade) { h.stopped = true; if (h.node) h.node.stop(fade); } };
      h.go = () => { if (!h.node && !h.stopped) h.node = play(name, Object.assign({}, p, { loop: true })); };
      api.whenReady(name, b => { if (b) { loops.push(h); h.go(); if (!h.node) pending.push(h.go); } });
      return h;
    },
    duck(on) { if (AC) bed.gain.setTargetAtTime(on ? .3 : 1, AC.currentTime, on ? .08 : .25); },
    setVolume(v) { vol = v; if (master) master.gain.value = o.mute ? 0 : v; },
    setPaused(on) { paused = !!on; if (AC) { if (on) { try { AC.suspend(); } catch (e) { /* no matter */ } } else resume(); } },
    // Sound not yet let run (a web view still waking its audio; a tab nobody has touched): ask again, not
    // more than every 0.4 s. Running with its clock stopped for good (iOS): a new context, but only from
    // the end of a touch (`touch`, the listeners below), which is when a phone lets one start.
    wake(touch) {
      if (!AC || paused) return;
      const t = performance.now();
      if (AC.state !== 'running') { if (t - asked > 400) { asked = t; resume(); } return; }
      if (!ticking()) {   // not yet seen to move: the next wake; still for 0.3 s while running: broken
        if (!touch || t - seen.at < 300 || t - asked < 400) return;
        asked = t; log('audio clock stopped: a new context');
        try { AC.close(); } catch (e) { /* gone anyway */ }
        build(); if (!AC) return;
        resume();
        for (const h of loops) if (!h.stopped) { h.node = null; pending.push(h.go); }
        return;
      }
      for (let i = pending.length; i--;) { pending[i](); pending.splice(i, 1); }
    },
  };
  const pending = [];
  // on the end of every touch, click and key (the header)
  if (AC) for (const t of ['touchend', 'pointerup', 'click', 'keydown']) addEventListener(t, () => api.wake(true), { capture: true, passive: true });
  return api;
}
