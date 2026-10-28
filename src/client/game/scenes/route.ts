import { Container, Graphics } from 'pixi.js';
import { inspector } from '../../../engine/content/registry';
import { C } from '../../gfx/palette';
import { t } from '../../i18n';
import { formatPower } from '../../i18n/format';
import type { Game, Scene } from '../app';
import { sfx } from '../feel';
import { panel, text } from '../pixel';
import { tips } from '../tutorial';
import { Button, SeatTile } from '../ui';

export function routeScene(game: Game): Scene {
  const s = game.run!;
  const root = new Container();
  const core = game.core;
  root.position.set(core.x, core.y);
  const ring = s.stopNo > 12;
  const line = Math.min(3, Math.ceil(s.stopNo / 4));
  game.bg.setMood(ring ? 'boss' : (`line${line}` as 'line1'));
  game.bg.energy = 0.25;

  const head = text(
    ring
      ? t('route.ring', { n: s.stopNo })
      : `${t(`line.${line}`)} · ${t('hud.stop', { n: s.stopNo })}`.toUpperCase(),
    {
      size: 16,
      align: 'center',
      color: C.amber2,
    },
  );
  head.position.set(129, 6);
  root.addChild(head);

  // Route strip: 12 stops, bosses marked.
  const strip = new Graphics();
  for (let i = 1; i <= 12; i++) {
    const x = 18 + (i - 1) * 21;
    const done = i < s.stopNo;
    const cur = i === s.stopNo;
    const big = i % 4 === 0;
    strip
      .rect(x - (big ? 4 : 3), 32 - (big ? 4 : 3), big ? 8 : 6, big ? 8 : 6)
      .fill(cur ? C.go1 : done ? C.glass3 : big ? C.blow1 : C.night5);
    if (i < 12) strip.rect(x + 4, 29, 13, 2).fill(done ? C.glass2 : C.night4);
  }
  root.addChild(strip);

  const tokens = text(`◉ ${s.tokens}`, { align: 'right', color: C.amber3 });
  tokens.position.set(252, 42);
  const title = text(t('route.title'), { color: C.paper2 });
  title.position.set(6, 42);
  root.addChild(tokens, title);

  const opts = s.route.options;
  let y = 60;
  opts.forEach((o, i) => {
    const boss = o.boss ? inspector(o.boss) : null;
    const card = new Container();
    card.position.set(0, y);
    const edge = o.kind === 'express' ? C.volt2 : boss ? C.blow1 : C.glass3;
    const name =
      o.kind === 'branch'
        ? t(i === 0 ? 'route.red' : 'route.blue')
        : o.kind === 'express'
          ? t('route.express')
          : o.kind === 'normal'
            ? t('route.normal')
            : o.kind === 'final'
              ? t('route.final')
              : o.kind === 'ring'
                ? t('stop.ring')
                : t('route.inspector');
    const content = new Container();
    const nl = text(name, { color: o.kind === 'branch' ? (i === 0 ? C.blow1 : C.glass3) : edge, fit: 150 });
    nl.position.set(8, 6);
    const tl = text(formatPower(o.target), { align: 'right', color: C.amber3 });
    tl.position.set(250, 6);
    content.addChild(nl, tl);
    let ly = 26;
    if (o.kind === 'express' || o.kind === 'normal') {
      const inf = text(t(o.kind === 'express' ? 'route.expressInfo' : 'route.normalInfo'), {
        color: C.night7,
        wrap: 242,
      });
      inf.position.set(8, ly);
      content.addChild(inf);
      ly += inf.height + 4;
    }
    if (boss) {
      const pre = o.kind === 'branch' ? `${t('route.bossAhead')} ` : '';
      const bl = text(`${pre}${t(`in.${boss.id}.name`)}`, { color: C.blow1, wrap: 242 });
      bl.position.set(8, ly);
      ly += bl.height + 2;
      const bd = text(t(`in.${boss.id}.desc`), { color: C.paper1, wrap: 242 });
      bd.position.set(8, ly);
      ly += bd.height + 4;
      content.addChild(bl, bd);
    }
    const h = ly + 30;
    card.addChild(panel(258, h, C.night1, edge, C.night3), content);
    const go = new Button(t('btn.go'), 110, 24, {
      fill: C.glass1,
      edge: C.go1,
      onTap: () => {
        sfx('bell');
        game.act({ t: 'route', choice: i });
        game.sync();
      },
    });
    go.position.set(140, h - 28);
    card.addChild(go);
    root.addChild(card);
    y += h + 6;
  });

  // Cabin (swap is free outside stops; tap a seat to drop off passengers in the kiosk).
  const cab = new Container();
  cab.position.set(0, Math.min(core.h - 108, y + 4));
  s.cabin.forEach((seat, i) => {
    const tile = new SeatTile(seat?.code ?? null, 84, 38);
    tile.position.set((i % 3) * 87, Math.floor(i / 3) * 40);
    cab.addChild(tile);
  });
  root.addChild(cab);

  const quit = new Button(t('btn.abandon'), 90, 22, {
    onTap: () => {
      game.act({ t: 'end' });
      game.sync();
    },
  });
  quit.position.set(0, core.h - 22);
  root.addChild(quit);
  if (opts[0]?.kind === 'branch') void tips(game, ['route']);
  return { root };
}
