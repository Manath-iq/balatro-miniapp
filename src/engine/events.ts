// Engine → presentation events. FROZEN CONTRACT (M1).
// Every state mutation that the player should see is emitted in order; the client Director turns the
// list into animation beats. Events carry final values so the UI never re-computes game logic.
import type { HandType, KioskItem, Phase, RouteOption, RunResult, StopKind } from './types';

/** Who caused an effect. seat = cabin index, punch = card uid, coupon = coupon code. */
export type Src =
  | { k: 'seat'; i: number }
  | { k: 'punch'; uid: number }
  | { k: 'boss'; code: number }
  | { k: 'wave' }
  | { k: 'driver' }
  | { k: 'condition' }
  | { k: 'coupon'; code: number }
  | { k: 'base' }
  | { k: 'income' };

export type GameEvent =
  | { e: 'phase'; phase: Phase }
  | { e: 'routeOptions'; stopNo: number; options: RouteOption[] }
  | {
      e: 'stopStart';
      stopNo: number;
      kind: StopKind;
      boss: number;
      target: bigint;
      hands: number;
      discards: number;
    }
  | { e: 'bossInfo'; code: number; value: number }
  | { e: 'draw'; uids: number[] }
  | { e: 'discard'; uids: number[] }
  /** Start of scoring: played cards (in play order), which of them score, hand type and level. */
  | { e: 'handStart'; uids: number[]; scoring: number[]; type: HandType; level: number; od: boolean }
  | { e: 'base'; t: number; n: number }
  /** One scoring trigger of a card: its Ток contribution (t) and any n; retrigger index rep. */
  | { e: 'card'; uid: number; rep: number; t: number; n: number }
  /** A modifier (seat/punch/boss/wave) adding Т/Н or a multiplier, attached to a card uid when per-card. */
  | { e: 'mod'; src: Src; uid?: number; t?: number; n?: number; x?: readonly [number, number] }
  | { e: 'held'; uid: number; t: number; n: number }
  | { e: 'nCap'; n: number }
  | { e: 'wave'; step: number }
  | { e: 'overdrive'; gauge: number; x: readonly [number, number] }
  /** Final hand result: t × n × Π(x) × od = power; stop total after adding. */
  | { e: 'power'; t: number; n: number; power: bigint; total: bigint }
  | { e: 'sparks'; adds: number[]; gauge: number }
  | { e: 'blowout'; cancelledBy: Src | null; penalty: 'hand' | 'tokens' | 'none'; gauge: number }
  | { e: 'gauge'; gauge: number; src: Src }
  | { e: 'xp'; hand: HandType; add: number; xp: number; level: number; levelUp: boolean; src: Src }
  | { e: 'tokens'; add: number; total: number; src: Src }
  | { e: 'counters'; hands: number; discards: number }
  | { e: 'target'; target: bigint; src: Src }
  | {
      e: 'stopCleared';
      stopNo: number;
      total: bigint;
      target: bigint;
      income: { src: Src; tokens: number }[];
    }
  | { e: 'stopFailed'; stopNo: number; total: bigint; target: bigint }
  | { e: 'piggyPayout'; deposit: number; bonus: number }
  | { e: 'kiosk'; slots: (KioskItem | null)[]; workshopOffer: readonly [number, number] }
  | { e: 'shift'; cost: number; slots: (KioskItem | null)[] }
  | { e: 'bought'; slot: number; item: KioskItem; seat?: number; pocket?: number; uid?: number }
  | { e: 'sold'; seat: number; code: number; refund: number }
  | { e: 'seats'; codes: (number | null)[] }
  | { e: 'cardChanged'; uid: number }
  | { e: 'cardAdded'; uid: number }
  | { e: 'cardRemoved'; uid: number }
  | { e: 'couponUsed'; slot: number; code: number }
  | { e: 'pocket'; codes: (number | null)[] }
  | { e: 'piggy'; piggy: number; tokens: number }
  | { e: 'reward'; offers: number[] }
  | { e: 'runOver'; result: RunResult };

export type GameEventType = GameEvent['e'];
