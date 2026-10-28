// Runs one bot game to the end and returns the actions and final state.
import { type Action, newRun, type RunConfig, type RunState, step } from '../../src/engine';
import { stream, Tag } from '../../src/engine/rng';
import { greedyAction } from './bots/greedy';
import { randomAction } from './bots/random';

export type Bot = 'random' | 'greedy';

export function playGame(
  cfg: RunConfig,
  bot: Bot,
  maxActions = 3000,
): { state: RunState; actions: Action[] } {
  const { state } = newRun(cfg);
  const rng = stream(cfg.seed, Tag.DAILY, 999, 999);
  const actions: Action[] = [];
  while (state.phase !== 'over' && actions.length < maxActions) {
    // Ring runs can go on forever: stop after stop 18.
    const a: Action =
      state.stopNo > 18 && state.phase === 'route'
        ? { t: 'end' }
        : bot === 'greedy'
          ? greedyAction(state)
          : randomAction(state, rng);
    step(state, a, { events: false });
    actions.push(a);
  }
  if (state.phase !== 'over') {
    step(state, { t: 'end' }, { events: false });
    actions.push({ t: 'end' });
  }
  return { state, actions };
}
