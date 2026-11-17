// ---------- what goes from a game to the ingest ----------
// The one definition of it, read by both ends: core/analytics.js, which sends, and
// the server's rollup, which counts (SERVER.md). A new event is added here, to the server's table
// (a column of the same name; its tests check they agree), and nowhere else.
//
//   { v: VERSION, host, os, events: [{ event, placement, creative, app, kind, secs?, from? }] }
//
// `from`, of a store_open: what was tapped (FROM), which the server counts beside the store_open itself, a column to
// each. Since 0.5.0, with `skip` (a video left for its end once the reward was in: not an interstitial's ✕) and `paid`; a server from before leaves
// out what it doesn't know, and an SDK from before doesn't send them.
//
// One more goes the same way and isn't a column: STEP, a playable's own name for somewhere in it
// that a showing reached ({ event: 'step', step: 'board2', creative, app, secs }), counted in a
// table of its own (rollup.js `steps`). An ingest older than it leaves it out.
//
// And a player's report of an ad (player.js, the ⓘ) goes on its own, at once, to /flag beside the ingest's /e:
//
//   { v: VERSION, sdk: SDK, host, os, lang, placement, creative, app, kind, secs, reason, message, test? }
//
// kept as it is said, for the dashboard: the one thing sent that a player typed. `test`: from a
// developer's test showing (createIndieAds test()), kept apart from players' reports on the dashboard.

export const VERSION = 1;
// Why a player reports an ad: one is picked before a report is sent (player.js), and goes with it as `reason`. A report
// from before 0.6.2 has none. The words for each are the player's (strings/ `why…`); these names are what's kept.
export const REASONS = ['broken', 'stuck', 'inappropriate', 'misleading', 'other'];
export const SDK = '0.6.16';   // this release, as package.json has it (test/version.test.mjs): said with a report of an ad
export const EVENTS = ['offer', 'show', 'cache_miss', 'q25', 'q50', 'q75', 'q100', 'first_touch', 'complete', 'reward', 'exit_kept', 'exit_early', 'store_open', 'fail', 'keep_playing', 'store_banner', 'skip', 'paid'];
export const KINDS = ['video', 'playable', 'card'];
export const OS = ['ios', 'android'];
export const FROM = ['creative', 'button', 'card'];   // a store_open's: the ad itself (a video tapped, a playable's own button), the player's store button beside it, or the end card's
export const STEP = 'step', STEP_NAME = /^[\w.-]{1,32}$/, STEPS_MAX = 12;   // a step's name, and how many a playable may have
export const FIELDS = ['event', 'placement', 'creative', 'app', 'kind', 'secs', 'step', 'from'];   // of an event: all that's sent of it
