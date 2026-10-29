// Pause / settings sheet on the overlay layer: sound, music, vibration, scoring speed, language and,
// during a run, abandoning it. Opened from the menu, Telegram's Back button or Escape.
import { Container, Graphics, Rectangle } from 'pixi.js';
import { C } from '../gfx/palette';
import { getLang, setLang, t } from '../i18n';
import type { Game } from './app';
import { saveSettings, settings } from './feel';
import { panel, text } from './pixel';
import { Button } from './ui';

let open: Container | null = null;

export function isPaused(): boolean {
  return open !== null && !open.destroyed;
}

export function closePause(): void {
  if (open && !open.destroyed) open.destroy({ children: true });
  open = null;
}

export function togglePause(game: Game, inRun: boolean): void {
  if (isPaused()) closePause();
  else openPause(game, inRun);
}

export function openPause(game: Game, inRun: boolean): void {
  closePause();
  const s = game.screen;
  const core = game.core;
  const root = new Container();
  open = root;
  const dim = new Graphics().rect(0, 0, s.w, s.h).fill({ color: C.night0, alpha: 0.82 });
  dim.eventMode = 'static';
  dim.hitArea = new Rectangle(0, 0, s.w, s.h);
  dim.on('pointertap', closePause);
  root.addChild(dim);

  const W = 220;
  const box = new Container();
  box.eventMode = 'static';
  root.addChild(box);
  const on = (v: boolean) => (v ? t('menu.on') : t('menu.off'));
  const rows: [string, () => string, () => void][] = [
    [t('menu.sound'), () => on(settings.sound), () => (settings.sound = !settings.sound)],
    [t('menu.music'), () => on(settings.music), () => (settings.music = !settings.music)],
    [t('menu.haptics'), () => on(settings.haptics), () => (settings.haptics = !settings.haptics)],
    [
      t('menu.speed'),
      () => `${settings.speed}×`,
      () => (settings.speed = settings.speed >= 3 ? 1 : settings.speed + 1),
    ],
  ];

  let y = 10;
  const title = text(t(inRun ? 'pause.title' : 'menu.settings'), { align: 'center', color: C.amber2 });
  title.position.set(W / 2, y);
  box.addChild(title);
  y += 26;
  for (const [label, value, flip] of rows) {
    const b: Button = new Button(`${label}: ${value()}`, W - 20, 26, {
      onTap: () => {
        flip();
        saveSettings();
        b.setText(`${label}: ${value()}`);
      },
    });
    b.position.set(10, y);
    box.addChild(b);
    y += 32;
  }
  const lang = new Button(`${t('menu.lang')}: ${getLang().toUpperCase()}`, W - 20, 26, {
    onTap: () => {
      setLang(getLang() === 'ru' ? 'en' : 'ru');
      try {
        localStorage.setItem('lt.lang', getLang());
      } catch {}
      closePause();
      game.sync(true);
    },
  });
  lang.position.set(10, y);
  box.addChild(lang);
  y += 36;

  if (inRun) {
    let armed = false;
    const quit: Button = new Button(t('pause.abandon'), W - 20, 26, {
      fill: C.night3,
      edge: C.blow1,
      onTap: () => {
        if (!armed) {
          armed = true;
          quit.setText(t('pause.confirm'));
          return;
        }
        closePause();
        game.act({ t: 'end' });
        game.sync();
      },
    });
    quit.position.set(10, y);
    box.addChild(quit);
    y += 34;
  }
  const back = new Button(t(inRun ? 'pause.resume' : 'btn.close'), W - 20, 30, {
    fill: C.glass1,
    edge: C.go1,
    size: 16,
    onTap: closePause,
  });
  back.position.set(10, y);
  box.addChild(back);
  y += 40;

  box.addChildAt(panel(W, y, C.night1, C.amber2), 0);
  box.position.set(core.x + Math.floor((258 - W) / 2), core.y + Math.max(0, Math.floor((core.h - y) / 2)));
  game.overlay.addChild(root);
}
