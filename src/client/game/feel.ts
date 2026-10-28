// Sound (procedural ZzFX presets) and haptics. Both respect user settings.
import { ZZFX } from 'zzfx';
import { tg } from '../platform/tg';

// ZzFX params: volume, randomness, frequency, attack, sustain, release, shape, shapeCurve, slide, deltaSlide,
// pitchJump, pitchJumpTime, repeatTime, noise, modulation, bitCrush, delay, sustainVolume, decay, tremolo
const PRESETS = {
  tap: [0.35, 0, 900, 0, 0, 0.02, 1],
  select: [0.5, 0.03, 640, 0, 0.01, 0.05, 1, 1.5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.6, 0.01],
  deselect: [0.4, 0.03, 430, 0, 0.01, 0.05, 1, 1.5],
  deal: [0.35, 0.1, 160, 0, 0, 0.05, 4, 0, 0, 0, 0, 0, 0, 4],
  play: [0.55, 0.05, 320, 0.01, 0.02, 0.12, 0, 1, -5],
  current: [0.55, 0, 760, 0, 0.01, 0.06, 1, 2.2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.5, 0.02],
  voltage: [0.5, 0, 1180, 0, 0.02, 0.08, 2, 1.4, 0, 0, 0, 0, 0, 0, 9],
  multiply: [0.8, 0, 130, 0.01, 0.05, 0.2, 3, 2, -2, 0, 0, 0, 0, 1.2, 0, 0.1],
  slam: [1, 0, 62, 0, 0.06, 0.32, 0, 1, 0, 0, 0, 0, 0, 0.5, 0, 0.15],
  sparks: [0.25, 0.4, 2400, 0, 0.02, 0.06, 4, 0, 0, 0, 0, 0, 0.02, 3],
  overdrive: [0.8, 0, 90, 0.02, 0.2, 0.3, 2, 1, 4, 0, 0, 0, 0, 0.4, 12],
  blowout: [1.1, 0.2, 180, 0, 0.1, 0.5, 4, 0, -10, 0, 0, 0, 0, 2, 0, 0.4],
  coin: [0.5, 0, 1350, 0, 0.03, 0.1, 1, 1.5, 0, 0, 320, 0.05],
  error: [0.5, 0, 140, 0, 0.05, 0.12, 3, 1],
  win: [0.8, 0, 520, 0, 0.15, 0.4, 1, 1, 0, 0, 260, 0.12, 0.1],
  lose: [0.8, 0, 220, 0, 0.2, 0.6, 2, 1, -1],
  bell: [0.7, 0, 660, 0, 0.12, 0.6, 1, 1, 0, 0, 0, 0, 0.16],
  levelUp: [0.6, 0, 700, 0, 0.08, 0.2, 1, 1, 0, 0, 350, 0.06],
  shift: [0.4, 0.2, 90, 0, 0.08, 0.06, 4, 0, 0, 0, 0, 0, 0.03, 2],
} as const;
export type Sfx = keyof typeof PRESETS;

const samples = new Map<Sfx, number[]>();
let lastPlay = new Map<Sfx, number>();
export const settings = { sound: true, haptics: true };

try {
  const raw = localStorage.getItem('lt.settings');
  if (raw) Object.assign(settings, JSON.parse(raw));
} catch {}

export function saveSettings(): void {
  try {
    localStorage.setItem('lt.settings', JSON.stringify(settings));
  } catch {}
}

export function unlockAudio(): void {
  const once = (): void => {
    void ZZFX.audioContext.resume();
  };
  window.addEventListener('pointerup', once);
  window.addEventListener('touchend', once);
}

export function setAudioActive(active: boolean): void {
  if (active) void ZZFX.audioContext.resume();
  else void ZZFX.audioContext.suspend();
}

/** Plays a preset; step raises the pitch by semitones (scoring cascades climb). */
export function sfx(name: Sfx, step = 0, vol = 1): void {
  if (!settings.sound || ZZFX.audioContext.state !== 'running') return;
  const now = performance.now();
  if (now - (lastPlay.get(name) ?? 0) < 40) return;
  lastPlay.set(name, now);
  let s = samples.get(name);
  if (!s) {
    s = ZZFX.buildSamples(...(PRESETS[name] as unknown as number[]));
    samples.set(name, s);
  }
  const rate = 2 ** (Math.min(step, 14) / 12) * (0.98 + Math.random() * 0.04);
  ZZFX.playSamples([s], vol, rate);
}

let lastHaptic = 0;
type Impact = 'light' | 'medium' | 'heavy' | 'rigid' | 'soft';
export const haptic = {
  impact(kind: Impact = 'light'): void {
    const now = performance.now();
    if (!settings.haptics || now - lastHaptic < 35) return;
    lastHaptic = now;
    try {
      tg?.HapticFeedback.impactOccurred(kind);
    } catch {}
  },
  notify(kind: 'success' | 'warning' | 'error'): void {
    if (!settings.haptics) return;
    try {
      tg?.HapticFeedback.notificationOccurred(kind);
    } catch {}
  },
  select(): void {
    if (!settings.haptics) return;
    try {
      tg?.HapticFeedback.selectionChanged();
    } catch {}
  },
};

export function resetSfxClock(): void {
  lastPlay = new Map();
}
