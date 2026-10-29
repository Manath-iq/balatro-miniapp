// Code-drawn pixel art: suits, cards, panels and pixel text (Tiny5; Pixelify Sans for small text).
import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import type { Card } from '../../engine';
import { C, CSS, SUIT_CSS } from '../gfx/palette';
import { getLang } from '../i18n';
import { drawFace, FACE_H, FACE_W } from './faces';

export const CARD_W = 48;
export const CARD_H = 66;
export const FONT = 'Tiny5';
export const BODY_FONT = 'Pixelify';

/** Concrete faces behind the logical text sizes; `fit` steps down through them. */
interface Face {
  css: string;
  /** Icon pixel scale. */
  k: number;
  base: number;
  lineH: number;
  /** Row of the capital letters' vertical centre, for centring labels. */
  mid: number;
}
const face = (family: string, px: number, k: number, base: number, lineH: number, mid: number): Face => ({
  css: `${px}px ${family}`,
  k,
  base,
  lineH,
  mid,
});
const BIG = face(FONT, 24, 3, 21, 26, 14);
const BODY = face(FONT, 16, 2, 14, 18, 8);
// Pixelify only renders cleanly on its native 11 px grid; it replaces Tiny5 8, which was too small to read.
const SMALL = face(BODY_FONT, 11, 1, 9, 13, 5);
const TINY = face(FONT, 8, 1, 7, 10, 4);
const LADDER: Record<8 | 16 | 24, Face[]> = {
  24: [BIG, BODY, SMALL, TINY],
  16: [BODY, SMALL, TINY],
  8: [SMALL, TINY],
};

const SUITS: string[][] = [
  ['...X...', '..XXX..', '.XXXXX.', 'XXXXXXX', 'XXXXXXX', '.X.X.X.', '..XXX..'],
  ['.XX.XX.', 'XXXXXXX', 'XXXXXXX', 'XXXXXXX', '.XXXXX.', '..XXX..', '...X...'],
  ['...X...', '..XXX..', '.XXXXX.', 'XXXXXXX', '.XXXXX.', '..XXX..', '...X...'],
  ['..XXX..', '..XXX..', 'XXXXXXX', 'XXXXXXX', 'XX.X.XX', '...X...', '..XXX..'],
];

export function drawSuit(
  ctx: CanvasRenderingContext2D,
  suit: number,
  x: number,
  y: number,
  k = 1,
  color?: string,
): void {
  ctx.fillStyle = color ?? SUIT_CSS[suit]!;
  SUITS[suit]!.forEach((row, j) => {
    for (let i = 0; i < row.length; i++) if (row[i] === 'X') ctx.fillRect(x + i * k, y + j * k, k, k);
  });
}

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  return [c, ctx];
}

function tex(c: HTMLCanvasElement): Texture {
  const t = Texture.from(c);
  t.source.scaleMode = 'nearest';
  return t;
}

/** Rounded pixel rectangle with a 1-px border. */
function frame(ctx: CanvasRenderingContext2D, w: number, h: number, fill: string, edge: string): void {
  ctx.fillStyle = edge;
  ctx.fillRect(1, 0, w - 2, h);
  ctx.fillRect(0, 1, w, h - 2);
  ctx.fillStyle = fill;
  ctx.fillRect(1, 1, w - 2, h - 2);
}

const RANK_RU = ['', '', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'В', 'Д', 'К', 'Т'];
const RANK_EN = ['', '', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
export const rankLabel = (r: number): string => (getLang() === 'ru' ? RANK_RU : RANK_EN)[r] ?? '?';

const cache = new Map<string, Texture>();

export function cardTexture(c: Pick<Card, 'rank' | 'suit' | 'punch' | 'charge'>): Texture {
  const key = `${c.rank}:${c.suit}:${c.punch}:${c.charge}:${getLang()}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const [cv, ctx] = canvas(CARD_W, CARD_H);
  const W = CARD_W;
  const H = CARD_H;
  const edge = c.punch === 1 ? CSS.amber1 : c.punch === 2 ? CSS.volt2 : CSS.ink;
  frame(ctx, W, H, CSS.paper1, edge);
  if (c.punch === 1 || c.punch === 2) {
    ctx.fillStyle = c.punch === 1 ? CSS.amber2 : CSS.volt3;
    ctx.fillRect(2, 1, W - 4, 1);
    ctx.fillRect(1, 2, 1, H - 4);
  }
  ctx.fillStyle = CSS.paper0;
  ctx.fillRect(2, H - 2, W - 4, 1);
  ctx.fillRect(W - 2, 2, 1, H - 4);
  for (let x = 4; x < W - 4; x += 3) ctx.fillRect(x, 3, 1, 1);

  const col = SUIT_CSS[c.suit]!;
  ctx.font = `16px ${FONT}`;
  ctx.textBaseline = 'top';
  ctx.fillStyle = col;
  const label = rankLabel(c.rank);
  ctx.fillText(label, 3, 2);
  drawSuit(ctx, c.suit, 4, 19);
  ctx.save();
  ctx.translate(W, H);
  ctx.rotate(Math.PI);
  ctx.fillText(label, 3, 2);
  drawSuit(ctx, c.suit, 4, 19);
  ctx.restore();

  const cx = Math.floor(W / 2);
  const cy = Math.floor(H / 2);
  if (c.rank >= 11 && c.rank <= 13) {
    const accent = col === CSS.suitSpade ? CSS.night6 : col;
    ctx.fillStyle = CSS.night3;
    ctx.fillRect(cx - 12, cy - 13, 24, 28);
    ctx.fillStyle = accent;
    ctx.fillRect(cx - 11, cy - 14, 22, 1);
    ctx.fillRect(cx - 11, cy + 15, 22, 1);
    drawFace(
      ctx,
      c.rank as 11 | 12 | 13,
      cx - FACE_W / 2,
      cy + 15 - FACE_H,
      col === CSS.suitSpade ? CSS.night5 : col,
    );
  } else {
    drawSuit(ctx, c.suit, cx - 7, cy - 7, 2);
    if (c.rank === 14) {
      ctx.fillStyle = col;
      ctx.fillRect(cx - 11, cy - 11, 22, 1);
      ctx.fillRect(cx - 11, cy + 10, 22, 1);
      ctx.fillRect(cx - 11, cy - 10, 1, 20);
      ctx.fillRect(cx + 10, cy - 10, 1, 20);
    }
  }
  if (c.punch === 3) {
    ctx.fillStyle = CSS.night1;
    ctx.fillRect(cx - 7, 7, 3, 3);
    ctx.fillRect(cx + 4, 7, 3, 3);
  }
  if (c.punch === 4) {
    ctx.fillStyle = CSS.ink;
    ctx.fillRect(W - 14, H - 26, 9, 5);
    ctx.fillRect(W - 5, H - 25, 1, 3);
    ctx.fillStyle = CSS.go1;
    const bars = Math.round((c.charge / 15) * 7);
    if (bars) ctx.fillRect(W - 13, H - 25, bars, 3);
  }
  const t = tex(cv);
  cache.set(key, t);
  return t;
}

let backTex: Texture | null = null;
export function cardBack(): Texture {
  if (backTex) return backTex;
  const [cv, ctx] = canvas(CARD_W, CARD_H);
  frame(ctx, CARD_W, CARD_H, CSS.night3, CSS.ink);
  ctx.fillStyle = CSS.night4;
  for (let y = 3; y < CARD_H - 3; y++)
    for (let x = 3; x < CARD_W - 3; x++) if ((x + y) % 6 === 0) ctx.fillRect(x, y, 1, 1);
  ctx.fillStyle = CSS.amber1;
  ctx.fillRect(10, 26, 28, 14);
  ctx.fillStyle = CSS.night1;
  ctx.fillRect(11, 27, 26, 12);
  ctx.font = `8px ${FONT}`;
  ctx.textBaseline = 'top';
  ctx.fillStyle = CSS.amber2;
  ctx.fillText('№ 13', 14, 29);
  backTex = tex(cv);
  return backTex;
}

/** A pixel panel as a Graphics object (border + fill + inner highlight). */
export function panel(w: number, h: number, fill = C.night2, edge = C.night5, hi = C.night3): Graphics {
  const g = new Graphics();
  g.rect(1, 0, w - 2, h).fill(edge);
  g.rect(0, 1, w, h - 2).fill(edge);
  g.rect(1, 1, w - 2, h - 2).fill(fill);
  g.rect(2, 1, w - 4, 1).fill(hi);
  return g;
}

export interface TextOpts {
  size?: 8 | 16 | 24;
  /** Max width: falls back to 8px if the text does not fit. */
  fit?: number;
  color?: number;
  align?: 'left' | 'center' | 'right';
  shadow?: boolean;
  wrap?: number;
}

const hex = (n: number): string => `#${n.toString(16).padStart(6, '0')}`;
const measureCtx = document.createElement('canvas').getContext('2d')!;

/** Pixel icons drawn in place of glyphs the font lacks (designed on the 8 px grid, scaled ×size/8). */
const ICONS: Record<string, { rows: string[]; colors?: Record<string, string> }> = {
  '◉': {
    rows: ['.oooo.', 'oaAAao', 'oa..ao', 'oaaaao', '.oooo.'],
    colors: { o: CSS.amber0, a: CSS.amber2, A: CSS.amber3 },
  },
  '▶': { rows: ['X...', 'XX..', 'XXX.', 'XX..', 'X...'] },
  '◀': { rows: ['...X', '..XX', '.XXX', '..XX', '...X'] },
  '⚡': { rows: ['..XX', '.XX.', 'XXXX', '.XX.', 'XX..'] },
};
const ICON_RE = /([◉▶◀⚡])/;

function segments(line: string): string[] {
  return line.split(ICON_RE).filter((x) => x !== '');
}

function measureLine(line: string, f: Face): number {
  measureCtx.font = f.css;
  const k = f.k;
  let w = 0;
  for (const seg of segments(line)) {
    const icon = ICONS[seg];
    w += icon ? (icon.rows[0]!.length + 1) * k : measureCtx.measureText(seg).width;
  }
  return w;
}

function drawLine(
  ctx: CanvasRenderingContext2D,
  line: string,
  x: number,
  base: number,
  f: Face,
  color: string,
  flat = false,
): void {
  const k = f.k;
  measureCtx.font = f.css;
  let cx = x;
  for (const seg of segments(line)) {
    const icon = ICONS[seg];
    if (!icon) {
      ctx.fillStyle = color;
      ctx.fillText(seg, cx, base);
      cx += measureCtx.measureText(seg).width;
      continue;
    }
    const top = base - icon.rows.length * k;
    icon.rows.forEach((row, j) => {
      for (let i = 0; i < row.length; i++) {
        const ch = row[i]!;
        if (ch === '.') continue;
        ctx.fillStyle = flat ? color : (icon.colors?.[ch] ?? color);
        ctx.fillRect(cx + i * k, top + j * k, k, k);
      }
    });
    cx += (icon.rows[0]!.length + 1) * k;
  }
}

function wrapLines(str: string, size: Face, wrap: number | undefined): string[] {
  const out: string[] = [];
  for (const para of str.split('\n')) {
    if (!wrap) {
      out.push(para);
      continue;
    }
    let line = '';
    for (const word of para.split(' ')) {
      const next = line ? `${line} ${word}` : word;
      if (line && measureLine(next, size) > wrap) {
        out.push(line);
        line = word;
      } else line = next;
    }
    out.push(line);
  }
  return out;
}

export type PixelText = Container & { set(s: string, color?: number): void; mid: number };

export function text(str: string, o: TextOpts = {}): PixelText {
  const box = new Container() as PixelText;
  const sprite = new Sprite(Texture.EMPTY);
  box.addChild(sprite);
  let color = o.color ?? C.paper2;
  const draw = (s: string): void => {
    const ladder = LADDER[o.size ?? 16];
    let f = ladder[0]!;
    let lines = wrapLines(s, f, o.wrap);
    let width = Math.max(1, ...lines.map((l) => Math.ceil(measureLine(l, f))));
    for (let i = 1; o.fit !== undefined && width > o.fit && i < ladder.length; i++) {
      f = ladder[i]!;
      lines = wrapLines(s, f, o.wrap);
      width = Math.max(1, ...lines.map((l) => Math.ceil(measureLine(l, f))));
    }
    box.mid = f.mid;
    const w = width + 2;
    const h = lines.length * f.lineH + 1;
    // Draw the words once, snap anti-aliased edges to whole pixels, then stamp a hard shadow under them.
    const [tc, tctx] = canvas(w, h);
    tctx.font = f.css;
    tctx.textBaseline = 'alphabetic';
    const ax = o.align === 'center' ? 0.5 : o.align === 'right' ? 1 : 0;
    lines.forEach((l, i) => {
      const x = Math.round((width - measureLine(l, f)) * ax);
      drawLine(tctx, l, x, i * f.lineH + f.base, f, hex(color));
    });
    const img = tctx.getImageData(0, 0, w, h);
    const px = img.data;
    for (let i = 3; i < px.length; i += 4) px[i] = px[i]! >= 110 ? 255 : 0;
    tctx.putImageData(img, 0, 0);
    const [cv, ctx] = canvas(w, h);
    if (o.shadow !== false) {
      ctx.drawImage(tc, 1, 1);
      ctx.globalCompositeOperation = 'source-in';
      ctx.fillStyle = CSS.night0;
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.drawImage(tc, 0, 0);
    const old = sprite.texture;
    sprite.texture = tex(cv);
    if (old !== Texture.EMPTY) old.destroy(true);
    sprite.anchor.set(ax, 0);
  };
  box.set = (s: string, c?: number) => {
    if (c !== undefined) color = c;
    draw(s);
  };
  draw(str);
  return box;
}
