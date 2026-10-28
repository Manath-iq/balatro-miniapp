import { Container } from 'pixi.js';
import { seedFromHex } from '../../../engine';
import type { StartRes } from '../../../shared/api';
import { C } from '../../gfx/palette';
import { getLang, setLang, t } from '../../i18n';
import { formatPower } from '../../i18n/format';
import type { Game, Scene } from '../app';
import { saveSettings, settings, sfx } from '../feel';
import { Spring } from '../fx';
import { ApiFail, api, online } from '../net';
import { text } from '../pixel';
import { bestLocal, loadRun } from '../save';
import { resetTutorial } from '../tutorial';
import { Button } from '../ui';

function randomSeedHex(): string {
  const b = new Uint32Array(4);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(8, '0')).join('');
}

/** Offline daily seed until the server issues it: same for everyone on the same Moscow date. */
export function mskDay(): string {
  return new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10);
}
async function dailySeedHex(day: string): Promise<string> {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`last-tram-daily:${day}`));
  return Array.from(new Uint8Array(h).slice(0, 16), (x) => x.toString(16).padStart(2, '0')).join('');
}

export function menuScene(game: Game): Scene {
  const root = new Container();
  const core = game.core;
  root.position.set(core.x, core.y);
  game.bg.setMood('menu');
  game.bg.energy = 0.35;

  const letters: { c: Container; phase: number; y: number }[] = [];
  const title = new Container();
  const words = t('game.title').toUpperCase().split(' ');
  words.forEach((word, row) => {
    const w = word.length * 24;
    [...word].forEach((ch, i) => {
      const c = text(ch, { size: 16, color: row === 0 ? C.amber2 : C.volt2, align: 'center' });
      c.scale.set(2);
      c.position.set(129 - w / 2 + i * 24 + 12, 30 + row * 40);
      title.addChild(c);
      letters.push({ c, phase: i * 0.5 + row, y: 30 + row * 40 });
    });
  });
  const sub = text(t('menu.subtitle'), { align: 'center', color: C.glass3 });
  sub.position.set(129, 116);
  root.addChild(title, sub);

  const btns = new Container();
  root.addChild(btns);
  let y = Math.max(130, core.h / 2 - 40);
  const add = (b: Button) => {
    b.position.set(129 - b.bw / 2, y);
    btns.addChild(b);
    y += b.bh + 8;
    return b;
  };

  let note: ReturnType<typeof text> | null = null;
  const say = (str: string, color: number = C.amber2) => {
    note?.destroy();
    note = text(str, { align: 'center', color, wrap: 240 });
    note.position.set(129, 136);
    root.addChild(note);
  };
  let busy = false;
  /** Asks the server for a seed (ranked); falls back to a local seed (unranked) outside Telegram or offline. */
  const begin = async (kind: 'standard' | 'daily', driver: number) => {
    if (busy) return;
    busy = true;
    if (online()) {
      say(t('menu.loading'), C.night7);
      try {
        const r = await api<StartRes>('/api/run/start', { kind, driver });
        game.startRun(
          { seed: seedFromHex(r.seed), kind: r.kind, driver: r.driver, grade: 1, condition: 0 },
          r.day ?? undefined,
          { runId: r.runId, token: r.token },
        );
        return;
      } catch (e) {
        busy = false;
        if (e instanceof ApiFail && e.code === 'daily_taken') {
          say(t('menu.dailyTaken'), C.go1);
          return;
        }
      }
    }
    busy = false;
    say(t('menu.offline'), C.night7);
    if (kind === 'daily') {
      const day = mskDay();
      game.startRun(
        { seed: seedFromHex(await dailySeedHex(day)), kind: 'daily', driver: 1, grade: 1, condition: 0 },
        day,
      );
    } else
      game.startRun({ seed: seedFromHex(randomSeedHex()), kind: 'standard', driver, grade: 1, condition: 0 });
  };

  const showMain = () => {
    btns.removeChildren().forEach((c) => {
      c.destroy({ children: true });
    });
    y = Math.max(130, core.h / 2 - 40);
    if (loadRun()) {
      add(
        new Button(t('menu.continue'), 180, 32, {
          fill: C.glass1,
          edge: C.go1,
          size: 16,
          onTap: () => game.resume() || showMain(),
        }),
      );
    }
    add(
      new Button(t('menu.play'), 180, 32, { fill: C.amber0, edge: C.amber2, size: 16, onTap: showDrivers }),
    );
    add(
      new Button(t('menu.daily'), 180, 32, {
        fill: C.volt0,
        edge: C.volt2,
        size: 16,
        onTap: async () => {
          const day = mskDay();
          game.startRun(
            { seed: seedFromHex(await dailySeedHex(day)), kind: 'daily', driver: 1, grade: 1, condition: 0 },
            day,
          );
        },
      }),
    );
    add(
      new Button(t('menu.top'), 180, 30, {
        fill: C.glass1,
        edge: C.glass3,
        size: 16,
        onTap: () => {
          game.backTo = 'menu';
          game.show('top');
        },
      }),
    );
    const snd = add(
      new Button(`${t('menu.sound')}: ${settings.sound ? t('menu.on') : t('menu.off')}`, 150, 26, {
        onTap: () => {
          settings.sound = !settings.sound;
          saveSettings();
          snd.setText(`${t('menu.sound')}: ${settings.sound ? t('menu.on') : t('menu.off')}`);
        },
      }),
    );
    add(
      new Button(`${t('menu.lang')}: ${getLang().toUpperCase()}`, 150, 26, {
        onTap: () => {
          setLang(getLang() === 'ru' ? 'en' : 'ru');
          try {
            localStorage.setItem('lt.lang', getLang());
          } catch {}
          game.show('menu');
        },
      }),
    );
    add(
      new Button(t('menu.howto'), 150, 26, {
        onTap: () => {
          resetTutorial();
          say(t('tut.select'), C.paper1);
        },
      }),
    );
    const best = bestLocal();
    if (best.stops) {
      const b = text(t('menu.best', { stops: best.stops, peak: formatPower(BigInt(best.peak)) }), {
        align: 'center',
        color: C.night7,
      });
      b.position.set(129, y + 6);
      btns.addChild(b);
    }
  };

  const showDrivers = () => {
    btns.removeChildren().forEach((c) => {
      c.destroy({ children: true });
    });
    y = Math.max(130, core.h / 2 - 60);
    const h = text(t('menu.driver'), { align: 'center', color: C.paper2 });
    h.position.set(129, y);
    btns.addChild(h);
    y += 18;
    for (const [code, id] of [
      [1, 'petya'],
      [2, 'valya'],
    ] as const) {
      add(
        new Button(t(`dr.${id}.name`), 220, 32, {
          fill: C.night3,
          edge: C.amber2,
          size: 16,
          onTap: () =>
            game.startRun({
              seed: seedFromHex(randomSeedHex()),
              kind: 'standard',
              driver: code,
              grade: 1,
              condition: 0,
            }),
        }),
      );
      const d = text(t(`dr.${id}.desc`), { align: 'center', color: C.night7, wrap: 236 });
      d.position.set(129, y - 4);
      btns.addChild(d);
      y += d.height + 6;
    }
    add(new Button(t('btn.cancel'), 120, 26, { onTap: showMain }));
  };

  showMain();
  sfx('bell');
  let time = 0;
  const pulse = new Spring(1, 120, 0.3);
  return {
    root,
    update(dt) {
      time += dt;
      for (const l of letters) l.c.y = l.y + Math.round(Math.sin(time * 2.4 + l.phase) * 2);
      letters.forEach((l, i) => {
        l.c.rotation = Math.sin(time * 1.8 + i) * 0.06;
      });
      sub.alpha = 0.7 + Math.sin(time * 3) * 0.3;
      pulse.step(dt);
    },
  };
}
