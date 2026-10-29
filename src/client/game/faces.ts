// Face cards drawn in code: the Jack is a young conductor, the Queen a conductress, the King the depot chief.
// Each figure is stored as its left half (11 px) and mirrored to 22×24; clothes take the suit colour.
import { CSS } from '../gfx/palette';

const FACES: Record<11 | 12 | 13, string[]> = {
  11: [
    '...........',
    '...........',
    '.....kkkkkk',
    '....kcccccc',
    '...kcccccgg',
    '...kkkkkkkk',
    '..kkkkkkkkk',
    '...khhhhhss',
    '...khssssss',
    '...ksssssss',
    '...ksssekss',
    '...kssssssS',
    '..kSsssssss',
    '...ksssssss',
    '...kssssskk',
    '....kssssss',
    '.....kkkkkk',
    '....kkcwwww',
    '..kkccccwkk',
    '.kcccccccwk',
    'kccccccccgw',
    'kcwwwccccwk',
    'kcwgwccccgw',
    'kcwwwcccccw',
  ],
  12: [
    '......kkkkk',
    '.....khhhhh',
    '....khhhggg',
    '...khhhgwgg',
    '...khhhhhhh',
    '..khhhhhhhh',
    '..khhssssss',
    '..khsssssss',
    '..khssseess',
    '..khssssssS',
    '..khsssssss',
    '..khsssssrr',
    '..kghsssssr',
    '..kgkhsssss',
    '...k.khssss',
    '......kkkkk',
    '....kwkwcww',
    '..kkwccccwc',
    '.kccccccgcc',
    'kcccccccccg',
    'kcccccccccc',
    'kccccgccccc',
    'kcccccccccc',
    'kccccccccgc',
  ],
  13: [
    '......kkkkk',
    '....kkccccc',
    '...kccccccg',
    '...kcccccgw',
    '...kccccccg',
    '..kkkkkkkkk',
    '.kkkkkkkkkk',
    '...khssssss',
    '...khssssss',
    '...kssseess',
    '...kssssssS',
    '..kSsssssss',
    '...kshhhhhs',
    '...khhhkkkh',
    '....khhhhhh',
    '.....khhhhh',
    '......kkkkk',
    '....kkcwwww',
    '..kkccccwwk',
    '.kgggcccwwk',
    'kcgggccccwk',
    'kccccccccgw',
    'kccccccccwk',
    'kccccccccgw',
  ],
};
const HAIR = { 11: '#a05a28', 12: '#5a3228', 13: '#c8c8d6' } as const;
const FIXED: Record<string, string> = {
  k: CSS.ink,
  e: CSS.ink,
  s: '#f0be96',
  S: '#c88c69',
  g: CSS.amber2,
  w: CSS.paper1,
  r: CSS.blow1,
};

export const FACE_W = 22;
export const FACE_H = 24;

export function drawFace(
  ctx: CanvasRenderingContext2D,
  rank: 11 | 12 | 13,
  x: number,
  y: number,
  cloth: string,
): void {
  FACES[rank].forEach((half, row) => {
    const full = half + [...half].reverse().join('');
    for (let i = 0; i < full.length; i++) {
      const ch = full[i]!;
      if (ch === '.') continue;
      ctx.fillStyle = ch === 'h' ? HAIR[rank] : ch === 'c' ? cloth : FIXED[ch]!;
      ctx.fillRect(x + i, y + row, 1, 1);
    }
  });
}
