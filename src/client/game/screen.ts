// Pixel-perfect sizing: the game renders at a small "art" resolution and is scaled up by an integer factor.
import { insets } from '../platform/tg';

export const CORE_W = 270;
/** Width of the content column; CORE_W - CONTENT_W leaves at least 6 px gutters. */
export const CONTENT_W = 258;
const MIN_H = 470;

export interface Screen {
  /** Art-pixel canvas size. */
  w: number;
  h: number;
  /** Device pixels per art pixel. */
  scale: number;
  /** Safe area in art px. */
  top: number;
  bottom: number;
  /** Left edge of the 270-wide core column. */
  x0: number;
  /** CSS size of the canvas. */
  cssW: number;
  cssH: number;
}

export function measure(root: HTMLElement): Screen {
  const dpr = Math.min(window.devicePixelRatio || 1, 4);
  const cssW = root.clientWidth || window.innerWidth;
  const cssH = root.clientHeight || window.innerHeight;
  const devW = Math.round(cssW * dpr);
  const devH = Math.round(cssH * dpr);
  let scale = Math.max(1, Math.min(Math.floor(devW / CORE_W), Math.floor(devH / MIN_H)));
  if (scale < 1) scale = 1;
  const w = Math.ceil(devW / scale);
  const h = Math.ceil(devH / scale);
  const ins = insets();
  return {
    w,
    h,
    scale,
    top: Math.ceil((ins.top * dpr) / scale),
    bottom: Math.ceil((ins.bottom * dpr) / scale),
    x0: Math.floor((w - CONTENT_W) / 2),
    cssW: (w * scale) / dpr,
    cssH: (h * scale) / dpr,
  };
}

export function fitCanvas(canvas: HTMLCanvasElement, s: Screen): void {
  canvas.style.width = `${s.cssW}px`;
  canvas.style.height = `${s.cssH}px`;
  canvas.style.imageRendering = 'pixelated';
  canvas.style.position = 'absolute';
  canvas.style.left = '0';
  canvas.style.top = '0';
}
