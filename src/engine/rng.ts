// Deterministic RNG streams. FROZEN CONTRACT (M1).
// sfc32 (128-bit state) seeded per purpose so one subsystem's choices never shift another's.
// Only Math.imul, >>>, ^, |, + and % on safe integers — identical results in JSC and V8.
import type { Seed } from './types';

export const Tag = {
  ROUTE: 1,
  DECK: 2,
  SPARK: 3,
  BOSS: 4,
  SEAT: 5,
  KIOSK: 6,
  WORKSHOP: 7,
  REWARD: 8,
  COUPON: 9,
  DAILY: 10,
} as const;
export type Tag = (typeof Tag)[keyof typeof Tag];

const U32 = 0x100000000;

/** Murmur3 finalizer. */
export function fmix32(h: number): number {
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

export class Rng {
  private a: number;
  private b: number;
  private c: number;
  private d: number;

  constructor(a: number, b: number, c: number, d: number) {
    this.a = a | 0;
    this.b = b | 0;
    this.c = c | 0;
    this.d = d | 0;
  }

  /** Next unsigned 32-bit value. */
  u32(): number {
    const t0 = (this.a + this.b) | 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) | 0;
    this.c = (this.c << 21) | (this.c >>> 11);
    this.d = (this.d + 1) | 0;
    const t = (t0 + this.d) | 0;
    this.c = (this.c + t) | 0;
    return t >>> 0;
  }

  /** Uniform integer in [0, n), rejection sampling (no modulo bias). 1 <= n <= 2^32. */
  int(n: number): number {
    if (!(n >= 1 && n <= U32) || n !== Math.floor(n)) throw new RangeError(`Rng.int(${n})`);
    const limit = U32 - (U32 % n);
    let x = this.u32();
    while (x >= limit) x = this.u32();
    return x % n;
  }

  /** Uniform integer in [lo, hi] inclusive. */
  range(lo: number, hi: number): number {
    return lo + this.int(hi - lo + 1);
  }

  /** True with probability num/den. */
  chance(num: number, den: number): boolean {
    return this.int(den) < num;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new RangeError('Rng.pick on empty array');
    return items[this.int(items.length)] as T;
  }

  /** Index chosen with integer weights (all >= 0, sum >= 1). */
  weighted(weights: readonly number[]): number {
    let sum = 0;
    for (const w of weights) sum += w;
    let r = this.int(sum);
    for (let i = 0; i < weights.length; i++) {
      r -= weights[i] as number;
      if (r < 0) return i;
    }
    return weights.length - 1;
  }

  /** Fisher–Yates on a copy. */
  shuffled<T>(items: readonly T[]): T[] {
    const out = items.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      const tmp = out[i] as T;
      out[i] = out[j] as T;
      out[j] = tmp;
    }
    return out;
  }
}

/** Independent stream for (tag, a, b). E.g. stream(seed, Tag.SPARK, stopNo, handNo). */
export function stream(seed: Seed, tag: Tag, a = 0, b = 0): Rng {
  const k = fmix32(
    Math.imul(tag + 1, 0x9e3779b1) ^
      fmix32(Math.imul(a + 0x632be5ab, 0x85ebca6b) ^ Math.imul(b + 0x1b873593, 0xcc9e2d51)),
  );
  const s0 = fmix32(seed[0] ^ fmix32((k + Math.imul(1, 0x6a09e667)) | 0));
  const s1 = fmix32(seed[1] ^ fmix32((k + Math.imul(2, 0x6a09e667)) | 0));
  const s2 = fmix32(seed[2] ^ fmix32((k + Math.imul(3, 0x6a09e667)) | 0));
  const s3 = fmix32(seed[3] ^ fmix32((k + Math.imul(4, 0x6a09e667)) | 0));
  const rng = new Rng(s0, s1, s2, s3);
  for (let i = 0; i < 15; i++) rng.u32();
  return rng;
}

/** Order key for a card in a shuffled draw pile: sort by (key, uid). Adding/removing cards never moves others. */
export function deckKey(streamSalt: number, uid: number): number {
  return fmix32(streamSalt ^ Math.imul(uid + 1, 0x9e3779b1));
}

export function seedFromHex(hex: string): Seed {
  if (!/^[0-9a-f]{32}$/i.test(hex)) throw new RangeError('seed must be 32 hex chars');
  const w = (i: number): number => Number.parseInt(hex.slice(i * 8, i * 8 + 8), 16) >>> 0;
  return [w(0), w(1), w(2), w(3)];
}

export function seedToHex(seed: Seed): string {
  return seed.map((x) => (x >>> 0).toString(16).padStart(8, '0')).join('');
}
