// ---------- what goes from a game to the ingest ----------
// The one definition of it, read by both ends: core/analytics.js, which sends, and
// ingest/src/rollup.js, which counts. A new event is added here, to the ingest's table
// (ingest/migrations, a column of the same name; test/ingest.test.mjs checks they agree),
// and nowhere else.
//
//   { v: VERSION, host, os, events: [{ event, placement, creative, app, kind, secs? }] }
//
// One more goes the same way and isn't a column: STEP, a playable's own name for somewhere in it
// that a showing reached ({ event: 'step', step: 'board2', creative, app, secs }), counted in a
// table of its own (rollup.js `steps`). An ingest older than it leaves it out.
//
// And a player's report of an ad (player.js, the ⓘ) goes on its own, at once, to /flag beside the ingest's /e:
//
//   { v: VERSION, sdk: SDK, host, os, lang, placement, creative, app, kind, secs, message, test? }
//
// kept as it is said (ingest/src/flags.js), for the dashboard: the one thing sent that a player typed. `test`: from a
// developer's test showing (createHouseAds test()), kept apart from players' reports on the dashboard.

export const VERSION = 1;
export const SDK = '0.3.5';   // this release, as package.json has it (test/version.test.mjs): said with a report of an ad
export const EVENTS = ['offer', 'show', 'cache_miss', 'q25', 'q50', 'q75', 'q100', 'first_touch', 'complete', 'reward', 'exit_kept', 'exit_early', 'store_open', 'fail', 'keep_playing', 'store_banner'];
export const KINDS = ['video', 'playable', 'card'];
export const OS = ['ios', 'android'];
export const STEP = 'step', STEP_NAME = /^[\w.-]{1,32}$/, STEPS_MAX = 12;   // a step's name, and how many a playable may have
export const FIELDS = ['event', 'placement', 'creative', 'app', 'kind', 'secs', 'step'];   // of an event: all that's sent of it
