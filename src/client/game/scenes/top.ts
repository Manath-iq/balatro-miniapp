// Leaderboard: Day / Peak / Ring tabs with the player's own row pinned at the bottom.
import { Container } from 'pixi.js';
import type { BoardEntry, BoardId, LeaderboardRes } from '../../../shared/api';
import { C } from '../../gfx/palette';
import { t } from '../../i18n';
import { formatPower } from '../../i18n/format';
import type { Game, Scene } from '../app';
import { api, online } from '../net';
import { panel, text } from '../pixel';
import { Button } from '../ui';

export function topScene(game: Game): Scene {
  const root = new Container();
  const core = game.core;
  const W = core.w;
  root.position.set(core.x, core.y);
  game.bg.setMood('menu');
  game.bg.energy = 0.2;

  const head = text(t('top.title'), { size: 24, color: C.amber2 });
  head.position.set(0, 0);
  const back = new Button(t('btn.back'), 96, 24, { onTap: () => game.show(game.backTo ?? 'menu') });
  back.position.set(W - 96, 2);
  root.addChild(head, back);

  const tabs: [BoardId, string][] = [
    ['daily', t('top.daily')],
    ['peak', t('top.peak')],
    ['ring', t('top.ring')],
  ];
  const list = new Container();
  list.position.set(0, 64);
  root.addChild(list);
  const buttons: Button[] = [];

  const boardValue = (board: BoardId, e: BoardEntry): string =>
    board === 'daily'
      ? t('top.dayVal', { s: e.extra, p: e.value })
      : board === 'peak'
        ? `${formatPower(BigInt(e.value))}`
        : t('top.ringVal', { n: e.value });

  const row = (board: BoardId, e: BoardEntry, y: number): Container => {
    const c = new Container();
    c.position.set(0, y);
    c.addChild(
      panel(W, 24, e.me ? C.night3 : C.night1, e.me ? C.amber2 : C.night3, e.me ? C.night4 : C.night2),
    );
    const rank = text(e.rank > 0 ? `${e.rank}` : '1000+', {
      color: e.rank > 0 && e.rank <= 3 ? C.amber2 : C.night7,
    });
    rank.position.set(6, 4);
    const name = text(e.me ? `${e.name} · ${t('top.me')}` : e.name, { color: C.paper2, fit: 110 });
    name.position.set(40, 4);
    const val = text(boardValue(board, e), { align: 'right', color: C.go1, fit: 104 });
    val.position.set(W - 6, 4);
    c.addChild(rank, name, val);
    return c;
  };

  const message = (str: string): void => {
    const m = text(str, { align: 'center', color: C.night7, wrap: W - 20 });
    m.position.set(W / 2, 30);
    list.addChild(m);
  };

  const load = async (board: BoardId): Promise<void> => {
    buttons.forEach((b, i) => {
      b.setEnabled(tabs[i]![0] !== board);
    });
    list.removeChildren().forEach((c) => {
      c.destroy({ children: true });
    });
    if (!online()) return message(t('top.offline'));
    message(t('top.loading'));
    let res: LeaderboardRes;
    try {
      res = await api<LeaderboardRes>(`/api/leaderboard?board=${board}`);
    } catch {
      list.removeChildren();
      return message(t('top.error'));
    }
    list.removeChildren().forEach((c) => {
      c.destroy({ children: true });
    });
    if (!res.entries.length) return message(t('top.empty'));
    const maxRows = Math.max(3, Math.floor((core.h - 64 - 34) / 26));
    res.entries.slice(0, maxRows).forEach((e, i) => {
      list.addChild(row(board, e, i * 26));
    });
    if (res.me && !res.entries.slice(0, maxRows).some((e) => e.me)) {
      list.addChild(row(board, res.me, core.h - 64 - 24));
    }
  };

  tabs.forEach(([id, label], i) => {
    const b = new Button(label, Math.floor((W - 8) / 3), 26, {
      fill: C.volt0,
      edge: C.volt2,
      onTap: () => void load(id),
    });
    b.position.set(i * (Math.floor((W - 8) / 3) + 4), 32);
    buttons.push(b);
    root.addChild(b);
  });
  void load('daily');
  return { root };
}
