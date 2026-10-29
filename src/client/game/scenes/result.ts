import { Container } from 'pixi.js';
import { C } from '../../gfx/palette';
import { t } from '../../i18n';
import { formatPower } from '../../i18n/format';
import { shareLink } from '../../platform/tg';
import type { Game, Scene } from '../app';
import { sfx } from '../feel';
import { BOT_LINK } from '../net';
import { text } from '../pixel';
import { Button, SeatTile } from '../ui';

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
  if (won) game.particles.burst(core.x + 129, core.y + 60, 80, [C.go1, C.amber2, C.volt2, C.paper2], 120);

  const head = text(t(won ? 'result.win' : 'result.lose'), {
    size: 24,
    fit: 250,
    align: 'center',
    color: won ? C.go1 : C.blow1,
  });
  head.position.set(129, 40);
  root.addChild(head);
  const lines = [
    t('result.stops', { n: s.stats.stopsCleared }),
    t('result.output', { v: formatPower(s.stats.output) }),
    t('result.peak', {
      v: `${formatPower(s.stats.peak)}${s.stats.peakHand >= 0 ? ` (${t(`hand.${s.stats.peakHand}`)})` : ''}`,
    }),
  ];
  lines.push(t('result.hands', { n: s.stats.handsPlayed }));
  if (s.stats.ringStop) lines.push(`${t('stop.ring')}: ${s.stats.ringStop}`);
  lines.forEach((l, i) => {
    const tl = text(l, { align: 'center', color: C.paper1, fit: 240 });
    tl.position.set(129, 80 + i * 22);
    root.addChild(tl);
  });

  let y = 80 + lines.length * 22 + 4;
  // The cabin the run ended with.
  if (s.cabin.some((x) => x)) {
    s.cabin.forEach((seat, i) => {
      const tile = new SeatTile(seat?.code ?? null, 42, 42);
      tile.position.set(129 - (s.cabin.length * 43) / 2 + i * 43, y);
      root.addChild(tile);
    });
    y += 52;
  }
  if (!depot) {
    // Ranked runs: show the leaderboard places once the server has replayed the log.
    const status = text(game.server ? t('result.sending') : t('result.unranked'), {
      align: 'center',
      color: C.night7,
      wrap: 240,
    });
    status.position.set(129, y);
    root.addChild(status);
    void game.submission?.then((r) => {
      if (status.destroyed || !game.server) return;
      if (!r) return status.set(t('result.sendFail'), C.blow1);
      const parts: string[] = [];
      for (const b of ['daily', 'peak', 'ring'] as const) {
        const n = r.ranks[b];
        if (n === null) continue;
        const board = t(`top.${b}`);
        parts.push(n > 1000 ? t('result.rankFar', { board }) : t('result.rank', { board, n }));
      }
      status.set(parts.length ? parts.join('\n') : t('result.unranked'), parts.length ? C.amber2 : C.night7);
    });
    y += 44;
  }
  if (depot) {
    const q = text(t('result.depot'), { align: 'center', color: C.volt2, wrap: 240 });
    q.position.set(129, y);
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
      ring.position.set(44, y);
      root.addChild(ring);
      y += 38;
    }
    const end = new Button(t('btn.end'), 170, 30, {
      onTap: () => {
        game.act({ t: 'end' });
        game.sync(true);
      },
    });
    end.position.set(44, y);
    root.addChild(end);
  } else {
    const menu = new Button(t('btn.menu'), 170, 30, {
      fill: C.amber0,
      edge: C.amber2,
      size: 16,
      onTap: () => game.quit(),
    });
    menu.position.set(44, y);
    root.addChild(menu);
    y += 38;
    const share = new Button(t('btn.share'), 170, 26, {
      fill: C.volt0,
      edge: C.volt2,
      onTap: () => {
        const msg = t(s.cfg.kind === 'daily' ? 'share.daily' : 'share.run', {
          stops: s.stats.stopsCleared,
          peak: formatPower(s.stats.peak),
        });
        shareLink(BOT_LINK, msg);
      },
    });
    share.position.set(44, y);
    root.addChild(share);
  }
  return { root };
}
