// What a playable's page says of itself, and what its code does: the admin's form is filled from these when a file is
// picked, and a box its code can't bear out isn't to be ticked (PLAYABLE_HOST.md, "Settings from the page"). One
// function, used by the kit's build (build.mjs) and by the network's server: its admin page (which has it written into the
// page, so it keeps to itself: nothing from outside its body) and its Worker, when a creative is saved.
//
// The page may say, in its head:  <meta name="house-ads" content='{"secs":60,"finishEarly":true,"keepPlaying":false}'>
// and the code is searched for what each needs: `closes` (it calls mraid.close()) for Finish early, `pauses` (it
// listens for viewableChange, so can stand still under the end card) for Keep playing. What the form starts as:
//   finishEarly  only where the tag asks, and the page closes. Never supposed: in a playable made for another
//                network close() is its own ✕, and the reward for one tap of that is too cheap
//   keepPlaying  wherever the page pauses, unless the tag says not: it's only an offer to a player whose time ran out
//   secs         the tag's, for the form's Seconds
// `said` is null where there's no tag, and `error` says what's wrong with one that can't be read.
export function pageSays(html) {
  const tag = /<meta\s+name=["']house-ads["']\s+content=(?:"([^"]*)"|'([^']*)')/i.exec(html);   // to the quote that closes it and no further: a page of unclosed ones isn't read end to end for each
  let said = null, error;
  if (tag) {
    try {
      const v = JSON.parse((tag[1] ?? tag[2]).replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&'));
      if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('not an object');
      said = {};
      if (typeof v.secs === 'number' && v.secs >= 5 && v.secs <= 60) said.secs = v.secs;
      for (const k of ['finishEarly', 'keepPlaying']) if (typeof v[k] === 'boolean') said[k] = v[k];
    } catch (e) { error = 'the house-ads tag in its head isn’t JSON: ' + e.message; }
  }
  const closes = /mraid\s*(?:&&\s*mraid\s*)?\.close\(/.test(html), pauses = /viewableChange/.test(html);
  return {
    said, error, closes, pauses, secs: said?.secs,
    finishEarly: said?.finishEarly === true && closes,
    keepPlaying: pauses && said?.keepPlaying !== false,
  };
}
