// pkAudio: the ad's sound, from clips the build put in the page as base64 (mp3).
//
//   const audio = pkAudio({ clips: { hook: '<base64>', music: '<base64>', ... }, first: 'hook', log });
//   audio.play('click', { vol: .8, rate: 1 });     // null if it can't sound right now (never queued for later)
//   audio.loop('music', { vol: .5, bed: true });   // starts when its clip is in; `bed` ducks under the voice
//   audio.setVolume(v); audio.setPaused(on); audio.wake();   // wake(): call on every touch
//
// What was learnt the hard way:
// - The first thing heard (`first`, the opening line) is decoded alone, before anything else is asked of
//   the decoder. All at once left the opening silent for seconds.
// - Each sound can play as soon as its own clip is in; nothing waits for the whole set.
// - A sound started on a sleeping context would wait, and they'd all go off together when it woke: so
//   play() gives null instead. The narrator (narrator.js) knows how to wait and to join late.
function pkAudio(o) {
  o = o || {};
  const clips = o.clips || {}, buffers = {}, waiting = {}, log = o.log || (() => {});
  let AC = null, master = null, bed = null, vol = 1, paused = false, asked = -9e9;
  try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { AC = null; }
  const bytes = s => { const b = atob(s.slice(s.indexOf(',') + 1)), a = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return a.buffer; };
  function one(name, then) {
    const end = b => { buffers[name] = b; (waiting[name] || []).forEach(f => f(b)); delete waiting[name]; if (then) then(); };
    try { const p = AC.decodeAudioData(bytes(clips[name]), b => end(b), () => end(null)); if (p && p.catch) p.catch(() => {}); } catch (e) { end(null); }
  }
  if (AC) {
    master = AC.createGain(); master.connect(AC.destination);
    bed = AC.createGain(); bed.connect(master);
    log('audio ' + AC.state); AC.onstatechange = () => log('audio ' + AC.state);
    const names = Object.keys(clips), first = clips[o.first] ? o.first : names[0];
    if (first) one(first, () => names.forEach(n => { if (n !== first) one(n); }));
  }
  function play(name, p) {
    p = p || {};
    if (!AC || !buffers[name] || paused || AC.state !== 'running') return null;
    const src = AC.createBufferSource(), gain = AC.createGain();
    src.buffer = buffers[name]; src.loop = !!p.loop; src.playbackRate.value = p.rate || 1; gain.gain.value = p.vol == null ? 1 : p.vol;
    src.connect(gain); gain.connect(p.bed ? bed : master);
    try { src.start(AC.currentTime + (p.delay || 0), p.offset || 0); } catch (e) { return null; }
    return { gain: gain.gain, stop(fade) { try { gain.gain.setTargetAtTime(0, AC.currentTime, (fade || .08) / 3); src.stop(AC.currentTime + (fade || .08) + .05); } catch (e) { /* already over */ } } };
  }
  const api = {
    ctx: AC, play,
    has: name => !!clips[name],
    // undefined: still decoding. null: it won't decode (or there's no sound at all). Else the buffer.
    state: name => (AC ? buffers[name] : null),
    running: () => !!AC && AC.state === 'running',
    whenReady(name, f) { if (!AC || !clips[name]) return; if (buffers[name] !== undefined) f(buffers[name]); else (waiting[name] = waiting[name] || []).push(f); },
    // A loop starts once its clip is in and the context runs; until then it keeps trying on each wake().
    loop(name, p) {
      const h = { node: null, stop(fade) { h.stopped = true; if (h.node) h.node.stop(fade); } };
      const go = () => { if (!h.node && !h.stopped) h.node = play(name, Object.assign({}, p, { loop: true })); };
      api.whenReady(name, b => { if (b) { go(); if (!h.node) pending.push(go); } });
      return h;
    },
    duck(on) { if (AC) bed.gain.setTargetAtTime(on ? .3 : 1, AC.currentTime, on ? .08 : .25); },
    setVolume(v) { vol = v; if (master) master.gain.value = o.mute ? 0 : v; },
    setPaused(on) { paused = !!on; if (AC) { try { on ? AC.suspend() : AC.resume(); } catch (e) { /* no matter */ } } },
    // Sound not yet let run (a web view still waking its audio; a tab nobody has touched): ask again, not more than every 0.4 s.
    wake() {
      if (!AC || paused) return;
      if (AC.state !== 'running') { const t = performance.now(); if (t - asked > 400) { asked = t; try { const p = AC.resume(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* stays asleep */ } } return; }
      for (let i = pending.length; i--;) { pending[i](); pending.splice(i, 1); }
    },
  };
  const pending = [];
  api.setVolume(vol);
  return api;
}
