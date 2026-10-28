// All tunable numbers. The balance simulator may edit ONLY this file.
import type { Ratio } from '../types';

/** Hand base by HandType: Т/Н at level 1 and per-level increments. */
export const HANDS: readonly { t: number; n: number; dt: number; dn: number }[] = [
  { t: 6, n: 1, dt: 6, dn: 1 }, // 0 Старшая
  { t: 9, n: 1, dt: 8, dn: 1 }, // 1 Пара
  { t: 14, n: 2, dt: 10, dn: 1 }, // 2 Две пары
  { t: 16, n: 3, dt: 12, dn: 1 }, // 3 Тройка
  { t: 26, n: 3, dt: 14, dn: 2 }, // 4 Стрит
  { t: 30, n: 3, dt: 16, dn: 2 }, // 5 Флеш
  { t: 38, n: 4, dt: 18, dn: 2 }, // 6 Фулл-хаус
  { t: 56, n: 5, dt: 24, dn: 2 }, // 7 Каре
  { t: 90, n: 7, dt: 30, dn: 3 }, // 8 Стрит-флеш
  { t: 110, n: 8, dt: 32, dn: 3 }, // 9 Пятерня
  { t: 150, n: 10, dt: 40, dn: 4 }, // 10 Молния
];

/** Hidden hand types: not listed in the UI until first played. */
export const HIDDEN_HANDS: readonly number[] = [9, 10];

/** Cumulative XP needed for levels 2..8; after that every level needs XP_STEP more. */
export const XP_THRESHOLDS: readonly number[] = [2, 5, 9, 14, 20, 27, 35];
export const XP_STEP = 9;
export const XP = { perPlay: 1, overdriveBonus: 1, firstPlayBonus: 1 } as const;

export const STOP = { hands: 4, discards: 3, handSize: 7, playMax: 5, discardMax: 5 } as const;

/** Targets in watts for stops 1..12 (index 0 unused). 4 and 8 are line bosses, 12 is Депо. */
export const TARGETS: readonly bigint[] = [
  0n,
  200n,
  300n,
  450n,
  900n,
  900n,
  1300n,
  1800n,
  3600n,
  3400n,
  4800n,
  6500n,
  10000n,
];
export const BOSS_STOPS: readonly number[] = [4, 8];
export const FINAL_STOP = 12;
export const EXPRESS_TARGET: Ratio = [7, 5];

/** Кольцевая (endless): stop 13+ grows from the Депо target. Every 3rd ring stop is a boss. */
export const RING = {
  growth: [17, 10] as Ratio,
  growthLate: [2, 1] as Ratio,
  lateFrom: 21,
  bossEvery: 3,
  bossMul: [8, 5] as Ratio,
} as const;

export const GAUGE = {
  start: 0,
  odMin: 30,
  odDen: 100,
  blowAt: 100,
  sparkMin: 3,
  sparkMax: 7,
  /** Extra sparks per trigger for В/Д/К/Т. */
  sparkHighRank: 2,
  highRankFrom: 11,
} as const;

export const WAVE = { per: 1, max: 4 } as const;

export const ECON = {
  startTokens: 4,
  income: { normal: 3, express: 5, boss: 6, final: 0, ring: 4, ringBoss: 6 },
  perUnusedHand: 1,
  /** Bonus when the stop total reaches overkillMul × target. */
  overkillMul: 2,
  overkillBonus: 2,
  /** Blowout with no hands left costs tokens instead. */
  blowoutTokens: 3,
  piggyBonus: [1, 2] as Ratio,
  piggyCap: 10,
  piggyBreak: [3, 4] as Ratio,
} as const;

export const SEATS = 6;
export const POCKET = 2;

export const SHOP = {
  slots: 4,
  expressSlots: 5,
  /** Item kind weights: passenger / coupon / punched card. */
  mix: [6, 3, 1] as readonly number[],
  /** Rarity weights C/U/R by line (index 0 = line 1; ring uses the last row). */
  rarityOdds: [
    [70, 27, 3],
    [55, 38, 7],
    [45, 43, 12],
  ] as readonly (readonly number[])[],
  cardPrice: 3,
  workshopPrice: 3,
  scrapPrice: 2,
  /** Shift k (0-based within a visit) costs shiftBase + floor(k / 2). */
  shiftBase: 1,
} as const;

export const REWARD = { offers: 3 } as const;

/** Daily points per cleared stop are capped at this (100 = exactly the target). */
export const DAILY_POINTS_CAP = 300;
