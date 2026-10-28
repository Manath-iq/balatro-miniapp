// Core engine types. FROZEN CONTRACT (M1): change only via the orchestrator.
// Engine rules: integers, BigInt and exact Ratios only — see docs/engine-contract.md.

/** 128-bit seed as four unsigned 32-bit words. */
export type Seed = readonly [number, number, number, number];

/** 0 ♠ spades, 1 ♥ hearts, 2 ♦ diamonds, 3 ♣ clubs. Red = 1 | 2. */
export type Suit = 0 | 1 | 2 | 3;
/** Card Ток equals its rank value: 2..10, J=11, Q=12, K=13, A=14. */
export type Rank = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14;

/**
 * 0 Старшая, 1 Пара, 2 Две пары, 3 Тройка, 4 Стрит, 5 Флеш, 6 Фулл-хаус, 7 Каре, 8 Стрит-флеш,
 * 9 Пятерня (five of a kind, only via copies), 10 Молния (royal flush). Numeric order == strength order.
 */
export type HandType = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
export const HAND_TYPES = 11;

/** Exact multiplier num/den (both positive safe integers). ×1.5 = [3, 2]. */
export type Ratio = readonly [num: number, den: number];

export interface Card {
  uid: number;
  rank: Rank;
  suit: Suit;
  /** Пробивка code (0 = none). */
  punch: number;
  /** Generic per-card counter (Конденсатор charge). */
  charge: number;
}

export type Phase = 'route' | 'stop' | 'reward' | 'kiosk' | 'depot' | 'over';

export type RunKind = 'standard' | 'daily';

export interface RunConfig {
  seed: Seed;
  kind: RunKind;
  /** Driver code (Водитель). Daily runs ignore this and derive it from the seed. */
  driver: number;
  /** Difficulty grade 1..6 (v1: always 1). */
  grade: number;
  /** Daily condition code (0 = none). Daily runs derive it from the seed. */
  condition: number;
}

export type StopKind = 'normal' | 'express' | 'boss' | 'final' | 'ring' | 'ringBoss';

export interface RouteOption {
  /** 'branch' = line-start choice of Red(0)/Blue(1) branch, which fixes that line's boss. */
  kind: 'branch' | StopKind;
  /** Inspector code shown for this option (branch: the line's boss; boss stops: the boss), 0 = none. */
  boss: number;
  /** Target of the stop this option leads to. */
  target: bigint;
}

export interface RouteState {
  /** Per line (index 0..2) chosen branch 0/1, or -1 if not chosen yet. */
  branch: number[];
  /** [line][branch] → inspector code. Line 2 (index 2) holds the two final bosses. */
  lineBosses: number[][];
  /** Options offered while phase === 'route'. */
  options: RouteOption[];
  /** Number of ring (endless) boss stops already generated, for the ROUTE stream index. */
  ringBosses: number;
}

export interface Seat {
  /** Passenger code. */
  code: number;
  /** Persistent per-passenger counters (length = def.stateSize ?? 0). */
  s: number[];
}

export interface StopState {
  kind: StopKind;
  /** Inspector code active at this stop (0 = none). */
  boss: number;
  target: bigint;
  total: bigint;
  hands: number;
  discards: number;
  handsUsed: number;
  discardsUsed: number;
  /** Draw pile, next card first (uids). */
  draw: number[];
  /** Cards in hand, engine slot order (uids). */
  hand: number[];
  /** Played + discarded this stop (uids). */
  spent: number[];
  /** Type of the previous hand at this stop, -1 if none. */
  prevType: number;
  waveStep: number;
  /** Пересадочный: remaining hands for which a type change does not break the wave. */
  waveShield: number;
  blowouts: number;
  /** 0-based index of the next hand at this stop (RNG key). */
  handNo: number;
  /** Inspector scratch state (e.g. Ремонт путей current rank). */
  bossState: number[];
}

export type KioskItem =
  | { k: 'passenger'; code: number; price: number }
  | { k: 'coupon'; code: number; price: number }
  | { k: 'card'; rank: Rank; suit: Suit; punch: number; price: number };

export interface KioskState {
  /** Conveyor, index 0 = top. Bottom item falls off on shift. */
  slots: (KioskItem | null)[];
  shifts: number;
  /** Items pulled from this kiosk's stream so far (stream index). */
  pulls: number;
  workshopUsed: boolean;
  /** Two punch codes offered by the Мастерская this visit. */
  workshopOffer: readonly [number, number];
  scrapUsed: boolean;
}

export interface RewardState {
  /** Passenger codes offered after a boss (pick one or skip). */
  offers: number[];
}

export interface RunStats {
  /** Sum of all stop totals (Выработка). */
  output: bigint;
  /** Biggest single hand power. */
  peak: bigint;
  peakHand: number;
  /** Daily points: Σ over cleared stops of min(floor(100·total/target), 300). */
  points: number;
  stopsCleared: number;
  /** Furthest ring stop reached (0 = never entered the ring). */
  ringStop: number;
  handsPlayed: number;
  bossesDefeated: number;
}

export interface RunResult {
  /** True if Депо (stop 12) was cleared. */
  won: boolean;
  /** Stop number where the run ended (failed or ended voluntarily). */
  endedAt: number;
  reason: 'failed' | 'ended';
}

export interface RunState {
  cfg: RunConfig;
  /** Resolved driver and condition (daily derives them from the seed). */
  driver: number;
  condition: number;
  phase: Phase;
  /** Current stop number (1-based). During 'route' it is the stop about to be entered. */
  stopNo: number;
  route: RouteState;
  /** Every card the player owns. */
  deck: Card[];
  nextUid: number;
  stop: StopState | null;
  cabin: (Seat | null)[];
  /** Coupon codes in the pocket (null = empty slot). */
  pocket: (number | null)[];
  gauge: number;
  mastery: {
    /** Accumulated XP per HandType. */
    xp: number[];
    /** Times each HandType was played this run. */
    played: number[];
  };
  tokens: number;
  piggy: number;
  /** Count of kiosks visited (KIOSK stream key). */
  kioskNo: number;
  /** Express chosen for the current stop → next kiosk gets +1 conveyor slot. */
  expressBonus: boolean;
  kiosk: KioskState | null;
  reward: RewardState | null;
  stats: RunStats;
  result: RunResult | null;
}

export type Action =
  | { t: 'route'; choice: number }
  /** idx: engine hand slots (0..6) in play order — scoring goes left to right in this order. */
  | { t: 'play'; idx: number[]; od: boolean }
  | { t: 'discard'; idx: number[] }
  | { t: 'coupon'; slot: number; uids?: number[]; hand?: HandType }
  | { t: 'buy'; slot: number }
  | { t: 'shift' }
  | { t: 'sell'; seat: number }
  | { t: 'swap'; a: number; b: number }
  | { t: 'workshop'; uid: number; pick: 0 | 1 }
  | { t: 'scrap'; uid: number }
  | { t: 'piggy'; deposit: number }
  | { t: 'piggyBreak' }
  /** pick 0..2, or 15 = skip. */
  | { t: 'reward'; pick: number }
  | { t: 'leave' }
  | { t: 'ring' }
  | { t: 'end' };

export type ActionType = Action['t'];

export interface Legal {
  phase: Phase;
  route: number;
  play: boolean;
  /** Overdrive lever usable for the next play. */
  od: boolean;
  discard: boolean;
  /** Per pocket slot: usable now. */
  coupon: boolean[];
  /** Per conveyor slot: affordable and has room. */
  buy: boolean[];
  shift: boolean;
  shiftCost: number;
  sell: boolean[];
  swap: boolean;
  workshop: boolean;
  scrap: boolean;
  piggy: boolean;
  reward: boolean[];
  leave: boolean;
  ring: boolean;
  end: boolean;
}

export interface Preview {
  type: HandType;
  level: number;
  /** Base Т/Н of the hand type at its current Стаж level (before cards and passengers). */
  t: number;
  n: number;
  /** Indices into the given idx array that score. */
  scoring: number[];
}

export interface RunSummary {
  kind: RunKind;
  won: boolean;
  stopsCleared: number;
  ringStop: number;
  output: bigint;
  peak: bigint;
  peakHand: number;
  points: number;
  handsPlayed: number;
  actions: number;
  /** hashState of the final state. */
  hash: number;
}

export class IllegalAction extends Error {
  readonly reason: string;
  constructor(reason: string) {
    super(reason);
    this.reason = reason;
  }
}
