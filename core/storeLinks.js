// ---------- store links ----------
// One record per game, both stores in it; the link is built for the platform at the moment
// of the tap, never pasted in by hand. Pure: no DOM, no clock but the one passed in.
//
//   app = { name, price: 'free' | 'paid', status?: 'preorder', release?: '2027-02-01',
//           ios: { id, pt? }, android: { package },
//           tracking?: 'https://…{host}…{campaign}…{creative}…{placement}' | { ios, android },
//           web?: { url: 'https://…{host}…', label?: 'signUp' | 'playtest' | 'wishlist' | 'learnMore' } }
//
// storeLink() answers { via, url, fallback?, sheet? }, in this order:
//   'tracking'  the partner's own attribution link, which redirects to the store
//   'sheet'     iOS, in an app: { id, ct, pt } for the App Store sheet, and `url` (itms-apps)
//               for a shell that has no sheet, or when the sheet can't load
//   'market'    Android, in an app
//   'https'     anywhere else
//   'web'       the game isn't on this store (or on any yet: a prototype, a playtest): its own
//               page, opened in the browser, the same macros filled
// `fallback` is always the plain https form. null when the game isn't on that store and has no page.

const CT_MAX = 40;   // an App Store campaign token: 40 characters at most
const token = s => String(s).replace(/[^\w.-]+/g, '-').slice(0, CT_MAX);
const fill = (template, ctx) => template.replace(/\{(\w+)\}/g, (_, k) => encodeURIComponent(ctx[k] ?? ''));
const onStore = (app, os) => os === 'ios' ? !!app.ios?.id : os === 'android' ? !!app.android?.package : false;
export const WEB_LABELS = ['signUp', 'playtest', 'wishlist', 'learnMore'];   // what a page's button may say: the player's own words (strings/), never a studio's
const query = pairs => pairs.filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');

export function storeLink(app, { os, native = false, host, campaign, creative, placement, pt } = {}) {
  const ctx = { host, campaign: campaign ?? creative, creative, placement };
  const tracking = typeof app.tracking === 'string' ? app.tracking : app.tracking?.[os];
  if (tracking) return { via: 'tracking', url: fill(tracking, ctx) };
  if (!onStore(app, os)) return app.web?.url ? { via: 'web', url: fill(app.web.url, ctx) } : null;

  if (os === 'ios') {
    const id = app.ios?.id;
    // a campaign link needs both: the provider token (whose App Analytics counts it) and the campaign: the creative's own
    // (one name for many ads reaches Apple's five first-time downloads sooner), else the game that showed it and the ad
    const provider = app.ios.pt ?? pt, ct = token(campaign || `${host}-${creative}`);
    const q = provider ? `?${query([['pt', provider], ['ct', ct], ['mt', 8]])}` : '';
    const fallback = `https://apps.apple.com/app/id${id}${q}`, url = `itms-apps://apps.apple.com/app/id${id}${q}`;
    return native ? { via: 'sheet', url, fallback, sheet: { id, ct, pt: provider ?? null } } : { via: 'https', url: fallback, fallback };
  }
  if (os === 'android') {
    const pkg = app.android?.package;
    // the Play Install Referrer hands this string to the installed game on its first launch
    const referrer = query([['utm_source', host], ['utm_medium', 'house'], ['utm_campaign', ctx.campaign], ['utm_content', creative], ['utm_term', placement]]);
    const q = query([['id', pkg], ['referrer', referrer]]);
    const fallback = `https://play.google.com/store/apps/details?${q}`;
    return native ? { via: 'market', url: `market://details?${q}`, fallback } : { via: 'https', url: fallback, fallback };
  }
  return null;
}

// The campaign of the ad a game was installed from, out of the referrer Google Play hands it (storeLink's, above): its
// `utm_campaign`, where the link was one of the network's (`utm_medium=house`). null for any other install. Pure.
export function campaignOf(referrer) {
  if (typeof referrer !== 'string' || !referrer) return null;
  const said = new URLSearchParams(referrer);
  return said.get('utm_medium') === 'house' ? said.get('utm_campaign') || null : null;
}

// What the store button says, in the words given (locale.js; English if none). Never a price: prices differ by store region.
// A game with a page and not on this store: what its page's button says, of WEB_LABELS.
const EN = { preregister: 'Pre-register', preorder: 'Pre-order', playFree: 'Play free', get: 'Get it', signUp: 'Sign up', playtest: 'Join the playtest', wishlist: 'Wishlist', learnMore: 'Learn more' };
// `link`: the one storeLink() chose, so the words are of where the button goes; without it, of where it would.
export function cta(app, os, now = Date.now(), t = EN, link = undefined) {
  if (link ? link.via === 'web' : app.web?.url && !onStore(app, os)) return t[WEB_LABELS.includes(app.web.label) ? app.web.label : 'learnMore'] ?? EN.learnMore;
  const out = app.status === 'preorder' && !(app.release && now >= Date.parse(app.release));
  if (out) return os === 'android' ? t.preregister : t.preorder;
  return app.price === 'free' ? t.playFree : t.get;
}
