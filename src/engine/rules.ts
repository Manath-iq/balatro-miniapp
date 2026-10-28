// Base rules from balance. E-core builds the per-hand rules on top of this (driver → condition → grade → seats → boss).
import { ECON, GAUGE, SHOP, STOP, WAVE } from './content/balance';
import type { Rules } from './content/defs';

export function baseRules(): Rules {
  return {
    odMin: GAUGE.odMin,
    odDen: GAUGE.odDen,
    odAlways: false,
    blowAt: GAUGE.blowAt,
    sparkMul: [1, 1],
    gaugeCools: true,
    nCap: null,
    handsPerStop: STOP.hands,
    discardsPerStop: STOP.discards,
    handSize: STOP.handSize,
    conveyorSlots: SHOP.slots,
    piggyBonus: ECON.piggyBonus,
    piggyCap: ECON.piggyCap,
    wavePer: WAVE.per,
    waveMax: WAVE.max,
    masteryFlat: false,
    xpMul: 1,
    sellFull: false,
  };
}
