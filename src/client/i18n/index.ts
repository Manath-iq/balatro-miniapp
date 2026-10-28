// i18n contract (FROZEN, M1). Each owner adds its own namespace files i18n/{ru,en}/<ns>.ts exporting a flat
// Record<string, string>, and registers them here (orchestrator only). Placeholders: {name}.
import type { Lang } from '../platform/tg';
import enContent from './en/content';
import enCore from './en/core';
import enGame from './en/game';
import enPassengers from './en/passengers';
import enUiDom from './en/ui-dom';
import ruContent from './ru/content';
import ruCore from './ru/core';
import ruGame from './ru/game';
import ruPassengers from './ru/passengers';
import ruUiDom from './ru/ui-dom';

export type Dict = Readonly<Record<string, string>>;

const dicts: Record<Lang, Dict[]> = {
  ru: [ruCore, ruGame, ruPassengers, ruContent, ruUiDom],
  en: [enCore, enGame, enPassengers, enContent, enUiDom],
};

let current: Lang = 'ru';

export function setLang(lang: Lang): void {
  current = lang;
}

export function getLang(): Lang {
  return current;
}

function lookup(lang: Lang, key: string): string | undefined {
  for (const d of dicts[lang]) {
    const v = d[key];
    if (v !== undefined) return v;
  }
  return undefined;
}

/** Translate; falls back to Russian, then to the key itself. */
export function t(key: string, vars?: Readonly<Record<string, string | number>>): string {
  const raw = lookup(current, key) ?? lookup('ru', key) ?? key;
  if (!vars) return raw;
  return raw.replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? String(vars[name]) : m));
}

/** All keys per language (for parity tests). */
export function keysOf(lang: Lang): Set<string> {
  const out = new Set<string>();
  for (const d of dicts[lang]) for (const k of Object.keys(d)) out.add(k);
  return out;
}
