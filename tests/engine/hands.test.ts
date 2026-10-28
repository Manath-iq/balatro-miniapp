import { describe, expect, it } from 'vitest';
import { newDeck } from '../../src/engine/cards';
import { cards } from '../../src/engine/content/testkit';
import { evaluate } from '../../src/engine/hands';

describe('evaluate', () => {
  it('matches the known 5-card frequencies over all C(52,5)', () => {
    const deck = newDeck();
    const counts = new Array<number>(11).fill(0);
    const hand = [deck[0]!, deck[0]!, deck[0]!, deck[0]!, deck[0]!];
    for (let a = 0; a < 48; a++)
      for (let b = a + 1; b < 49; b++)
        for (let c = b + 1; c < 50; c++)
          for (let d = c + 1; d < 51; d++)
            for (let e = d + 1; e < 52; e++) {
              hand[0] = deck[a]!;
              hand[1] = deck[b]!;
              hand[2] = deck[c]!;
              hand[3] = deck[d]!;
              hand[4] = deck[e]!;
              counts[evaluate(hand).type]!++;
            }
    expect(counts).toEqual([1302540, 1098240, 123552, 54912, 10200, 5108, 3744, 624, 36, 0, 4]);
  }, 60000);

  it('handles short hands, the wheel, and copies', () => {
    expect(evaluate(cards('9S 9H'))).toEqual({ type: 1, scoring: [0, 1] });
    expect(evaluate(cards('3S KH 7D'))).toEqual({ type: 0, scoring: [1] });
    expect(evaluate(cards('AS 2H 3D 4C 5S')).type).toBe(4);
    expect(evaluate(cards('QS KH AD 2C 3S')).type).toBe(0);
    expect(evaluate(cards('7S 7S 7S 7S 7S')).type).toBe(9);
    expect(evaluate(cards('10H JH QH KH AH')).type).toBe(10);
    expect(evaluate(cards('8S 8H 8D 4C 4S')).type).toBe(6);
    expect(evaluate(cards('KS KH 2D 2C 9S'))).toEqual({ type: 2, scoring: [0, 1, 2, 3] });
  });
});
