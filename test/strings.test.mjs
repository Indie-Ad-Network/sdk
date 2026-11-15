import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { STRINGS } from '../core/strings.js';
import { match, preferred, stringsFor, localised, say } from '../core/locale.js';
import { build } from '../tools/build-strings.mjs';
import { cta } from '../core/storeLinks.js';
import { eligible } from '../core/pick.js';
import { validate } from '../core/catalogue.js';

const KEYS = Object.keys(STRINGS.en).sort();
const holes = s => [...String(s).matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort();
const isRegion = id => id.includes('-') && !!STRINGS[id.split('-')[0]];   // es-419 over es; not zh-Hans, which has no zh under it

test('core/strings.js is what strings/*.json say', () => {
  assert.equal(readFileSync(new URL('../core/strings.js', import.meta.url), 'utf8'), build(), 'run tools/build-strings.mjs');
});

test('every language has every string; a region of one has only strings that exist', () => {
  for (const [id, t] of Object.entries(STRINGS)) {
    if (isRegion(id)) assert.deepEqual(Object.keys(t).filter(k => !KEYS.includes(k)), [], `${id}: unknown keys`);
    else assert.deepEqual(Object.keys(t).sort(), KEYS, id);
    for (const [k, v] of Object.entries(t)) {
      assert.ok(typeof v === 'string' && v.trim(), `${id}.${k} is empty`);
      assert.deepEqual(holes(v), holes(STRINGS.en[k]), `${id}.${k}: its {placeholders} aren't the original's`);
    }
  }
});

test("every language our games are played in is here", () => {
  const tcb = ['en', 'fr', 'it', 'de', 'es', 'pl', 'zh-Hans', 'ja', 'ko', 'pt', 'ru', 'uk', 'id', 'hi', 'zh-Hant'];
  const pr = ['ar', 'zh-CN', 'en', 'fr', 'de', 'it', 'ja', 'ko', 'es', 'sv', 'th', 'tr'];
  for (const tag of [...tcb, ...pr]) assert.notEqual(stringsFor(tag).locale === 'en' && !tag.startsWith('en'), true, tag);
});

test('a tag finds its language, and the right region of it', () => {
  const cases = { 'es': 'es', 'es-ES': 'es', 'es-MX': 'es-419', 'es_US': 'es-419', 'es-419': 'es-419', 'es-AR': 'es-419',
    'pt': 'pt', 'pt-BR': 'pt', 'pt-PT': 'pt-PT', 'pt-AO': 'pt-PT',
    'zh': 'zh-Hans', 'zh-CN': 'zh-Hans', 'zh-SG': 'zh-Hans', 'zh-TW': 'zh-Hant', 'zh-HK': 'zh-Hant', 'zh-Hant': 'zh-Hant', 'zh-Hans-HK': 'zh-Hans', 'zh-Hant-CN': 'zh-Hant',
    'fr-CA': 'fr', 'en-AU': 'en', 'in-ID': 'id', 'DE': 'de', 'sv-SE': 'sv' };
  for (const [tag, want] of Object.entries(cases)) assert.equal(match(tag), want, tag);
  for (const none of ['xx', 'nb-NO', '', null, '???']) assert.equal(match(none), null);
});

test("the game's language first, its region from the device; the device's when the game doesn't say", () => {
  assert.equal(stringsFor('es', ['en-US', 'es-MX']).locale, 'es-419');   // playing in Spanish, on a Mexican phone
  assert.equal(stringsFor('es', ['en-US']).locale, 'es');
  assert.equal(stringsFor('pt', ['pt-PT']).locale, 'pt-PT');
  assert.equal(stringsFor('fr', ['es-MX']).locale, 'fr');               // the game's setting, not the phone's
  assert.equal(stringsFor('zh-Hant', ['zh-CN']).locale, 'zh-Hant');     // already exact: the device has no say
  assert.equal(stringsFor(null, ['nb-NO', 'pt-PT', 'en']).locale, 'pt-PT');
  assert.equal(stringsFor(null, ['nb-NO']).locale, 'en');
  assert.equal(stringsFor('tlh', ['ja-JP']).locale, 'en');              // a game's language we don't have: English, not the phone's
  assert.deepEqual(preferred('es', ['es-ES', 'es-MX']), ['es-ES', 'es']);
});

test("a region's words over its language's, and English under both", () => {
  const { t } = stringsFor('pt-PT');
  assert.equal(t.keep, STRINGS['pt-PT'].keep);
  assert.equal(t.ad, STRINGS.pt.ad);
  assert.notEqual(stringsFor('es-MX').t.earned, stringsFor('es-ES').t.earned);
  assert.equal(stringsFor('ar').rtl, true);
  assert.equal(stringsFor('fr').rtl, false);
  assert.equal(say(stringsFor('fr').t.earned, { reward: '+3 ♥' }), 'Gagné : +3 ♥');
});

test('the store button, in words', () => {
  const free = { price: 'free' }, soon = { status: 'preorder' };
  assert.equal(cta(free, 'ios'), 'Play free');
  assert.equal(cta(free, 'ios', 0, stringsFor('de').t), 'Gratis spielen');
  assert.equal(cta(soon, 'android', 0, stringsFor('es-MX').t), 'Preinscribirse');
  assert.equal(cta(soon, 'android', 0, stringsFor('es-ES').t), 'Registrarse previamente');
});

test("a catalogue's line: one for everyone, or one per language", () => {
  const line = { en: 'Build it.', es: 'Constrúyelo.', 'es-419': 'Constrúyela.', 'pt-BR': 'Construa.' };
  assert.equal(localised('Same for all', 'fr'), 'Same for all');
  assert.equal(localised(line, 'es-419'), 'Constrúyela.');
  assert.equal(localised(line, 'es'), 'Constrúyelo.');
  assert.equal(localised(line, 'pt'), 'Construa.');        // "pt-BR" is what we call pt
  assert.equal(localised(line, 'pt-PT'), 'Build it.');     // no Portuguese of Portugal's, and none plain: English
  assert.equal(localised({ es: 'Hola' }, 'es-419'), 'Hola');
  assert.equal(localised(line, 'ja'), 'Build it.');
  assert.equal(localised(undefined, 'ja'), null);
});

test('a creative with words in it is for those who read them', () => {
  const catalogue = validate({ apps: { a: { name: 'A', ios: { id: 1 } } }, creatives: [
    { id: 'any', app: 'a', kind: 'video', secs: 15, src: 'a.mp4' }, { id: 'english', app: 'a', kind: 'video', secs: 15, src: 'b.mp4', langs: ['en'] }] });
  const ids = lang => eligible({ catalogue, host: 'h', lang }).map(c => c.id);
  assert.deepEqual(ids('en'), ['any', 'english']);
  assert.deepEqual(ids('zh-Hans'), ['any']);
  assert.deepEqual(ids(null), ['any', 'english']);
});
