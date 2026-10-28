// Test helpers for content hooks: build cards, hand views, seats and a recording Fx without the full engine.
import { type Rng, stream, Tag } from '../rng';
import type { Card, HandType, Rank, RunState, Seat, StopState, Suit } from '../types';
import { HANDS, POCKET, SEATS } from './balance';
import type { Fx, HandView, SeatCtx } from './defs';

let nextUid = 1000;

export function card(rank: Rank, suit: Suit, punch = 0, charge = 0): Card {
  return { uid: nextUid++, rank, suit, punch, charge };
}

const RANKS: Record<string, Rank> = {
  '2': 2,
  '3': 3,
  '4': 4,
  '5': 5,
  '6': 6,
  '7': 7,
  '8': 8,
  '9': 9,
  '10': 10,
  J: 11,
  Q: 12,
  K: 13,
  A: 14,
};
const SUITS: Record<string, Suit> = { S: 0, H: 1, D: 2, C: 3 };

/** cards('AS KH 10D 2C') — ranks 2..10 J Q K A, suits S H D C. */
export function cards(spec: string): Card[] {
  return spec
    .trim()
    .split(/\s+/)
    .map((token) => {
      const rank = RANKS[token.slice(0, -1).toUpperCase()];
      const suit = SUITS[token.slice(-1).toUpperCase()];
      if (rank === undefined || suit === undefined) throw new Error(`bad card "${token}"`);
      return card(rank, suit);
    });
}

export function blankStop(over: Partial<StopState> = {}): StopState {
  return {
    kind: 'normal',
    boss: 0,
    target: 200n,
    total: 0n,
    hands: 4,
    discards: 3,
    handsUsed: 0,
    discardsUsed: 0,
    draw: [],
    hand: [],
    spent: [],
    prevType: -1,
    waveStep: 0,
    waveShield: 0,
    blowouts: 0,
    handNo: 0,
    bossState: [],
    ...over,
  };
}

export function blankRun(over: Partial<RunState> = {}): RunState {
  return {
    cfg: { seed: [1, 2, 3, 4], kind: 'standard', driver: 1, grade: 1, condition: 0 },
    driver: 1,
    condition: 0,
    phase: 'stop',
    stopNo: 1,
    route: {
      branch: [-1, -1, -1],
      lineBosses: [
        [0, 0],
        [0, 0],
        [0, 0],
      ],
      options: [],
      ringBosses: 0,
    },
    deck: [],
    nextUid: 1,
    stop: blankStop(),
    cabin: new Array<Seat | null>(SEATS).fill(null),
    pocket: new Array<number | null>(POCKET).fill(null),
    gauge: 0,
    mastery: { xp: new Array<number>(11).fill(0), played: new Array<number>(11).fill(0) },
    tokens: 4,
    piggy: 0,
    kioskNo: 0,
    expressBonus: false,
    kiosk: null,
    reward: null,
    stats: {
      output: 0n,
      peak: 0n,
      peakHand: -1,
      points: 0,
      stopsCleared: 0,
      ringStop: 0,
      handsPlayed: 0,
      bossesDefeated: 0,
    },
    result: null,
    ...over,
  };
}

/** A HandView with sensible defaults; scoring defaults to played, base Т/Н from the hand table at `level`. */
export function handView(over: Partial<HandView> & { type?: HandType } = {}): HandView {
  const type = over.type ?? 0;
  const level = over.level ?? 1;
  const base = HANDS[type]!;
  const played = over.played ?? [];
  return {
    played,
    scoring: over.scoring ?? played,
    held: over.held ?? [],
    type,
    level,
    baseT: over.baseT ?? base.t + (level - 1) * base.dt,
    baseN: over.baseN ?? base.n + (level - 1) * base.dn,
    waveStep: over.waveStep ?? 0,
    gaugeBefore: over.gaugeBefore ?? 0,
    od: over.od ?? false,
    prevType: over.prevType ?? -1,
    stopNo: over.stopNo ?? 1,
    boss: over.boss ?? 0,
    run: over.run ?? blankRun(),
  };
}

export function seat(index = 0, neighbors: number[] = [], s: number[] = []): SeatCtx {
  return { seat: index, neighbors, s };
}

export interface FxCall {
  fn: keyof Fx;
  args: unknown[];
}

/** Fx that records every call and applies the obvious change to `s` (a blankRun by default). */
export function mockFx(s: RunState = blankRun(), rng: Rng = stream(s.cfg.seed, Tag.SEAT, 0, 0)) {
  const calls: FxCall[] = [];
  const rec = (fn: keyof Fx, ...args: unknown[]): void => {
    calls.push({ fn, args });
  };
  const find = (uid: number): Card | undefined => s.deck.find((c) => c.uid === uid);
  let pendingSparks = 0;
  const fx: Fx & { calls: FxCall[]; sparksAdded(): number } = {
    s,
    rng,
    calls,
    sparksAdded: () => pendingSparks,
    tokens(n) {
      rec('tokens', n);
      s.tokens = Math.max(0, s.tokens + n);
    },
    xp(hand, n) {
      rec('xp', hand, n);
      s.mastery.xp[hand] = (s.mastery.xp[hand] ?? 0) + n;
    },
    sparks(n) {
      rec('sparks', n);
      pendingSparks += n;
    },
    setGauge(g) {
      rec('setGauge', g);
      s.gauge = g;
    },
    hands(n) {
      rec('hands', n);
      if (s.stop) s.stop.hands += n;
    },
    discards(n) {
      rec('discards', n);
      if (s.stop) s.stop.discards += n;
    },
    punch(uid, p) {
      rec('punch', uid, p);
      const c = find(uid);
      if (c) c.punch = p;
    },
    suit(uid, suit) {
      rec('suit', uid, suit);
      const c = find(uid);
      if (c) c.suit = suit;
    },
    charge(uid, value) {
      rec('charge', uid, value);
      const c = find(uid);
      if (c) c.charge = value;
    },
    addCard(c) {
      rec('addCard', c);
      const uid = s.nextUid++;
      s.deck.push({ uid, rank: c.rank, suit: c.suit, punch: c.punch, charge: 0 });
      return uid;
    },
    removeCard(uid) {
      rec('removeCard', uid);
      s.deck = s.deck.filter((c) => c.uid !== uid);
    },
    target(next) {
      rec('target', next);
      if (s.stop) s.stop.target = next;
    },
    waveShield(n) {
      rec('waveShield', n);
      if (s.stop) s.stop.waveShield = n;
    },
    rotateSeats() {
      rec('rotateSeats');
      const last = s.cabin[s.cabin.length - 1] ?? null;
      for (let i = s.cabin.length - 1; i > 0; i--) s.cabin[i] = s.cabin[i - 1] ?? null;
      s.cabin[0] = last;
    },
  };
  return fx;
}
