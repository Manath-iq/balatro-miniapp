// Passengers built around Стаж (hand mastery) and hand size.
import type { PassengerDef } from '../defs';

export const MASTERY: PassengerDef[] = [
  {
    id: 'student',
    code: 11,
    v1: true,
    rarity: 'U',
    price: 6,
    onAfterHand(fx, h) {
      fx.xp(h.type, 1);
    },
  },
  {
    id: 'professor',
    code: 12,
    v1: true,
    rarity: 'R',
    price: 8,
    onHand: (h) => ({ x: [10 + h.level, 10] }),
  },
  {
    id: 'twins',
    code: 13,
    v1: true,
    rarity: 'C',
    price: 4,
    onRetrig(h, c) {
      if (h.type !== 1 && h.type !== 2) return 0;
      const red = c.suit === 1 || c.suit === 2;
      return h.scoring.some((o) => o !== c && o.rank === c.rank && (o.suit === 1 || o.suit === 2) === red)
        ? 1
        : 0;
    },
  },
  {
    id: 'minimalist',
    code: 15,
    v1: true,
    rarity: 'C',
    price: 4,
    onHand: (h) => (h.played.length <= 2 ? { t: 2 * h.baseT } : undefined),
  },
];
