// "How to play": a paged story-and-rules sheet on the overlay layer, with a small picture per page.
// Opened from the menu and the pause sheet; shown once on the very first launch.
import { Container, Graphics, Rectangle, Sprite } from 'pixi.js';
import type { Card } from '../../engine';
import { C } from '../gfx/palette';
import { t } from '../i18n';
import type { Game } from './app';
import { PORTRAIT, portrait } from './art';
import { cardTexture, panel, text } from './pixel';
import { Button } from './ui';

const KEY = 'lt.guide';
const PAGES = ['lore', 'cards', 'power', 'stop', 'gauge', 'wave', 'kiosk', 'boss'] as const;
type Page = (typeof PAGES)[number];

export function guideSeen(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return true;
  }
}

const card = (rank: number, suit: number): Card => ({ uid: 0, rank, suit, punch: 0, charge: 0 }) as Card;

/** A portrait in a 44×44 frame; null draws an empty seat. */
function tile(id: string | null, edge: number): Container {
  const c = new Container();
  c.addChild(panel(44, 44, C.night1, id ? edge : C.night4, C.night2));
  const tex = id ? portrait(id) : undefined;
  if (tex) {
    const sp = new Sprite(tex);
    sp.position.set((44 - PORTRAIT) / 2, (44 - PORTRAIT) / 2);
    c.addChild(sp);
  }
  return c;
}

/** A small illustration for each page, drawn into a 240×70 box. */
function picture(page: Page): Container {
  const c = new Container();
  const row = (ids: (string | null)[], edge: number) =>
    ids.forEach((id, i) => {
      const f = tile(id, edge);
      f.position.set(120 - (ids.length * 48 - 4) / 2 + i * 48, 12);
      c.addChild(f);
    });
  const cards = (list: [number, number][], lift: number[] = []) =>
    list.forEach(([r, s], i) => {
      const sp = new Sprite(cardTexture(card(r, s)));
      sp.position.set(120 - (list.length * 34) / 2 + i * 34, lift.includes(i) ? 0 : 6);
      c.addChild(sp);
    });
  const tn = (tv: string, nv: string, total: string) => {
    const a = panel(64, 22, C.amber0, C.amber2);
    a.position.set(20, 20);
    const b = panel(64, 22, C.volt0, C.volt2);
    b.position.set(108, 20);
    const at = text(tv, { align: 'center' });
    at.position.set(52, 22);
    const x = text('×', { align: 'center' });
    x.position.set(96, 22);
    const bt = text(nv, { align: 'center' });
    bt.position.set(140, 22);
    const eq = text(`= ${total}`, { color: C.go1 });
    eq.position.set(178, 22);
    c.addChild(a, b, at, x, bt, eq);
  };
  switch (page) {
    case 'lore':
      row(['veteran', 'seedGranny', 'general', 'electrician', 'accordionist'], C.amber2);
      break;
    case 'cards':
      cards(
        [
          [14, 1],
          [11, 1],
          [8, 1],
          [5, 1],
          [3, 1],
        ],
        [0, 1, 2, 3, 4],
      );
      break;
    case 'power':
      tn('30+47', '3', '231');
      break;
    case 'stop': {
      const bar = new Graphics().rect(20, 14, 200, 10).fill(C.night0).rect(21, 15, 150, 8).fill(C.amber1);
      const l = text(t('guide.pic.target'), { align: 'center', color: C.paper1 });
      l.position.set(120, 30);
      c.addChild(bar, l);
      break;
    }
    case 'gauge': {
      const g = new Graphics();
      g.rect(110, 0, 12, 68).fill(C.night0);
      g.rect(111, 1 + 66 - 40, 10, 40).fill(C.volt2);
      g.rect(108, 1 + 66 - 20, 16, 1).fill(C.amber2);
      g.rect(108, 1, 16, 1).fill(C.blow1);
      const a = text(t('guide.pic.od'), { size: 8, color: C.amber2 });
      a.position.set(130, 40);
      const b = text(t('guide.pic.blow'), { size: 8, color: C.blow1 });
      b.position.set(130, 0);
      c.addChild(g, a, b);
      break;
    }
    case 'wave':
      ['+1', '+2', '+3', '+4'].forEach((s, i) => {
        const p = panel(44, 22, C.glass1, C.go1);
        p.position.set(20 + i * 52, 22);
        const l = text(s, { align: 'center', color: C.go1 });
        l.position.set(42 + i * 52, 25);
        c.addChild(p, l);
      });
      break;
    case 'kiosk':
      row(['zebra', 'smallChange', 'twins', null, null], C.go1);
      break;
    case 'boss':
      row(['auditor', 'conductress', 'blackIce', 'lastTram'], C.blow1);
      break;
  }
  return c;
}

export function openGuide(game: Game, onClose?: () => void): void {
  try {
    localStorage.setItem(KEY, '1');
  } catch {}
  const s = game.screen;
  const core = game.core;
  const root = new Container();
  const dim = new Graphics().rect(0, 0, s.w, s.h).fill({ color: C.night0, alpha: 0.9 });
  dim.eventMode = 'static';
  dim.hitArea = new Rectangle(0, 0, s.w, s.h);
  root.addChild(dim);
  const box = new Container();
  root.addChild(box);
  game.overlay.addChild(root);

  const W = 254;
  const close = () => {
    root.destroy({ children: true });
    onClose?.();
  };
  const show = (i: number) => {
    box.removeChildren().forEach((ch) => {
      ch.destroy({ children: true });
    });
    const page = PAGES[i]!;
    let y = 8;
    const title = text(t(`guide.${page}.title`), { align: 'center', color: C.amber2, fit: W - 12 });
    title.position.set(W / 2, y);
    y += 24;
    const pic = picture(page);
    pic.position.set(Math.floor((W - 240) / 2), y);
    y += 80;
    const body = text(t(`guide.${page}.body`), { color: C.paper1, wrap: W - 16 });
    body.position.set(8, y);
    y += body.height + 10;
    const dots = text(`${i + 1} / ${PAGES.length}`, { align: 'center', color: C.night7 });
    dots.position.set(W / 2, y);
    y += 20;
    const prev = new Button(t('guide.prev'), 76, 28, { onTap: () => show(i - 1) });
    prev.setEnabled(i > 0);
    prev.position.set(6, y);
    const last = i === PAGES.length - 1;
    const next = new Button(last ? t('guide.done') : t('guide.next'), 100, 28, {
      fill: last ? C.glass1 : C.amber0,
      edge: last ? C.go1 : C.amber2,
      size: 16,
      onTap: () => (last ? close() : show(i + 1)),
    });
    next.position.set(W - 106, y);
    const skip = new Button('X', 32, 28, { onTap: close });
    skip.position.set(Math.floor(W / 2) - 32, y);
    y += 36;
    box.addChild(panel(W, y, C.night1, C.amber2), title, pic, body, dots, prev, skip, next);
    box.position.set(core.x + Math.floor((258 - W) / 2), core.y + Math.max(0, Math.floor((core.h - y) / 2)));
  };
  show(0);
}
