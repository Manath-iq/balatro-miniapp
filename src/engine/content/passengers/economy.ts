// Passengers that make or save жетоны.
import type { PassengerDef } from '../defs';

export const ECONOMY: PassengerDef[] = [
  {
    id: 'dacha',
    code: 18,
    v1: true,
    rarity: 'C',
    price: 4,
    onStopEnd(fx, info) {
      if (info.discardsUsed === 0) fx.tokens(2);
    },
  },
  {
    id: 'seedGranny',
    code: 19,
    v1: true,
    rarity: 'C',
    price: 4,
    onKiosk(k) {
      k.freeShifts += 1;
    },
  },
  {
    id: 'bottleCollector',
    code: 21,
    v1: true,
    rarity: 'C',
    price: 4,
    onCardRemoved(fx) {
      fx.tokens(3);
    },
  },
];
