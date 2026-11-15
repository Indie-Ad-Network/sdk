// Everything the narrator says, by key. The key names the line's take (vo/recorded/<key>.wav) and its
// caption. `text` is the caption and what the voice says; `say` overrides what the voice is given where the
// caption reads badly aloud; `note` is the direction for the take. The kit's README says how to write these.
//
// The first group is the script, in the order it can happen: each is said once, and never after a later
// one. Lines with a `pool` come round again: doing nothing (stall), small reactions (bark).
export const LINES = {
  hook:    { text: 'Okay, okay... what do we have here?', note: 'The cold open: starts in the first frame. Keen.' },
  hook2:   { text: 'Ooh, a little dot! Do I just push?', note: 'Straight behind the hook, no gap. A guess.' },
  moved:   { text: 'Whoa! I push... and it rolls!', note: "The game's one idea, said as it happens." },
  close:   { text: 'Nearly, nearly... keep going!', note: 'Tension filler. Leaning in.' },
  there:   { text: 'Yes! Got it!', note: 'The payoff. Quick, bright.' },
  next:    { text: 'Ha! Okay... what’s next?', note: 'Looking ahead: the ad ends on wanting more, not on a call to action.' },

  stall_1: { pool: 'stall', text: 'I just need to swipe to move.', note: 'To yourself, working it out.' },
  stall_2: { pool: 'stall', text: 'Gotta push it along!', note: 'A nudge, still friendly.' },
  stall_3: { pool: 'stall', text: 'Hmm... what if I swipe right?', note: 'An idea arriving.' },
};
