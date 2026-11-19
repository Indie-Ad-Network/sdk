import { test } from 'node:test';
import assert from 'node:assert/strict';
import { storeLink, cta, campaignOf } from '../core/storeLinks.js';

const tcb = { name: 'Game One', price: 'free', ios: { id: 123456789 }, android: { package: 'com.example.gameone' } };
const ctx = { host: 'tca', creative: 'tcb-crashcam-15', placement: 'saveMe' };

test('iOS in a browser: the https page, with the campaign only when there is a provider token', () => {
  assert.deepEqual(storeLink(tcb, { ...ctx, os: 'ios' }), { via: 'https', url: 'https://apps.apple.com/app/id123456789', fallback: 'https://apps.apple.com/app/id123456789' });
  assert.equal(storeLink(tcb, { ...ctx, os: 'ios', pt: 123 }).url, 'https://apps.apple.com/app/id123456789?pt=123&ct=tca-tcb-crashcam-15&mt=8');
});

test('iOS in an app: the sheet with its tokens, and itms-apps should there be no sheet', () => {
  const sheet = storeLink(tcb, { ...ctx, os: 'ios', native: true, pt: 123 });
  assert.equal(sheet.via, 'sheet');
  assert.deepEqual(sheet.sheet, { id: 123456789, ct: 'tca-tcb-crashcam-15', pt: 123 });
  assert.equal(sheet.url, 'itms-apps://apps.apple.com/app/id123456789?pt=123&ct=tca-tcb-crashcam-15&mt=8');
  assert.equal(storeLink(tcb, { ...ctx, os: 'ios', native: true }).sheet.pt, null);
});

test("the app's own provider token wins; a campaign token is 40 characters at most", () => {
  const l = storeLink({ ...tcb, ios: { id: 1, pt: 999 } }, { os: 'ios', native: true, host: 'tca', creative: 'a-very-long-creative-name-that-goes-on-and-on-and-on', pt: 123 });
  assert.equal(l.sheet.pt, 999);
  assert.equal(l.sheet.ct.length, 40);
});

test('Android: market:// in an app, https in a browser, the referrer saying where it came from', () => {
  const app = storeLink(tcb, { ...ctx, os: 'android', native: true }), web = storeLink(tcb, { ...ctx, os: 'android' });
  assert.equal(app.via, 'market');
  assert.ok(app.url.startsWith('market://details?id=com.example.gameone&referrer='));
  assert.equal(web.url, app.fallback);
  const referrer = new URLSearchParams(new URL(web.url).searchParams.get('referrer'));
  assert.deepEqual(Object.fromEntries(referrer), { utm_source: 'tca', utm_medium: 'house', utm_campaign: 'tcb-crashcam-15', utm_content: 'tcb-crashcam-15', utm_term: 'saveMe' });
});

test('the installed game reads back the campaign of the ad it came from, and nothing of any other install', () => {
  const referrer = l => new URL(l.fallback).searchParams.get('referrer');   // as Google Play hands it to the game: decoded once
  assert.equal(campaignOf(referrer(storeLink(tcb, { ...ctx, os: 'android', native: true, campaign: 'starter50' }))), 'starter50');
  assert.equal(campaignOf(referrer(storeLink(tcb, { ...ctx, os: 'android', campaign: 'half off/now' }))), 'half off/now');
  assert.equal(campaignOf(referrer(storeLink(tcb, { ...ctx, os: 'android' }))), 'tcb-crashcam-15');   // no campaign: the creative's id
  assert.equal(campaignOf('utm_source=google-play&utm_medium=organic'), null);
  assert.equal(campaignOf('utm_source=x&utm_medium=cpc&utm_campaign=someone-elses'), null);
  for (const nothing of [null, undefined, '', 42]) assert.equal(campaignOf(nothing), null);
});

test("a partner's tracking link comes first, its macros filled; one per store, or one for both", () => {
  const one = { ...tcb, tracking: 'https://app.adjust.com/abc?campaign={campaign}&creative={creative}&site={host}_{placement}' };
  assert.deepEqual(storeLink(one, { ...ctx, os: 'ios', native: true, campaign: 'launch week' }),
    { via: 'tracking', url: 'https://app.adjust.com/abc?campaign=launch%20week&creative=tcb-crashcam-15&site=tca_saveMe' });
  const perStore = { ...tcb, tracking: { android: 'https://t.example/{host}' } };
  assert.equal(storeLink(perStore, { ...ctx, os: 'android' }).url, 'https://t.example/tca');
  assert.equal(storeLink(perStore, { ...ctx, os: 'ios' }).via, 'https');
});

test('not on that store: no link', () => {
  assert.equal(storeLink({ name: 'x', ios: { id: 1 } }, { ...ctx, os: 'android' }), null);
  assert.equal(storeLink({ name: 'x', android: { package: 'a.b' } }, { ...ctx, os: 'ios' }), null);
});

test('the button: free, paid (never a price), and a pre-order until its release', () => {
  assert.equal(cta(tcb, 'ios'), 'Play free');
  assert.equal(cta({ price: 'paid' }, 'android'), 'Get it');
  const soon = { price: 'free', status: 'preorder', release: '2027-02-01' };
  assert.equal(cta(soon, 'ios', Date.parse('2027-01-31')), 'Pre-order');
  assert.equal(cta(soon, 'android', Date.parse('2027-01-31')), 'Pre-register');
  assert.equal(cta(soon, 'ios', Date.parse('2027-02-01')), 'Play free');
  assert.equal(cta({ price: 'free', status: 'preorder' }, 'ios'), 'Pre-order');
});

test("a game with a page of its own: the page where it isn't on the store, the store where it is", () => {
  const proto = { name: 'Prototype', web: { url: 'https://studio.example/playtest?from={host}&ad={creative}', label: 'playtest' } };
  for (const os of ['ios', 'android', 'web']) assert.deepEqual(storeLink(proto, { ...ctx, os, native: true }), { via: 'web', url: 'https://studio.example/playtest?from=tca&ad=tcb-crashcam-15' });
  assert.equal(cta(proto, 'ios'), 'Join the playtest');
  assert.equal(cta({ web: { url: 'https://x.example' } }, 'android'), 'Learn more');
  assert.equal(cta({ web: { url: 'https://x.example', label: 'Free money' } }, 'android'), 'Learn more', "a label that isn't one of the player's own");
  assert.equal(cta(proto, 'ios', 0, { playtest: 'Rejoindre le playtest' }), 'Rejoindre le playtest');
  const half = { name: 'x', price: 'free', ios: { id: 1 }, web: { url: 'https://x.example', label: 'signUp' } };
  assert.equal(storeLink(half, { ...ctx, os: 'ios' }).via, 'https'); assert.equal(cta(half, 'ios'), 'Play free');
  assert.equal(storeLink(half, { ...ctx, os: 'android' }).via, 'web'); assert.equal(cta(half, 'android'), 'Sign up');
});

test("the button's words are of the link chosen: a tracking link is no page of the game's own", () => {
  const app = { name: 'x', price: 'free', web: { url: 'https://x.example', label: 'signUp' }, tracking: 'https://t.example/c' }, link = storeLink(app, { ...ctx, os: 'ios' });
  assert.equal(link.via, 'tracking'); assert.equal(cta(app, 'ios', 0, undefined, link), 'Play free');
  assert.equal(cta(app, 'ios', 0, undefined, { via: 'web', url: app.web.url }), 'Sign up');
});
