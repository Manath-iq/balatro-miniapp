// Run lifecycle and the action dispatcher (public step/legal/preview/newRun/summarize).
import { mustCard, newDeck } from './cards';
import { ECON, FINAL_STOP, GAUGE, POCKET, SHOP } from './content/balance';
import { condition, coupon, driver, pools } from './content/registry';
import { buildRules, type Ctx, emit, makeFx, removeCard } from './ctx';
import type { GameEvent } from './events';
import { evaluate } from './hands';
import { hashState } from './hash';
import {
  buy,
  enterKiosk,
  enterReward,
  firstFreeSeat,
  MIN_DECK,
  piggyBreak,
  piggyDeposit,
  sell,
  shift,
  shiftCost,
  swap,
  takeReward,
  workshop,
} from './kiosk';
import { handBase, levelOf } from './mastery';
import { stream, Tag } from './rng';
import { rollLineBosses, routeOptions } from './route';
import { canOverdrive, discardCards, enterStop, finishRun, playHand, refillHand } from './stop';
import type {
  Action,
  HandType,
  Legal,
  Preview,
  RunConfig,
  RunState,
  RunSummary,
  Seat,
  StopKind,
} from './types';
import { HAND_TYPES, IllegalAction } from './types';

const NO_EVENTS: GameEvent[] = [];

function makeCtx(s: RunState, events: boolean): Ctx {
  const ctx: Ctx = { s, ev: events ? [] : null };
  ctx.next = (kind: StopKind) => afterClear(ctx, kind);
  return ctx;
}

function afterClear(ctx: Ctx, kind: StopKind): void {
  const s = ctx.s;
  if (kind === 'final') {
    s.phase = 'depot';
    emit(ctx, { e: 'phase', phase: 'depot' });
  } else if (kind === 'boss' || kind === 'ringBoss') {
    enterReward(ctx);
  } else {
    enterKiosk(ctx);
  }
}

function enterRoute(ctx: Ctx, stopNo: number): void {
  const s = ctx.s;
  s.stopNo = stopNo;
  s.kiosk = null;
  s.route.options = routeOptions(s, stopNo);
  s.phase = 'route';
  emit(ctx, { e: 'phase', phase: 'route' });
  emit(ctx, { e: 'routeOptions', stopNo, options: s.route.options });
}

export function newRun(cfg: RunConfig): { state: RunState; events: GameEvent[] } {
  let drv = cfg.driver;
  let cond = 0;
  if (cfg.kind === 'daily') {
    const rng = stream(cfg.seed, Tag.DAILY);
    drv = pools.drivers.length ? rng.pick(pools.drivers).code : 1;
    cond = pools.conditions.length ? rng.pick(pools.conditions).code : 0;
  }
  const d = driver(drv);
  const s: RunState = {
    cfg: { ...cfg, seed: [cfg.seed[0], cfg.seed[1], cfg.seed[2], cfg.seed[3]] },
    driver: drv,
    condition: cond,
    phase: 'route',
    stopNo: 1,
    route: { branch: [-1, -1, -1], lineBosses: [], options: [], ringBosses: 0 },
    deck: newDeck(),
    nextUid: 53,
    stop: null,
    cabin: new Array<Seat | null>(d.seats).fill(null),
    pocket: new Array<number | null>(POCKET).fill(null),
    gauge: GAUGE.start,
    mastery: { xp: new Array<number>(HAND_TYPES).fill(0), played: new Array<number>(HAND_TYPES).fill(0) },
    tokens: ECON.startTokens,
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
  };
  d.setup?.(s);
  if (cond) condition(cond).setup?.(s);
  s.route.lineBosses = rollLineBosses(s);
  const ctx = makeCtx(s, true);
  enterRoute(ctx, 1);
  return { state: s, events: ctx.ev ?? [] };
}

function chooseRoute(ctx: Ctx, choice: number): void {
  const s = ctx.s;
  if (s.phase !== 'route') throw new IllegalAction('not_in_route');
  const opt = s.route.options[choice];
  if (!opt) throw new IllegalAction('bad_choice');
  if (opt.kind === 'branch') s.route.branch[Math.ceil(s.stopNo / 4) - 1] = choice;
  enterStop(ctx, opt);
}

function useCoupon(
  ctx: Ctx,
  slot: number,
  uids: readonly number[] | undefined,
  hand: HandType | undefined,
): void {
  const s = ctx.s;
  const code = s.pocket[slot];
  if (code === null || code === undefined) throw new IllegalAction('empty_pocket');
  const def = coupon(code);
  const inStop = s.phase === 'stop';
  if (!inStop && s.phase !== 'kiosk') throw new IllegalAction('cannot_use_now');
  if (def.when === 'stop' && !inStop) throw new IllegalAction('stop_only');
  if (def.when === 'kiosk' && inStop) throw new IllegalAction('kiosk_only');
  if (def.canUse && !def.canUse(s)) throw new IllegalAction('cannot_use');
  const tgt = def.target;
  const list = uids ?? [];
  if (tgt.k === 'cards') {
    if (list.length < tgt.min || list.length > tgt.max || new Set(list).size !== list.length) {
      throw new IllegalAction('bad_targets');
    }
    for (const uid of list) {
      if (inStop ? !s.stop!.hand.includes(uid) : !s.deck.some((c) => c.uid === uid)) {
        throw new IllegalAction('bad_target');
      }
    }
  } else if (tgt.k === 'hand') {
    if (hand === undefined || hand < 0 || hand >= HAND_TYPES) throw new IllegalAction('bad_hand');
  }
  const rng = stream(s.cfg.seed, Tag.COUPON, s.stopNo, s.stats.handsPlayed * 4 + slot);
  s.pocket[slot] = null;
  const target: { uids: readonly number[]; hand?: HandType } = { uids: list };
  if (hand !== undefined) target.hand = hand;
  def.apply(makeFx(ctx, rng, { k: 'coupon', code }), target);
  emit(ctx, { e: 'couponUsed', slot, code });
  emit(ctx, { e: 'pocket', codes: s.pocket.slice() });
  if (inStop && s.stop) refillHand(ctx);
}

function scrap(ctx: Ctx, uid: number): void {
  const s = ctx.s;
  if (s.phase !== 'kiosk' || !s.kiosk) throw new IllegalAction('not_in_kiosk');
  if (s.kiosk.scrapUsed) throw new IllegalAction('scrap_used');
  if (s.tokens < SHOP.scrapPrice) throw new IllegalAction('no_tokens');
  if (s.deck.length <= MIN_DECK) throw new IllegalAction('deck_too_small');
  mustCard(s, uid);
  s.tokens -= SHOP.scrapPrice;
  s.kiosk.scrapUsed = true;
  emit(ctx, { e: 'tokens', add: -SHOP.scrapPrice, total: s.tokens, src: { k: 'base' } });
  removeCard(ctx, uid);
}

export function step(s: RunState, a: Action, opts?: { events?: boolean }): GameEvent[] {
  if (s.phase === 'over') throw new IllegalAction('run_over');
  const ctx = makeCtx(s, opts?.events !== false);
  switch (a.t) {
    case 'route':
      chooseRoute(ctx, a.choice);
      break;
    case 'play':
      playHand(ctx, a.idx, a.od);
      break;
    case 'discard':
      discardCards(ctx, a.idx);
      break;
    case 'coupon':
      useCoupon(ctx, a.slot, a.uids, a.hand);
      break;
    case 'buy':
      buy(ctx, a.slot);
      break;
    case 'shift':
      shift(ctx);
      break;
    case 'sell':
      sell(ctx, a.seat);
      break;
    case 'swap':
      swap(ctx, a.a, a.b);
      break;
    case 'workshop':
      workshop(ctx, a.uid, a.pick);
      break;
    case 'scrap':
      scrap(ctx, a.uid);
      break;
    case 'piggy':
      piggyDeposit(ctx, a.deposit);
      break;
    case 'piggyBreak':
      piggyBreak(ctx);
      break;
    case 'reward':
      takeReward(ctx, a.pick);
      break;
    case 'leave':
      if (s.phase !== 'kiosk') throw new IllegalAction('not_in_kiosk');
      enterRoute(ctx, s.stopNo + 1);
      break;
    case 'ring':
      if (s.phase !== 'depot' || s.cfg.kind !== 'standard') throw new IllegalAction('no_ring');
      enterRoute(ctx, FINAL_STOP + 1);
      break;
    case 'end':
      finishRun(ctx, 'ended');
      break;
    default:
      throw new IllegalAction('unknown_action');
  }
  return ctx.ev ?? NO_EVENTS;
}

export function legal(s: RunState): Legal {
  const phase = s.phase;
  const r = buildRules(s);
  const st = s.stop;
  const k = s.kiosk;
  const inStop = phase === 'stop' && st !== null;
  const canManage = phase === 'kiosk' || phase === 'route' || phase === 'reward';
  const free = firstFreeSeat(s) >= 0;
  return {
    phase,
    route: phase === 'route' ? s.route.options.length : 0,
    play: inStop && st.hands > 0,
    od: inStop && !r.odAlways && canOverdrive(r, s.gauge),
    discard: inStop && st.discards > 0,
    coupon: s.pocket.map((code) => {
      if (code === null || (!inStop && phase !== 'kiosk')) return false;
      const def = coupon(code);
      if (def.when === 'stop' && !inStop) return false;
      if (def.when === 'kiosk' && inStop) return false;
      return def.canUse ? def.canUse(s) : true;
    }),
    buy:
      phase === 'kiosk' && k
        ? k.slots.map((it) => {
            if (!it || s.tokens < it.price) return false;
            if (it.k === 'passenger') return free;
            if (it.k === 'coupon') return s.pocket.includes(null);
            return true;
          })
        : [],
    shift: phase === 'kiosk' && k !== null && s.tokens >= shiftCost(s),
    shiftCost: phase === 'kiosk' && k ? shiftCost(s) : 0,
    sell: s.cabin.map((x) => canManage && x !== null),
    swap: canManage,
    workshop:
      phase === 'kiosk' &&
      k !== null &&
      !k.workshopUsed &&
      k.workshopOffer[0] > 0 &&
      s.tokens >= SHOP.workshopPrice,
    scrap:
      phase === 'kiosk' &&
      k !== null &&
      !k.scrapUsed &&
      s.tokens >= SHOP.scrapPrice &&
      s.deck.length > MIN_DECK,
    piggy: phase === 'kiosk' && s.tokens > 0,
    reward: phase === 'reward' && s.reward ? s.reward.offers.map(() => free) : [],
    leave: phase === 'kiosk',
    ring: phase === 'depot' && s.cfg.kind === 'standard',
    end: phase !== 'over',
  };
}

export function preview(s: RunState, idx: readonly number[]): Preview {
  const st = s.stop;
  if (!st || idx.length < 1 || idx.length > 5) throw new IllegalAction('bad_preview');
  const cards = idx.map((i) => {
    const uid = st.hand[i];
    if (uid === undefined) throw new IllegalAction('bad_slot');
    return mustCard(s, uid);
  });
  const ev = evaluate(cards);
  const level = buildRules(s).masteryFlat ? 1 : levelOf(s.mastery.xp[ev.type]!);
  const base = handBase(ev.type, level);
  return { type: ev.type, level, t: base.t, n: base.n, scoring: ev.scoring };
}

export function summarize(s: RunState, actions: number): RunSummary {
  return {
    kind: s.cfg.kind,
    won: s.stats.stopsCleared >= FINAL_STOP,
    stopsCleared: s.stats.stopsCleared,
    ringStop: s.stats.ringStop,
    output: s.stats.output,
    peak: s.stats.peak,
    peakHand: s.stats.peakHand,
    points: s.stats.points,
    handsPlayed: s.stats.handsPlayed,
    actions,
    hash: hashState(s),
  };
}
