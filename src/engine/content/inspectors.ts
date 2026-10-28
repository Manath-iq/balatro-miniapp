// Контролёры: boss rule-twists for stops 4, 8, 12 and ring bosses.
import type { InspectorDef } from './defs';

export const INSPECTORS: InspectorDef[] = [
  {
    id: 'auditor',
    code: 1,
    v1: true,
    tier: 'line',
    cardT: (c, t) => (c.punch === 0 ? Math.floor(t / 2) : t),
    onAfterHand(fx, h, st) {
      const paid = st.bossState[1] ?? 0;
      const punched = h.scoring.filter((c) => c.punch !== 0).length;
      const pay = Math.min(punched, 3 - paid);
      if (pay > 0) {
        st.bossState[1] = paid + pay;
        fx.tokens(pay);
      }
    },
  },
  {
    id: 'conductress',
    code: 3,
    v1: true,
    tier: 'line',
    onAfterHand(fx) {
      fx.rotateSeats();
    },
  },
  {
    id: 'blackIce',
    code: 4,
    v1: true,
    tier: 'line',
    rules(r) {
      r.sparkMul = [2, 1];
    },
    onStopStart(fx) {
      fx.setGauge(50);
    },
  },
  {
    id: 'blackout',
    code: 5,
    v1: true,
    tier: 'line',
    rules(r) {
      r.odMin = 1000000;
      r.nCap = 10;
    },
  },
  {
    id: 'shiftChange',
    code: 6,
    v1: true,
    tier: 'line',
    rules(r) {
      r.masteryFlat = true;
      r.xpMul = 2;
    },
  },
  {
    id: 'trackWorks',
    code: 7,
    v1: true,
    tier: 'line',
    onStopStart(fx, st) {
      st.bossState[0] = fx.rng.range(2, 14);
    },
    onAfterHand(fx, _h, st) {
      st.bossState[0] = fx.rng.range(2, 14);
    },
    cardT: (c, t, _h, st) => (c.rank === st.bossState[0] ? 0 : t),
    cardSparks: (c, _h, st) => (c.rank === st.bossState[0] ? 6 : 0),
  },
  {
    id: 'depotChief',
    code: 21,
    v1: true,
    tier: 'final',
    onAfterHand(fx, _h, st) {
      fx.target((st.target * 23n) / 20n);
    },
  },
  {
    id: 'lastTram',
    code: 22,
    v1: true,
    tier: 'final',
    rules(r) {
      r.handsPerStop = 3;
      r.discardsPerStop = 0;
      r.odAlways = true;
      r.odMin = 0;
      r.sparkMul = [3, 2];
    },
  },
];
