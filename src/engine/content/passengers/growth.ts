// Passengers that grow permanently during the run.
import type { PassengerDef } from '../defs';

export const GROWTH: PassengerDef[] = [
  {
    id: 'gymRat',
    code: 32,
    v1: true,
    rarity: 'U',
    price: 6,
    stateSize: 1,
    onHand: (_h, me) => (me.s[0] ? { t: me.s[0] } : undefined),
    onAfterHand(_fx, h, _p, me) {
      if (h.scoring.length === 5) me.s[0] = (me.s[0] ?? 0) + 4;
    },
  },
  {
    id: 'veteran',
    code: 34,
    v1: true,
    rarity: 'R',
    price: 8,
    onHand: (h) => {
      const b = h.run.stats.bossesDefeated;
      return b > 0 ? { x: [4 + b, 4] } : undefined;
    },
  },
  {
    id: 'nonstop',
    code: 35,
    v1: true,
    rarity: 'C',
    price: 4,
    stateSize: 1,
    onHand: (_h, me) => (me.s[0] ? { n: me.s[0] } : undefined),
    onStopEnd(_fx, info, me) {
      if (info.discardsUsed === 0) me.s[0] = (me.s[0] ?? 0) + 3;
    },
  },
];
