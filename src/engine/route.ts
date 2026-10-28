// Route structure: lines, branches, stop kinds and targets.
import { EXPRESS_TARGET, FINAL_STOP, RING, TARGETS } from './content/balance';
import { condition, pools } from './content/registry';
import { mulRatio } from './power';
import { stream, Tag } from './rng';
import type { Ratio, RouteOption, RunState, StopKind } from './types';

export const lineOf = (stopNo: number): number => (stopNo > FINAL_STOP ? 3 : Math.ceil(stopNo / 4));

export function targetOf(stopNo: number, kind: StopKind, mul?: Ratio): bigint {
  let t: bigint;
  if (stopNo <= FINAL_STOP) {
    t = TARGETS[stopNo] ?? 0n;
    if (kind === 'express') t = mulRatio(t, EXPRESS_TARGET[0], EXPRESS_TARGET[1]);
  } else {
    t = TARGETS[FINAL_STOP]!;
    for (let k = FINAL_STOP + 1; k <= stopNo; k++) {
      const g = k >= RING.lateFrom ? RING.growthLate : RING.growth;
      t = mulRatio(t, g[0], g[1]);
    }
    if (kind === 'ringBoss') t = mulRatio(t, RING.bossMul[0], RING.bossMul[1]);
  }
  if (mul) t = mulRatio(t, mul[0], mul[1]);
  return t;
}

export function targetFor(s: RunState, stopNo: number, kind: StopKind): bigint {
  const mul = s.condition ? condition(s.condition).targetMul : undefined;
  return targetOf(stopNo, kind, mul);
}

/** Line bosses [line][branch] from the seed (empty pools → 0). */
export function rollLineBosses(s: RunState): number[][] {
  const rng = stream(s.cfg.seed, Tag.ROUTE, 0, 0);
  const lb = rng.shuffled(pools.lineBosses.map((b) => b.code));
  const fb = rng.shuffled(pools.finalBosses.map((b) => b.code));
  const at = (arr: number[], i: number): number => (arr.length ? arr[i % arr.length]! : 0);
  return [
    [at(lb, 0), at(lb, 1)],
    [at(lb, 2), at(lb, 3)],
    [at(fb, 0), at(fb, 1)],
  ];
}

export function routeOptions(s: RunState, stopNo: number): RouteOption[] {
  if (stopNo > FINAL_STOP) {
    const boss = (stopNo - FINAL_STOP) % RING.bossEvery === 0;
    if (!boss) return [{ kind: 'ring', boss: 0, target: targetFor(s, stopNo, 'ring') }];
    const pool = pools.lineBosses;
    const code = pool.length
      ? pool[stream(s.cfg.seed, Tag.ROUTE, 1, s.route.ringBosses).int(pool.length)]!.code
      : 0;
    return [{ kind: 'ringBoss', boss: code, target: targetFor(s, stopNo, 'ringBoss') }];
  }
  const line = lineOf(stopNo);
  const bosses = s.route.lineBosses[line - 1]!;
  const branch = s.route.branch[line - 1]!;
  if (stopNo === 1 || stopNo === 5 || stopNo === 9) {
    const target = targetFor(s, stopNo, 'normal');
    return [
      { kind: 'branch', boss: bosses[0]!, target },
      { kind: 'branch', boss: bosses[1]!, target },
    ];
  }
  if (stopNo === 4 || stopNo === 8) {
    return [{ kind: 'boss', boss: bosses[branch]!, target: targetFor(s, stopNo, 'boss') }];
  }
  if (stopNo === FINAL_STOP) {
    return [{ kind: 'final', boss: bosses[branch]!, target: targetFor(s, stopNo, 'final') }];
  }
  return [
    { kind: 'normal', boss: 0, target: targetFor(s, stopNo, 'normal') },
    { kind: 'express', boss: 0, target: targetFor(s, stopNo, 'express') },
  ];
}
