// Passengers around the Форсаж gauge and blowouts.
import type { PassengerDef } from '../defs';

export const OVERDRIVE: PassengerDef[] = [
  {
    id: 'electrician',
    code: 26,
    v1: true,
    rarity: 'C',
    price: 4,
    onCard: () => ({ sparks: 2 }),
    onHand: () => ({ t: 10 }),
  },
  {
    id: 'fuseGrandpa',
    code: 27,
    v1: true,
    rarity: 'U',
    price: 6,
    stateSize: 1,
    onBlowout(fx, me) {
      if (me.s[0] === fx.s.stopNo) return false;
      me.s[0] = fx.s.stopNo;
      fx.setGauge(50);
      return true;
    },
  },
  {
    id: 'powerEngineer',
    code: 28,
    v1: true,
    rarity: 'R',
    price: 8,
    rules(r) {
      r.odDen = 70;
    },
  },
  {
    id: 'adrenaline',
    code: 30,
    v1: true,
    rarity: 'C',
    price: 4,
    onHand: (h) => (h.gaugeBefore >= 10 ? { n: Math.floor(h.gaugeBefore / 10) } : undefined),
  },
];
