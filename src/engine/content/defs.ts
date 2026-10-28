// Content hook interfaces. FROZEN CONTRACT (M1). See docs/engine-contract.md for exact semantics.
// Scoring hooks (onRetrig/onCard/onHeld/onHand/cardT/...) are PURE: they read their arguments and return a Delta.
// State changes happen only through Fx in the non-scoring hooks.
import type { Rng } from '../rng';
import type { Card, HandType, Rank, Ratio, RunState, StopKind, StopState, Suit } from '../types';

/** A scoring contribution. t/n are added; x multiplies the final power; sparks add to this hand's sparks. */
export interface Delta {
  t?: number;
  n?: number;
  x?: Ratio;
  sparks?: number;
}

export interface SeatCtx {
  /** Cabin index of this passenger. */
  seat: number;
  /** Cabin indices of OCCUPIED orthogonal neighbours (3-wide grid). */
  neighbors: readonly number[];
  /** Own persistent counters (length = stateSize). Mutate only in non-scoring hooks. */
  s: number[];
}

/** Read-only view of the hand being scored. */
export interface HandView {
  /** Played cards in play order. */
  played: readonly Card[];
  /** The subset of played cards that score, in play order. */
  scoring: readonly Card[];
  /** Cards still in hand (not played), engine slot order. */
  held: readonly Card[];
  type: HandType;
  /** Стаж level used for scoring (1 under Пересменка). */
  level: number;
  /** Hand base Т/Н at that level. */
  baseT: number;
  baseN: number;
  /** Зелёная волна step for this hand (0 = no streak). */
  waveStep: number;
  /** Overdrive gauge before this hand. */
  gaugeBefore: number;
  od: boolean;
  /** Type of the previous hand at this stop, -1 if this is the first. */
  prevType: number;
  stopNo: number;
  /** Inspector active at this stop (0 = none). */
  boss: number;
  run: Readonly<RunState>;
}

/** Mutable rules, rebuilt before every hand: balance → driver → condition → grade → seats 1→6 → boss. */
export interface Rules {
  /** Overdrive usable when gauge >= odMin. */
  odMin: number;
  /** Overdrive multiplier = (odDen + gauge) / odDen. */
  odDen: number;
  /** Every hand is overdriven automatically (final boss «Последний трамвай»). */
  odAlways: boolean;
  /** Blowout when gauge reaches this value. */
  blowAt: number;
  sparkMul: Ratio;
  /** Gauge halves between stops. */
  gaugeCools: boolean;
  /** Cap on summed Н before multipliers (null = none). */
  nCap: number | null;
  handsPerStop: number;
  discardsPerStop: number;
  handSize: number;
  conveyorSlots: number;
  piggyBonus: Ratio;
  piggyCap: number;
  wavePer: number;
  waveMax: number;
  /** Пересменка: all hands score at Стаж level 1. */
  masteryFlat: boolean;
  /** XP multiplier for XP gained from playing hands. */
  xpMul: number;
  /** Selling returns the full price (Перекупщик). */
  sellFull: boolean;
}

export interface KioskRules {
  /** Number of free shifts per kiosk visit (Бабка с семечками). */
  freeShifts: number;
  /** Added to every item price (min 1). */
  priceDelta: number;
}

export interface StopEndInfo {
  kind: StopKind;
  handsUsed: number;
  discardsUsed: number;
  blowouts: number;
  total: bigint;
  target: bigint;
}

export interface Fx {
  readonly s: Readonly<RunState>;
  /** Stream bound to the calling context (seat / boss / coupon). */
  readonly rng: Rng;
  tokens(n: number): void;
  xp(hand: HandType, n: number): void;
  /** During a hand: adds to this hand's sparks. Outside a hand: adds to the gauge (capped at blowAt - 1). */
  sparks(n: number): void;
  setGauge(g: number): void;
  hands(n: number): void;
  discards(n: number): void;
  punch(uid: number, punch: number): void;
  suit(uid: number, suit: Suit): void;
  charge(uid: number, value: number): void;
  addCard(c: { rank: Rank; suit: Suit; punch: number }): number;
  removeCard(uid: number): void;
  /** Replace the current stop target (Начальник депо). */
  target(next: bigint): void;
  /** Пересадочный: next n hands keep the wave on a type change. */
  waveShield(n: number): void;
  /** Кондукторша Люда: every seat moves one place forward (last → first). */
  rotateSeats(): void;
}

export type Rarity = 'C' | 'U' | 'R';

export interface PassengerDef {
  id: string;
  code: number;
  v1: boolean;
  rarity: Rarity;
  price: number;
  stateSize?: number;
  rules?(r: Rules, me: SeatCtx): void;
  onStopStart?(fx: Fx, me: SeatCtx): void;
  /** Extra triggers for scoring card c at scoring index i. */
  onRetrig?(h: HandView, c: Card, i: number, me: SeatCtx): number;
  /** Called once per trigger of each scoring card. */
  onCard?(h: HandView, c: Card, i: number, me: SeatCtx): Delta | undefined;
  onHeld?(h: HandView, c: Card, me: SeatCtx): Delta | undefined;
  onHand?(h: HandView, me: SeatCtx): Delta | undefined;
  onAfterHand?(fx: Fx, h: HandView, power: bigint, me: SeatCtx): void;
  onDiscard?(fx: Fx, cards: readonly Card[], me: SeatCtx): void;
  /** Return true to cancel the blowout. */
  onBlowout?(fx: Fx, me: SeatCtx): boolean;
  onStopEnd?(fx: Fx, info: StopEndInfo, me: SeatCtx): void;
  onKiosk?(k: KioskRules, me: SeatCtx): void;
  onCardRemoved?(fx: Fx, c: Card, me: SeatCtx): void;
}

export interface InspectorDef {
  id: string;
  code: number;
  v1: boolean;
  tier: 'line' | 'final';
  rules?(r: Rules): void;
  onStopStart?(fx: Fx, st: StopState): void;
  /** Rewrite one trigger's card Ток (t is the value before the boss). */
  cardT?(c: Card, t: number, h: HandView, st: StopState): number;
  /** Extra sparks per trigger of card c. */
  cardSparks?(c: Card, h: HandView, st: StopState): number;
  onHand?(h: HandView, st: StopState): Delta | undefined;
  onAfterHand?(fx: Fx, h: HandView, st: StopState): void;
}

export type CouponTarget = { k: 'none' } | { k: 'cards'; min: number; max: number } | { k: 'hand' };

export interface CouponDef {
  id: string;
  code: number;
  v1: boolean;
  price: number;
  when: 'stop' | 'kiosk' | 'any';
  target: CouponTarget;
  canUse?(s: Readonly<RunState>): boolean;
  apply(fx: Fx, tgt: { uids: readonly number[]; hand?: HandType }): void;
}

export interface PunchDef {
  id: string;
  code: number;
  v1: boolean;
  /** Extra triggers when this card scores (Компостер). */
  retrig?: number;
  onScore?(c: Card, h: HandView): Delta | undefined;
  onHeld?(c: Card, h: HandView): Delta | undefined;
  /** After each played hand, for this card if it stayed in hand. */
  afterHandHeld?(fx: Fx, c: Card): void;
  /** When the card is played (scoring or not), after scoring. */
  onPlayed?(fx: Fx, c: Card): void;
  onDiscard?(fx: Fx, c: Card): void;
}

export interface DriverDef {
  id: string;
  code: number;
  v1: boolean;
  /** Cabin size (6 default). */
  seats: number;
  /** Mutates the fresh run directly before the first event (gauge, XP, tokens, deck). */
  setup?(s: RunState): void;
  rules?(r: Rules): void;
}

export interface ConditionDef {
  id: string;
  code: number;
  v1: boolean;
  setup?(s: RunState): void;
  rules?(r: Rules): void;
  /** Multiplies every stop target. */
  targetMul?: Ratio;
}
