import type { ErrorCode } from '../src/shared/api';
import { AuthError, initDataFromRequest, type TgUser, validateInitData } from './auth';

export const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

export const fail = (status: number, error: ErrorCode): Response => json({ error }, status);

export class HttpError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  constructor(status: number, code: ErrorCode) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

/** Validates initData, upserts the user and returns it. */
export async function authUser(req: Request, env: Env): Promise<TgUser> {
  if (!env.BOT_TOKEN) throw new HttpError(503, 'bot_token_missing');
  const raw = initDataFromRequest(req);
  if (!raw) throw new HttpError(401, 'no_init_data');
  const now = Math.floor(Date.now() / 1000);
  let user: TgUser;
  try {
    user = (await validateInitData(raw, env.BOT_TOKEN, now)).user;
  } catch (e) {
    if (e instanceof AuthError) throw new HttpError(401, e.message === 'expired' ? 'expired' : 'bad_hash');
    throw e;
  }
  await env.DB.prepare(
    `INSERT INTO users (tg_id, first_name, last_name, username, photo_url, lang, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)
     ON CONFLICT(tg_id) DO UPDATE SET first_name = excluded.first_name, last_name = excluded.last_name,
       username = excluded.username, photo_url = excluded.photo_url, lang = excluded.lang, updated_at = excluded.updated_at`,
  )
    .bind(
      user.id,
      user.first_name,
      user.last_name ?? null,
      user.username ?? null,
      user.photo_url ?? null,
      user.language_code ?? null,
      now,
    )
    .run();
  return user;
}

export async function readJson<T>(req: Request, max = 65536): Promise<T> {
  const buf = await req.arrayBuffer();
  if (buf.byteLength > max) throw new HttpError(413, 'too_large');
  try {
    return JSON.parse(new TextDecoder().decode(buf)) as T;
  } catch {
    throw new HttpError(400, 'bad_request');
  }
}
