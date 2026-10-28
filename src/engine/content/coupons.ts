// Талоны: one-shot consumables kept in the 2-slot pocket.
import type { CouponDef } from './defs';

export const COUPONS: CouponDef[] = [
  {
    id: 'copper',
    code: 1,
    v1: true,
    price: 3,
    when: 'any',
    target: { k: 'cards', min: 1, max: 2 },
    apply(fx, t) {
      for (const uid of t.uids) fx.punch(uid, 1);
    },
  },
  {
    id: 'neon',
    code: 2,
    v1: true,
    price: 3,
    when: 'any',
    target: { k: 'cards', min: 1, max: 1 },
    apply(fx, t) {
      for (const uid of t.uids) fx.punch(uid, 2);
    },
  },
  {
    id: 'scrap',
    code: 5,
    v1: true,
    price: 3,
    when: 'any',
    target: { k: 'cards', min: 1, max: 2 },
    apply(fx, t) {
      for (const uid of t.uids) fx.removeCard(uid);
    },
  },
  {
    id: 'photocopy',
    code: 6,
    v1: true,
    price: 3,
    when: 'any',
    target: { k: 'cards', min: 1, max: 1 },
    apply(fx, t) {
      const c = fx.s.deck.find((x) => x.uid === t.uids[0]);
      if (c) fx.addCard({ rank: c.rank, suit: c.suit, punch: c.punch });
    },
  },
  {
    id: 'transfer',
    code: 7,
    v1: true,
    price: 3,
    when: 'stop',
    target: { k: 'none' },
    apply(fx) {
      fx.waveShield(2);
    },
  },
  {
    id: 'lectureNotes',
    code: 8,
    v1: true,
    price: 3,
    when: 'any',
    target: { k: 'hand' },
    apply(fx, t) {
      if (t.hand !== undefined) fx.xp(t.hand, 4);
    },
  },
  {
    id: 'extinguisher',
    code: 10,
    v1: true,
    price: 3,
    when: 'stop',
    target: { k: 'none' },
    apply(fx) {
      fx.setGauge(0);
      if ((fx.s.stop?.blowouts ?? 0) > 0) fx.hands(1);
      else fx.discards(1);
    },
  },
  {
    id: 'spareTicket',
    code: 12,
    v1: true,
    price: 4,
    when: 'stop',
    target: { k: 'none' },
    apply(fx) {
      fx.hands(1);
    },
  },
];
