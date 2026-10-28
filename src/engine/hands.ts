// Poker hand evaluation for 1–5 cards (duplicates allowed: copies make Пятерня possible).
import type { Card, HandType } from './types';

export interface Evaluation {
  type: HandType;
  /** Indices into the evaluated cards that score, ascending (play order). */
  scoring: number[];
}

const asc = (a: number, b: number): number => a - b;

export function evaluate(cards: readonly Card[]): Evaluation {
  const n = cards.length;
  if (n < 1 || n > 5) throw new RangeError(`evaluate: ${n} cards`);

  const byRank: number[][] = [];
  for (let r = 0; r <= 14; r++) byRank.push([]);
  for (let i = 0; i < n; i++) byRank[cards[i]!.rank]!.push(i);

  // Groups by size desc, then rank desc.
  const groups: number[][] = [];
  for (let r = 14; r >= 2; r--) if (byRank[r]!.length > 0) groups.push(byRank[r]!);
  groups.sort((a, b) => b.length - a.length || cards[b[0]!]!.rank - cards[a[0]!]!.rank);
  const g0 = groups[0]!.length;
  const g1 = groups[1]?.length ?? 0;
  const all = [0, 1, 2, 3, 4].slice(0, n);

  let flush = false;
  let straight = false;
  let royal = false;
  if (n === 5) {
    const s0 = cards[0]!.suit;
    flush = cards.every((c) => c.suit === s0);
    if (groups.length === 5) {
      let min = 15;
      let max = 0;
      for (const c of cards) {
        if (c.rank < min) min = c.rank;
        if (c.rank > max) max = c.rank;
      }
      const wheel =
        max === 14 && byRank[2]!.length + byRank[3]!.length + byRank[4]!.length + byRank[5]!.length === 4;
      straight = max - min === 4 || wheel;
      royal = straight && min === 10;
    }
  }

  if (flush && straight) return { type: royal ? 10 : 8, scoring: all };
  if (g0 === 5) return { type: 9, scoring: all };
  if (g0 === 4) return { type: 7, scoring: groups[0]!.slice().sort(asc) };
  if (g0 === 3 && g1 >= 2) return { type: 6, scoring: all };
  if (flush) return { type: 5, scoring: all };
  if (straight) return { type: 4, scoring: all };
  if (g0 === 3) return { type: 3, scoring: groups[0]!.slice().sort(asc) };
  if (g0 === 2 && g1 === 2) return { type: 2, scoring: [...groups[0]!, ...groups[1]!].sort(asc) };
  if (g0 === 2) return { type: 1, scoring: groups[0]!.slice().sort(asc) };

  let best = 0;
  for (let i = 1; i < n; i++) if (cards[i]!.rank > cards[best]!.rank) best = i;
  return { type: 0, scoring: [best] };
}
