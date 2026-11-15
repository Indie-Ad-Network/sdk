// Who plays the ad while it's filmed for a video (`node <kit>/tools/record.mjs dist/playable.html ad.mp4 --play play.mjs`).
// `page` is tools/cdp.mjs's (eval, touch, tap, swipe, sleep, until), with page.width and page.height (CSS pixels) and
// page.at() (ms since the ad loaded). Play like a person: read what the ad says of itself (window.__ad) and wait on
// that, not on the clock; be quick on most moves and slow on one or two, so the hint and a stall line are in the video.
export default async page => {
  const x = page.width * .3, y = page.height * .7;
  // a finger down, and the stick is under it; pushed right, and held
  const push = async () => { await page.touch('touchStart', x, y); for (let i = 1; i <= 8; i++) { await page.sleep(25); await page.touch('touchMove', x + i * 8, y); } };
  await page.until('window.__ad && __ad.T > 5.5');   // nothing done for a while: the hint is seen
  await push(); await page.until('__ad.x > .5');
  await page.touch('touchEnd'); await page.sleep(1200);   // let go half way, for a moment
  await push(); await page.until('__ad.x >= 1');
  await page.touch('touchEnd');
};
