// Game shell: Pixi application, background, scenes and the run (engine state + action log).
import { Application, Container } from 'pixi.js';
import {
  type Action,
  type GameEvent,
  legal,
  newRun,
  type RunConfig,
  type RunState,
  step,
} from '../../engine';
import { C, CSS } from '../gfx/palette';
import { setLang } from '../i18n';
import {
  lang,
  onActiveChange,
  onInsetsChanged,
  ready,
  setClosingConfirmation,
  setupTelegram,
} from '../platform/tg';
import { Background } from './bg';
import { setAudioActive, unlockAudio } from './feel';
import { Particles, Pops, Shake } from './fx';
import { clearRun, loadRun, recordBest, saveRun } from './save';
import { fitCanvas, measure, type Screen } from './screen';

export interface Scene {
  root: Container;
  update?(dt: number): void;
  destroy?(): void;
}

export type SceneFactory = (game: Game) => Scene;

export class Game {
  readonly pixi = new Application();
  readonly bg = new Background();
  readonly world = new Container();
  readonly fxLayer = new Container();
  readonly particles = new Particles();
  readonly pops = new Pops();
  readonly shake = new Shake();
  screen!: Screen;
  run: RunState | null = null;
  cfg: RunConfig | null = null;
  actions: Action[] = [];
  private scene: Scene | null = null;
  private factories: Record<string, SceneFactory> = {};
  private root: HTMLElement;

  constructor(root: HTMLElement) {
    this.root = root;
  }

  async start(factories: Record<string, SceneFactory>): Promise<void> {
    this.factories = factories;
    let saved: string | null = null;
    try {
      saved = localStorage.getItem('lt.lang');
    } catch {}
    setLang(saved === 'ru' || saved === 'en' ? saved : lang());
    setupTelegram(CSS.night1);
    await document.fonts.load('8px Tiny5').catch(() => undefined);
    this.screen = measure(this.root);
    await this.pixi.init({
      width: this.screen.w,
      height: this.screen.h,
      background: C.night0,
      antialias: false,
      resolution: 1,
      roundPixels: true,
      preference: 'webgl',
    });
    this.root.append(this.pixi.canvas);
    this.pixi.stage.addChild(this.bg.view);
    this.applySize();
    this.fxLayer.addChild(this.particles.layer, this.pops.layer);
    this.pixi.stage.addChild(this.world, this.fxLayer);
    this.pixi.ticker.add((tk) => this.tick(tk.deltaMS / 1000));
    window.addEventListener('resize', () => this.relayout());
    onInsetsChanged(() => this.relayout());
    onActiveChange((on) => {
      setAudioActive(on);
      this.bg.setRunning(on);
    });
    unlockAudio();
    this.show('menu');
    requestAnimationFrame(() => ready());
  }

  private applySize(): void {
    this.bg.resize(this.screen.w, this.screen.h);
    fitCanvas(this.pixi.canvas, this.screen);
  }

  private relayout(): void {
    const s = measure(this.root);
    if (
      s.w === this.screen.w &&
      s.h === this.screen.h &&
      s.top === this.screen.top &&
      s.bottom === this.screen.bottom
    )
      return;
    this.screen = s;
    this.pixi.renderer.resize(s.w, s.h);
    this.applySize();
    this.sync(true);
  }

  private tick(dt: number): void {
    const step = Math.min(dt, 0.05);
    this.bg.tick(performance.now(), step);
    this.scene?.update?.(step);
    this.particles.update(step);
    this.pops.update(step);
    const [x, y] = this.shake.offset(step);
    this.world.position.set(x, y);
  }

  show(name: string): void {
    this.scene?.destroy?.();
    this.world.removeChildren().forEach((c) => {
      c.destroy({ children: true });
    });
    const f = this.factories[name];
    if (!f) throw new Error(`no scene ${name}`);
    this.scene = f(this);
    this.world.addChild(this.scene.root);
  }

  /** Shows the scene matching the run phase. */
  sync(force = false): void {
    const s = this.run;
    const name = !s ? 'menu' : s.phase === 'depot' || s.phase === 'over' ? 'result' : s.phase;
    if (force || name !== this.current) {
      this.current = name;
      this.show(name);
    }
  }
  private current = 'menu';

  startRun(cfg: RunConfig, day?: string): void {
    this.cfg = cfg;
    this.actions = [];
    this.run = newRun(cfg).state;
    this.day = day;
    setClosingConfirmation(true);
    saveRun(cfg, this.actions, day);
    this.sync(true);
  }
  day: string | undefined;

  resume(): boolean {
    const saved = loadRun();
    if (!saved) return false;
    try {
      const { state } = newRun(saved.cfg);
      for (const a of saved.actions) step(state, a, { events: false });
      if (state.phase === 'over') return false;
      this.cfg = saved.cfg;
      this.actions = saved.actions;
      this.run = state;
      this.day = saved.day;
      setClosingConfirmation(true);
      this.sync(true);
      return true;
    } catch {
      clearRun();
      return false;
    }
  }

  /** Applies an action to the run, records it and returns the presentation events. */
  act(a: Action): GameEvent[] {
    if (!this.run || !this.cfg) return [];
    const ev = step(this.run, a);
    this.actions.push(a);
    if (this.run.phase === 'over') {
      recordBest(this.run.stats.stopsCleared, this.run.stats.peak);
      clearRun();
      setClosingConfirmation(false);
    } else saveRun(this.cfg, this.actions, this.day);
    return ev;
  }

  legal() {
    return this.run ? legal(this.run) : null;
  }

  quit(): void {
    this.run = null;
    this.cfg = null;
    clearRun();
    setClosingConfirmation(false);
    this.sync(true);
  }

  /** Common screen-space helpers. */
  get core(): { x: number; y: number; w: number; h: number } {
    const s = this.screen;
    return { x: s.x0, y: s.top + 6, w: 258, h: s.h - s.top - s.bottom - 12 };
  }
}

export const BG = C.night1;
