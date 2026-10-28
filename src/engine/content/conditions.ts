// Условия дня (daily route modifiers). See docs/engine-contract.md §12.
import type { ConditionDef } from './defs';

export const CONDITIONS: ConditionDef[] = [
  {
    id: 'noTwos',
    code: 1,
    v1: true,
    setup(s) {
      s.deck = s.deck.filter((c) => c.rank !== 2);
    },
  },
  {
    id: 'narrowBelt',
    code: 2,
    v1: true,
    rules(r) {
      r.conveyorSlots = 3;
    },
  },
  {
    id: 'veteranCrew',
    code: 3,
    v1: true,
    setup(s) {
      for (let i = 0; i < s.mastery.xp.length; i++) s.mastery.xp[i] = Math.max(s.mastery.xp[i] ?? 0, 2);
    },
    targetMul: [6, 5],
  },
  {
    id: 'highVoltage',
    code: 4,
    v1: true,
    setup(s) {
      s.gauge = 50;
    },
    rules(r) {
      r.blowAt = 90;
    },
  },
];
