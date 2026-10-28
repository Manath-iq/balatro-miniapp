import { describe, expect, it } from 'vitest';
import { playGame } from '../../scripts/sim/play';
import {
  decodeLog,
  encodeLog,
  fromBase64Url,
  hashState,
  newRun,
  type RunConfig,
  replay,
  step,
  targetOf,
  toBase64Url,
} from '../../src/engine';
import { TARGETS } from '../../src/engine/content/balance';

const cfg = (i: number, kind: 'standard' | 'daily' = 'standard'): RunConfig => ({
  seed: [i + 1, i * 7 + 3, 99, i ^ 0x5555],
  kind,
  driver: 1 + (i % 2),
  grade: 1,
  condition: 0,
});

describe('run', () => {
  it('replays bot games to the identical state', () => {
    for (let i = 0; i < 150; i++) {
      const c = cfg(i, i % 5 === 0 ? 'daily' : 'standard');
      const { state, actions } = playGame(c, i % 2 ? 'greedy' : 'random');
      const log = encodeLog(actions);
      expect(decodeLog(fromBase64Url(toBase64Url(log))).actions).toEqual(actions);
      expect(replay(c, log).hash).toBe(hashState(state));
    }
  });

  it('starts at a branch choice and enters a stop with a 7-card hand', () => {
    const { state, events } = newRun(cfg(1));
    expect(state.phase).toBe('route');
    expect(state.route.options.map((o) => o.kind)).toEqual(['branch', 'branch']);
    expect(events.some((e) => e.e === 'routeOptions')).toBe(true);
    step(state, { t: 'route', choice: 0 });
    expect(state.phase).toBe('stop');
    expect(state.stop!.hand).toHaveLength(7);
    expect(state.stop!.hands).toBe(4);
  });

  it('computes targets: express, ring growth, ring boss', () => {
    expect(targetOf(2, 'express')).toBe((TARGETS[2]! * 7n) / 5n);
    const r13 = (TARGETS[12]! * 17n) / 10n;
    expect(targetOf(13, 'ring')).toBe(r13);
    expect(targetOf(15, 'ringBoss')).toBe((((((r13 * 17n) / 10n) * 17n) / 10n) * 8n) / 5n);
  });

  it('rejects illegal actions and tampered logs', () => {
    const { state } = newRun(cfg(2));
    expect(() => step(state, { t: 'play', idx: [0], od: false })).toThrow();
    const bad = encodeLog([{ t: 'route', choice: 0 }]);
    bad[3] = 99;
    expect(() => replay(cfg(2), bad)).toThrow();
  });
});
