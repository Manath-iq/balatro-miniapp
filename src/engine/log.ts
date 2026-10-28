// Compact binary action log (docs/engine-contract.md §10) + base64url transport.
import { CONTENT_HASH } from './content/registry';
import type { Action, HandType } from './types';
import { IllegalAction } from './types';

export const ENGINE_VERSION = 1;
const FORMAT = 1;
const HEADER = 9;
export const MAX_ACTIONS = 4000;

class Writer {
  bytes: number[] = [];
  u8(v: number): void {
    this.bytes.push(v & 0xff);
  }
  varint(v: number): void {
    if (!Number.isInteger(v) || v < 0) throw new IllegalAction('bad_varint');
    let x = v;
    while (x >= 0x80) {
      this.u8((x % 0x80) | 0x80);
      x = Math.floor(x / 0x80);
    }
    this.u8(x);
  }
  nibbles(idx: readonly number[]): void {
    for (let i = 0; i < idx.length; i += 2) {
      const lo = idx[i]!;
      const hi = idx[i + 1] ?? 0;
      if (lo > 15 || hi > 15 || lo < 0 || hi < 0) throw new IllegalAction('bad_slot');
      this.u8(lo | (hi << 4));
    }
  }
}

class Reader {
  pos: number;
  private readonly b: Uint8Array;
  constructor(b: Uint8Array, start: number) {
    this.b = b;
    this.pos = start;
  }
  get done(): boolean {
    return this.pos >= this.b.length;
  }
  u8(): number {
    if (this.pos >= this.b.length) throw new IllegalAction('truncated');
    return this.b[this.pos++]!;
  }
  varint(): number {
    let v = 0;
    let mul = 1;
    for (let i = 0; i < 8; i++) {
      const byte = this.u8();
      v += (byte & 0x7f) * mul;
      if (byte < 0x80) return v;
      mul *= 0x80;
    }
    throw new IllegalAction('bad_varint');
  }
  nibbles(count: number): number[] {
    const out: number[] = [];
    for (let i = 0; i < count; i += 2) {
      const byte = this.u8();
      out.push(byte & 0x0f);
      if (i + 1 < count) out.push(byte >> 4);
    }
    return out;
  }
}

export function encodeLog(actions: readonly Action[]): Uint8Array {
  if (actions.length > MAX_ACTIONS) throw new IllegalAction('too_many_actions');
  const w = new Writer();
  w.u8(0x4c);
  w.u8(0x54);
  w.u8(FORMAT);
  w.u8(ENGINE_VERSION & 0xff);
  w.u8((ENGINE_VERSION >>> 8) & 0xff);
  for (let i = 0; i < 4; i++) w.u8((CONTENT_HASH >>> (8 * i)) & 0xff);
  for (const a of actions) {
    switch (a.t) {
      case 'play':
        if (a.idx.length < 1 || a.idx.length > 5) throw new IllegalAction('slot_count');
        w.u8(0x10 | (a.od ? 8 : 0) | a.idx.length);
        w.nibbles(a.idx);
        break;
      case 'discard':
        if (a.idx.length < 1 || a.idx.length > 5) throw new IllegalAction('slot_count');
        w.u8(0x20 | a.idx.length);
        w.nibbles(a.idx);
        break;
      case 'route':
        w.u8(0x30 | (a.choice & 0x0f));
        break;
      case 'coupon':
        w.u8(0x40 | (a.slot & 0x0f));
        if (a.hand !== undefined) {
          w.u8(2);
          w.u8(a.hand);
        } else if (a.uids && a.uids.length > 0) {
          w.u8(1);
          w.varint(a.uids.length);
          for (const uid of a.uids) w.varint(uid);
        } else w.u8(0);
        break;
      case 'buy':
        w.u8(0x50 | (a.slot & 0x0f));
        break;
      case 'shift':
        w.u8(0x60);
        break;
      case 'sell':
        w.u8(0x70 | (a.seat & 0x0f));
        break;
      case 'swap':
        w.u8(0x80);
        w.u8((a.a << 4) | (a.b & 0x0f));
        break;
      case 'workshop':
        w.u8(0x90 | a.pick);
        w.varint(a.uid);
        break;
      case 'scrap':
        w.u8(0xa0);
        w.varint(a.uid);
        break;
      case 'piggy':
        w.u8(0xb0);
        w.varint(a.deposit);
        break;
      case 'piggyBreak':
        w.u8(0xb1);
        break;
      case 'reward':
        w.u8(0xc0 | (a.pick & 0x0f));
        break;
      case 'leave':
        w.u8(0xd0);
        break;
      case 'ring':
        w.u8(0xd1);
        break;
      case 'end':
        w.u8(0xd2);
        break;
    }
  }
  return Uint8Array.from(w.bytes);
}

export function decodeLog(bytes: Uint8Array): { engine: number; contentHash: number; actions: Action[] } {
  if (bytes.length < HEADER || bytes[0] !== 0x4c || bytes[1] !== 0x54) throw new IllegalAction('bad_header');
  if (bytes[2] !== FORMAT) throw new IllegalAction('bad_format');
  const engine = bytes[3]! | (bytes[4]! << 8);
  const contentHash = (bytes[5]! | (bytes[6]! << 8) | (bytes[7]! << 16) | (bytes[8]! << 24)) >>> 0;
  const r = new Reader(bytes, HEADER);
  const actions: Action[] = [];
  while (!r.done) {
    if (actions.length >= MAX_ACTIONS) throw new IllegalAction('too_many_actions');
    const op = r.u8();
    const hi = op & 0xf0;
    const lo = op & 0x0f;
    switch (hi) {
      case 0x10: {
        const count = lo & 7;
        if (count < 1 || count > 5) throw new IllegalAction('bad_opcode');
        actions.push({ t: 'play', od: (lo & 8) !== 0, idx: r.nibbles(count) });
        break;
      }
      case 0x20:
        if (lo < 1 || lo > 5) throw new IllegalAction('bad_opcode');
        actions.push({ t: 'discard', idx: r.nibbles(lo) });
        break;
      case 0x30:
        actions.push({ t: 'route', choice: lo });
        break;
      case 0x40: {
        const tag = r.u8();
        if (tag === 0) actions.push({ t: 'coupon', slot: lo });
        else if (tag === 1) {
          const n = r.varint();
          if (n > 16) throw new IllegalAction('bad_targets');
          const uids: number[] = [];
          for (let i = 0; i < n; i++) uids.push(r.varint());
          actions.push({ t: 'coupon', slot: lo, uids });
        } else if (tag === 2) actions.push({ t: 'coupon', slot: lo, hand: r.u8() as HandType });
        else throw new IllegalAction('bad_opcode');
        break;
      }
      case 0x50:
        actions.push({ t: 'buy', slot: lo });
        break;
      case 0x60:
        if (lo) throw new IllegalAction('bad_opcode');
        actions.push({ t: 'shift' });
        break;
      case 0x70:
        actions.push({ t: 'sell', seat: lo });
        break;
      case 0x80: {
        if (lo) throw new IllegalAction('bad_opcode');
        const b = r.u8();
        actions.push({ t: 'swap', a: b >> 4, b: b & 0x0f });
        break;
      }
      case 0x90:
        if (lo > 1) throw new IllegalAction('bad_opcode');
        actions.push({ t: 'workshop', pick: lo as 0 | 1, uid: r.varint() });
        break;
      case 0xa0:
        if (lo) throw new IllegalAction('bad_opcode');
        actions.push({ t: 'scrap', uid: r.varint() });
        break;
      case 0xb0:
        if (lo === 0) actions.push({ t: 'piggy', deposit: r.varint() });
        else if (lo === 1) actions.push({ t: 'piggyBreak' });
        else throw new IllegalAction('bad_opcode');
        break;
      case 0xc0:
        actions.push({ t: 'reward', pick: lo });
        break;
      case 0xd0:
        if (lo === 0) actions.push({ t: 'leave' });
        else if (lo === 1) actions.push({ t: 'ring' });
        else if (lo === 2) actions.push({ t: 'end' });
        else throw new IllegalAction('bad_opcode');
        break;
      default:
        throw new IllegalAction('bad_opcode');
    }
  }
  return { engine, contentHash, actions };
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

export function toBase64Url(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i]!;
    const b = bytes[i + 1];
    const c = bytes[i + 2];
    out += B64[a >> 2];
    out += B64[((a & 3) << 4) | ((b ?? 0) >> 4)];
    if (b !== undefined) out += B64[((b & 15) << 2) | ((c ?? 0) >> 6)];
    if (c !== undefined) out += B64[c & 63];
  }
  return out;
}

export function fromBase64Url(str: string): Uint8Array {
  const vals: number[] = [];
  for (const ch of str) {
    const v = B64.indexOf(ch);
    if (v < 0) throw new IllegalAction('bad_base64');
    vals.push(v);
  }
  if (vals.length % 4 === 1) throw new IllegalAction('bad_base64');
  const out: number[] = [];
  for (let i = 0; i < vals.length; i += 4) {
    const a = vals[i]!;
    const b = vals[i + 1]!;
    const c = vals[i + 2];
    const d = vals[i + 3];
    out.push((a << 2) | (b >> 4));
    if (c !== undefined) out.push(((b & 15) << 4) | (c >> 2));
    if (d !== undefined) out.push(((c! & 3) << 6) | d);
  }
  return Uint8Array.from(out);
}
