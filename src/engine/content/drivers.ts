// Водители (starting characters). See docs/engine-contract.md §12.
import type { DriverDef } from './defs';

const ALL_HANDS_LEVEL_2 = (xp: number[]): void => {
  for (let i = 0; i < xp.length; i++) xp[i] = Math.max(xp[i] ?? 0, 2);
};

export const DRIVERS: DriverDef[] = [
  {
    id: 'petya',
    code: 1,
    v1: true,
    seats: 6,
    setup(s) {
      s.gauge = 30;
    },
  },
  {
    id: 'valya',
    code: 2,
    v1: true,
    seats: 5,
    setup(s) {
      ALL_HANDS_LEVEL_2(s.mastery.xp);
    },
  },
];
