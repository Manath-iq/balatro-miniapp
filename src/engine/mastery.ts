import { HANDS, XP_STEP, XP_THRESHOLDS } from './content/balance';
import type { HandType } from './types';

export function levelOf(xp: number): number {
  let level = 1;
  for (const th of XP_THRESHOLDS) if (xp >= th) level++;
  const last = XP_THRESHOLDS[XP_THRESHOLDS.length - 1]!;
  if (xp >= last) level += Math.floor((xp - last) / XP_STEP);
  return level;
}

export function handBase(type: HandType, level: number): { t: number; n: number } {
  const h = HANDS[type]!;
  return { t: h.t + (level - 1) * h.dt, n: h.n + (level - 1) * h.dn };
}
