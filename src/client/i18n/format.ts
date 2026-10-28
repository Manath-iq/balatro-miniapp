import { getLang } from './index';

const UNITS = {
  ru: ['Вт', 'кВт', 'МВт', 'ГВт', 'ТВт', 'ПВт', 'ЭВт'],
  en: ['W', 'kW', 'MW', 'GW', 'TW', 'PW', 'EW'],
};

/** 1340 → "1,34 кВт"; three significant digits, then ×10ⁿ beyond exawatts. */
export function formatPower(p: bigint | number): string {
  const lang = getLang();
  const units = UNITS[lang];
  const v = typeof p === 'bigint' ? p : BigInt(Math.max(0, Math.floor(p)));
  if (v < 1000n) return `${v} ${units[0]}`;
  const s = v.toString();
  const tier = Math.floor((s.length - 1) / 3);
  const sep = lang === 'ru' ? ',' : '.';
  if (tier >= units.length) return `${s[0]}${sep}${s.slice(1, 3)}e${s.length - 1} ${units[0]}`;
  const intLen = s.length - tier * 3;
  const frac = s.slice(intLen, 3).replace(/0+$/, '');
  return `${s.slice(0, intLen)}${frac ? sep + frac : ''} ${units[tier]}`;
}

/** Compact integer for Т/Н boxes: 12345 → 12.3k. */
export function formatShort(n: number): string {
  if (n < 10000) return String(n);
  if (n < 1000000) return `${Math.floor(n / 100) / 10}k`;
  return `${Math.floor(n / 100000) / 10}M`;
}

export function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}
