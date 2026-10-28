import { ENGINE_VERSION } from '../src/engine';
import { AuthError, initDataFromRequest, validateInitData } from './auth';
import { leaderboard, me } from './board';
import { telegramWebhook } from './bot';
import { fail, HttpError, json } from './http';
import { startRun, submitRun } from './runs';

async function health(env: Env): Promise<Response> {
  let db = false;
  try {
    db = (await env.DB.prepare('SELECT 1 AS ok').first<{ ok: number }>())?.ok === 1;
  } catch {
    db = false;
  }
  return json({ ok: true, engine: ENGINE_VERSION, db, botToken: Boolean(env.BOT_TOKEN) });
}

async function whoami(req: Request, env: Env): Promise<Response> {
  if (!env.BOT_TOKEN) return fail(503, 'bot_token_missing');
  const raw = initDataFromRequest(req);
  if (!raw) return fail(401, 'no_init_data');
  try {
    const { user } = await validateInitData(raw, env.BOT_TOKEN, Math.floor(Date.now() / 1000));
    return json({ user: { id: user.id, first_name: user.first_name, username: user.username ?? null } });
  } catch (e) {
    if (e instanceof AuthError) return fail(401, 'bad_hash');
    throw e;
  }
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(req);
    try {
      switch (`${req.method} ${url.pathname}`) {
        case 'GET /api/health':
          return await health(env);
        case 'GET /api/whoami':
          return await whoami(req, env);
        case 'POST /api/run/start':
          return await startRun(req, env);
        case 'POST /api/run/submit':
          return await submitRun(req, env);
        case 'GET /api/leaderboard':
          return await leaderboard(req, env);
        case 'POST /api/tg/webhook':
          return await telegramWebhook(req, env);
        case 'GET /api/me':
          return await me(req, env);
        default:
          return fail(404, 'not_found');
      }
    } catch (e) {
      if (e instanceof HttpError) return fail(e.status, e.code);
      console.error(e);
      return fail(500, 'bad_request');
    }
  },
} satisfies ExportedHandler<Env>;
