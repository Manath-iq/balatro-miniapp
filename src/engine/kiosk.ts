// Reward (after a boss) and the Ларёк conveyor. Rules: docs/engine-contract.md §6–7.
import { REWARD, SHOP } from './content/balance';
import { passenger, pools } from './content/registry';
import { addTokens, buildRules, type Ctx, emit, kioskRules, seatCodes } from './ctx';
import { stream, Tag } from './rng';
import { lineOf } from './route';
import type { KioskItem, Rank, RunState, Suit } from './types';
import { IllegalAction } from './types';

const ownedCodes = (s: RunState): Set<number> =>
  new Set(s.cabin.filter((x) => x !== null).map((x) => x.code));

export function enterReward(ctx: Ctx): void {
  const s = ctx.s;
  const owned = ownedCodes(s);
  const rng = stream(s.cfg.seed, Tag.REWARD, s.stopNo);
  const rare = rng.shuffled(
    pools.passengers.filter((p) => p.rarity !== 'C' && !owned.has(p.code)).map((p) => p.code),
  );
  const common = rng.shuffled(
    pools.passengers.filter((p) => p.rarity === 'C' && !owned.has(p.code)).map((p) => p.code),
  );
  const offers = [...rare, ...common].slice(0, REWARD.offers);
  s.reward = { offers };
  s.phase = 'reward';
  emit(ctx, { e: 'phase', phase: 'reward' });
  emit(ctx, { e: 'reward', offers });
}

export function firstFreeSeat(s: RunState): number {
  return s.cabin.indexOf(null);
}

export function seatPassenger(s: RunState, seat: number, code: number): void {
  s.cabin[seat] = { code, s: new Array<number>(passenger(code).stateSize ?? 0).fill(0) };
}

export function takeReward(ctx: Ctx, pick: number): void {
  const s = ctx.s;
  if (s.phase !== 'reward' || !s.reward) throw new IllegalAction('not_in_reward');
  if (pick !== 15) {
    const code = s.reward.offers[pick];
    if (code === undefined) throw new IllegalAction('bad_pick');
    const seat = firstFreeSeat(s);
    if (seat < 0) throw new IllegalAction('cabin_full');
    seatPassenger(s, seat, code);
    emit(ctx, { e: 'seats', codes: seatCodes(s) });
  }
  s.reward = null;
  enterKiosk(ctx);
}

function price(base: number, delta: number): number {
  return Math.max(1, base + delta);
}

function pull(s: RunState): KioskItem | null {
  const k = s.kiosk!;
  const rng = stream(s.cfg.seed, Tag.KIOSK, s.kioskNo, k.pulls++);
  const kr = kioskRules(s);
  const kind = rng.weighted(SHOP.mix);
  if (kind === 0) {
    const odds = SHOP.rarityOdds[Math.min(lineOf(s.stopNo), 3) - 1]!;
    const rarity = (['C', 'U', 'R'] as const)[rng.weighted(odds)]!;
    const owned = ownedCodes(s);
    for (const slot of k.slots) if (slot?.k === 'passenger') owned.add(slot.code);
    const free = pools.passengers.filter((p) => !owned.has(p.code));
    const same = free.filter((p) => p.rarity === rarity);
    const pool = same.length ? same : free;
    if (pool.length) {
      const p = rng.pick(pool);
      return { k: 'passenger', code: p.code, price: price(p.price, kr.priceDelta) };
    }
  }
  if (kind !== 2 && pools.coupons.length) {
    const c = rng.pick(pools.coupons);
    return { k: 'coupon', code: c.code, price: price(c.price, kr.priceDelta) };
  }
  if (pools.punches.length) {
    return {
      k: 'card',
      rank: rng.range(2, 14) as Rank,
      suit: rng.int(4) as Suit,
      punch: rng.pick(pools.punches).code,
      price: price(SHOP.cardPrice, kr.priceDelta),
    };
  }
  return null;
}

export function enterKiosk(ctx: Ctx): void {
  const s = ctx.s;
  s.kioskNo += 1;
  const n = buildRules(s).conveyorSlots + (s.expressBonus ? 1 : 0);
  s.expressBonus = false;
  const wrng = stream(s.cfg.seed, Tag.WORKSHOP, s.kioskNo);
  const punches = wrng.shuffled(pools.punches.map((p) => p.code));
  s.kiosk = {
    slots: new Array<KioskItem | null>(n).fill(null),
    shifts: 0,
    pulls: 0,
    workshopUsed: false,
    workshopOffer: [punches[0] ?? 0, punches[1] ?? punches[0] ?? 0],
    scrapUsed: false,
  };
  for (let i = 0; i < n; i++) s.kiosk.slots[i] = pull(s);
  s.phase = 'kiosk';
  emit(ctx, { e: 'phase', phase: 'kiosk' });
  emit(ctx, { e: 'kiosk', slots: s.kiosk.slots.slice(), workshopOffer: s.kiosk.workshopOffer });
}

export function shiftCost(s: RunState): number {
  const k = s.kiosk!.shifts;
  return k < kioskRules(s).freeShifts ? 0 : SHOP.shiftBase + Math.floor(k / 2);
}

function inKiosk(s: RunState): NonNullable<RunState['kiosk']> {
  if (s.phase !== 'kiosk' || !s.kiosk) throw new IllegalAction('not_in_kiosk');
  return s.kiosk;
}

export function shift(ctx: Ctx): void {
  const s = ctx.s;
  const k = inKiosk(s);
  const cost = shiftCost(s);
  if (s.tokens < cost) throw new IllegalAction('no_tokens');
  s.tokens -= cost;
  for (let i = k.slots.length - 1; i > 0; i--) k.slots[i] = k.slots[i - 1] ?? null;
  k.slots[0] = null;
  k.shifts += 1;
  k.slots[0] = pull(s);
  emit(ctx, { e: 'shift', cost, slots: k.slots.slice() });
  emit(ctx, { e: 'tokens', add: -cost, total: s.tokens, src: { k: 'base' } });
}

export function buy(ctx: Ctx, slot: number): void {
  const s = ctx.s;
  const k = inKiosk(s);
  const item = k.slots[slot];
  if (!item) throw new IllegalAction('empty_slot');
  if (s.tokens < item.price) throw new IllegalAction('no_tokens');
  if (item.k === 'passenger') {
    const seat = firstFreeSeat(s);
    if (seat < 0) throw new IllegalAction('cabin_full');
    s.tokens -= item.price;
    seatPassenger(s, seat, item.code);
    emit(ctx, { e: 'bought', slot, item, seat });
    emit(ctx, { e: 'seats', codes: seatCodes(s) });
  } else if (item.k === 'coupon') {
    const pocket = s.pocket.indexOf(null);
    if (pocket < 0) throw new IllegalAction('pocket_full');
    s.tokens -= item.price;
    s.pocket[pocket] = item.code;
    emit(ctx, { e: 'bought', slot, item, pocket });
    emit(ctx, { e: 'pocket', codes: s.pocket.slice() });
  } else {
    s.tokens -= item.price;
    const uid = s.nextUid++;
    s.deck.push({ uid, rank: item.rank, suit: item.suit, punch: item.punch, charge: 0 });
    emit(ctx, { e: 'bought', slot, item, uid });
    emit(ctx, { e: 'cardAdded', uid });
  }
  k.slots[slot] = null;
  emit(ctx, { e: 'tokens', add: -item.price, total: s.tokens, src: { k: 'base' } });
}

export function workshop(ctx: Ctx, uid: number, pickIdx: 0 | 1): void {
  const s = ctx.s;
  const k = inKiosk(s);
  if (k.workshopUsed) throw new IllegalAction('workshop_used');
  const code = k.workshopOffer[pickIdx];
  if (!code) throw new IllegalAction('no_offer');
  if (s.tokens < SHOP.workshopPrice) throw new IllegalAction('no_tokens');
  const card = s.deck.find((c) => c.uid === uid);
  if (!card) throw new IllegalAction('no_card');
  s.tokens -= SHOP.workshopPrice;
  k.workshopUsed = true;
  card.punch = code;
  emit(ctx, { e: 'cardChanged', uid });
  emit(ctx, { e: 'tokens', add: -SHOP.workshopPrice, total: s.tokens, src: { k: 'base' } });
}

export const MIN_DECK = 20;

export function piggyDeposit(ctx: Ctx, amount: number): void {
  const s = ctx.s;
  inKiosk(s);
  if (!Number.isInteger(amount) || amount < 1 || amount > s.tokens) throw new IllegalAction('bad_amount');
  s.tokens -= amount;
  s.piggy += amount;
  emit(ctx, { e: 'piggy', piggy: s.piggy, tokens: s.tokens });
}

export function piggyBreak(ctx: Ctx): void {
  const s = ctx.s;
  inKiosk(s);
  if (s.piggy <= 0) throw new IllegalAction('piggy_empty');
  const back = Math.floor((s.piggy * 3) / 4);
  s.piggy = 0;
  s.tokens += back;
  emit(ctx, { e: 'piggy', piggy: 0, tokens: s.tokens });
}

export function sell(ctx: Ctx, seat: number): void {
  const s = ctx.s;
  if (s.phase !== 'kiosk' && s.phase !== 'route' && s.phase !== 'reward')
    throw new IllegalAction('cannot_sell_now');
  const p = s.cabin[seat];
  if (!p) throw new IllegalAction('empty_seat');
  const def = passenger(p.code);
  const refund = buildRules(s).sellFull ? def.price : Math.floor(def.price / 2);
  s.cabin[seat] = null;
  emit(ctx, { e: 'sold', seat, code: p.code, refund });
  emit(ctx, { e: 'seats', codes: seatCodes(s) });
  addTokens(ctx, refund, { k: 'base' });
}

export function swap(ctx: Ctx, a: number, b: number): void {
  const s = ctx.s;
  if (s.phase !== 'kiosk' && s.phase !== 'route' && s.phase !== 'reward')
    throw new IllegalAction('cannot_swap_now');
  const n = s.cabin.length;
  if (a === b || a < 0 || b < 0 || a >= n || b >= n) throw new IllegalAction('bad_seats');
  const tmp = s.cabin[a] ?? null;
  s.cabin[a] = s.cabin[b] ?? null;
  s.cabin[b] = tmp;
  emit(ctx, { e: 'seats', codes: seatCodes(s) });
}
