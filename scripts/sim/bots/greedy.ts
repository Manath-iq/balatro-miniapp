// Greedy bot: plays the subset with the best estimated power, discards weak hands, buys what it can afford.
import { type Action, legal, preview, type RunState } from '../../../src/engine';

function subsets(n: number): number[][] {
  const out: number[][] = [];
  for (let mask = 1; mask < 1 << n; mask++) {
    const idx: number[] = [];
    for (let i = 0; i < n; i++) if (mask & (1 << i)) idx.push(i);
    if (idx.length <= 5) out.push(idx);
  }
  return out;
}
const SUBSETS: number[][][] = Array.from({ length: 9 }, (_, n) => subsets(n));

export function bestPlay(s: RunState): { idx: number[]; est: number } {
  const st = s.stop!;
  let best = { idx: [0], est: -1 };
  for (const idx of SUBSETS[st.hand.length]!) {
    const p = preview(s, idx);
    let t = p.t;
    for (const i of p.scoring) t += s.deck.find((c) => c.uid === st.hand[idx[i]!])!.rank;
    const est = t * p.n * 100 - idx.length;
    if (est > best.est) best = { idx, est };
  }
  return best;
}

export function greedyAction(s: RunState): Action {
  const L = legal(s);
  switch (s.phase) {
    case 'route': {
      const o = s.route.options;
      const pick = o.length === 2 && o[0]!.kind !== 'branch' && s.tokens < 6 ? 1 : 0;
      return { t: 'route', choice: pick };
    }
    case 'stop': {
      const st = s.stop!;
      const play = bestPlay(s);
      const p = preview(s, play.idx);
      const remaining = st.target - st.total;
      if (L.discard && p.type <= 1 && BigInt(Math.floor(play.est / 100)) * BigInt(st.hands) < remaining) {
        const keep = new Set(play.idx);
        const idx = [...Array(st.hand.length).keys()].filter((i) => !keep.has(i)).slice(0, 5);
        if (idx.length) return { t: 'discard', idx };
      }
      return { t: 'play', idx: play.idx, od: L.od && (s.gauge >= 70 || st.hands === 1) };
    }
    case 'reward': {
      const i = L.reward.indexOf(true);
      return { t: 'reward', pick: i >= 0 ? i : 15 };
    }
    case 'kiosk': {
      const k = s.kiosk!;
      let best = -1;
      for (let i = 0; i < L.buy.length; i++) {
        const it = k.slots[i];
        if (L.buy[i] && it?.k === 'passenger' && (best < 0 || it.price > k.slots[best]!.price)) best = i;
      }
      if (best >= 0) return { t: 'buy', slot: best };
      return { t: 'leave' };
    }
    case 'depot':
      return L.ring ? { t: 'ring' } : { t: 'end' };
    default:
      return { t: 'end' };
  }
}
