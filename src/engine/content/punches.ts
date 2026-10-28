// Пробивки: permanent card upgrades (one per card).
import type { PunchDef } from './defs';

export const PUNCHES: PunchDef[] = [
  { id: 'copper', code: 1, v1: true, onScore: () => ({ t: 5, sparks: 3 }) },
  { id: 'neon', code: 2, v1: true, onScore: () => ({ n: 2 }) },
  { id: 'doublePunch', code: 3, v1: true, retrig: 1 },
  {
    id: 'capacitor',
    code: 4,
    v1: true,
    onScore: (c) => (c.charge ? { t: c.charge } : undefined),
    afterHandHeld(fx, c) {
      fx.charge(c.uid, Math.min(c.charge + 3, 15));
    },
    onPlayed(fx, c) {
      fx.charge(c.uid, 0);
    },
  },
];
