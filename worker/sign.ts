// HMAC helpers (Web Crypto) for server-issued seeds and run tokens.
const enc = new TextEncoder();
const keys = new Map<string, CryptoKey>();

async function key(secret: string): Promise<CryptoKey> {
  let k = keys.get(secret);
  if (!k) {
    k = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
      'sign',
    ]);
    keys.set(secret, k);
  }
  return k;
}

export async function hmacBytes(secret: string, msg: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.sign('HMAC', await key(secret), enc.encode(msg)));
}

export const toHex = (b: Uint8Array): string =>
  Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');

export async function hmacHex(secret: string, msg: string): Promise<string> {
  return toHex(await hmacBytes(secret, msg));
}

export function safeEqual(a: string, b: string): boolean {
  const x = enc.encode(a);
  const y = enc.encode(b);
  return x.length === y.length && crypto.subtle.timingSafeEqual(x, y);
}

export function randomId(): string {
  return toHex(crypto.getRandomValues(new Uint8Array(16)));
}

/** Moscow calendar date for the daily route. */
export function mskDay(nowMs: number): string {
  return new Date(nowMs + 3 * 3600_000).toISOString().slice(0, 10);
}
