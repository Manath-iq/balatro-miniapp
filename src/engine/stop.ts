// Stop lifecycle: entering, playing and discarding hands, clearing or failing. Rules: docs/engine-contract.md §5.
import { cardByUid, mustCard } from './cards';
import { DAILY_POINTS_CAP, ECON, GAUGE, XP } from './content/balance';
import type { Delta, HandView, Rules } from './content/defs';
import { inspector, passenger, punch } from './content/registry';
import { addTokens, bossFx, buildRules, type Ctx, emit, emitCounters, makeFx, seatCtx, seatFx } from './ctx';
import { evaluate } from './hands';
import { handBase, levelOf } from './mastery';
import { deckKey, stream, Tag } from './rng';
import type { RouteOption, RunResult, StopKind, StopState } from './types';
import { IllegalAction } from './types';

export function enterStop(ctx: Ctx, opt: RouteOption): void {
  const s = ctx.s;
  const kind: StopKind = opt.kind === 'branch' ? 'normal' : opt.kind;
  const st: StopState = {
    kind,
    boss: opt.boss && kind !== 'normal' && kind !== 'express' && kind !== 'ring' ? opt.boss : 0,
    target: opt.target,
    total: 0n,
    hands: 0,
    discards: 0,
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
  };
  s.stop = st;
  s.phase = 'stop';
  if (kind === 'express') s.expressBonus = true;
  if (kind === 'ringBoss') s.route.ringBosses++;
  const r = buildRules(s);
  st.hands = r.handsPerStop;
  st.discards = r.discardsPerStop;

  const salt = stream(s.cfg.seed, Tag.DECK, s.stopNo).u32();
  st.draw = s.deck
    .map((c) => ({ uid: c.uid, key: deckKey(salt, c.uid) }))
    .sort((a, b) => a.key - b.key || a.uid - b.uid)
    .map((x) => x.uid);

  emit(ctx, { e: 'phase', phase: 'stop' });
  emit(ctx, {
    e: 'stopStart',
    stopNo: s.stopNo,
    kind,
    boss: st.boss,
    target: st.target,
    hands: st.hands,
    discards: st.discards,
  });

  for (let i = 0; i < s.cabin.length; i++) {
    const seat = s.cabin[i];
    if (seat) passenger(seat.code).onStopStart?.(seatFx(ctx, i), seatCtx(s, i));
  }
  if (st.boss) {
    inspector(st.boss).onStopStart?.(bossFx(ctx, st.boss), st);
    emitBossInfo(ctx);
  }
  refill(ctx, r.handSize);
}

function emitBossInfo(ctx: Ctx): void {
  const st = ctx.s.stop;
  if (ctx.ev && st?.boss && st.bossState[0] !== undefined) {
    emit(ctx, { e: 'bossInfo', code: st.boss, value: st.bossState[0]! });
  }
}

function refill(ctx: Ctx, handSize: number): void {
  const st = ctx.s.stop!;
  const drawn: number[] = [];
  while (st.hand.length < handSize && st.draw.length > 0) {
    const uid = st.draw.shift()!;
    st.hand.push(uid);
    drawn.push(uid);
  }
  if (drawn.length) emit(ctx, { e: 'draw', uids: drawn });
}

export function refillHand(ctx: Ctx): void {
  refill(ctx, buildRules(ctx.s).handSize);
}

function checkSlots(st: StopState, idx: readonly number[], max: number): void {
  if (idx.length < 1 || idx.length > max) throw new IllegalAction('slot_count');
  const seen = new Set<number>();
  for (const i of idx) {
    if (!Number.isInteger(i) || i < 0 || i >= st.hand.length || seen.has(i))
      throw new IllegalAction('bad_slot');
    seen.add(i);
  }
}

export function canOverdrive(r: Rules, gauge: number): boolean {
  return r.odAlways || gauge >= r.odMin;
}

interface Acc {
  t: number;
  n: number;
  num: bigint;
  den: bigint;
}

function apply(acc: Acc, d: Delta | undefined): void {
  if (!d) return;
  if (d.t) acc.t += d.t;
  if (d.n) acc.n += d.n;
  if (d.x) {
    acc.num *= BigInt(d.x[0]);
    acc.den *= BigInt(d.x[1]);
  }
}

const deltaEmpty = (d: Delta | undefined): boolean => !d || (!d.t && !d.n && !d.x);

export function playHand(ctx: Ctx, idx: readonly number[], odRequested: boolean): void {
  const s = ctx.s;
  const st = s.stop;
  if (s.phase !== 'stop' || !st) throw new IllegalAction('not_in_stop');
  if (st.hands <= 0) throw new IllegalAction('no_hands');
  checkSlots(st, idx, 5);
  const r = buildRules(s);
  const od = r.odAlways || odRequested;
  if (odRequested && !r.odAlways && s.gauge < r.odMin) throw new IllegalAction('overdrive_locked');

  st.hands -= 1;
  st.handsUsed += 1;
  const playedUids = idx.map((i) => st.hand[i]!);
  const played = playedUids.map((uid) => mustCard(s, uid));
  const heldUids = st.hand.filter((_, i) => !idx.includes(i));
  const held = heldUids.map((uid) => mustCard(s, uid));
  const ev = evaluate(played);
  const type = ev.type;
  const scoring = ev.scoring.map((i) => played[i]!);

  let step = 0;
  if (st.prevType >= 0 && (type === st.prevType || st.waveShield > 0)) step = st.waveStep + 1;
  const lvl = levelOf(s.mastery.xp[type]!);
  const level = r.masteryFlat ? Math.ceil(lvl / 2) : lvl;
  const base = handBase(type, level);
  const gaugeBefore = s.gauge;

  const h: HandView = {
    played,
    scoring,
    held,
    type,
    level,
    baseT: base.t,
    baseN: base.n,
    waveStep: step,
    gaugeBefore,
    od,
    prevType: st.prevType,
    stopNo: s.stopNo,
    boss: st.boss,
    run: s,
  };
  emit(ctx, { e: 'handStart', uids: playedUids, scoring: ev.scoring, type, level, od });
  emit(ctx, { e: 'base', t: base.t, n: base.n });

  const acc: Acc = { t: base.t, n: base.n, num: 1n, den: 1n };
  const boss = st.boss ? inspector(st.boss) : null;
  const sparkRng = stream(s.cfg.seed, Tag.SPARK, s.stopNo, st.handNo);
  const adds: number[] = [];

  // 3. Scoring cards, left to right, with retriggers.
  for (let i = 0; i < scoring.length; i++) {
    const c = scoring[i]!;
    const pd = c.punch ? punch(c.punch) : null;
    let reps = 1 + (pd?.retrig ?? 0);
    for (let k = 0; k < s.cabin.length; k++) {
      const seat = s.cabin[k];
      const fn = seat ? passenger(seat.code).onRetrig : undefined;
      if (seat && fn) reps += fn(h, c, i, seatCtx(s, k));
    }
    for (let rep = 0; rep < reps; rep++) {
      let t: number = c.rank;
      if (boss?.cardT) t = boss.cardT(c, t, h, st);
      acc.t += t;
      emit(ctx, { e: 'card', uid: c.uid, rep, t, n: 0 });
      let sparks =
        sparkRng.range(GAUGE.sparkMin, GAUGE.sparkMax) +
        (c.rank >= GAUGE.highRankFrom ? GAUGE.sparkHighRank : 0);
      if (pd?.onScore) {
        const d = pd.onScore(c, h);
        apply(acc, d);
        sparks += d?.sparks ?? 0;
        if (!deltaEmpty(d)) emit(ctx, { e: 'mod', src: { k: 'punch', uid: c.uid }, uid: c.uid, ...pick(d) });
      }
      for (let k = 0; k < s.cabin.length; k++) {
        const seat = s.cabin[k];
        const fn = seat ? passenger(seat.code).onCard : undefined;
        if (!seat || !fn) continue;
        const d = fn(h, c, i, seatCtx(s, k));
        apply(acc, d);
        sparks += d?.sparks ?? 0;
        if (!deltaEmpty(d)) emit(ctx, { e: 'mod', src: { k: 'seat', i: k }, uid: c.uid, ...pick(d) });
      }
      if (boss?.cardSparks) sparks += boss.cardSparks(c, h, st);
      adds.push(sparks);
    }
  }

  // 4. Held cards.
  for (const c of held) {
    const before = acc.t;
    const beforeN = acc.n;
    if (c.punch) apply(acc, punch(c.punch).onHeld?.(c, h));
    for (let k = 0; k < s.cabin.length; k++) {
      const seat = s.cabin[k];
      const fn = seat ? passenger(seat.code).onHeld : undefined;
      if (seat && fn) apply(acc, fn(h, c, seatCtx(s, k)));
    }
    if (acc.t !== before || acc.n !== beforeN) {
      emit(ctx, { e: 'held', uid: c.uid, t: acc.t - before, n: acc.n - beforeN });
    }
  }

  // 5. Hand-level modifiers: seats, wave, boss.
  for (let k = 0; k < s.cabin.length; k++) {
    const seat = s.cabin[k];
    const fn = seat ? passenger(seat.code).onHand : undefined;
    if (!seat || !fn) continue;
    const d = fn(h, seatCtx(s, k));
    apply(acc, d);
    if (!deltaEmpty(d)) emit(ctx, { e: 'mod', src: { k: 'seat', i: k }, ...pick(d) });
  }
  const waveN = Math.min(step * r.wavePer, r.waveMax);
  if (waveN > 0) {
    acc.n += waveN;
    emit(ctx, { e: 'wave', step });
    emit(ctx, { e: 'mod', src: { k: 'wave' }, n: waveN });
  }
  if (boss?.onHand) {
    const d = boss.onHand(h, st);
    apply(acc, d);
    if (!deltaEmpty(d)) emit(ctx, { e: 'mod', src: { k: 'boss', code: st.boss }, ...pick(d) });
  }

  // 6. N cap and clamps.
  if (r.nCap !== null && acc.n > r.nCap) {
    acc.n = r.nCap;
    emit(ctx, { e: 'nCap', n: acc.n });
  }
  if (acc.t < 0) acc.t = 0;
  if (acc.n < 0) acc.n = 0;

  // 7. Overdrive and power (one floor).
  let num = BigInt(acc.t) * BigInt(acc.n) * acc.num;
  let den = acc.den;
  if (od) {
    const x = [r.odDen + gaugeBefore, r.odDen] as const;
    num *= BigInt(x[0]);
    den *= BigInt(x[1]);
    emit(ctx, { e: 'overdrive', gauge: gaugeBefore, x });
  }
  const power = num / den;
  st.total += power;
  s.stats.handsPlayed += 1;
  if (power > s.stats.peak) {
    s.stats.peak = power;
    s.stats.peakHand = type;
  }
  emit(ctx, { e: 'power', t: acc.t, n: acc.n, power, total: st.total });

  // 8. Gauge: a chosen overdrive drains it; otherwise (and under always-on overdrive) sparks fill it, then blowout.
  if (od && !r.odAlways) {
    s.gauge = 0;
    emit(ctx, { e: 'gauge', gauge: 0, src: { k: 'base' } });
  } else {
    let sum = 0;
    for (const a of adds) sum += a;
    sum = Math.floor((sum * r.sparkMul[0]) / r.sparkMul[1]);
    s.gauge += sum;
    emit(ctx, { e: 'sparks', adds, gauge: s.gauge });
    if (s.gauge >= r.blowAt) blowout(ctx);
  }

  // 9. Стаж XP.
  const add =
    (XP.perPlay + (od ? XP.overdriveBonus : 0) + (s.mastery.played[type] === 0 ? XP.firstPlayBonus : 0)) *
    r.xpMul;
  s.mastery.played[type] = s.mastery.played[type]! + 1;
  const m = s.mastery;
  const lvBefore = levelOf(m.xp[type]!);
  m.xp[type] = m.xp[type]! + add;
  const lv = levelOf(m.xp[type]!);
  emit(ctx, {
    e: 'xp',
    hand: type,
    add,
    xp: m.xp[type]!,
    level: lv,
    levelUp: lv > lvBefore,
    src: { k: 'base' },
  });

  // 10. After-hand hooks.
  for (let k = 0; k < s.cabin.length; k++) {
    const seat = s.cabin[k];
    const fn = seat ? passenger(seat.code).onAfterHand : undefined;
    if (seat && fn) fn(seatFx(ctx, k), h, power, seatCtx(s, k));
  }
  for (const c of played) {
    const fn = c.punch ? punch(c.punch).onPlayed : undefined;
    if (fn) fn(makeFx(ctx, null, { k: 'punch', uid: c.uid }), c);
  }
  for (const c of held) {
    const fn = c.punch ? punch(c.punch).afterHandHeld : undefined;
    if (fn && cardByUid(s, c.uid)) fn(makeFx(ctx, null, { k: 'punch', uid: c.uid }), c);
  }
  if (boss?.onAfterHand) {
    boss.onAfterHand(bossFx(ctx, st.boss), h, st);
    emitBossInfo(ctx);
  }

  // 11. Bookkeeping.
  st.prevType = type;
  st.waveStep = step;
  st.waveShield = Math.max(0, st.waveShield - 1);
  st.handNo += 1;
  st.hand = st.hand.filter((uid) => !playedUids.includes(uid));
  st.spent.push(...playedUids);

  // 12. Outcome.
  if (st.total >= st.target) clearStop(ctx);
  else if (st.hands <= 0) failStop(ctx);
  else {
    refill(ctx, r.handSize);
    emitCounters(ctx);
  }
}

const pick = (d: Delta | undefined): { t?: number; n?: number; x?: readonly [number, number] } => {
  const out: { t?: number; n?: number; x?: readonly [number, number] } = {};
  if (d?.t) out.t = d.t;
  if (d?.n) out.n = d.n;
  if (d?.x) out.x = d.x;
  return out;
};

function blowout(ctx: Ctx): void {
  const s = ctx.s;
  const st = s.stop!;
  for (let k = 0; k < s.cabin.length; k++) {
    const seat = s.cabin[k];
    const fn = seat ? passenger(seat.code).onBlowout : undefined;
    if (seat && fn && fn(seatFx(ctx, k), seatCtx(s, k))) {
      emit(ctx, { e: 'blowout', cancelledBy: { k: 'seat', i: k }, penalty: 'none', gauge: s.gauge });
      return;
    }
  }
  s.gauge = 0;
  st.blowouts += 1;
  if (st.hands > 0) {
    st.hands -= 1;
    emit(ctx, { e: 'blowout', cancelledBy: null, penalty: 'hand', gauge: 0 });
  } else {
    s.tokens = Math.max(0, s.tokens - ECON.blowoutTokens);
    emit(ctx, { e: 'blowout', cancelledBy: null, penalty: 'tokens', gauge: 0 });
  }
}

export function discardCards(ctx: Ctx, idx: readonly number[]): void {
  const s = ctx.s;
  const st = s.stop;
  if (s.phase !== 'stop' || !st) throw new IllegalAction('not_in_stop');
  if (st.discards <= 0) throw new IllegalAction('no_discards');
  checkSlots(st, idx, 5);
  const uids = idx.map((i) => st.hand[i]!);
  const cards = uids.map((uid) => mustCard(s, uid));
  st.hand = st.hand.filter((uid) => !uids.includes(uid));
  st.spent.push(...uids);
  st.discards -= 1;
  st.discardsUsed += 1;
  emit(ctx, { e: 'discard', uids });
  for (let k = 0; k < s.cabin.length; k++) {
    const seat = s.cabin[k];
    const fn = seat ? passenger(seat.code).onDiscard : undefined;
    if (seat && fn) fn(seatFx(ctx, k), cards, seatCtx(s, k));
  }
  for (const c of cards) {
    const fn = c.punch ? punch(c.punch).onDiscard : undefined;
    if (fn && cardByUid(s, c.uid)) fn(makeFx(ctx, null, { k: 'punch', uid: c.uid }), c);
  }
  refill(ctx, buildRules(s).handSize);
  emitCounters(ctx);
}

const isBossKind = (k: StopKind): boolean => k === 'boss' || k === 'final' || k === 'ringBoss';

function clearStop(ctx: Ctx): void {
  const s = ctx.s;
  const st = s.stop!;
  const income: { src: { k: 'income' }; tokens: number }[] = [];
  const base = ECON.income[st.kind];
  if (base) income.push({ src: { k: 'income' }, tokens: base });
  if (st.hands > 0) income.push({ src: { k: 'income' }, tokens: st.hands * ECON.perUnusedHand });
  if (st.total >= st.target * BigInt(ECON.overkillMul))
    income.push({ src: { k: 'income' }, tokens: ECON.overkillBonus });
  for (const it of income) s.tokens += it.tokens;
  emit(ctx, { e: 'stopCleared', stopNo: s.stopNo, total: st.total, target: st.target, income });

  const info = {
    kind: st.kind,
    handsUsed: st.handsUsed,
    discardsUsed: st.discardsUsed,
    blowouts: st.blowouts,
    total: st.total,
    target: st.target,
  };
  for (let k = 0; k < s.cabin.length; k++) {
    const seat = s.cabin[k];
    const fn = seat ? passenger(seat.code).onStopEnd : undefined;
    if (seat && fn) fn(seatFx(ctx, k), info, seatCtx(s, k));
  }

  s.stats.stopsCleared += 1;
  s.stats.output += st.total;
  const pts = st.target > 0n ? (st.total * 100n) / st.target : BigInt(DAILY_POINTS_CAP);
  s.stats.points += Number(pts > BigInt(DAILY_POINTS_CAP) ? BigInt(DAILY_POINTS_CAP) : pts);
  if (st.kind === 'ring' || st.kind === 'ringBoss') s.stats.ringStop = s.stopNo;

  const r = buildRules(s);
  if (isBossKind(st.kind)) {
    s.stats.bossesDefeated += 1;
    if (s.piggy > 0) {
      const raw = Math.floor((s.piggy * r.piggyBonus[0]) / r.piggyBonus[1]);
      const bonus = Math.min(raw, r.piggyCap);
      const deposit = s.piggy;
      s.piggy = 0;
      addTokens(ctx, deposit + bonus, { k: 'income' });
      emit(ctx, { e: 'piggyPayout', deposit, bonus });
    }
  }
  if (r.gaugeCools && s.gauge > 0) {
    s.gauge = Math.floor(s.gauge / 2);
    emit(ctx, { e: 'gauge', gauge: s.gauge, src: { k: 'base' } });
  }
  const kind = st.kind;
  s.stop = null;
  ctx.next?.(kind);
}

function failStop(ctx: Ctx): void {
  const s = ctx.s;
  const st = s.stop!;
  emit(ctx, { e: 'stopFailed', stopNo: s.stopNo, total: st.total, target: st.target });
  finishRun(ctx, 'failed');
}

export function finishRun(ctx: Ctx, reason: RunResult['reason']): void {
  const s = ctx.s;
  s.result = { won: s.stats.stopsCleared >= 12, endedAt: s.stopNo, reason };
  s.phase = 'over';
  emit(ctx, { e: 'phase', phase: 'over' });
  emit(ctx, { e: 'runOver', result: s.result });
}
