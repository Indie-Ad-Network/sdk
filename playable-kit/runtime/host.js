// pkHost: the page's side of the contract with the ad player (../PLAYABLE_HOST.md).
// A plain script, so a build can inline it ahead of the ad's own code.
//
//   const host = pkHost({
//     onStart({ paused, volume }) {},   // once, when the host is ready: start the ad here
//     onPause(on) {},                   // not viewable (time's up under the end card, the store open, the app hidden): stand still, silent
//     onVolume(v) {},                   // 0..1: the host game's mute
//   });
//   host.begin();
//   host.step('2_freeze');              // the funnel: counted once a showing, a dozen names at most
//   host.done();                        // the ad has reached its end (the end card, and with it the reward where the creative is marked finishEarly)
//   host.install();                     // an install button of the ad's own, if it has one (the host opens its own link)
function pkHost(o) {
  o = o || {};
  const mraid = window.mraid || null, steps = [], STEP_NAME = /^[\w.-]{1,32}$/, STEPS_MAX = 12;
  const clamp01 = v => Math.max(0, Math.min(1, v));
  let paused = false, volume = 1, started = false, finished = false;
  function setPaused(on) { on = !!on; if (on === paused) return; paused = on; if (started && o.onPause) o.onPause(on); }
  function setVolume(v) { volume = v; if (started && o.onVolume) o.onVolume(v); }
  function start() {
    if (started) return;
    if (mraid) {
      try {
        mraid.addEventListener('viewableChange', v => setPaused(!v));
        mraid.addEventListener('audioVolumeChange', v => setVolume(clamp01((v == null ? 100 : +v || 0) / 100)));
        const v0 = mraid.getAudioVolume && mraid.getAudioVolume(); if (typeof v0 === 'number') volume = clamp01(v0 / 100);
        if (mraid.isViewable && mraid.isViewable() === false) paused = true;
      } catch (e) { /* a network without these: carry on */ }
    }
    document.addEventListener('visibilitychange', () => { if (!mraid) setPaused(document.hidden); });
    started = true;
    if (o.onStart) o.onStart({ paused, volume });
  }
  return {
    mraid, steps,
    get paused() { return paused; }, get volume() { return volume; }, get finished() { return finished; },
    begin() {
      if (mraid && mraid.addEventListener) { mraid.addEventListener('ready', start); setTimeout(start, 300); }
      else if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
    },
    step(name) {
      if (steps.indexOf(name) >= 0) return;
      if (!STEP_NAME.test(name) || steps.length >= STEPS_MAX) { if (window.console) console.warn('pkHost: step not counted: ' + name); return; }
      steps.push(name);
      try { window.houseAds && window.houseAds.step(name); } catch (e) { /* nobody counting */ }
    },
    done() { if (finished) return; finished = true; try { mraid && mraid.close(); } catch (e) { /* nobody to tell */ } },
    install(url) { try { mraid && mraid.open(url || ''); } catch (e) { /* nobody to tell */ } },
  };
}
