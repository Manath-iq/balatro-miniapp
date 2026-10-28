// Random bot: picks uniformly among legal actions with a bias toward progress. Uses only the public engine API.
import { type Action, legal, preview, type RunState } from '../../../src/engine';
import type { Rng } from '../../../src/engine/rng';

export function randomAction(s: RunState, rng: Rng): Action {
  const L = legal(s);
  switch (s.phase) {
    case 'route':
      return { t: 'route', choice: rng.int(L.route) };
    case 'stop': {
      const hand = s.stop!.hand.length;
      const count = rng.range(1, Math.min(5, hand));
      const idx = rng.shuffled([...Array(hand).keys()]).slice(0, count);
      if (L.discard && rng.chance(1, 4)) return { t: 'discard', idx };
      preview(s, idx);
      return { t: 'play', idx, od: L.od && rng.chance(1, 3) };
    }
    case 'reward': {
      const ok = L.reward.map((v, i) => (v ? i : -1)).filter((i) => i >= 0);
      return { t: 'reward', pick: ok.length && rng.chance(3, 4) ? rng.pick(ok) : 15 };
    }
    case 'kiosk': {
      const buys = L.buy.map((v, i) => (v ? i : -1)).filter((i) => i >= 0);
      const r = rng.int(10);
      if (buys.length && r < 4) return { t: 'buy', slot: rng.pick(buys) };
      if (L.shift && r === 4) return { t: 'shift' };
      if (L.piggy && r === 5) return { t: 'piggy', deposit: 1 };
      return { t: 'leave' };
    }
    case 'depot':
      return L.ring && rng.chance(1, 2) ? { t: 'ring' } : { t: 'end' };
    default:
      return { t: 'end' };
  }
}
