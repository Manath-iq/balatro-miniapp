import { CONTENT_HASH } from './content/registry';
import { decodeLog, ENGINE_VERSION } from './log';
import { newRun, step, summarize } from './run';
import type { RunConfig, RunState, RunSummary } from './types';
import { IllegalAction } from './types';

/** Re-runs a recorded game with events off. Throws IllegalAction on version mismatch or illegal moves. */
export function replayState(cfg: RunConfig, log: Uint8Array): { state: RunState; actions: number } {
  const { engine, contentHash, actions } = decodeLog(log);
  if (engine !== ENGINE_VERSION || contentHash !== CONTENT_HASH) throw new IllegalAction('engine_outdated');
  const { state } = newRun(cfg);
  for (const a of actions) {
    if (state.phase === 'over') throw new IllegalAction('actions_after_end');
    step(state, a, { events: false });
  }
  return { state, actions: actions.length };
}

export function replay(cfg: RunConfig, log: Uint8Array): RunSummary {
  const { state, actions } = replayState(cfg, log);
  return summarize(state, actions);
}
