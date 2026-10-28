// Passengers that care about where they sit in the Салон.
import type { PassengerDef } from '../defs';

export const CABIN: PassengerDef[] = [
  {
    id: 'accordionist',
    code: 36,
    v1: true,
    rarity: 'U',
    price: 6,
    onHand: (_h, me) => (me.neighbors.length > 0 ? { x: [10 + me.neighbors.length, 10] } : undefined),
  },
];
