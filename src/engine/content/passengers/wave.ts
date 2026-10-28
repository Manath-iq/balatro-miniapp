// Passengers that reward Зелёная волна (streaks) and escalation.
import type { PassengerDef } from '../defs';

export const WAVE_P: PassengerDef[] = [
  {
    id: 'signalman',
    code: 23,
    v1: true,
    rarity: 'C',
    price: 4,
    onHand: (h) => (h.waveStep > 0 ? { n: Math.min(3 * h.waveStep, 12) } : undefined),
  },
  {
    id: 'stairClimber',
    code: 24,
    v1: true,
    rarity: 'U',
    price: 6,
    onHand: (h) => (h.prevType >= 0 && h.type > h.prevType ? { x: [3, 2] } : undefined),
  },
];
