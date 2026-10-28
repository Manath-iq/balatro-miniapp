// Ларёк (shop conveyor), the deck picker for Мастерская/Утиль, and the post-boss reward.
import { Container, Sprite } from 'pixi.js';
import type { KioskItem } from '../../../engine';
import { SHOP } from '../../../engine/content/balance';
import { coupon, passenger, punch } from '../../../engine/content/registry';
import { C, RARITY_COLOR } from '../../gfx/palette';
import { t } from '../../i18n';
import type { Game, Scene } from '../app';
import { sfx } from '../feel';
import { cardTexture, panel, rankLabel, text } from '../pixel';
import { Button, infoSheet, SeatTile } from '../ui';

function itemInfo(it: KioskItem): { name: string; desc: string; color: number } {
  if (it.k === 'passenger') {
    const d = passenger(it.code);
    return { name: t(`p.${d.id}.name`), desc: t(`p.${d.id}.desc`), color: RARITY_COLOR[d.rarity] };
  }
  if (it.k === 'coupon') {
    const d = coupon(it.code);
    return { name: t(`cp.${d.id}.name`), desc: t(`cp.${d.id}.desc`), color: C.amber2 };
  }
  const p = punch(it.punch);
  return {
    name: `${t('kiosk.card')}: ${rankLabel(it.rank)}`,
    desc: `${t(`pu.${p.id}.name`)} — ${t(`pu.${p.id}.desc`)}`,
    color: C.paper1,
  };
}

export function kioskScene(game: Game): Scene {
  const s = game.run!;
  const root = new Container();
  const core = game.core;
  root.position.set(core.x, core.y);
  game.bg.setMood('kiosk');
  game.bg.energy = 0.2;
  const body = new Container();
  root.addChild(body);
  let sheet: Container | null = null;
  const closeSheet = () => {
    sheet?.destroy({ children: true });
    sheet = null;
  };

  const draw = () => {
    closeSheet();
    body.removeChildren().forEach((c) => {
      c.destroy({ children: true });
    });
    const k = s.kiosk!;
    const L = game.legal()!;
    const head = text(t('kiosk.title'), { size: 24, color: C.amber2 });
    head.position.set(4, 4);
    const tok = text(`◉ ${s.tokens}`, { size: 24, align: 'right', color: C.amber3 });
    tok.position.set(266, 4);
    body.addChild(head, tok);

    // Cabin with drop-off.
    s.cabin.forEach((seat, i) => {
      const tile = new SeatTile(seat?.code ?? null, 88, 30, () => {
        if (!seat) return;
        const d = passenger(seat.code);
        const sh = infoSheet(
          262,
          t(`p.${d.id}.name`),
          t(`p.${d.id}.desc`),
          RARITY_COLOR[d.rarity],
          t(`p.${d.id}.flavor`),
        );
        const sell = new Button(`${t('btn.sell')} +${Math.floor(d.price / 2)}`, 120, 22, {
          fill: C.blow0,
          edge: C.blow1,
          onTap: () => {
            game.act({ t: 'sell', seat: i });
            sfx('coin');
            draw();
          },
        });
        sell.position.set(136, 2);
        sh.addChild(sell);
        showSheet(sh);
      });
      tile.position.set((i % 3) * 91, 30 + Math.floor(i / 3) * 32);
      body.addChild(tile);
    });
    // Pocket
    s.pocket.forEach((code, i) => {
      const box = new Container();
      box.position.set(i * 68, 96);
      box.addChild(panel(66, 22, code ? C.night3 : C.night1, code ? C.amber1 : C.night3));
      if (code) {
        const l = text(t(`cp.${coupon(code).id}.name`).replace('Талон ', ''), { color: C.amber3, fit: 60 });
        l.position.set(3, 3);
        box.addChild(l);
      }
      body.addChild(box);
    });
    const pig = text(t('kiosk.piggy', { n: s.piggy }), { color: C.glass3, fit: 128 });
    pig.position.set(140, 99);
    body.addChild(pig);

    // Conveyor
    let y = 122;
    k.slots.forEach((it, i) => {
      const row = new Container();
      row.position.set(0, y);
      if (!it) {
        row.addChild(panel(270, 26, C.night1, C.night3, C.night1));
        const e = text(t('kiosk.empty'), { align: 'center', color: C.night5 });
        e.position.set(135, 5);
        row.addChild(e);
        body.addChild(row);
        y += 28;
        return;
      }
      const info = itemInfo(it);
      const nx = it.k === 'card' ? 30 : 6;
      const n = text(info.name, { color: info.color, fit: 196 - nx });
      n.position.set(nx, 3);
      let d = text(info.desc, { color: C.paper1, wrap: 196 - nx });
      if (d.height > 36) d = text(info.desc, { size: 8, color: C.paper1, wrap: 196 - nx });
      d.position.set(nx, 21);
      const h = Math.max(34, 24 + d.height);
      row.addChild(panel(270, h, C.night2, info.color, C.night3));
      if (it.k === 'card') {
        const sp = new Sprite(cardTexture({ rank: it.rank, suit: it.suit, punch: it.punch, charge: 0 }));
        sp.scale.set(0.5);
        sp.position.set(3, 2);
        row.addChild(sp);
      }
      const b = new Button(`${it.price} ◉`, 62, 26, {
        fill: C.amber0,
        edge: C.amber2,
        onTap: () => {
          game.act({ t: 'buy', slot: i });
          sfx('coin');
          draw();
        },
      });
      b.setEnabled(!!L.buy[i]);
      b.position.set(204, Math.floor((h - 26) / 2));
      row.addChild(n, d, b);
      body.addChild(row);
      y += h + 2;
    });
    y += 4;

    // Actions
    const shift = new Button(`${t('btn.shift')} ${L.shiftCost}◉`, 86, 24, {
      onTap: () => {
        game.act({ t: 'shift' });
        sfx('shift');
        draw();
      },
    });
    shift.setEnabled(L.shift);
    shift.position.set(0, y);
    const ws = new Button(`${t('btn.workshop')} ${SHOP.workshopPrice}◉`, 92, 24, {
      onTap: () => pickCard('workshop'),
    });
    ws.setEnabled(L.workshop);
    ws.position.set(88, y);
    const sc = new Button(`${t('btn.scrap')} ${SHOP.scrapPrice}◉`, 86, 24, {
      onTap: () => pickCard('scrap'),
    });
    sc.setEnabled(L.scrap);
    sc.position.set(184, y);
    y += 26;
    const pg = new Button(t('btn.piggy'), 130, 24, {
      onTap: () => {
        game.act({ t: 'piggy', deposit: 1 });
        sfx('coin');
        draw();
      },
    });
    pg.setEnabled(L.piggy);
    pg.position.set(0, y);
    const pb = new Button(t('btn.piggyBreak'), 90, 24, {
      onTap: () => {
        game.act({ t: 'piggyBreak' });
        draw();
      },
    });
    pb.setEnabled(s.piggy > 0);
    pb.position.set(134, y);
    body.addChild(shift, ws, sc, pg, pb);

    const leave = new Button(t('btn.leave'), 150, 30, {
      fill: C.glass1,
      edge: C.go1,
      size: 16,
      onTap: () => {
        game.act({ t: 'leave' });
        game.sync();
      },
    });
    leave.position.set(60, Math.max(y + 28, core.h - 32));
    body.addChild(leave);
  };

  const showSheet = (c: Container) => {
    closeSheet();
    sheet = c;
    c.position.set(4, 122);
    root.addChild(c);
  };

  const pickCard = (mode: 'workshop' | 'scrap') => {
    closeSheet();
    const k = s.kiosk!;
    const ov = new Container();
    const deck = s.deck.slice().sort((a, b) => a.suit - b.suit || a.rank - b.rank);
    const rows = Math.ceil(deck.length / 9);
    const h = 40 + rows * 35;
    ov.addChild(panel(270, h, C.night0, C.amber2, C.night2));
    const ttl =
      mode === 'workshop'
        ? `${t('btn.workshop')}: ${k.workshopOffer.map((c) => t(`pu.${punch(c).id}.name`)).join(' / ')}`
        : t('btn.scrap');
    const tl = text(`${ttl} — ${t('kiosk.pickCard')}`, { color: C.amber2, wrap: 250 });
    tl.position.set(6, 6);
    ov.addChild(tl);
    deck.forEach((c, i) => {
      const sp = new Sprite(cardTexture(c));
      sp.scale.set(0.6);
      sp.position.set(6 + (i % 9) * 29, 30 + Math.floor(i / 9) * 35);
      sp.eventMode = 'static';
      sp.cursor = 'pointer';
      sp.on('pointertap', () => {
        if (mode === 'workshop') {
          // Pick the first offer; the second is chosen by tapping the title.
          game.act({ t: 'workshop', uid: c.uid, pick: choice });
        } else game.act({ t: 'scrap', uid: c.uid });
        sfx('coin');
        ov.destroy({ children: true });
        draw();
      });
      ov.addChild(sp);
    });
    let choice: 0 | 1 = 0;
    if (mode === 'workshop') {
      const sw = new Button(t(`pu.${punch(k.workshopOffer[0]).id}.name`), 90, 18, {
        fill: C.volt0,
        edge: C.volt2,
        onTap: () => {
          choice = choice === 0 ? 1 : 0;
          sw.setText(t(`pu.${punch(k.workshopOffer[choice]).id}.name`));
        },
      });
      sw.position.set(174, h - 22);
      ov.addChild(sw);
    }
    const cancel = new Button(t('btn.cancel'), 70, 18, { onTap: () => ov.destroy({ children: true }) });
    cancel.position.set(6, h - 22);
    ov.addChild(cancel);
    ov.position.set(0, 60);
    root.addChild(ov);
  };

  draw();
  return { root };
}

export function rewardScene(game: Game): Scene {
  const s = game.run!;
  const root = new Container();
  const core = game.core;
  root.position.set(core.x, core.y);
  game.bg.setMood('kiosk');
  const head = text(t('reward.title'), { size: 24, align: 'center', color: C.go1 });
  head.position.set(135, 10);
  const sub = text(t('reward.sub'), { align: 'center', color: C.paper1, wrap: 260 });
  sub.position.set(135, 36);
  root.addChild(head, sub);
  const L = game.legal()!;
  let y = 76;
  s.reward!.offers.forEach((code, i) => {
    const d = passenger(code);
    const c = new Container();
    c.position.set(0, y);
    const n = text(t(`p.${d.id}.name`), { color: RARITY_COLOR[d.rarity], fit: 190 });
    n.position.set(8, 5);
    const ds = text(t(`p.${d.id}.desc`), { color: C.paper1, wrap: 186 });
    ds.position.set(8, 24);
    const fl = text(t(`p.${d.id}.flavor`), { size: 8, color: C.night7, wrap: 186 });
    fl.position.set(8, 28 + ds.height);
    const h = 36 + ds.height + fl.height;
    c.addChild(panel(270, h, C.night1, RARITY_COLOR[d.rarity], C.night3));
    const b = new Button(t('btn.take'), 70, 26, {
      fill: C.glass1,
      edge: C.go1,
      onTap: () => {
        game.act({ t: 'reward', pick: i });
        sfx('win');
        game.sync();
      },
    });
    b.setEnabled(!!L.reward[i]);
    b.position.set(196, Math.floor((h - 26) / 2));
    c.addChild(n, ds, fl, b);
    root.addChild(c);
    y += h + 6;
  });
  if (!s.reward!.offers.length || L.reward.every((v) => !v)) {
    const full = text(t('kiosk.cabinFull'), { align: 'center', color: C.blow1 });
    full.position.set(135, y);
    root.addChild(full);
  }
  const skip = new Button(t('btn.skip'), 140, 28, {
    onTap: () => {
      game.act({ t: 'reward', pick: 15 });
      game.sync();
    },
  });
  skip.position.set(65, y + 16);
  root.addChild(skip);
  return { root };
}
