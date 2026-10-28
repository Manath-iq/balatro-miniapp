// Code-drawn pixel art: suits, cards, panels and pixel text (Tiny5).
import { Container, Graphics, Text, Texture } from 'pixi.js';
import type { Card } from '../../engine';
import { C, CSS, SUIT_CSS } from '../gfx/palette';
import { getLang } from '../i18n';

export const CARD_W = 48;
export const CARD_H = 66;
export const FONT = 'Tiny5';

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
    ctx.fillStyle = CSS.night3;
    ctx.fillRect(cx - 12, cy - 13, 24, 28);
    ctx.fillStyle = col === CSS.suitSpade ? CSS.night6 : col;
    ctx.fillRect(cx - 11, cy - 14, 22, 1);
    ctx.fillRect(cx - 11, cy + 13, 22, 1);
    ctx.font = `16px ${FONT}`;
    ctx.fillStyle = CSS.paper2;
    const m = ctx.measureText(label).width;
    ctx.fillText(label, Math.round(cx - m / 2), cy - 12);
    drawSuit(ctx, c.suit, cx - 3, cy + 4, 1, col === CSS.suitSpade ? CSS.paper1 : col);
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

/** Pixel text with a 1-px dark drop shadow. Anchor follows align. */
export function text(str: string, o: TextOpts = {}): Container & { set(s: string, color?: number): void } {
  const size = o.size ?? 16;
  const style = {
    fontFamily: FONT,
    fontSize: size,
    fill: o.color ?? C.paper2,
    align: o.align ?? 'left',
    wordWrap: o.wrap !== undefined,
    wordWrapWidth: o.wrap ?? 0,
    lineHeight: size + 2,
  } as const;
  const box = new Container() as Container & { set(s: string, color?: number): void };
  const main = new Text({
    text: str,
    style,
    resolution: 1,
    roundPixels: true,
    textureStyle: { scaleMode: 'nearest' },
  });
  const sh = new Text({
    text: str,
    style: { ...style, fill: C.night0 },
    resolution: 1,
    roundPixels: true,
    textureStyle: { scaleMode: 'nearest' },
  });
  const ax = o.align === 'center' ? 0.5 : o.align === 'right' ? 1 : 0;
  for (const t of [sh, main]) t.anchor.set(ax, 0);
  sh.position.set(1, 1);
  sh.visible = o.shadow !== false;
  box.addChild(sh, main);
  const fit = (): void => {
    if (o.fit === undefined) return;
    const small = main.width > o.fit;
    const fs = small ? 8 : size;
    if (main.style.fontSize !== fs) {
      main.style.fontSize = fs;
      sh.style.fontSize = fs;
      main.style.lineHeight = fs + 2;
      sh.style.lineHeight = fs + 2;
      main.style.wordWrapWidth = o.wrap ?? 0;
    }
  };
  box.set = (s: string, color?: number) => {
    main.style.fontSize = size;
    sh.style.fontSize = size;
    main.text = s;
    sh.text = s;
    if (color !== undefined) main.style.fill = color;
    fit();
  };
  fit();
  return box;
}
