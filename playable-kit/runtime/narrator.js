// pkNarrator: the voice that thinks aloud while the player plays (the README says how to write for it).
//
//   const narrator = pkNarrator({
//     lines,                 // { key: { text, dur, pool? } }: the build gives each line its clip's length as `dur`
//     audio,                 // a pkAudio, its clips named by line key (or `prefix` + key). Without one: captions only
//     now: () => T,          // the ad's clock, in seconds: one that stands still while the ad is paused
//     caption(c) {},         // c = { key, text, dur } as a line starts, null as it ends
//     log(what) {},
//   });
//   narrator.say('hook');                    // a script line: said once, and never after a later one
//   narrator.say('solved', { cut: true });   // a turn in the game: what's being said stops, this is said now
//   narrator.bark('refused');                // one of a pool, only if she's free: a small reaction
//   narrator.did();                          // the player did something
//   narrator.stall('n_walk');                // every frame, with the pool for where they're stuck: said after 4.5 s of nothing
//   narrator.tick();                         // every frame
//
// How she talks:
// - Lines wait their turn in a queue and never overlap; a caption is held for its clip's length.
// - The script's lines (those with no `pool`, in the order written) are each said once, in order, and never
//   after a later one. A new one takes the place of any still waiting (unless `keep`), so a fast player skips
//   lines instead of hearing stale ones. Lines in a pool come round again, never the same twice running.
// - A line waits up to 4 s for its clip to decode and 1.5 s (once) for the page to be allowed sound, then is
//   shown as a caption alone; its voice joins, at the word it has reached, the moment it can.
// - The music (anything looped with `bed`) ducks under her and comes back when she has nothing more to say.
//
//   say(key, { cut, keep, front, patience, valid, hold })
//     patience  seconds it may wait to start before it's stale and dropped (4)
//     front     ahead of what's waiting (a quick reaction)
//     valid     a function checked as the line comes up; dropped if it's no longer true
//     hold      false: nothing need wait for this line (see holding())
function pkNarrator(o) {
  const LINES = o.lines, audio = o.audio || null, now = o.now, prefix = o.prefix || '', log = o.log || (() => {});
  const show = o.caption || (() => {}), clip = key => prefix + key;
  const ORDER = Object.keys(LINES).filter(k => !LINES[k].pool);
  const vo = { cur: null, queue: [], wait: 0, deaf: false, quiet: -9e9, ducked: false }, bags = {};
  let saidTo = -1, lastDo = 0;
  function pick(pool) {
    let bag = bags[pool];
    if (!bag || !bag.list.length) {
      const list = Object.keys(LINES).filter(k => LINES[k].pool === pool);
      if (!list.length) return null;
      if (o.shuffle !== false) list.sort(() => Math.random() - .5); else list.reverse();   // unshuffled: in the order written
      if (bag && list.length > 1 && list[list.length - 1] === bag.last) list.unshift(list.pop());   // not the same one twice running
      bag = bags[pool] = { list, last: bag && bag.last };
    }
    return bag.last = bag.list.pop();
  }
  const busy = () => !!vo.cur || vo.queue.length > 0;
  function hush() {
    vo.queue.length = 0; vo.wait = 0;
    if (vo.cur) { if (vo.cur.node) vo.cur.node.stop(.08); vo.cur = null; vo.quiet = now(); show(null); }
  }
  function say(key, p) {
    p = p || {};
    if (!LINES[key]) return false;
    const i = ORDER.indexOf(key);
    if (i >= 0) {
      if (i <= saidTo) return false;
      saidTo = i;
      if (!p.keep && !p.cut) vo.queue.length = 0;
    }
    if (p.cut) hush();
    const line = { key, by: now() + (p.patience == null ? 4 : p.patience), valid: p.valid, hold: p.hold !== false };
    if (p.front) vo.queue.unshift(line); else vo.queue.push(line);
    tick();
    return true;
  }
  function tick() {
    const T = now();
    if (vo.cur && T >= vo.cur.end) { vo.cur = null; vo.quiet = T; show(null); }
    if (audio) audio.wake();
    if (vo.cur && !vo.cur.node && audio && audio.running() && audio.state(clip(vo.cur.key)) && vo.cur.end - T > .5) {
      vo.cur.node = audio.play(clip(vo.cur.key), { offset: Math.max(0, T - vo.cur.t0) });
      if (vo.cur.node) log('voice joins ' + vo.cur.key);
    }
    if (vo.cur) return;
    while (vo.queue.length) {
      const n = vo.queue[0], key = n.key;
      if (T > n.by || (n.valid && !n.valid())) { vo.queue.shift(); vo.wait = 0; continue; }
      const has = audio && audio.has(clip(key)), undecoded = has && audio.state(clip(key)) === undefined, asleep = has && !audio.running() && !vo.deaf;
      if (undecoded || asleep) {
        vo.wait = vo.wait || T;
        if (T - vo.wait < (undecoded ? 4 : 1.5)) { n.by = Math.max(n.by, T + .1); return; }
        if (asleep) vo.deaf = true;   // a page nobody has touched may never be allowed sound: don't wait on every line
      }
      if (audio && audio.running()) vo.deaf = false;
      vo.wait = 0; vo.queue.shift();
      const dur = LINES[key].dur || 1;
      vo.cur = { key, hold: n.hold, t0: T, end: T + dur + .1, node: has ? audio.play(clip(key)) : null };
      show({ key, text: LINES[key].text, dur });
      if (audio) audio.duck(true);
      vo.ducked = true;
      log('say ' + key + (vo.cur.node ? '' : ' (caption only)'));
      return;
    }
    if (vo.ducked) { vo.ducked = false; if (audio) audio.duck(false); }
  }
  return {
    say, hush, tick, busy, order: ORDER,
    speaking: () => !!vo.cur,
    // true while a line the game should wait for is being said or is waiting
    holding: () => !!(vo.cur && vo.cur.hold) || vo.queue.some(n => n.hold),
    get current() { return vo.cur && vo.cur.key; },
    bark(pool, p) { if (busy()) return false; const k = pick(pool); return !!k && say(k, Object.assign({ patience: .5, hold: false }, p)); },
    did() { lastDo = now(); },
    stall(pool, after) {
      const T = now();
      if (busy() || T - vo.quiet < 1.2 || T - lastDo < (after == null ? 4.5 : after)) return false;
      const k = pick(pool); if (!k) return false;
      lastDo = T; return say(k, { hold: false });
    },
  };
}
