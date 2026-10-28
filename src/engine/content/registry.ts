// Content registry. FROZEN CONTRACT (M1): content agents fill the imported arrays, never this file.
import { canonical, fnv1a } from '../hash';
import * as balance from './balance';
import { CONDITIONS } from './conditions';
import { COUPONS } from './coupons';
import type { ConditionDef, CouponDef, DriverDef, InspectorDef, PassengerDef, PunchDef } from './defs';
import { DRIVERS } from './drivers';
import { INSPECTORS } from './inspectors';
import { CABIN } from './passengers/cabin';
import { ECONOMY } from './passengers/economy';
import { GROWTH } from './passengers/growth';
import { MASTERY } from './passengers/mastery';
import { OVERDRIVE } from './passengers/overdrive';
import { RANKS } from './passengers/ranks';
import { WAVE_P } from './passengers/wave';
import { PUNCHES } from './punches';

export const PASSENGERS: readonly PassengerDef[] = [
  ...RANKS,
  ...MASTERY,
  ...ECONOMY,
  ...WAVE_P,
  ...OVERDRIVE,
  ...GROWTH,
  ...CABIN,
].sort((a, b) => a.code - b.code);

export { CONDITIONS, COUPONS, DRIVERS, INSPECTORS, PUNCHES };

function byCode<T extends { code: number; id: string }>(kind: string, items: readonly T[]): Map<number, T> {
  const map = new Map<number, T>();
  for (const item of items) {
    if (map.has(item.code)) throw new Error(`duplicate ${kind} code ${item.code} (${item.id})`);
    map.set(item.code, item);
  }
  return map;
}

const passengerMap = byCode('passenger', PASSENGERS);
const couponMap = byCode('coupon', COUPONS);
const punchMap = byCode('punch', PUNCHES);
const inspectorMap = byCode('inspector', INSPECTORS);
const driverMap = byCode('driver', DRIVERS);
const conditionMap = byCode('condition', CONDITIONS);

function get<T>(map: Map<number, T>, kind: string, code: number): T {
  const item = map.get(code);
  if (!item) throw new Error(`unknown ${kind} code ${code}`);
  return item;
}

export const passenger = (code: number): PassengerDef => get(passengerMap, 'passenger', code);
export const coupon = (code: number): CouponDef => get(couponMap, 'coupon', code);
export const punch = (code: number): PunchDef => get(punchMap, 'punch', code);
export const inspector = (code: number): InspectorDef => get(inspectorMap, 'inspector', code);
export const driver = (code: number): DriverDef => get(driverMap, 'driver', code);
export const condition = (code: number): ConditionDef => get(conditionMap, 'condition', code);

/** Content available in v1 runs (shop pools, boss pools, daily conditions). */
export const pools = {
  passengers: PASSENGERS.filter((p) => p.v1),
  coupons: COUPONS.filter((c) => c.v1),
  punches: PUNCHES.filter((p) => p.v1),
  lineBosses: INSPECTORS.filter((i) => i.v1 && i.tier === 'line'),
  finalBosses: INSPECTORS.filter((i) => i.v1 && i.tier === 'final'),
  drivers: DRIVERS.filter((d) => d.v1),
  conditions: CONDITIONS.filter((c) => c.v1),
} as const;

const fingerprint = (items: readonly { id: string; code: number; v1: boolean }[]): string[] =>
  items.map((i) => `${i.code}:${i.id}:${i.v1 ? 1 : 0}`);

/**
 * Changes whenever balance numbers or the content roster change. Written into every action log;
 * the server refuses logs recorded against different content.
 */
export const CONTENT_HASH: number = fnv1a(
  canonical({
    // Sorted explicitly: bundlers order module-namespace keys differently.
    balance: Object.keys(balance)
      .sort()
      .map((k) => [k, (balance as Record<string, unknown>)[k]]),
    passengers: PASSENGERS.map((p) => `${p.code}:${p.id}:${p.v1 ? 1 : 0}:${p.rarity}:${p.price}`),
    coupons: COUPONS.map((c) => `${c.code}:${c.id}:${c.v1 ? 1 : 0}:${c.price}`),
    punches: fingerprint(PUNCHES),
    inspectors: fingerprint(INSPECTORS),
    drivers: fingerprint(DRIVERS),
    conditions: fingerprint(CONDITIONS),
  }),
);
