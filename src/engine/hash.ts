// Stable 32-bit hashing (FNV-1a over UTF-16 code units) for state fingerprints and content versioning.
import type { RunState } from './types';

export function fnv1a(str: string, h = 0x811c9dc5): number {
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

const bigintSafe = (_key: string, value: unknown): unknown =>
  typeof value === 'bigint' ? `${value.toString()}n` : value;

/** Canonical JSON (insertion order is deterministic because the engine builds objects identically). */
export function canonical(value: unknown): string {
  return JSON.stringify(value, bigintSafe);
}

/** Fingerprint of the whole run state; used by golden tests and the JSC/V8 comparison. */
export function hashState(s: RunState): number {
  return fnv1a(canonical(s));
}
