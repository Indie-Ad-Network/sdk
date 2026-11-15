import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pageSays } from '../playable-kit/tools/page-says.js';

test("what a playable's page says: the form's Finish early and Keep playing start as its house-ads tag asks, within what its code does", async () => {
  const head = s => `<html><head><meta charset="utf-8"><meta name="house-ads" content='${JSON.stringify(s)}'></head><body><script>`;
  const closes = 'mraid && mraid.close();', pauses = "mraid.addEventListener('viewableChange', f);";
  const says = html => { const { finishEarly, keepPlaying, secs } = pageSays(html); return { finishEarly, keepPlaying, secs }; };
  // both said, and the code there for each
  assert.deepEqual(says(head({ secs: 60, finishEarly: true, keepPlaying: true }) + closes + pauses), { finishEarly: true, keepPlaying: true, secs: 60 });
  // Finish early must be asked for: a page made for another network closes on its own ✕, and that isn't an ending
  assert.deepEqual(says('<html>' + closes + pauses), { finishEarly: false, keepPlaying: true, secs: undefined }, 'no tag: never early, played on if it pauses');
  assert.equal(says(head({ secs: 30 }) + closes).finishEarly, false, 'a tag that doesn\'t ask');
  assert.equal(says(head({ finishEarly: true }) + pauses).finishEarly, false, 'asked for, but nothing in it closes');
  // Keep playing needs no asking, only a page that stands still when told; and the tag may say not
  assert.equal(says(head({ keepPlaying: true }) + closes).keepPlaying, false, 'it never listens for viewableChange');
  assert.equal(says(head({ keepPlaying: false }) + pauses).keepPlaying, false, 'the tag says not');
  // secs only as the form may take it
  assert.equal(says(head({ secs: 90 })).secs, undefined);
  assert.equal(says(head({ secs: '60' })).secs, undefined);
  // the tag as the kit escapes it, and one that can't be read
  assert.equal(says(`<meta name="house-ads" content='{"keepPlaying":true,"x":"it&#39;s &amp; that"}'>` + pauses).keepPlaying, true);
  assert.match(pageSays(`<meta name="house-ads" content='{keepPlaying}'>`).error, /isn’t JSON/);
  assert.deepEqual([pageSays(closes).closes, pageSays(closes).pauses, pageSays(pauses).closes, pageSays(pauses).pauses], [true, false, false, true], 'what the code can bear out, which the Worker holds a ticked box to');
  assert.equal(pageSays('<html></html>').said, null);
  const t0 = Date.now(); pageSays(`<meta name="house-ads" content='{`.repeat(20000) + 'x'.repeat(2e6));
  assert.ok(Date.now() - t0 < 1000, 'a page of tags never closed is read once, not once for each');
});
