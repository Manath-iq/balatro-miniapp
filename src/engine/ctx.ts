// Execution context shared by the engine modules: event sink, rules, seat contexts and the Fx implementation.
import { mustCard } from './cards';
import type { Fx, KioskRules, Rules, SeatCtx } from './content/defs';
import { condition, driver, inspector, passenger } from './content/registry';
import type { GameEvent, Src } from './events';
import { levelOf } from './mastery';
import { type Rng, stream, Tag } from './rng';
import { baseRules } from './rules';
import type { HandType, RunState, StopKind } from './types';

export interface Ctx {
  s: RunState;
  /** null when events are off (replay). */
  ev: GameEvent[] | null;
  /** Continuation after a cleared stop (set by run.ts to avoid an import cycle). */
  next?: (kind: StopKind) => void;
}

export function emit(ctx: Ctx, e: GameEvent): void {
  ctx.ev?.push(e);
}

export function buildRules(s: RunState): Rules {
  const r = baseRules();
  driver(s.driver).rules?.(r);
  if (s.condition) condition(s.condition).rules?.(r);
  for (let i = 0; i < s.cabin.length; i++) {
    const seat = s.cabin[i];
    if (seat) passenger(seat.code).rules?.(r, seatCtx(s, i));
  }
  if (s.stop?.boss) inspector(s.stop.boss).rules?.(r);
  return r;
}

export function kioskRules(s: RunState): KioskRules {
  const k: KioskRules = { freeShifts: 0, priceDelta: 0 };
  for (let i = 0; i < s.cabin.length; i++) {
    const seat = s.cabin[i];
    if (seat) passenger(seat.code).onKiosk?.(k, seatCtx(s, i));
  }
  return k;
}

/** Occupied orthogonal neighbours on the 3-wide cabin grid. */
export function neighbors(s: RunState, i: number): number[] {
  const out: number[] = [];
  const n = s.cabin.length;
  const col = i % 3;
  if (col > 0 && s.cabin[i - 1]) out.push(i - 1);
  if (col < 2 && i + 1 < n && s.cabin[i + 1]) out.push(i + 1);
  if (i - 3 >= 0 && s.cabin[i - 3]) out.push(i - 3);
  if (i + 3 < n && s.cabin[i + 3]) out.push(i + 3);
  return out;
}

export function seatCtx(s: RunState, i: number): SeatCtx {
  const seat = s.cabin[i];
  if (!seat) throw new Error(`seat ${i} empty`);
  return { seat: i, neighbors: neighbors(s, i), s: seat.s };
}

export function seatCodes(s: RunState): (number | null)[] {
  return s.cabin.map((x) => (x ? x.code : null));
}

export function addTokens(ctx: Ctx, n: number, src: Src): void {
  const s = ctx.s;
  const before = s.tokens;
  s.tokens = Math.max(0, s.tokens + n);
  emit(ctx, { e: 'tokens', add: s.tokens - before, total: s.tokens, src });
}

export function setGauge(ctx: Ctx, g: number, src: Src): void {
  const s = ctx.s;
  const max = buildRules(s).blowAt - 1;
  s.gauge = Math.max(0, Math.min(g, max));
  emit(ctx, { e: 'gauge', gauge: s.gauge, src });
}

export function addXp(ctx: Ctx, hand: HandType, n: number, src: Src): void {
  const m = ctx.s.mastery;
  const before = levelOf(m.xp[hand]!);
  m.xp[hand] = m.xp[hand]! + n;
  const level = levelOf(m.xp[hand]!);
  emit(ctx, { e: 'xp', hand, add: n, xp: m.xp[hand]!, level, levelUp: level > before, src });
}

export function emitCounters(ctx: Ctx): void {
  const st = ctx.s.stop;
  if (st) emit(ctx, { e: 'counters', hands: st.hands, discards: st.discards });
}

const without = (arr: number[], uid: number): number[] => arr.filter((x) => x !== uid);

/** Removes a card from the deck (and the current stop's piles), firing onCardRemoved hooks. */
export function removeCard(ctx: Ctx, uid: number): void {
  const s = ctx.s;
  const card = mustCard(s, uid);
  s.deck = s.deck.filter((c) => c.uid !== uid);
  if (s.stop) {
    s.stop.hand = without(s.stop.hand, uid);
    s.stop.draw = without(s.stop.draw, uid);
    s.stop.spent = without(s.stop.spent, uid);
  }
  emit(ctx, { e: 'cardRemoved', uid });
  for (let i = 0; i < s.cabin.length; i++) {
    const seat = s.cabin[i];
    if (seat) passenger(seat.code).onCardRemoved?.(seatFx(ctx, i), card, seatCtx(s, i));
  }
}

export const seatRng = (s: RunState, i: number): Rng =>
  stream(s.cfg.seed, Tag.SEAT, s.stopNo * 16 + i, s.stop?.handNo ?? 255);

export const seatFx = (ctx: Ctx, i: number): Fx => makeFx(ctx, seatRng(ctx.s, i), { k: 'seat', i });

export const bossFx = (ctx: Ctx, code: number): Fx =>
  makeFx(ctx, stream(ctx.s.cfg.seed, Tag.BOSS, ctx.s.stopNo, ctx.s.stop?.handNo ?? 255), { k: 'boss', code });

export function makeFx(ctx: Ctx, rng: Rng | null, src: Src): Fx {
  const s = ctx.s;
  return {
    s,
    get rng(): Rng {
      if (!rng) throw new Error('no rng bound for this hook');
      return rng;
    },
    tokens: (n) => addTokens(ctx, n, src),
    xp: (hand, n) => addXp(ctx, hand, n, src),
    sparks: (n) => setGauge(ctx, s.gauge + n, src),
    setGauge: (g) => setGauge(ctx, g, src),
    hands(n) {
      if (!s.stop) return;
      s.stop.hands = Math.max(0, s.stop.hands + n);
      emitCounters(ctx);
    },
    discards(n) {
      if (!s.stop) return;
      s.stop.discards = Math.max(0, s.stop.discards + n);
      emitCounters(ctx);
    },
    punch(uid, p) {
      mustCard(s, uid).punch = p;
      emit(ctx, { e: 'cardChanged', uid });
    },
    suit(uid, suit) {
      mustCard(s, uid).suit = suit;
      emit(ctx, { e: 'cardChanged', uid });
    },
    charge(uid, value) {
      const c = mustCard(s, uid);
      if (c.charge === value) return;
      c.charge = value;
      emit(ctx, { e: 'cardChanged', uid });
    },
    addCard(c) {
      const uid = s.nextUid++;
      s.deck.push({ uid, rank: c.rank, suit: c.suit, punch: c.punch, charge: 0 });
      emit(ctx, { e: 'cardAdded', uid });
      return uid;
    },
    removeCard: (uid) => removeCard(ctx, uid),
    target(next) {
      if (!s.stop) return;
      s.stop.target = next;
      emit(ctx, { e: 'target', target: next, src });
    },
    waveShield(n) {
      if (s.stop) s.stop.waveShield = n;
    },
    rotateSeats() {
      const last = s.cabin[s.cabin.length - 1] ?? null;
      for (let i = s.cabin.length - 1; i > 0; i--) s.cabin[i] = s.cabin[i - 1] ?? null;
      s.cabin[0] = last;
      emit(ctx, { e: 'seats', codes: seatCodes(s) });
    },
  };
}
