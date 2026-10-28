// Thin wrapper over the official telegram-web-app.js. Every call is version-gated and wrapped,
// so the game runs the same inside Telegram (any client version) and in a plain browser.
import type { WebApp } from 'telegram-web-app';

export type PerfClass = 'LOW' | 'AVERAGE' | 'HIGH' | 'UNKNOWN';
export type Lang = 'ru' | 'en';

export interface Insets {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

const w =
  typeof window === 'undefined' ? undefined : (window as { Telegram?: { WebApp?: WebApp } }).Telegram?.WebApp;

/** The WebApp object, or undefined outside Telegram (the script also defines it in a browser with platform "unknown"). */
export const tg: WebApp | undefined = w && w.platform !== 'unknown' ? w : undefined;

export const inTelegram = tg !== undefined;

export function can(version: string): boolean {
  try {
    return !!tg && tg.isVersionAtLeast(version);
  } catch {
    return false;
  }
}

function attempt(fn: () => void): boolean {
  try {
    fn();
    return true;
  } catch {
    return false;
  }
}

export function isMobile(): boolean {
  const p = tg?.platform ?? '';
  return p === 'ios' || p === 'android' || p === 'android_x';
}

/** Android Telegram appends "(…; LOW|AVERAGE|HIGH)" to the UA; iOS devices are treated as HIGH. */
export function perfClass(): PerfClass {
  const m = /;\s*(LOW|AVERAGE|HIGH)\)/.exec(navigator.userAgent);
  if (m) return m[1] as PerfClass;
  return tg?.platform === 'ios' ? 'HIGH' : 'UNKNOWN';
}

export function lang(): Lang {
  const code = tg?.initDataUnsafe?.user?.language_code ?? navigator.language ?? 'ru';
  return code.toLowerCase().startsWith('ru') ? 'ru' : code.toLowerCase().startsWith('en') ? 'en' : 'ru';
}

export function initDataRaw(): string {
  return tg?.initData ?? '';
}

/** Total insets the game must keep clear: device safe area + Telegram's own header/controls in fullscreen. */
export function insets(): Insets {
  const s = tg?.safeAreaInset;
  const c = tg?.contentSafeAreaInset;
  return {
    top: (s?.top ?? 0) + (c?.top ?? 0),
    bottom: (s?.bottom ?? 0) + (c?.bottom ?? 0),
    left: (s?.left ?? 0) + (c?.left ?? 0),
    right: (s?.right ?? 0) + (c?.right ?? 0),
  };
}

export interface TgSetupReport {
  fullscreen: 'on' | 'failed' | 'unsupported' | 'skipped';
  orientationLocked: boolean;
  swipesDisabled: boolean;
}

/** Call once at boot. `ready()` is separate so it can wait for the first rendered frame. */
export function setupTelegram(bg: string): TgSetupReport {
  const report: TgSetupReport = { fullscreen: 'skipped', orientationLocked: false, swipesDisabled: false };
  if (!tg) return report;

  attempt(() => tg.expand());
  if (can('6.1')) attempt(() => tg.setBackgroundColor(bg));
  if (can('6.9')) attempt(() => tg.setHeaderColor(bg));
  if (can('7.10')) attempt(() => tg.setBottomBarColor(bg));
  if (can('7.7')) report.swipesDisabled = attempt(() => tg.disableVerticalSwipes());

  if (isMobile()) {
    if (can('8.0')) {
      report.fullscreen = attempt(() => tg.requestFullscreen()) ? 'on' : 'failed';
      tg.onEvent('fullscreenFailed', () => {
        report.fullscreen = 'failed';
      });
      if (window.innerHeight > window.innerWidth)
        report.orientationLocked = attempt(() => tg.lockOrientation());
    } else {
      report.fullscreen = 'unsupported';
    }
  }
  return report;
}

export function ready(): void {
  attempt(() => tg?.ready());
}

export function onInsetsChanged(cb: () => void): void {
  if (!tg) return;
  tg.onEvent('safeAreaChanged', cb);
  tg.onEvent('contentSafeAreaChanged', cb);
  tg.onEvent('viewportChanged', cb);
  tg.onEvent('fullscreenChanged', cb);
}

/** Pause/resume hooks: Telegram's activated/deactivated (8.0+) with visibilitychange as the fallback. */
export function onActiveChange(cb: (active: boolean) => void): void {
  if (can('8.0') && tg) {
    tg.onEvent('activated', () => cb(true));
    tg.onEvent('deactivated', () => cb(false));
  }
  document.addEventListener('visibilitychange', () => cb(document.visibilityState === 'visible'));
}

export function setClosingConfirmation(on: boolean): void {
  if (!can('6.2') || !tg) return;
  attempt(() => (on ? tg.enableClosingConfirmation() : tg.disableClosingConfirmation()));
}
