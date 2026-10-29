// Juice: springs, timing, screen shake, particles, popping numbers.
import { Container, Graphics } from 'pixi.js';
import { text } from './pixel';

export class Spring {
  v = 0;
  x: number;
  target: number;
  k: number;
  zeta: number;
  constructor(x: number, k = 260, zeta = 0.62) {
    this.x = x;
    this.target = x;
    this.k = k;
    this.zeta = zeta;
  }
  step(dt: number): number {
    const c = 2 * this.zeta * Math.sqrt(this.k);
    const n = 3;
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      this.v += (-this.k * (this.x - this.target) - c * this.v) * h;
      this.x += this.v * h;
    }
    return this.x;
  }
  kick(v: number): void {
    this.v += v;
  }
  snap(x: number): void {
    this.x = x;
    this.target = x;
    this.v = 0;
  }
}

/** Global time scale for scoring animations (1×/2×/4×, fast-forward while held). */
export const pace = { speed: 1, fast: false };

export function wait(ms: number): Promise<void> {
  const k = pace.fast ? 6 : pace.speed;
  return new Promise((r) => setTimeout(r, ms / k));
}

const reducedMotion = (() => {
  try {
    return matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
})();

export class Shake {
  trauma = 0;
  private t = 0;
  add(v: number): void {
    if (reducedMotion) return;
    this.trauma = Math.min(1, this.trauma + v);
  }
  offset(dt: number): [number, number] {
    this.t += dt;
    this.trauma = Math.max(0, this.trauma - dt * 1.4);
    const s = this.trauma * this.trauma * 6;
    return [Math.round(Math.sin(this.t * 61) * s), Math.round(Math.cos(this.t * 47) * s)];
  }
}

interface P {
  g: Graphics;
  vx: number;
  vy: number;
  life: number;
}

export class Particles {
  readonly layer = new Container();
  private list: P[] = [];
  cap = 200;
  burst(x: number, y: number, n: number, colors: number[], power = 60): void {
    for (let i = 0; i < n && this.list.length < this.cap; i++) {
      const g = new Graphics().rect(0, 0, 1 + (i % 2), 1 + (i % 2)).fill(colors[i % colors.length]!);
      g.position.set(x, y);
      const a = Math.random() * Math.PI * 2;
      const v = power * (0.4 + Math.random());
      this.list.push({
        g,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v - power * 0.6,
        life: 0.5 + Math.random() * 0.5,
      });
      this.layer.addChild(g);
    }
  }
  update(dt: number): void {
    this.list = this.list.filter((p) => {
      p.life -= dt;
      if (p.life <= 0) {
        p.g.destroy();
        return false;
      }
      p.vy += 160 * dt;
      p.g.x = Math.round(p.g.x + p.vx * dt);
      p.g.y = Math.round(p.g.y + p.vy * dt);
      p.g.alpha = Math.min(1, p.life * 3);
      return true;
    });
  }
}

/** Floating "+12" style popups. */
export class Pops {
  readonly layer = new Container();
  private list: { c: Container; vy: number; life: number; s: Spring }[] = [];
  pop(str: string, x: number, y: number, color: number, size: 8 | 16 | 24 = 16): void {
    const c = text(str, { size, color, align: 'center' });
    c.position.set(Math.round(x), Math.round(y));
    const s = new Spring(0.2, 420, 0.4);
    s.target = 1;
    this.layer.addChild(c);
    this.list.push({ c, vy: -24, life: 0.8, s });
  }
  update(dt: number): void {
    this.list = this.list.filter((p) => {
      p.life -= dt;
      if (p.life <= 0) {
        p.c.destroy({ children: true });
        return false;
      }
      p.c.scale.set(Math.max(0.1, p.s.step(dt)));
      p.c.y += p.vy * dt;
      p.vy *= 0.92;
      p.c.alpha = Math.min(1, p.life * 4);
      return true;
    });
  }
}
