// Ларёк (shop conveyor), the deck picker for Мастерская/Утиль, and the post-boss reward.
import { Container, Graphics, Rectangle, Sprite } from 'pixi.js';
import type { HandType, KioskItem } from '../../../engine';
import { ECON, SHOP } from '../../../engine/content/balance';
import { coupon, passenger, punch } from '../../../engine/content/registry';
import { levelOf } from '../../../engine/mastery';
import { C, RARITY_COLOR } from '../../gfx/palette';
import { t } from '../../i18n';
import type { Game, Scene } from '../app';
import { portrait } from '../art';
import { sfx } from '../feel';
import { cardTexture, panel, rankLabel, text } from '../pixel';
import { tips } from '../tutorial';
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

  const W = 258;
  const label = (str: string, x: number, y: number): void => {
    const l = text(str, { color: C.night6, shadow: false });
    l.position.set(x, y);
    body.addChild(l);
  };

  const draw = () => {
    closeSheet();
    body.removeChildren().forEach((c) => {
      c.destroy({ children: true });
    });
    const k = s.kiosk!;
    const L = game.legal()!;
    const head = text(t('kiosk.title'), { size: 24, color: C.amber2 });
    head.position.set(0, 0);
    const tok = text(`${s.tokens} ◉`, { size: 24, align: 'right', color: C.amber3 });
    tok.position.set(W, 0);
    body.addChild(head, tok);

    // Салон: tap a passenger to read it or drop it off.
    label(t('mech.cabin').toUpperCase(), 0, 30);
    s.cabin.forEach((seat, i) => {
      const tile = new SeatTile(seat?.code ?? null, 42, 42, () => {
        if (!seat) return;
        const d = passenger(seat.code);
        const sh = infoSheet(
          W,
          t(`p.${d.id}.name`),
          t(`p.${d.id}.desc`),
          RARITY_COLOR[d.rarity],
          t(`p.${d.id}.flavor`),
        );
        const refund = Math.floor(d.price / 2);
        const sell = new Button(`${t('btn.sell')} +${refund}◉`, 136, 24, {
          fill: C.blow0,
          edge: C.blow1,
          onTap: () => {
            game.act({ t: 'sell', seat: i });
            sfx('coin');
            draw();
          },
        });
        sell.position.set(W - 142, 4);
        sh.addChild(sell);
        showSheet(sh);
      });
      tile.position.set(i * 43, 48);
      body.addChild(tile);
    });

    // Карман (coupons) and Копилка.
    let y = 48 + 42 + 6;
    label(t('mech.pocket').toUpperCase(), 0, y);
    label(`${t('mech.piggy').toUpperCase()}: ${s.piggy}◉ (?)`, 132, y);
    const piggyHit = new Container();
    piggyHit.hitArea = new Rectangle(132, y - 2, 126, 18);
    piggyHit.eventMode = 'static';
    piggyHit.cursor = 'pointer';
    piggyHit.on('pointertap', () =>
      showSheet(
        infoSheet(
          W - 8,
          t('mech.piggy'),
          t('kiosk.piggyHelp', { pct: 50, cap: ECON.piggyCap, back: 75 }),
          C.amber2,
        ),
      ),
    );
    body.addChild(piggyHit);
    y += 18;
    s.pocket.forEach((code, i) => {
      const box = new Container();
      box.position.set(i * 64, y);
      box.addChild(panel(62, 24, code ? C.night3 : C.night1, code ? C.amber1 : C.night3));
      const l = text(code ? t(`cp.${coupon(code).id}.name`).replace('Талон ', '') : t('seat.empty'), {
        color: code ? C.amber3 : C.night5,
        fit: 56,
      });
      l.position.set(4, 4);
      box.addChild(l);
      if (code) {
        box.eventMode = 'static';
        box.cursor = 'pointer';
        box.on('pointertap', () => openCoupon(i));
      }
      body.addChild(box);
    });
    const pg = new Button('+1◉', 56, 24, {
      onTap: () => {
        game.act({ t: 'piggy', deposit: 1 });
        sfx('coin');
        draw();
      },
    });
    pg.setEnabled(L.piggy);
    pg.position.set(132, y);
    const pb = new Button(t('btn.piggyBreak'), 66, 24, {
      onTap: () => {
        game.act({ t: 'piggyBreak' });
        sfx('coin');
        draw();
      },
    });
    pb.setEnabled(s.piggy > 0);
    pb.position.set(192, y);
    body.addChild(pg, pb);
    y += 30;

    // Лента (conveyor).
    label(t('kiosk.belt'), 0, y);
    y += 18;
    k.slots.forEach((it, i) => {
      const row = new Container();
      row.position.set(0, y);
      if (!it) {
        row.addChild(panel(W, 24, C.night1, C.night3, C.night1));
        const e = text(t('kiosk.empty'), { align: 'center', color: C.night5 });
        e.position.set(W / 2, 4);
        row.addChild(e);
        body.addChild(row);
        y += 26;
        return;
      }
      const info = itemInfo(it);
      const face = it.k === 'passenger' ? portrait(passenger(it.code).id) : undefined;
      const nx = it.k === 'card' ? 30 : face ? 46 : 6;
      const textW = W - 76 - nx;
      const n = text(info.name, { color: info.color, fit: textW });
      n.position.set(nx, 3);
      const d = text(info.desc, { size: 8, color: C.paper1, wrap: textW });
      d.position.set(nx, 21);
      const h = Math.max(face ? 46 : 36, 24 + d.height);
      row.addChild(panel(W, h, C.night2, info.color, C.night3));
      if (face) {
        const fp = new Sprite(face);
        fp.position.set(3, Math.floor((h - 40) / 2));
        row.addChild(fp);
      }
      if (it.k === 'card') {
        const sp = new Sprite(cardTexture({ rank: it.rank, suit: it.suit, punch: it.punch, charge: 0 }));
        sp.scale.set(0.5);
        sp.position.set(3, 3);
        row.addChild(sp);
      }
      const b = new Button(`${it.price}◉`, 62, 28, {
        fill: C.amber0,
        edge: C.amber2,
        onTap: () => {
          game.act({ t: 'buy', slot: i });
          sfx('coin');
          draw();
        },
      });
      b.setEnabled(!!L.buy[i]);
      // Affordable but blocked: say why instead of just greying the price out.
      if (!L.buy[i] && s.tokens >= it.price)
        b.setText(t(it.k === 'coupon' ? 'kiosk.noPocket' : 'kiosk.noSeat'));
      b.position.set(W - 66, Math.floor((h - 28) / 2));
      row.addChild(n, d, b);
      body.addChild(row);
      y += h + 3;
    });
    y += 3;

    // Shop actions, 3 in a row with short labels.
    const bw = Math.floor((W - 4) / 2);
    const acts: [string, boolean, () => void][] = [
      [
        `${t('btn.shift')} ${L.shiftCost}◉`,
        L.shift,
        () => {
          game.act({ t: 'shift' });
          sfx('shift');
          draw();
        },
      ],
      [`${t('btn.workshopShort')} ${SHOP.workshopPrice}◉`, L.workshop, openWorkshop],
      [
        `${t('btn.scrap')} ${SHOP.scrapPrice}◉`,
        L.scrap,
        () =>
          pickCards(t('kiosk.scrapPick'), 1, 1, ([uid]) => {
            game.act({ t: 'scrap', uid: uid! });
            sfx('coin');
          }),
      ],
    ];
    acts.forEach(([str, on, fn], i) => {
      const btn = new Button(str, bw, 26, { onTap: fn });
      btn.setEnabled(on);
      btn.position.set((i % 2) * (bw + 4), y + Math.floor(i / 2) * 30);
      body.addChild(btn);
    });
    y += 62;

    const leave = new Button(t('btn.leave'), 160, 32, {
      fill: C.glass1,
      edge: C.go1,
      size: 16,
      onTap: () => {
        game.act({ t: 'leave' });
        game.sync();
      },
    });
    leave.position.set(W / 2 - 80, Math.max(y, core.h - 34));
    body.addChild(leave);
  };

  const showSheet = (c: Container) => {
    closeSheet();
    sheet = c;
    c.position.set(4, 122);
    // Tap the sheet itself to close it (its buttons act first).
    c.eventMode = 'static';
    c.on('pointertap', closeSheet);
    root.addChild(c);
  };

  /** Deck picker: tap cards (min..max), then confirm; a single-card pick applies on tap. */
  const pickCards = (
    title: string,
    min: number,
    max: number,
    done: (uids: number[]) => void,
    header?: (ov: Container, y: number) => number,
  ) => {
    closeSheet();
    const ov = new Container();
    ov.eventMode = 'static';
    const tl = text(title, { color: C.amber2, wrap: 244 });
    tl.position.set(6, 6);
    let y = 10 + tl.height;
    const hdr = new Container();
    y = header ? header(hdr, y) : y;
    const deck = s.deck.slice().sort((a, b) => a.suit - b.suit || b.rank - a.rank);
    const top = y;
    const rows = Math.ceil(deck.length / 9);
    const h = top + rows * 42 + 34;
    ov.addChild(panel(258, h, C.night0, C.amber2, C.night2), tl, hdr);
    const chosen = new Set<number>();
    const confirm = new Button(t('btn.done'), 90, 24, {
      fill: C.glass1,
      edge: C.go1,
      onTap: () => {
        if (chosen.size < min) return;
        ov.destroy({ children: true });
        done([...chosen]);
        draw();
      },
    });
    const marks = new Map<number, Graphics>();
    deck.forEach((c, i) => {
      const x = 6 + (i % 9) * 28;
      const cy = top + Math.floor(i / 9) * 42;
      const mark = new Graphics().rect(x - 1, cy - 1, 29, 41).fill(C.go1);
      mark.visible = false;
      marks.set(c.uid, mark);
      const sp = new Sprite(cardTexture(c));
      sp.scale.set(0.56);
      sp.position.set(x, cy);
      sp.eventMode = 'static';
      sp.cursor = 'pointer';
      sp.on('pointertap', () => {
        if (max === 1) {
          ov.destroy({ children: true });
          done([c.uid]);
          draw();
          return;
        }
        if (chosen.has(c.uid)) chosen.delete(c.uid);
        else if (chosen.size < max) chosen.add(c.uid);
        else return sfx('error');
        sfx('select');
        mark.visible = chosen.has(c.uid);
        confirm.setEnabled(chosen.size >= min);
      });
      ov.addChild(mark, sp);
    });
    const cancel = new Button(t('btn.cancel'), 90, 24, { onTap: () => ov.destroy({ children: true }) });
    cancel.position.set(6, h - 30);
    ov.addChild(cancel);
    if (max > 1) {
      confirm.setEnabled(false);
      confirm.position.set(258 - 96, h - 30);
      ov.addChild(confirm);
    }
    ov.position.set(0, Math.max(0, Math.min(40, core.h - h)));
    root.addChild(ov);
  };

  /** Мастерская: both punch offers side by side with their effect; then pick the card. */
  const openWorkshop = () => {
    const k = s.kiosk!;
    let choice: 0 | 1 = 0;
    pickCards(
      t('kiosk.workshopPick'),
      1,
      1,
      ([uid]) => {
        game.act({ t: 'workshop', uid: uid!, pick: choice });
        sfx('coin');
      },
      (hdr, y0) => {
        const btns: Button[] = [];
        const desc = text('', { size: 8, color: C.paper1, wrap: 244 });
        const show = () => {
          desc.set(t(`pu.${punch(k.workshopOffer[choice]).id}.desc`));
          btns.forEach((b, i) => {
            b.alpha = i === choice ? 1 : 0.5;
          });
        };
        k.workshopOffer.forEach((code, i) => {
          if (!code) return;
          const b = new Button(t(`pu.${punch(code).id}.name`), 120, 24, {
            fill: C.volt0,
            edge: C.volt2,
            onTap: () => {
              choice = i as 0 | 1;
              show();
            },
          });
          b.position.set(6 + i * 126, y0);
          btns.push(b);
          hdr.addChild(b);
        });
        desc.position.set(6, y0 + 28);
        hdr.addChild(desc);
        show();
        return y0 + 32 + 26;
      },
    );
  };

  /** Pocket coupons in the kiosk: read them and use the ones that work outside a stop. */
  const openCoupon = (slot: number) => {
    const code = s.pocket[slot];
    if (!code) return;
    const def = coupon(code);
    const L = game.legal();
    const ok = !!L?.coupon[slot];
    const sh = infoSheet(
      W - 8,
      t(`cp.${def.id}.name`),
      t(`cp.${def.id}.desc`),
      C.amber2,
      ok ? undefined : t('kiosk.stopOnly'),
    );
    const use = new Button(t('btn.use'), 110, 22, {
      fill: C.amber0,
      edge: C.amber2,
      onTap: () => {
        const tg = def.target;
        const apply = (extra: { uids?: number[]; hand?: HandType }) => {
          game.act({ t: 'coupon', slot, ...extra });
          sfx('levelUp');
          draw();
        };
        if (tg.k === 'cards')
          pickCards(
            t('kiosk.pickN', { n: tg.min === tg.max ? tg.min : `${tg.min}-${tg.max}` }),
            tg.min,
            tg.max,
            (uids) => apply({ uids }),
          );
        else if (tg.k === 'hand') pickHand((hand) => apply({ hand }));
        else apply({});
      },
    });
    use.setEnabled(ok);
    use.position.set(W - 8 - 116, 4);
    sh.addChild(use);
    showSheet(sh);
  };

  /** Hand-type picker (Конспект): every known hand with its current level. */
  const pickHand = (done: (hand: HandType) => void) => {
    closeSheet();
    const ov = new Container();
    ov.eventMode = 'static';
    const tl = text(t('kiosk.pickHand'), { color: C.amber2 });
    tl.position.set(6, 6);
    const types = [...Array(11).keys()].filter((h) => h < 9 || s.mastery.played[h]! > 0) as HandType[];
    const h = 30 + Math.ceil(types.length / 2) * 30 + 32;
    ov.addChild(panel(258, h, C.night0, C.amber2, C.night2), tl);
    types.forEach((ht, i) => {
      const b = new Button(
        `${t(`hand.${ht}`)} ${t('stop.lvl', { n: levelOf(s.mastery.xp[ht]!) })}`,
        122,
        26,
        {
          onTap: () => {
            ov.destroy({ children: true });
            done(ht);
          },
        },
      );
      b.position.set(6 + (i % 2) * 126, 28 + Math.floor(i / 2) * 30);
      ov.addChild(b);
    });
    const cancel = new Button(t('btn.cancel'), 90, 24, { onTap: () => ov.destroy({ children: true }) });
    cancel.position.set(6, h - 30);
    ov.addChild(cancel);
    ov.position.set(0, 60);
    root.addChild(ov);
  };

  draw();
  void tips(game, ['kiosk'], 40);
  return { root };
}

export function rewardScene(game: Game): Scene {
  const s = game.run!;
  const root = new Container();
  const core = game.core;
  root.position.set(core.x, core.y);
  game.bg.setMood('kiosk');
  const head = text(t('reward.title'), { size: 24, align: 'center', color: C.go1 });
  head.position.set(129, 10);
  const sub = text(t('reward.sub'), { align: 'center', color: C.paper1, wrap: 248 });
  sub.position.set(129, 36);
  root.addChild(head, sub);
  const L = game.legal()!;
  let y = 76;
  s.reward!.offers.forEach((code, i) => {
    const d = passenger(code);
    const c = new Container();
    c.position.set(0, y);
    const face = portrait(d.id);
    const tx = face ? 48 : 8;
    const n = text(t(`p.${d.id}.name`), { color: RARITY_COLOR[d.rarity], fit: 178 - tx + 8 });
    n.position.set(tx, 5);
    const ds = text(t(`p.${d.id}.desc`), { color: C.paper1, wrap: 174 - tx + 8 });
    ds.position.set(tx, 24);
    const fl = text(t(`p.${d.id}.flavor`), { size: 8, color: C.night7, wrap: 174 - tx + 8 });
    fl.position.set(tx, 28 + ds.height);
    const h = Math.max(48, 36 + ds.height + fl.height);
    c.addChild(panel(258, h, C.night1, RARITY_COLOR[d.rarity], C.night3));
    if (face) {
      const fp = new Sprite(face);
      fp.position.set(4, 4);
      c.addChild(fp);
    }
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
    b.position.set(184, Math.floor((h - 26) / 2));
    c.addChild(n, ds, fl, b);
    root.addChild(c);
    y += h + 6;
  });
  if (s.reward!.offers.length && L.reward.every((v) => !v)) {
    // Cabin full: let the player drop someone off right here (tap a seat twice) to make room.
    const full = text(t('reward.full'), { align: 'center', color: C.blow1, wrap: 248 });
    full.position.set(129, y);
    root.addChild(full);
    y += full.height + 4;
    let armed = -1;
    const note = text('', { size: 8, align: 'center', color: C.amber2, wrap: 248 });
    s.cabin.forEach((seat, i) => {
      const tile = new SeatTile(seat?.code ?? null, 42, 42, () => {
        if (!seat) return;
        const d = passenger(seat.code);
        if (armed !== i) {
          armed = i;
          note.set(t('reward.dropConfirm', { name: t(`p.${d.id}.name`), n: Math.floor(d.price / 2) }));
          sfx('select');
          return;
        }
        game.act({ t: 'sell', seat: i });
        sfx('coin');
        game.sync(true);
      });
      tile.position.set(i * 43, y);
      root.addChild(tile);
    });
    y += 46;
    note.position.set(129, y);
    root.addChild(note);
    y += 14;
  }
  const skip = new Button(t('btn.skip'), 130, 28, {
    onTap: () => {
      game.act({ t: 'reward', pick: 15 });
      game.sync();
    },
  });
  skip.position.set(64, y + 10);
  root.addChild(skip);
  return { root };
}
