// Passengers keyed on card ranks and suits.
import type { Card } from '../../types';
import type { PassengerDef } from '../defs';

const red = (c: Card): boolean => c.suit === 1 || c.suit === 2;
/** Мариаж values by suit: ♠ ♥ ♦ ♣. */
const MARRIAGE = [40, 100, 80, 60];

export const RANKS: PassengerDef[] = [
  {
    id: 'zebra',
    code: 1,
    v1: true,
    rarity: 'C',
    price: 4,
    onHand(h) {
      const sc = h.scoring;
      if (sc.length < 3) return undefined;
      for (let i = 1; i < sc.length; i++) if (red(sc[i]!) === red(sc[i - 1]!)) return undefined;
      return { x: [3, 2] };
    },
  },
  {
    id: 'smallChange',
    code: 3,
    v1: true,
    rarity: 'C',
    price: 4,
    onCard: (_h, c) => (c.rank <= 5 ? { t: 2 * c.rank } : undefined),
  },
  {
    id: 'general',
    code: 5,
    v1: true,
    rarity: 'R',
    price: 8,
    onHand: (h) =>
      h.scoring.length >= 3 && h.scoring.every((c) => c.rank >= 11) ? { x: [5, 2] } : undefined,
  },
  {
    id: 'aristocrat',
    code: 7,
    v1: true,
    rarity: 'U',
    price: 6,
    onHand: (h) => (h.scoring.length > 0 && h.scoring.every((c) => c.rank >= 10) ? { n: 6 } : undefined),
  },
  {
    id: 'thousand',
    code: 8,
    v1: true,
    rarity: 'U',
    price: 6,
    onHand(h) {
      let best = 0;
      for (let suit = 0; suit < 4; suit++) {
        const k = h.played.some((c) => c.suit === suit && c.rank === 13);
        const q = h.played.some((c) => c.suit === suit && c.rank === 12);
        if (k && q && MARRIAGE[suit]! > best) best = MARRIAGE[suit]!;
      }
      return best ? { t: best, n: 2 } : undefined;
    },
  },
  {
    id: 'honorStudent',
    code: 9,
    v1: true,
    rarity: 'C',
    price: 4,
    onHand: (h) => (h.scoring.filter((c) => c.rank === 14).length === 1 ? { x: [3, 2] } : undefined),
  },
  {
    id: 'twentyOne',
    code: 10,
    v1: true,
    rarity: 'C',
    price: 4,
    onHand(h) {
      let sum = 0;
      for (const c of h.scoring) sum += c.rank;
      return sum <= 21 ? { n: 8 } : undefined;
    },
  },
];
