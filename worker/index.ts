import { AuthError, initDataFromRequest, validateInitData } from './auth';

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

const fail = (status: number, error: string): Response => json({ error }, status);

async function health(env: Env): Promise<Response> {
  let db = false;
  try {
    db = (await env.DB.prepare('SELECT 1 AS ok').first<{ ok: number }>())?.ok === 1;
  } catch {
    db = false;
  }
  return json({ ok: true, engine: Number(env.ENGINE_VERSION), db, botToken: Boolean(env.BOT_TOKEN) });
}

async function whoami(req: Request, env: Env): Promise<Response> {
  if (!env.BOT_TOKEN) return fail(503, 'bot_token_missing');
  const raw = initDataFromRequest(req);
  if (!raw) return fail(401, 'no_init_data');

  const now = Math.floor(Date.now() / 1000);
  let auth: Awaited<ReturnType<typeof validateInitData>>;
  try {
    auth = await validateInitData(raw, env.BOT_TOKEN, now);
  } catch (e) {
    if (e instanceof AuthError) return fail(401, e.message);
    throw e;
  }

  const u = auth.user;
  await env.DB.prepare(
    `INSERT INTO users (tg_id, first_name, last_name, username, photo_url, lang, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)
     ON CONFLICT(tg_id) DO UPDATE SET first_name = excluded.first_name, last_name = excluded.last_name,
       username = excluded.username, photo_url = excluded.photo_url, lang = excluded.lang, updated_at = excluded.updated_at`,
  )
    .bind(
      u.id,
      u.first_name,
      u.last_name ?? null,
      u.username ?? null,
      u.photo_url ?? null,
      u.language_code ?? null,
      now,
    )
    .run();

  return json({
    user: { id: u.id, first_name: u.first_name, username: u.username ?? null },
    authAgeSec: now - auth.authDate,
  });
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const route = `${req.method} ${url.pathname}`;
    switch (route) {
      case 'GET /api/health':
        return health(env);
      case 'GET /api/whoami':
        return whoami(req, env);
      default:
        return url.pathname.startsWith('/api/') ? fail(404, 'not_found') : env.ASSETS.fetch(req);
    }
  },
} satisfies ExportedHandler<Env>;
