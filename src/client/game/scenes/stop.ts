// The stop screen: cabin, score panel, overdrive gauge, the hand, and the animated scoring cascade.
import { Container, Graphics, Rectangle, Sprite } from 'pixi.js';
import { type Card, type GameEvent, preview } from '../../../engine';
import { coupon, inspector, passenger } from '../../../engine/content/registry';
import { C } from '../../gfx/palette';
import { t } from '../../i18n';
import { formatPower, formatShort } from '../../i18n/format';
import type { Game, Scene } from '../app';
import { haptic, sfx } from '../feel';
import { pace, Spring, wait } from '../fx';
import { CARD_H, CARD_W, cardTexture, panel, rankLabel, text } from '../pixel';
import { tips } from '../tutorial';
import { Button, infoSheet, SeatTile } from '../ui';

class CardView extends Container {
  readonly cardUid: number;
  readonly sprite: Sprite;
  sx: Spring;
  sy: Spring;
  rot = new Spring(0, 200, 0.5);
  sc = new Spring(1, 300, 0.45);
  phase = Math.random() * 6.28;
  selected = false;

  constructor(card: Card, x: number, y: number) {
    super();
    this.cardUid = card.uid;
    this.sprite = new Sprite(cardTexture(card));
    this.sprite.anchor.set(0.5);
    this.addChild(this.sprite);
    this.sx = new Spring(x, 180, 0.7);
    this.sy = new Spring(y, 180, 0.7);
    this.position.set(x, y);
    this.eventMode = 'static';
    this.cursor = 'pointer';
    this.hitArea = new Rectangle(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H);
  }

  refresh(card: Card): void {
    this.sprite.texture = cardTexture(card);
  }

  update(dt: number, time: number, idle: boolean): void {
    this.x = Math.round(this.sx.step(dt));
    this.y = Math.round(this.sy.step(dt) + (idle ? Math.sin(time * 1.1 + this.phase) * 0.8 : 0));
    this.rotation = this.rot.step(dt) + (idle ? Math.sin(time * 1.4 + this.phase) * 0.02 : 0);
    this.scale.set(this.sc.step(dt));
  }
}

export function stopScene(game: Game): Scene {
  const s = game.run!;
  const root = new Container();
  const core = game.core;
  root.position.set(core.x, core.y);
  const W = 258;
  const MID = 119; // centre of the play column (the gauge sits on the right)
  const H = core.h;
  const st = () => s.stop!;
  const boss = st().boss ? inspector(st().boss) : null;
  const line = Math.min(3, Math.ceil(s.stopNo / 4));
  game.bg.setMood(boss ? 'boss' : (`line${line}` as 'line1'));
  game.bg.energy = 0.15;

  // ---------- HUD ----------
  const hud = new Container();
  hud.addChild(panel(W, 44, C.night1, boss ? C.blow1 : C.night5));
  const stopLbl = text('', { color: boss ? C.blow1 : C.glass3, fit: 190 });
  stopLbl.position.set(6, 4);
  const targetLbl = text('', { align: 'center', color: C.paper2 });
  targetLbl.position.set(W / 2, 4);
  const tokensLbl = text('', { align: 'right', color: C.amber3 });
  tokensLbl.position.set(W - 6, 4);
  const bar = new Graphics();
  bar.position.set(6, 28);
  const totalLbl = text('', { align: 'right', color: C.paper1, fit: 150 });
  totalLbl.position.set(W - 6, 24);
  hud.addChild(stopLbl, targetLbl, tokensLbl, bar, totalLbl);
  root.addChild(hud);
  let shownTotal = Number(s.stop?.total ?? 0n);
  const drawHud = () => {
    const k = st().kind;
    const kindName = boss ? t(`in.${boss.id}.name`) : t(`stop.${k}`);
    stopLbl.set(`${t('hud.stop', { n: s.stopNo })} · ${kindName}`.toUpperCase());
    targetLbl.set('');
    tokensLbl.set(`◉ ${s.tokens}`);
    const target = Number(st().target);
    const frac = Math.min(1, shownTotal / Math.max(1, target));
    bar
      .clear()
      .rect(0, 0, 96, 9)
      .fill(C.night0)
      .rect(1, 1, Math.round(94 * frac), 7)
      .fill(frac >= 1 ? C.go1 : C.amber1);
    totalLbl.set(`${formatPower(BigInt(Math.floor(shownTotal)))} / ${formatPower(st().target)}`);
  };

  // ---------- Cabin + side panel ----------
  const cabin = new Container();
  cabin.position.set(0, 50);
  root.addChild(cabin);
  const sheetLayer = new Container();
  let sheet: Container | null = null;
  const closeSheet = () => {
    sheet?.destroy({ children: true });
    sheet = null;
  };
  const openSheet = (c: Container) => {
    closeSheet();
    sheet = c;
    c.position.set(0, 160);
    c.eventMode = 'static';
    c.on('pointertap', closeSheet);
    sheetLayer.addChild(c);
  };
  const seatTiles: SeatTile[] = [];
  const drawCabin = () => {
    cabin.removeChildren().forEach((c) => {
      c.destroy({ children: true });
    });
    seatTiles.length = 0;
    s.cabin.forEach((seat, i) => {
      const tile = new SeatTile(seat?.code ?? null, 84, 36, () => {
        if (!seat) return;
        const def = passenger(seat.code);
        sfx('tap');
        openSheet(
          infoSheet(W, t(`p.${def.id}.name`), t(`p.${def.id}.desc`), C.volt2, t(`p.${def.id}.flavor`)),
        );
      });
      tile.position.set((i % 3) * 87, Math.floor(i / 3) * 39);
      cabin.addChild(tile);
      seatTiles[i] = tile;
    });
    // boss / stop card
    const side = new Container();
    side.position.set(0, 78);
    const bossBox = panel(126, 22, boss ? C.blow0 : C.night2, boss ? C.blow1 : C.night4);
    const bl = text(boss ? t(`in.${boss.id}.name`) : t(`stop.${st().kind}`), { color: C.paper2, fit: 118 });
    bl.position.set(4, 3);
    side.addChild(bossBox, bl);
    if (boss) {
      side.eventMode = 'static';
      side.on('pointertap', () =>
        openSheet(
          infoSheet(
            258,
            t(`in.${boss.id}.name`),
            t(`in.${boss.id}.desc`),
            C.blow1,
            `«${t(`in.${boss.id}.quote`)}»`,
          ),
        ),
      );
    }
    s.pocket.forEach((code, i) => {
      const box = new Container();
      box.position.set(130 + i * 65, 0);
      box.addChild(panel(63, 22, code ? C.night3 : C.night1, code ? C.amber1 : C.night3));
      if (code) {
        const def = coupon(code);
        const l = text(t(`cp.${def.id}.name`).replace('Талон ', ''), { color: C.amber3, fit: 57 });
        l.position.set(3, 3);
        box.addChild(l);
        box.eventMode = 'static';
        box.cursor = 'pointer';
        box.on('pointertap', () => openCoupon(i));
      }
      side.addChild(box);
    });
    cabin.addChild(side);
  };

  // ---------- Score panel ----------
  const score = new Container();
  score.position.set(0, 160);
  root.addChild(score);
  const handName = text('', { align: 'center', color: C.paper2, fit: 240 });
  handName.position.set(MID, 0);
  const tBox = panel(96, 28, C.amber0, C.amber2, C.amber1);
  tBox.position.set(MID - 116, 20);
  const nBox = panel(96, 28, C.volt0, C.volt2, C.volt1);
  nBox.position.set(MID + 20, 20);
  const tVal = text('0', { size: 24, align: 'center', color: C.amber3 });
  tVal.position.set(MID - 68, 22);
  const nVal = text('0', { size: 24, align: 'center', color: C.volt3 });
  nVal.position.set(MID + 68, 22);
  const times = text('×', { size: 24, align: 'center', color: C.paper2 });
  times.position.set(MID, 22);
  const powerLbl = text('', { size: 24, align: 'center', color: C.paper2 });
  powerLbl.position.set(MID, 52);
  score.addChild(handName, tBox, nBox, tVal, nVal, times, powerLbl);
  const tSpring = new Spring(1, 400, 0.35);
  const nSpring = new Spring(1, 400, 0.35);
  let curT = 0;
  let curN = 0;
  const setTN = (tv: number, nv: number) => {
    if (tv !== curT) tSpring.kick(4);
    if (nv !== curN) nSpring.kick(4);
    curT = tv;
    curN = nv;
    tVal.set(formatShort(tv));
    nVal.set(formatShort(nv));
  };

  // ---------- Gauge ----------
  const gauge = new Graphics();
  gauge.position.set(W - 10, 160);
  root.addChild(gauge);
  const gaugeH = Math.max(60, Math.min(170, H - 160 - 150));
  let shownGauge = s.gauge;
  const drawGauge = () => {
    const g = gauge.clear();
    g.rect(0, 0, 10, gaugeH).fill(C.night5);
    g.rect(1, 1, 8, gaugeH - 2).fill(C.night0);
    const v = Math.max(0, Math.min(100, shownGauge));
    const h = Math.round(((gaugeH - 2) * v) / 100);
    const col = v >= 80 ? C.blow1 : v >= 30 ? C.volt2 : C.glass2;
    g.rect(1, gaugeH - 1 - h, 8, h).fill(col);
    const mark = gaugeH - 1 - Math.round(((gaugeH - 2) * 30) / 100);
    g.rect(0, mark, 10, 1).fill(C.amber2);
  };

  // ---------- Hand, play area, controls ----------
  const by = H - 32;
  const handY = by - 18 - CARD_H / 2;
  const deckY = handY - CARD_H / 2 - 30;
  const playY = Math.round((240 + deckY) / 2);
  const cardsLayer = new Container();
  root.addChild(cardsLayer);
  const views = new Map<number, CardView>();
  let sortMode: 'slot' | 'rank' | 'suit' = 'rank';
  let busy = false;
  let odArmed = false;

  const card = (uid: number): Card => s.deck.find((c) => c.uid === uid)!;
  const displayOrder = (): number[] => {
    const hand = st().hand.slice();
    if (sortMode === 'rank') hand.sort((a, b) => card(b).rank - card(a).rank || card(a).suit - card(b).suit);
    if (sortMode === 'suit') hand.sort((a, b) => card(a).suit - card(b).suit || card(b).rank - card(a).rank);
    return hand;
  };
  const layoutHand = () => {
    const order = displayOrder();
    const n = order.length;
    const span = Math.min(35, n > 1 ? (W - CARD_W) / (n - 1) : 0);
    order.forEach((uid, i) => {
      const v = views.get(uid);
      if (!v) return;
      const mid = (n - 1) / 2;
      v.sx.target = W / 2 + (i - mid) * span;
      v.sy.target = handY + Math.round((i - mid) ** 2 * 0.6) - (v.selected ? 14 : 0);
      v.rot.target = (i - mid) * 0.035;
      cardsLayer.setChildIndex(v, Math.min(i, cardsLayer.children.length - 1));
    });
  };
  const selectedIdx = (): number[] => {
    const hand = st().hand;
    return displayOrder()
      .filter((uid) => views.get(uid)?.selected)
      .map((uid) => hand.indexOf(uid));
  };
  const addView = (uid: number, fromDeck: boolean) => {
    const v = new CardView(card(uid), fromDeck ? W - 20 : W / 2, fromDeck ? handY + 40 : handY);
    v.on('pointertap', () => toggle(v));
    views.set(uid, v);
    cardsLayer.addChild(v);
  };
  const toggle = (v: CardView) => {
    if (busy) return;
    closeSheet();
    if (!v.selected && selectedIdx().length >= 5) {
      sfx('error');
      return;
    }
    v.selected = !v.selected;
    v.rot.kick(v.selected ? -3 : 3);
    v.sc.kick(2);
    sfx(v.selected ? 'select' : 'deselect');
    haptic.impact('light');
    layoutHand();
    refreshControls();
  };

  const info = text('', { color: C.night7 });
  info.position.set(66, deckY + 3);
  const previewLbl = text('', { align: 'right', color: C.paper1 });
  previewLbl.position.set(W, deckY);
  previewLbl.visible = false;
  root.addChild(info, previewLbl, sheetLayer);

  const discardBtn = new Button('', 72, 32, { fill: C.night3, edge: C.blow1, onTap: () => doDiscard() });
  discardBtn.position.set(0, by);
  const odBtn = new Button('', 88, 32, { fill: C.volt0, edge: C.volt2, onTap: () => toggleOd() });
  odBtn.position.set(76, by);
  const playBtn = new Button('', 90, 32, { fill: C.glass1, edge: C.go1, onTap: () => doPlay() });
  playBtn.position.set(168, by);
  const sortBtn = new Button(t('btn.sort'), 56, 22, {
    fill: C.night2,
    edge: C.night5,
    onTap: () => {
      sortMode = sortMode === 'rank' ? 'suit' : 'rank';
      layoutHand();
    },
  });
  sortBtn.position.set(0, deckY);
  root.addChild(discardBtn, odBtn, playBtn, sortBtn);

  const refreshControls = () => {
    const L = game.legal();
    const idx = selectedIdx();
    const has = idx.length > 0 && !busy;
    playBtn.setText(`${t('btn.play')} ${st()?.hands ?? 0}`);
    discardBtn.setText(`${t('btn.discard')} ${st()?.discards ?? 0}`);
    playBtn.setEnabled(has && !!L?.play);
    discardBtn.setEnabled(has && !!L?.discard);
    const odOk = !!L?.od && !busy;
    if (!odOk) odArmed = false;
    odBtn.setText(odArmed ? `⚡ ×${((100 + s.gauge) / 100).toFixed(2)}` : t('btn.overdrive'));
    odBtn.setEnabled(odOk);
    info.set(`${t('misc.deck', { n: st()?.draw.length ?? 0 })}`);
    if (st() && idx.length) {
      const p = preview(s, idx);
      previewLbl.set(`${t(`hand.${p.type}`)} ${t('stop.lvl', { n: p.level })} · ${p.t}×${p.n}`);
      if (!busy) handName.set(`${t(`hand.${p.type}`).toUpperCase()} ${t('stop.lvl', { n: p.level })}`);
      if (!busy) setTN(p.t, p.n);
    } else {
      previewLbl.set('');
      if (!busy) {
        handName.set('');
        setTN(0, 0);
      }
    }
    if (st()?.boss && st().bossState[0] !== undefined && boss?.id === 'trackWorks') {
      info.set(
        `${t('misc.deck', { n: st().draw.length })} · ${t('stop.repair', { r: rankLabel(st().bossState[0]!) })}`,
      );
    }
    drawHud();
  };

  const toggleOd = () => {
    odArmed = !odArmed;
    sfx(odArmed ? 'overdrive' : 'deselect');
    haptic.impact('medium');
    if (odArmed) game.bg.pulse(C.volt2, 0.4);
    refreshControls();
  };

  const openCoupon = (slot: number) => {
    if (busy) return;
    const code = s.pocket[slot];
    if (!code) return;
    const def = coupon(code);
    const sheetC = infoSheet(W, t(`cp.${def.id}.name`), t(`cp.${def.id}.desc`), C.amber2);
    const L = game.legal();
    const use = new Button(t('btn.use'), 100, 20, {
      fill: C.amber0,
      edge: C.amber2,
      onTap: () => {
        const idx = selectedIdx();
        const uids = idx.map((i) => st().hand[i]!);
        try {
          if (def.target.k === 'cards') {
            if (uids.length < def.target.min || uids.length > def.target.max) {
              game.pops.pop(t('stop.pickCards'), core.x + MID, core.y + 170, C.amber2);
              return;
            }
            void run(game.act({ t: 'coupon', slot, uids }));
          } else if (def.target.k === 'hand') {
            if (!idx.length) {
              game.pops.pop(t('stop.pickCards'), core.x + MID, core.y + 170, C.amber2);
              return;
            }
            void run(game.act({ t: 'coupon', slot, hand: preview(s, idx).type }));
          } else void run(game.act({ t: 'coupon', slot }));
          closeSheet();
        } catch {
          sfx('error');
        }
      },
    });
    use.setEnabled(!!L?.coupon[slot]);
    use.position.set(W - 108, 4);
    sheetC.addChild(use);
    openSheet(sheetC);
  };

  const doPlay = () => {
    if (busy) return;
    const idx = selectedIdx();
    if (!idx.length) return;
    sfx('play');
    haptic.impact('medium');
    void run(game.act({ t: 'play', idx, od: odArmed }));
  };
  const doDiscard = () => {
    if (busy) return;
    const idx = selectedIdx();
    if (!idx.length) return;
    void run(game.act({ t: 'discard', idx }));
  };

  // ---------- Event cascade ----------
  const centerOf = (uid: number): [number, number] => {
    const v = views.get(uid);
    return v ? [core.x + v.x, core.y + v.y - CARD_H / 2 - 4] : [core.x + MID, core.y + 160];
  };
  const seatPos = (i: number): [number, number] => [
    core.x + (i % 3) * 87 + 42,
    core.y + 50 + Math.floor(i / 3) * 39,
  ];

  async function run(events: GameEvent[]): Promise<void> {
    busy = true;
    refreshControls();
    let step = 0;
    let tAcc = 0;
    let nAcc = 0;
    for (const e of events) {
      switch (e.e) {
        case 'handStart': {
          handName.set(`${t(`hand.${e.type}`).toUpperCase()} ${t('stop.lvl', { n: e.level })}`);
          const n = e.uids.length;
          e.uids.forEach((uid, i) => {
            const v = views.get(uid);
            if (!v) return;
            v.selected = false;
            v.sx.target = MID + (i - (n - 1) / 2) * 44;
            v.sy.target = playY - (e.scoring.includes(i) ? 6 : 0);
            v.rot.target = 0;
            cardsLayer.addChild(v);
          });
          layoutHand();
          if (e.od) {
            game.bg.pulse(C.volt2, 1);
            game.bg.energy = 0.8;
          }
          await wait(380);
          break;
        }
        case 'base':
          tAcc = e.t;
          nAcc = e.n;
          setTN(tAcc, nAcc);
          sfx('voltage', 0);
          await wait(260);
          break;
        case 'card': {
          tAcc += e.t;
          setTN(tAcc, nAcc);
          const v = views.get(e.uid);
          v?.sc.kick(6);
          v?.rot.kick(e.rep % 2 ? -6 : 6);
          const [x, y] = centerOf(e.uid);
          game.pops.pop(`+${e.t}`, x, y, C.amber2, 16);
          sfx('current', step++);
          haptic.impact('rigid');
          await wait(150);
          break;
        }
        case 'mod': {
          tAcc += e.t ?? 0;
          nAcc += e.n ?? 0;
          let [x, y] = e.uid ? centerOf(e.uid) : [core.x + MID, core.y + 180];
          if (e.src.k === 'seat') {
            [x, y] = seatPos(e.src.i);
            const tile = seatTiles[e.src.i];
            if (tile) {
              tile.y += -3;
              setTimeout(() => (tile.y += 3), 120);
            }
          }
          const parts = [
            e.t ? `+${e.t}` : '',
            e.n ? `+${e.n} ${t('unit.voltage').slice(0, 1)}` : '',
            e.x ? `×${(e.x[0] / e.x[1]).toFixed(2).replace(/\.?0+$/, '')}` : '',
          ].filter(Boolean);
          game.pops.pop(parts.join(' '), x, y, e.x ? C.volt3 : e.n ? C.volt2 : C.amber2, 16);
          if (e.x) {
            sfx('multiply');
            game.shake.add(0.15);
          } else sfx(e.n ? 'voltage' : 'current', step++);
          setTN(tAcc, nAcc);
          await wait(e.src.k === 'seat' ? 230 : 160);
          break;
        }
        case 'held': {
          tAcc += e.t;
          nAcc += e.n;
          const [x, y] = centerOf(e.uid);
          game.pops.pop(`+${e.t || e.n}`, x, y, C.glass3);
          setTN(tAcc, nAcc);
          await wait(150);
          break;
        }
        case 'wave':
          game.pops.pop(t('stop.wave', { n: e.step }), core.x + MID, core.y + 140, C.go1);
          sfx('levelUp', e.step);
          await wait(200);
          break;
        case 'nCap':
          nAcc = e.n;
          setTN(tAcc, nAcc);
          await wait(150);
          break;
        case 'overdrive':
          game.pops.pop(`⚡ ×${(e.x[0] / e.x[1]).toFixed(2)}`, core.x + MID, core.y + 200, C.volt3, 16);
          sfx('overdrive');
          haptic.impact('heavy');
          game.shake.add(0.3);
          await wait(320);
          break;
        case 'power': {
          setTN(e.t, e.n);
          await wait(250);
          powerLbl.set(`= ${formatPower(e.power)}`);
          const ratio = Number(e.power) / Math.max(1, Number(st()?.target ?? 1));
          sfx('slam');
          haptic.impact(ratio > 0.5 ? 'heavy' : 'medium');
          game.shake.add(Math.min(0.9, 0.2 + ratio));
          game.bg.pulse(C.amber2, Math.min(1, 0.3 + ratio));
          game.bg.energy = Math.min(1, 0.2 + ratio);
          game.particles.burst(core.x + MID, core.y + 200, Math.min(60, 10 + Math.round(ratio * 40)), [
            C.amber2,
            C.volt2,
            C.paper2,
          ]);
          const from = shownTotal;
          const to = Number(e.total);
          for (let i = 1; i <= 12; i++) {
            shownTotal = from + ((to - from) * i) / 12;
            drawHud();
            await wait(30);
          }
          await wait(250);
          break;
        }
        case 'sparks': {
          sfx('sparks');
          const from = shownGauge;
          for (let i = 1; i <= 8; i++) {
            shownGauge = from + ((e.gauge - from) * i) / 8;
            drawGauge();
            await wait(25);
          }
          break;
        }
        case 'gauge':
          shownGauge = e.gauge;
          drawGauge();
          break;
        case 'blowout':
          if (e.cancelledBy) {
            game.pops.pop('⚡!', core.x + W - 5, core.y + 150, C.go1);
            sfx('coin');
          } else {
            game.pops.pop(t('stop.blowout'), core.x + MID, core.y + 160, C.blow1, 16);
            sfx('blowout');
            haptic.notify('error');
            game.shake.add(0.8);
            game.bg.pulse(C.blow1, 1);
            game.particles.burst(core.x + W - 5, core.y + 170, 40, [C.blow1, C.amber2, C.paper2], 90);
          }
          shownGauge = e.gauge;
          drawGauge();
          await wait(450);
          break;
        case 'xp':
          if (e.levelUp) {
            game.pops.pop(
              t('stop.levelUp', { hand: t(`hand.${e.hand}`), lvl: e.level }),
              core.x + MID,
              core.y + 76,
              C.glass3,
            );
            sfx('levelUp');
            await wait(250);
          }
          break;
        case 'tokens':
          if (e.add) {
            game.pops.pop(`${e.add > 0 ? '+' : ''}${e.add} ◉`, core.x + W - 20, core.y + 12, C.amber3);
            sfx('coin');
          }
          drawHud();
          break;
        case 'discard':
          for (const uid of e.uids) {
            const v = views.get(uid);
            if (v) {
              v.sx.target = 300;
              v.sy.target = handY + 60;
              v.rot.kick(10);
            }
          }
          sfx('deal');
          await wait(220);
          for (const uid of e.uids) {
            views.get(uid)?.destroy();
            views.delete(uid);
          }
          break;
        case 'draw':
          for (const uid of e.uids) {
            if (!views.has(uid)) addView(uid, true);
            sfx('deal');
            layoutHand();
            await wait(60);
          }
          break;
        case 'cardChanged':
          views.get(e.uid)?.refresh(card(e.uid));
          break;
        case 'cardRemoved':
          views.get(e.uid)?.destroy();
          views.delete(e.uid);
          break;
        case 'seats':
          drawCabin();
          break;
        case 'pocket':
          drawCabin();
          break;
        case 'target':
          drawHud();
          break;
        case 'stopCleared': {
          sfx('win');
          haptic.notify('success');
          const inc = e.income.reduce((a, b) => a + b.tokens, 0);
          game.pops.pop(t('stop.cleared'), core.x + MID, core.y + 150, C.go1, 16);
          game.pops.pop(t('stop.income', { n: inc }), core.x + MID, core.y + 172, C.amber3);
          game.particles.burst(core.x + MID, core.y + 150, 60, [C.go1, C.amber2, C.paper2], 100);
          await wait(900);
          break;
        }
        case 'stopFailed':
          sfx('lose');
          haptic.notify('error');
          game.pops.pop(t('stop.failed'), core.x + MID, core.y + 150, C.blow1, 16);
          game.bg.setMood('over');
          await wait(1200);
          break;
        default:
          break;
      }
    }
    // Played cards leave the table.
    for (const [uid, v] of views) {
      if (!st()?.hand.includes(uid)) {
        v.sy.target = -60;
        v.rot.kick(8);
        setTimeout(() => {
          v.destroy();
        }, 400);
        views.delete(uid);
      }
    }
    powerLbl.set('');
    busy = false;
    game.bg.energy = 0.15;
    if (s.phase !== 'stop') {
      await wait(200);
      game.sync();
      return;
    }
    layoutHand();
    refreshControls();
  }

  // ---------- Init ----------
  drawCabin();
  for (const uid of st().hand) addView(uid, true);
  layoutHand();
  drawGauge();
  refreshControls();
  void tips(game, boss ? ['boss'] : ['select', 'score', 'overdrive', 'discard'], 236);
  if (boss) {
    sfx('bell');
    game.pops.pop(`«${t(`in.${boss.id}.quote`)}»`, core.x + MID, core.y + 160, C.blow1);
  }

  let time = 0;
  return {
    root,
    update(dt) {
      time += dt;
      const fast = pace.fast;
      for (const v of views.values()) v.update(dt * (fast ? 2 : 1), time, !busy);
      tVal.scale.set(tSpring.step(dt));
      nVal.scale.set(nSpring.step(dt));
    },
  };
}
