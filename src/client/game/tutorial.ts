// First-run tips: a dimmed overlay with one short explanation; each tip is shown once.
import { Container, Graphics } from 'pixi.js';
import { C } from '../gfx/palette';
import { t } from '../i18n';
import type { Game } from './app';
import { panel, text } from './pixel';
import { Button } from './ui';

const KEY = 'lt.tut';

function seen(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(KEY) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
}

function markSeen(id: string): void {
  const s = seen();
  s.add(id);
  try {
    localStorage.setItem(KEY, JSON.stringify([...s]));
  } catch {}
}

export function resetTutorial(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {}
}

let queue: Promise<void> = Promise.resolve();

/** Shows the given tips in order (skipping ones already seen). Resolves when the last is dismissed. */
export function tips(game: Game, ids: string[], y?: number): Promise<void> {
  queue = queue.then(async () => {
    for (const id of ids) {
      if (seen().has(id)) continue;
      await showTip(game, id, y);
      markSeen(id);
    }
  });
  return queue;
}

function showTip(game: Game, id: string, y?: number): Promise<void> {
  return new Promise((resolve) => {
    const core = game.core;
    const s = game.screen;
    const layer = new Container();
    const dim = new Graphics().rect(0, 0, s.w, s.h).fill({ color: C.night0, alpha: 0.55 });
    dim.eventMode = 'static';
    layer.addChild(dim);
    const body = text(t(`tut.${id}`), { color: C.paper2, wrap: core.w - 20 });
    const h = body.height + 52;
    const box = new Container();
    box.addChild(panel(core.w, h, C.night1, C.amber2, C.night3));
    body.position.set(10, 10);
    const ok = new Button(t('btn.ok'), 100, 26, {
      fill: C.amber0,
      edge: C.amber2,
      onTap: () => {
        layer.destroy({ children: true });
        resolve();
      },
    });
    ok.position.set(core.w - 108, h - 32);
    box.addChild(body, ok);
    box.position.set(core.x, core.y + (y ?? Math.round((core.h - h) / 2)));
    layer.addChild(box);
    game.overlay.addChild(layer);
  });
}
