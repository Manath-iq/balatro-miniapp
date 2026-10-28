// Telegram Mini App initData validation (bot-token HMAC scheme).
// https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app

export interface TgUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  photo_url?: string;
  is_premium?: true;
}

export class AuthError extends Error {}

const enc = new TextEncoder();

// secret_key = HMAC_SHA256(key = "WebAppData", msg = bot_token); cached per token for the isolate's lifetime.
let cachedToken = '';
let cachedKey: CryptoKey | null = null;

async function hmacKey(raw: BufferSource): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
}

async function secretKey(botToken: string): Promise<CryptoKey> {
  if (cachedKey && cachedToken === botToken) return cachedKey;
  const webAppKey = await hmacKey(enc.encode('WebAppData'));
  const secret = await crypto.subtle.sign('HMAC', webAppKey, enc.encode(botToken));
  cachedKey = await hmacKey(secret);
  cachedToken = botToken;
  return cachedKey;
}

function fromHex(hex: string): Uint8Array | null {
  if (!/^[0-9a-f]{64}$/i.test(hex)) return null;
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** Validates raw initData and returns the user. `signature` stays in the check string; only `hash` is removed. */
export async function validateInitData(
  raw: string,
  botToken: string,
  nowSec: number,
  maxAgeSec = 86400,
): Promise<{ user: TgUser; authDate: number; startParam: string | null }> {
  const params = new URLSearchParams(raw);
  const given = fromHex(params.get('hash') ?? '');
  if (!given) throw new AuthError('no_hash');

  const pairs: string[] = [];
  params.forEach((value, key) => {
    if (key !== 'hash') pairs.push(`${key}=${value}`);
  });
  pairs.sort();

  const calc = new Uint8Array(
    await crypto.subtle.sign('HMAC', await secretKey(botToken), enc.encode(pairs.join('\n'))),
  );
  if (calc.length !== given.length || !crypto.subtle.timingSafeEqual(calc, given))
    throw new AuthError('bad_hash');

  const authDate = Number(params.get('auth_date'));
  if (!Number.isFinite(authDate) || authDate <= 0 || nowSec - authDate > maxAgeSec)
    throw new AuthError('expired');

  const user = JSON.parse(params.get('user') ?? 'null') as TgUser | null;
  if (!user || typeof user.id !== 'number') throw new AuthError('no_user');
  return { user, authDate, startParam: params.get('start_param') };
}

/** Reads `Authorization: tma <initData>`. */
export function initDataFromRequest(req: Request): string | null {
  const header = req.headers.get('Authorization') ?? '';
  return header.startsWith('tma ') ? header.slice(4) : null;
}
