import palette from '../../../assets/palette.json';

type Name = keyof typeof palette.colors;

const toNum = (hex: string): number => Number.parseInt(hex.slice(1), 16);

/** Numeric colours (0xRRGGBB) for Pixi. */
export const C = Object.fromEntries(Object.entries(palette.colors).map(([k, v]) => [k, toNum(v)])) as Record<
  Name,
  number
>;

/** CSS colour strings. */
export const CSS = palette.colors as Record<Name, string>;

export const SUIT_COLOR = [C.suitSpade, C.suitHeart, C.suitDiamond, C.suitClub] as const;
export const SUIT_CSS = [CSS.suitSpade, CSS.suitHeart, CSS.suitDiamond, CSS.suitClub] as const;
export const RARITY_COLOR = { C: C.glass3, U: C.volt2, R: C.amber2 } as const;

export function rgb(n: number): [number, number, number] {
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
