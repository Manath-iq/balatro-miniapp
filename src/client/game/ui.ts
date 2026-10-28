// Pixel UI widgets: buttons, passenger tiles, toasts.
import { Container, Graphics, Rectangle } from 'pixi.js';
import { passenger } from '../../engine/content/registry';
import { C, RARITY_COLOR } from '../gfx/palette';
import { t } from '../i18n';
import { haptic, sfx } from './feel';
import { panel, text } from './pixel';

export interface ButtonOpts {
  fill?: number;
  edge?: number;
  color?: number;
  size?: 8 | 16;
  onTap: () => void;
}

export class Button extends Container {
  private bg: Graphics;
  private caption: ReturnType<typeof text>;
  private opts: ButtonOpts;
  enabled = true;
  readonly bw: number;
  readonly bh: number;

  constructor(str: string, w: number, h: number, opts: ButtonOpts) {
    super();
    this.opts = opts;
    this.bw = w;
    this.bh = h;
    this.bg = new Graphics();
    this.caption = text(str, { size: opts.size ?? 8, color: opts.color ?? C.paper2, align: 'center' });
    this.addChild(this.bg, this.caption);
    this.draw(false);
    this.eventMode = 'static';
    this.cursor = 'pointer';
    this.hitArea = new Rectangle(0, 0, w, h);
    this.on('pointerdown', () => this.enabled && this.draw(true));
    this.on('pointerupoutside', () => this.draw(false));
    this.on('pointerup', () => {
      this.draw(false);
      if (!this.enabled) {
        sfx('error');
        haptic.notify('error');
        return;
      }
      sfx('tap');
      haptic.impact('light');
      this.opts.onTap();
    });
  }

  setText(str: string): void {
    this.caption.set(str);
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    this.draw(false);
  }

  private draw(pressed: boolean): void {
    const { bw: w, bh: h } = this;
    const fill = this.enabled ? (this.opts.fill ?? C.night4) : C.night2;
    const edge = this.enabled ? (this.opts.edge ?? C.night6) : C.night3;
    const g = this.bg.clear();
    const dy = pressed ? 2 : 0;
    g.rect(1, 2, w - 2, h - 2).fill(C.night0);
    g.rect(1, dy, w - 2, h - 2).fill(edge);
    g.rect(0, dy + 1, w, h - 4).fill(edge);
    g.rect(1, dy + 1, w - 2, h - 4).fill(fill);
    g.rect(2, dy + 1, w - 4, 1).fill(this.enabled ? edge : C.night3);
    this.caption.position.set(
      Math.floor(w / 2),
      Math.floor((h - 2) / 2) - (this.opts.size === 16 ? 8 : 4) + dy,
    );
    this.caption.alpha = this.enabled ? 1 : 0.45;
  }
}

/** A Салон seat: passenger name on a rarity-coloured tile. */
export class SeatTile extends Container {
  readonly tw: number;
  readonly th: number;
  constructor(code: number | null, w: number, h: number, onTap?: () => void) {
    super();
    this.tw = w;
    this.th = h;
    if (code === null) {
      const g = new Graphics();
      for (let x = 1; x < w - 1; x += 2)
        g.rect(x, 0, 1, 1)
          .rect(x, h - 1, 1, 1)
          .fill(C.night4);
      for (let y = 1; y < h - 1; y += 2)
        g.rect(0, y, 1, 1)
          .rect(w - 1, y, 1, 1)
          .fill(C.night4);
      const l = text(t('seat.empty'), { color: C.night5, align: 'center', shadow: false });
      l.position.set(w / 2, h / 2 - 4);
      this.addChild(g, l);
    } else {
      const def = passenger(code);
      const col = RARITY_COLOR[def.rarity];
      this.addChild(panel(w, h, C.night3, col, C.night4));
      const g = new Graphics().rect(2, 2, 3, h - 4).fill(col);
      const name = text(t(`p.${def.id}.name`), { color: C.paper2, wrap: w - 9 });
      name.position.set(7, 3);
      this.addChild(g, name);
    }
    if (onTap) {
      this.eventMode = 'static';
      this.cursor = 'pointer';
      this.hitArea = new Rectangle(0, 0, w, h);
      this.on('pointertap', onTap);
    }
  }
}

/** Bottom sheet with a title and wrapped description; tap anywhere to close. */
export function infoSheet(w: number, title: string, body: string, color: number, extra?: string): Container {
  const c = new Container();
  const lines = text(body, { wrap: w - 16, color: C.paper1 });
  const ex = extra ? text(extra, { wrap: w - 16, color: C.night7 }) : null;
  const h = 24 + lines.height + (ex ? ex.height + 6 : 0) + 6;
  c.addChild(panel(w, h, C.night1, color, C.night3));
  const tt = text(title, { color });
  tt.position.set(8, 6);
  lines.position.set(8, 18);
  c.addChild(tt, lines);
  if (ex) {
    ex.position.set(8, 18 + lines.height + 4);
    c.addChild(ex);
  }
  return c;
}
