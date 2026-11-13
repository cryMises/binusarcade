/* Binus Arcade i18n.
 *
 * Indonesian is the default UI language; English is the source copy.
 * Every dictionary is keyed by the English source string, so an untranslated
 * string still renders (in English) instead of showing a raw key.
 *
 *   t("Library")                       -> "Pustaka"        (id)
 *   t("{n} saves", { n: 4 })           -> "4 simpanan"
 *
 * Translations live in js/locales/id-*.js, one file per area, so views can
 * be worked on independently.
 */

import core from "./locales/id-core.js";
import home from "./locales/id-home.js";
import library from "./locales/id-library.js";
import detail from "./locales/id-detail.js";
import profile from "./locales/id-profile.js";
import register from "./locales/id-register.js";

export const LANG_KEY = "binusarcade.lang";
export const DEFAULT_LOCALE = "id";
export const LOCALES = ["id", "en"];

const DICTIONARIES = {
  id: Object.assign({}, core, home, library, detail, profile, register),
};

const INTL_TAGS = { id: "id-ID", en: "en-GB" };
const HTML_TAGS = { id: "id", en: "en" };
const NATIVE_LABELS = { id: "Indonesia", en: "English" };

function storedLocale() {
  try {
    const value = localStorage.getItem(LANG_KEY);
    return LOCALES.includes(value) ? value : DEFAULT_LOCALE;
  } catch {
    return DEFAULT_LOCALE;
  }
}

let current = DEFAULT_LOCALE;

export function locale() {
  return current;
}

export function intlLocale() {
  return INTL_TAGS[current] || INTL_TAGS.en;
}

export function htmlLang() {
  return HTML_TAGS[current] || "id";
}

/* "Indonesia" / "English", always in the language's own words. */
export function nativeLabel(code = current) {
  return NATIVE_LABELS[code] || NATIVE_LABELS[DEFAULT_LOCALE];
}

function interpolate(text, params) {
  const source = String(text ?? "");
  if (!params) return source;
  return source.replace(/\{(\w+)\}/g, (match, key) => {
    const value = params[key];
    return value === undefined || value === null ? match : String(value);
  });
}

/* Translate an English source string. Unknown strings fall back to English. */
export function t(source, params) {
  const dict = DICTIONARIES[current];
  const text =
    dict && Object.prototype.hasOwnProperty.call(dict, source) ? dict[source] : source;
  return interpolate(text, params);
}

/* Plural helper: tn(count, "1 save", "{n} saves", { n: count }) */
export function tn(count, one, many, params) {
  return t(count === 1 ? one : many, { ...params, n: count });
}

export function applyDocumentLang() {
  document.documentElement.lang = htmlLang();
  document.documentElement.dataset.lang = current;
}

export function setLocale(next) {
  const value = LOCALES.includes(next) ? next : DEFAULT_LOCALE;
  if (value === current) return current;
  current = value;
  try {
    localStorage.setItem(LANG_KEY, value);
  } catch {
    /* storage may be unavailable; the in-memory choice still applies */
  }
  applyDocumentLang();
  window.dispatchEvent(new CustomEvent("binusarcade:lang", { detail: { locale: value } }));
  return value;
}

export function initI18n() {
  current = storedLocale();
  applyDocumentLang();
  return current;
}

/* Number/date formatting helpers that follow the active language. */
export function formatNumber(value, options) {
  try {
    return new Intl.NumberFormat(intlLocale(), options).format(Number(value) || 0);
  } catch {
    return String(value ?? "");
  }
}
