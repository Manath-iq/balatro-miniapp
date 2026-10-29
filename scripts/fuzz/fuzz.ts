// Random-bot fuzzer: plays many runs with every kind of action (including illegal ones), checks invariants,
// and verifies that replaying the encoded log reproduces the same final state hash.
//   npx tsx scripts/fuzz/fuzz.ts [runs]
import {
  type Action,
  type HandType,
  encodeLog,
  hashState,
  IllegalAction,
  legal,
  newRun,
  preview,
  type RunConfig,
  replayState,
  step,
} from '../../src/engine';
import { coupon } from '../../src/engine/content/registry';
import { stream } from '../../src/engine/rng';
import { greedyAction } from '../sim/bots/greedy';

const RUNS = Number(process.argv[2] ?? 300);
/** cheat: every stop target becomes tiny so runs reach the finals, the Depot and the Ring (no replay check). */
const CHEAT = process.argv[3] === 'cheat';
const problems = new Map<string, number>();
const note = (k: string): void => void problems.set(k, (problems.get(k) ?? 0) + 1);
const phases = new Map<string, number>();
let stopsMax = 0;
let illegal = 0;

for (let run = 0; run < RUNS; run++) {
  const rng = stream([run, 7, 99, run * 31], 1);
  const pick = <T>(a: readonly T[]): T => a[rng.int(a.length)]!;
  const cfg: RunConfig = {
    seed: [run * 2654435761, run, 12345, 678],
    kind: run % 3 === 0 ? 'daily' : 'standard',
    driver: (run % 2) + 1,
    grade: 1,
    condition: 0,
  };
  const s = newRun(cfg).state;
  const log: Action[] = [];
  for (let n = 0; n < 3000 && s.phase !== 'over'; n++) {
    const L = legal(s);
    phases.set(L.phase, (phases.get(L.phase) ?? 0) + 1);
    const opts: Action[] = [];
    if (L.route) opts.push({ t: 'route', choice: rng.int(L.route) });
    if (s.stop) {
      const hand = s.stop.hand.length;
      const k = 1 + rng.int(Math.min(5, hand));
      const idx = [...Array(hand).keys()].sort(() => rng.int(3) - 1).slice(0, k);
      if (L.play) {
        try {
          preview(s, idx);
        } catch (e) {
          note(`preview threw: ${(e as Error).message}`);
        }
        opts.push({ t: 'play', idx, od: L.od && rng.int(2) === 0 }, { t: 'play', idx, od: false });
      }
      if (L.discard) opts.push({ t: 'discard', idx });
    }
    L.coupon.forEach((ok, slot) => {
      if (!ok) return;
      const code = s.pocket[slot]!;
      const tg = coupon(code).target;
      const pool = s.stop ? s.stop.hand : s.deck.map((c) => c.uid);
      const uids = tg.k === 'cards' ? pool.slice(0, tg.min + rng.int(tg.max - tg.min + 1)) : undefined;
      const a: Action = { t: 'coupon', slot };
      if (uids) a.uids = uids;
      if (tg.k === 'hand') a.hand = rng.int(9) as HandType;
      opts.push(a);
    });
    L.buy.forEach((ok, slot) => ok && opts.push({ t: 'buy', slot }, { t: 'buy', slot }));
    if (L.shift) opts.push({ t: 'shift' });
    L.sell.forEach((ok, seat) => ok && rng.int(4) === 0 && opts.push({ t: 'sell', seat }));
    if (L.swap) opts.push({ t: 'swap', a: rng.int(s.cabin.length), b: rng.int(s.cabin.length) });
    if (L.workshop) opts.push({ t: 'workshop', uid: pick(s.deck).uid, pick: rng.int(2) as 0 | 1 });
    if (L.scrap) opts.push({ t: 'scrap', uid: pick(s.deck).uid });
    if (L.piggy) opts.push({ t: 'piggy', deposit: 1 + rng.int(Math.max(1, s.tokens)) });
    if (s.piggy > 0 && s.phase === 'kiosk') opts.push({ t: 'piggyBreak' });
    L.reward.forEach((ok, i) => ok && opts.push({ t: 'reward', pick: i }));
    if (L.phase === 'reward') opts.push({ t: 'reward', pick: 15 });
    if (L.leave) opts.push({ t: 'leave' }, { t: 'leave' }, { t: 'leave' });
    if (L.ring && rng.int(2) === 0) opts.push({ t: 'ring' });
    if (L.phase === 'depot') opts.push({ t: 'end' });
    // Occasionally try something illegal on purpose: it must throw IllegalAction and leave state untouched.
    if (rng.int(20) === 0)
      opts.push({ t: 'play', idx: [9], od: false }, { t: 'buy', slot: 7 }, { t: 'route', choice: 5 });
    if (!opts.length) {
      note(`no options in phase ${L.phase}`);
      break;
    }
    let a = pick(opts);
    if (s.stop && rng.int(10) < 7) a = greedyAction(s);
    const before = hashState(s);
    try {
      step(s, a);
      log.push(a);
      if (CHEAT && s.stop && s.stop.total === 0n && s.stop.target > 5n)
        s.stop.target = 5n + BigInt(rng.int(400));
    } catch (e) {
      if (!(e instanceof IllegalAction)) {
        note(`crash on ${a.t}: ${(e as Error).message}`);
        break;
      }
      illegal++;
      if (hashState(s) !== before) note(`illegal ${a.t} (${(e as Error).message}) mutated state`);
    }
    if (s.tokens < 0) note('negative tokens');
    if (s.stop && s.stop.hand.length > 8) note('hand too big');
    if (s.gauge < 0) note('negative gauge');
    if (s.cabin.some((x, i) => x && s.cabin.indexOf(x) !== i)) note('seat object shared');
  }
  stopsMax = Math.max(stopsMax, s.stats.stopsCleared);
  if (!CHEAT)
    try {
      const r = replayState(cfg, encodeLog(log));
      if (hashState(r.state) !== hashState(s)) note('replay hash mismatch');
    } catch (e) {
      note(`replay threw: ${(e as Error).message}`);
    }
}
console.log({ runs: RUNS, illegal, stopsMax, phases: Object.fromEntries(phases) });
console.log(problems.size ? Object.fromEntries(problems) : 'no problems');
