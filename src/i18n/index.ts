/**
 * Minimal i18n. Messages are flat JSON objects in ./locales/<code>.json.
 * Placeholders use {name}. Plurals: keys "<key>_one" / "<key>_other", chosen by params.count.
 * To add a language, see docs/TRANSLATING.md.
 */
import en from './locales/en.json';
import hu from './locales/hu.json';
import de from './locales/de.json';

type Messages = Record<string, string>;

export interface LocaleInfo {
  code: string;
  /** Language name in that language, shown in the picker. */
  name: string;
  messages: Messages;
}

export const LOCALES: LocaleInfo[] = [
  { code: 'en', name: 'English', messages: en as Messages },
  { code: 'hu', name: 'Magyar', messages: hu as Messages },
  { code: 'de', name: 'Deutsch', messages: de as Messages },
];

const FALLBACK = 'en';
let current: LocaleInfo = LOCALES[0];

export function detectLocale(preferred?: string): string {
  const wanted = [preferred, ...(typeof navigator !== 'undefined' ? navigator.languages ?? [] : [])];
  for (const w of wanted) {
    if (!w) continue;
    const base = w.toLowerCase().split('-')[0];
    if (LOCALES.some((l) => l.code === base)) return base;
  }
  return FALLBACK;
}

export function setLocale(code: string): void {
  current = LOCALES.find((l) => l.code === code) ?? LOCALES[0];
  document.documentElement.lang = current.code;
}

export function locale(): string {
  return current.code;
}

export type Params = Record<string, string | number>;

export function t(key: string, params?: Params): string {
  let k = key;
  if (params && typeof params.count === 'number') {
    const rule = new Intl.PluralRules(current.code).select(params.count);
    const candidate = `${key}_${rule}`;
    if (candidate in current.messages || candidate in (LOCALES[0].messages as Messages)) k = candidate;
    else k = `${key}_other`;
  }
  const msg = current.messages[k] ?? (LOCALES[0].messages as Messages)[k] ?? key;
  if (!params) return msg;
  return msg.replace(/\{(\w+)\}/g, (m, name: string) => (name in params ? String(params[name]) : m));
}
