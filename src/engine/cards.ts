import type { Card, Rank, RunState, Suit } from './types';

export const isRed = (c: Card): boolean => c.suit === 1 || c.suit === 2;

/** 52 cards: suit 0..3 × rank 2..14, uids 1..52. */
export function newDeck(): Card[] {
  const deck: Card[] = [];
  let uid = 1;
  for (let suit = 0; suit < 4; suit++) {
    for (let rank = 2; rank <= 14; rank++) {
      deck.push({ uid: uid++, rank: rank as Rank, suit: suit as Suit, punch: 0, charge: 0 });
    }
  }
  return deck;
}

export function cardByUid(s: RunState, uid: number): Card | undefined {
  for (const c of s.deck) if (c.uid === uid) return c;
  return undefined;
}

export function mustCard(s: RunState, uid: number): Card {
  const c = cardByUid(s, uid);
  if (!c) throw new Error(`card ${uid} not in deck`);
  return c;
}
