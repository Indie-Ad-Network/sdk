// ---------- which language ----------
// The player's own words (strings/, as core/strings.js) in the language the player is
// playing in. That is the host game's to say if it has a language setting of its own
// (`lang`), and the device's if it doesn't.
//
// A game often knows the language and not the region ("es"), and the region matters: Spain's
// Spanish isn't Mexico's. So a host's bare language is filled out from the device's list when
// the device has the same language with a region ("es" + a device in es-MX → es-MX).
//
// Pure: tags in, a key of STRINGS out.
import { STRINGS } from './strings.js';

export const RTL = ['ar'];
const HANT = ['tw', 'hk', 'mo'];
const OLD = { in: 'id', iw: 'he', ji: 'yi' };   // codes Java still gives

// 'pt_BR', 'zh-Hant-TW' → { language, script, region }, lower case; null if it isn't a tag
export function parse(tag) {
  const parts = String(tag ?? '').trim().replace(/_/g, '-').toLowerCase().split('-');
  if (!/^[a-z]{2,3}$/.test(parts[0])) return null;
  const out = { language: OLD[parts[0]] ?? parts[0], script: '', region: '' };
  for (const p of parts.slice(1)) {
    if (/^[a-z]{4}$/.test(p)) out.script = p;
    else if (/^([a-z]{2}|\d{3})$/.test(p)) out.region = p;
  }
  return out;
}

// One tag → the key of `have` (STRINGS) that suits it, or null.
export function match(tag, have = STRINGS) {
  const t = parse(tag);
  if (!t) return null;
  const { language, script, region } = t;
  let want;
  if (language === 'zh') want = script === 'hant' || (!script && HANT.includes(region)) ? 'zh-Hant' : 'zh-Hans';
  else if (language === 'es') want = region && region !== 'es' ? 'es-419' : 'es';          // every Spanish but Spain's is Latin America's
  else if (language === 'pt') want = region && region !== 'br' ? 'pt-PT' : 'pt';          // Portugal's, and Africa's which follows it; bare "pt" is Brazil's
  else want = language;
  if (have[want]) return want;
  return have[want.split('-')[0]] ? want.split('-')[0] : null;
}

// The tags to try, in order. `host` is the game's language, if it says ('fr', 'es', 'zh-Hant');
// `device` the device's list (navigator.languages).
export function preferred(host, device = []) {
  const h = parse(host);
  if (!h) return [...device];
  if (h.region || h.script) return [host];
  const fuller = device.find(d => { const p = parse(d); return p?.language === h.language && (p.region || p.script); });
  return fuller ? [fuller, host] : [host];
}

// → { locale, lang (for the page's lang attribute), rtl, t: every string, in that language as far as it goes }
export function stringsFor(host, device = [], have = STRINGS) {
  let locale = 'en';
  for (const tag of preferred(host, device)) { const m = match(tag, have); if (m) { locale = m; break; } }
  const parent = locale.includes('-') && have[locale.split('-')[0]] ? locale.split('-')[0] : null;
  return { locale, lang: locale, rtl: RTL.includes(locale.split('-')[0]), t: { ...have.en, ...(parent && have[parent]), ...have[locale] } };
}

// A catalogue's text that may be one string for everyone or { en: '…', fr: '…', 'es-419': '…' }:
// the one for this locale, then its language's, then English, then any.
export function localised(text, locale) {
  if (text == null || typeof text === 'string') return text ?? null;
  const keys = Object.keys(text), by = k => keys.find(x => x.toLowerCase() === k.toLowerCase());
  const key = by(locale) ?? keys.find(k => match(k, { [locale]: 1, [locale.split('-')[0]]: 1 }) === locale) ?? by(locale.split('-')[0]) ?? by('en') ?? keys[0];
  return key ? String(text[key]) : null;
}

export const say = (template, vars) => String(template).replace(/\{(\w+)\}/g, (_, k) => vars?.[k] ?? '');
