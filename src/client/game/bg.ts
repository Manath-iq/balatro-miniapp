// Background: our own GLSL "rain on a night tram window" — domain-warped swirl, falling streaks,
// palette bands with Bayer dither. Runs on its own small WebGL2 canvas behind the Pixi canvas.
import { Filter, GlProgram, Sprite, Texture } from 'pixi.js';
import { C, rgb } from '../gfx/palette';
import { perfClass } from '../platform/tg';
import { music } from './music';

const VERT = `in vec2 aPosition;
out vec2 vTextureCoord;
uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;
void main(){
  vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
  position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
  position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
  gl_Position = vec4(position, 0.0, 1.0);
  vTextureCoord = aPosition * (uOutputFrame.zw * uInputSize.zw);
}`;

const FRAG = `precision mediump float;
in vec2 vTextureCoord;
uniform sampler2D uTexture;
uniform vec2 uRes; uniform float uTime; uniform float uEnergy; uniform float uFlash;
uniform vec3 uP0; uniform vec3 uP1; uniform vec3 uP2; uniform vec3 uP3; uniform vec3 uP4; uniform vec3 uP5;
uniform vec3 uFlashCol;
out vec4 finalColor;
float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++){ v += a*n(p); p = p*2.03 + 7.1; a *= 0.5; } return v; }
float b2(vec2 a){ a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
float bayer(vec2 c){ return b2(0.5 * c) * 0.25 + b2(c); }
void main(){
  vec2 px = floor(vTextureCoord * uRes / 2.0) * 2.0;      // 2-art-px blocks
  vec2 uv = (px - 0.5*uRes) / uRes.y;
  float t = uTime * (0.05 + 0.08*uEnergy);
  float r = length(uv);
  float a = atan(uv.y, uv.x) + (0.9 + 1.4*uEnergy) * exp(-r*1.6) * sin(t*0.7) + t*0.25;
  vec2 q = vec2(cos(a), sin(a)) * r * 2.2;
  vec2 w = q + vec2(fbm(q + t), fbm(q - t + 5.2)) * (1.2 + uEnergy);
  float v = fbm(w + vec2(t*1.3, -t*0.4));
  // rain streaks
  float col = floor(px.x / 2.0);
  float speed = 0.6 + h(vec2(col, 1.0)) * 1.2;
  float y = fract(px.y / uRes.y * 0.6 + uTime * speed * 0.15 + h(vec2(col, 3.0)));
  float streak = step(0.985 - 0.01*uEnergy, h(vec2(col, floor(y * 9.0)))) * smoothstep(0.0, 0.25, fract(y*9.0));
  v += streak * 0.35;
  v = clamp(v * (0.85 + 0.3*uEnergy) - 0.08 + (bayer(px / 2.0) - 0.5) * 0.12, 0.0, 0.999);
  int b = int(floor(v * 6.0));
  vec3 c = b == 0 ? uP0 : b == 1 ? uP1 : b == 2 ? uP2 : b == 3 ? uP3 : b == 4 ? uP4 : uP5;
  float vig = smoothstep(1.15, 0.35, length((px - 0.5*uRes) / uRes));
  c *= mix(0.6, 1.0, vig);
  c = mix(c, uFlashCol, uFlash * 0.45);
  finalColor = vec4(c, 1.0);
}`;

export type Mood = 'menu' | 'line1' | 'line2' | 'line3' | 'boss' | 'kiosk' | 'over';

const MOODS: Record<Mood, number[]> = {
  menu: [C.night1, C.night3, C.night4, C.volt0, C.glass1, C.volt1],
  line1: [C.night1, C.night3, C.glass0, C.glass1, C.night5, C.glass2],
  line2: [C.night1, C.night3, C.volt0, C.night4, C.volt1, C.glass1],
  line3: [C.night1, C.night3, C.amber0, C.night4, C.glass1, C.amber1],
  boss: [C.night0, C.night2, C.blow0, C.volt0, C.night4, C.blow1],
  kiosk: [C.night1, C.night3, C.glass1, C.amber0, C.night4, C.glass2],
  over: [C.night0, C.night1, C.night2, C.night3, C.night4, C.night5],
};

export class Background {
  /** Full-screen sprite rendered by the shader filter; add it at the bottom of the stage. */
  readonly view = new Sprite(Texture.WHITE);
  private filter: Filter | null = null;
  private pal = MOODS.menu.flatMap(rgb);
  private target = this.pal.slice();
  energy = 0;
  private flash = 0;
  private flashCol = [1, 1, 1];
  private time = 0;
  private running = true;

  constructor() {
    try {
      this.filter = new Filter({
        glProgram: new GlProgram({ vertex: VERT, fragment: FRAG, name: 'tram-rain' }),
        resources: {
          u: {
            uRes: { value: new Float32Array([270, 480]), type: 'vec2<f32>' },
            uTime: { value: 0, type: 'f32' },
            uEnergy: { value: 0, type: 'f32' },
            uFlash: { value: 0, type: 'f32' },
            uP0: { value: new Float32Array(3), type: 'vec3<f32>' },
            uP1: { value: new Float32Array(3), type: 'vec3<f32>' },
            uP2: { value: new Float32Array(3), type: 'vec3<f32>' },
            uP3: { value: new Float32Array(3), type: 'vec3<f32>' },
            uP4: { value: new Float32Array(3), type: 'vec3<f32>' },
            uP5: { value: new Float32Array(3), type: 'vec3<f32>' },
            uFlashCol: { value: new Float32Array([1, 1, 1]), type: 'vec3<f32>' },
          },
        },
      });
      this.view.filters = [this.filter];
      const pc = perfClass();
      this.filter.resolution = pc === 'LOW' ? 0.34 : pc === 'AVERAGE' ? 0.5 : 1;
    } catch {
      this.view.tint = C.night2;
    }
  }

  resize(w: number, h: number): void {
    this.view.width = w;
    this.view.height = h;
    if (this.filter) (this.filter.resources.u.uniforms.uRes as Float32Array).set([w, h]);
  }

  setMood(m: Mood): void {
    music.mood(m);
    this.target = MOODS[m].flatMap(rgb);
  }

  pulse(color: number, amount = 1): void {
    this.flash = Math.min(1, this.flash + amount);
    this.flashCol = rgb(color);
  }

  /** Called when the frame rate stays low: renders the shader at a lower resolution. */
  degrade(): boolean {
    const res = typeof this.filter?.resolution === 'number' ? this.filter.resolution : 1;
    if (!this.filter || res <= 0.26) return false;
    this.filter.resolution = Math.max(0.25, res / 2);
    return true;
  }

  setRunning(on: boolean): void {
    this.running = on;
  }

  tick(_now: number, dt: number): void {
    for (let i = 0; i < this.pal.length; i++)
      this.pal[i]! += (this.target[i]! - this.pal[i]!) * Math.min(1, dt * 2);
    this.flash *= Math.exp(-dt * 4);
    if (!this.filter || !this.running) return;
    this.time = (this.time + dt) % 600;
    const u = this.filter.resources.u.uniforms as Record<string, number | Float32Array>;
    u.uTime = this.time;
    u.uEnergy = this.energy;
    u.uFlash = this.flash;
    for (let i = 0; i < 6; i++) (u[`uP${i}`] as Float32Array).set(this.pal.slice(i * 3, i * 3 + 3));
    (u.uFlashCol as Float32Array).set(this.flashCol);
  }
}
