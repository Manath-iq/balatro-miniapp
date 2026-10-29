// Procedural night-tram music: a minor chord loop (pad, bass, arpeggio, hats, kick) scheduled ahead on the
// shared ZzFX AudioContext. The scene mood picks tempo, layers and brightness.
import { ZZFX } from 'zzfx';
import type { Mood } from './bg';

const ctx = ZZFX.audioContext;
const midi = (n: number): number => 440 * 2 ** ((n - 69) / 12);

// Am9 → Fmaj7 → Dm9 → E7, two bars each.
const CHORDS = [
  [57, 60, 64, 67, 71],
  [53, 57, 60, 64, 69],
  [50, 53, 57, 60, 64],
  [52, 56, 59, 62, 64],
];
const ROOTS = [33, 29, 38, 40];
const ARP = [0, 2, 1, 3, 4, 3, 1, 2];

interface Style {
  bpm: number;
  arp: boolean;
  kick: boolean;
  hats: number;
  cutoff: number;
}
const STYLES: Record<Mood, Style> = {
  menu: { bpm: 80, arp: true, kick: false, hats: 0.5, cutoff: 1800 },
  line1: { bpm: 88, arp: true, kick: true, hats: 1, cutoff: 2400 },
  line2: { bpm: 92, arp: true, kick: true, hats: 1, cutoff: 2800 },
  line3: { bpm: 96, arp: true, kick: true, hats: 1, cutoff: 3200 },
  boss: { bpm: 100, arp: true, kick: true, hats: 1, cutoff: 4200 },
  kiosk: { bpm: 76, arp: false, kick: false, hats: 0.5, cutoff: 1400 },
  over: { bpm: 70, arp: false, kick: false, hats: 0, cutoff: 900 },
};

let master: GainNode | null = null;
let filter: BiquadFilterNode;
let echo: GainNode;
let noise: AudioBuffer;
let style = STYLES.menu;
let enabled = false;
let stepNo = 0;
let nextAt = 0;
let timer = 0;

function graph(): void {
  master = ctx.createGain();
  master.gain.value = 0;
  filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = style.cutoff;
  filter.Q.value = 0.7;
  master.connect(filter).connect(ctx.destination);
  // Feedback delay for the arpeggio.
  const delay = ctx.createDelay(1);
  delay.delayTime.value = 0.27;
  const fb = ctx.createGain();
  fb.gain.value = 0.32;
  echo = ctx.createGain();
  echo.gain.value = 0.5;
  echo.connect(delay).connect(fb).connect(delay);
  delay.connect(master);
  noise = ctx.createBuffer(1, ctx.sampleRate / 10, ctx.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
}

function tone(
  freq: number,
  at: number,
  dur: number,
  vol: number,
  type: OscillatorType,
  attack = 0.01,
  out: AudioNode = master!,
): void {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(vol, at + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g).connect(out);
  o.start(at);
  o.stop(at + dur + 0.05);
}

function hat(at: number, vol: number): void {
  const src = ctx.createBufferSource();
  src.buffer = noise;
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 7000;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, at);
  g.gain.exponentialRampToValueAtTime(0.0001, at + 0.05);
  src.connect(hp).connect(g).connect(master!);
  src.start(at);
  src.stop(at + 0.06);
}

function kick(at: number): void {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.frequency.setValueAtTime(130, at);
  o.frequency.exponentialRampToValueAtTime(42, at + 0.12);
  g.gain.setValueAtTime(0.32, at);
  g.gain.exponentialRampToValueAtTime(0.0001, at + 0.25);
  o.connect(g).connect(master!);
  o.start(at);
  o.stop(at + 0.3);
}

/** One eighth note: 8 per bar, a chord lasts 2 bars, the loop is 64 steps. */
function play(at: number, i: number, len: number): void {
  const chord = Math.floor(i / 16) % 4;
  const notes = CHORDS[chord]!;
  const beat = i % 8;
  if (i % 16 === 0) for (const n of notes.slice(0, 4)) tone(midi(n), at, len * 16, 0.035, 'triangle', 0.6);
  if (beat === 0 || beat === 3 || beat === 4 || (beat === 7 && i % 16 === 15))
    tone(midi(ROOTS[chord]! + (beat === 3 ? 12 : 0)), at, len * 1.6, 0.11, 'sawtooth', 0.01);
  if (style.arp && i % 64 >= 16) {
    const n = notes[ARP[i % 8]!]! + 12;
    tone(midi(n), at, len * 0.9, 0.022, 'square', 0.005, echo);
  }
  if (style.hats && (style.hats >= 1 || beat % 2 === 1)) hat(at, beat % 2 ? 0.05 : 0.025);
  if (style.kick && (beat === 0 || beat === 4)) kick(at);
}

function schedule(): void {
  if (!master || ctx.state !== 'running') return;
  const len = 60 / style.bpm / 2;
  if (nextAt < ctx.currentTime) nextAt = ctx.currentTime + 0.05;
  while (nextAt < ctx.currentTime + 0.25) {
    play(nextAt, stepNo, len);
    stepNo = (stepNo + 1) % 64;
    nextAt += len;
  }
}

export const music = {
  setEnabled(on: boolean): void {
    enabled = on;
    if (on && !master) graph();
    if (!master) return;
    const t = ctx.currentTime;
    master.gain.cancelScheduledValues(t);
    master.gain.setTargetAtTime(on ? 0.55 : 0, t, 0.4);
    if (on && !timer) timer = window.setInterval(schedule, 60);
    if (!on && timer) {
      window.clearInterval(timer);
      timer = 0;
    }
  },
  mood(m: Mood): void {
    style = STYLES[m];
    if (master && enabled) filter.frequency.setTargetAtTime(style.cutoff, ctx.currentTime, 0.8);
  },
};
