import { Container } from 'pixi.js';
import { C } from '../../gfx/palette';
import { t } from '../../i18n';
import { formatPower } from '../../i18n/format';
import type { Game, Scene } from '../app';
import { sfx } from '../feel';
import { text } from '../pixel';
import { Button } from '../ui';

export function resultScene(game: Game): Scene {
  const s = game.run!;
  const root = new Container();
  const core = game.core;
  root.position.set(core.x, core.y);
  const depot = s.phase === 'depot';
  const won = depot || s.stats.stopsCleared >= 12;
  game.bg.setMood(won ? 'kiosk' : 'over');
  game.bg.energy = won ? 0.7 : 0.05;
  sfx(won ? 'win' : 'lose');
  if (won) game.particles.burst(core.x + 135, core.y + 60, 80, [C.go1, C.amber2, C.volt2, C.paper2], 120);

  const head = text(t(won ? 'result.win' : 'result.lose'), {
    size: 16,
    align: 'center',
    color: won ? C.go1 : C.blow1,
  });
  head.position.set(135, 40);
  root.addChild(head);
  const lines = [
    t('result.stops', { n: s.stats.stopsCleared }),
    t('result.output', { v: formatPower(s.stats.output) }),
    t('result.peak', {
      v: `${formatPower(s.stats.peak)}${s.stats.peakHand >= 0 ? ` (${t(`hand.${s.stats.peakHand}`)})` : ''}`,
    }),
  ];
  if (s.stats.ringStop) lines.push(`${t('stop.ring')}: ${s.stats.ringStop}`);
  lines.forEach((l, i) => {
    const tl = text(l, { align: 'center', color: C.paper1, fit: 262 });
    tl.position.set(135, 80 + i * 22);
    root.addChild(tl);
  });

  let y = 80 + lines.length * 22 + 20;
  if (depot) {
    const q = text(t('result.depot'), { align: 'center', color: C.volt2, wrap: 250 });
    q.position.set(135, y);
    root.addChild(q);
    y += q.height + 8;
    if (game.legal()?.ring) {
      const ring = new Button(t('btn.ring'), 170, 30, {
        fill: C.volt0,
        edge: C.volt2,
        size: 16,
        onTap: () => {
          game.act({ t: 'ring' });
          game.sync();
        },
      });
      ring.position.set(50, y);
      root.addChild(ring);
      y += 38;
    }
    const end = new Button(t('btn.end'), 170, 30, {
      onTap: () => {
        game.act({ t: 'end' });
        game.sync(true);
      },
    });
    end.position.set(50, y);
    root.addChild(end);
  } else {
    const menu = new Button(t('btn.menu'), 170, 30, {
      fill: C.amber0,
      edge: C.amber2,
      size: 16,
      onTap: () => game.quit(),
    });
    menu.position.set(50, y);
    root.addChild(menu);
  }
  return { root };
}
