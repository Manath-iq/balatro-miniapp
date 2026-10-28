// Run lifecycle on the server: issue seeds/tokens, then verify submitted logs by replaying them.
import { CONTENT_HASH, ENGINE_VERSION, fromBase64Url, IllegalAction, powerKey, replayState, seedFromHex, summarize } from '../src/engine';
import type { StartReq, StartRes, SubmitReq, SubmitRes } from '../src/shared/api';
import { myRank } from './board';
import { authUser, HttpError, json, readJson } from './http';
import { hmacBytes, hmacHex, mskDay, randomId, safeEqual, toHex } from './sign';

const TOKEN_MAX_AGE = 3 * 24 * 3600;

const seedHex = async (secret: string, label: string): Promise<string> =>
  toHex((await hmacBytes(secret, label)).slice(0, 16));

const tokenSig = (secret: string, runId: string, userId: number, kind: string, issued: number, driver: number) =>
  hmacHex(secret, `run|${runId}|${userId}|${kind}|${issued}|${driver}`);

export async function startRun(req: Request, env: Env): Promise<Response> {
  const user = await authUser(req, env);
  const body = await readJson<StartReq>(req, 1024);
  const kind = body.kind === 'daily' ? 'daily' : 'standard';
  const driver = body.driver === 2 ? 2 : 1;
  const now = Date.now();
  let runId: string;
  let issued = Math.floor(now / 1000);
  let seed: string;
  let day: string | null = null;

  if (kind === 'daily') {
    day = mskDay(now);
    seed = await seedHex(env.SEED_SECRET, `daily:${day}`);
    const row = await env.DB.prepare(
      `SELECT id, status, created_at FROM runs WHERE user_id = ?1 AND day = ?2 AND kind = 'daily'`,
    )
      .bind(user.id, day)
      .first<{ id: string; status: string; created_at: number }>();
    if (row) {
      if (row.status !== 'started') throw new HttpError(409, 'daily_taken');
      runId = row.id;
      issued = row.created_at;
    } else {
      runId = randomId();
      await env.DB.prepare(
        `INSERT INTO runs (id, user_id, kind, day, seed, engine_ver, content_hash, status, created_at)
         VALUES (?1, ?2, 'daily', ?3, ?4, ?5, ?6, 'started', ?7)`,
      )
        .bind(runId, user.id, day, seed, ENGINE_VERSION, CONTENT_HASH, issued)
        .run();
    }
  } else {
    runId = randomId();
    seed = await seedHex(env.SEED_SECRET, `run:${runId}`);
  }

  const sig = await tokenSig(env.SEED_SECRET, runId, user.id, kind, issued, driver);
  const res: StartRes = {
    runId,
    kind,
    seed,
    day,
    driver,
    condition: 0,
    engine: ENGINE_VERSION,
    contentHash: CONTENT_HASH,
    issuedAt: issued,
    token: `${kind}.${issued}.${driver}.${sig}`,
  };
  return json(res);
}

export async function submitRun(req: Request, env: Env): Promise<Response> {
  const user = await authUser(req, env);
  const body = await readJson<SubmitReq>(req);
  if (typeof body.runId !== 'string' || !/^[0-9a-f]{32}$/.test(body.runId) || typeof body.token !== 'string') {
    throw new HttpError(400, 'bad_request');
  }
  const [kindRaw, issuedRaw, driverRaw, sig] = body.token.split('.');
  const kind = kindRaw === 'daily' ? 'daily' : kindRaw === 'standard' ? 'standard' : null;
  const issued = Number(issuedRaw);
  const driver = Number(driverRaw);
  if (!kind || !sig || !Number.isInteger(issued) || (driver !== 1 && driver !== 2)) throw new HttpError(400, 'bad_token');
  const expect = await tokenSig(env.SEED_SECRET, body.runId, user.id, kind, issued, driver);
  if (!safeEqual(expect, sig)) throw new HttpError(403, 'bad_token');
  const now = Math.floor(Date.now() / 1000);
  if (now - issued > TOKEN_MAX_AGE) throw new HttpError(403, 'bad_token');

  let seed: string;
  let day: string | null = null;
  if (kind === 'daily') {
    const row = await env.DB.prepare(`SELECT seed, day, status, user_id FROM runs WHERE id = ?1`)
      .bind(body.runId)
      .first<{ seed: string; day: string; status: string; user_id: number }>();
    if (!row || row.user_id !== user.id) throw new HttpError(404, 'not_found');
    if (row.status !== 'started') throw new HttpError(409, 'already_submitted');
    seed = row.seed;
    day = row.day;
  } else {
    const exists = await env.DB.prepare(`SELECT 1 AS x FROM runs WHERE id = ?1`).bind(body.runId).first();
    if (exists) throw new HttpError(409, 'already_submitted');
    seed = await seedHex(env.SEED_SECRET, `run:${body.runId}`);
  }

  let log: Uint8Array;
  try {
    log = fromBase64Url(body.log ?? '');
  } catch {
    throw new HttpError(400, 'bad_request');
  }
  if (log.length > 48000) throw new HttpError(413, 'too_large');

  const cfg = { seed: seedFromHex(seed), kind, driver, grade: 1, condition: 0 } as const;
  let summary: ReturnType<typeof summarize>;
  try {
    const { state, actions } = replayState(cfg, log);
    if (state.phase !== 'over') throw new IllegalAction('not_finished');
    summary = summarize(state, actions);
  } catch (e) {
    if (e instanceof IllegalAction && e.reason === 'engine_outdated') throw new HttpError(409, 'engine_outdated');
    throw new HttpError(422, 'replay_failed');
  }

  const out = summary.output;
  const peak = summary.peak;
  const db = env.DB;
  const runCols = [summary.stopsCleared, summary.points, out.toString(), powerKey(out), peak.toString(), powerKey(peak), summary.peakHand, summary.ringStop, log, now] as const;
  const stmts: D1PreparedStatement[] = [];
  if (kind === 'daily') {
    stmts.push(
      db
        .prepare(
          `UPDATE runs SET status = 'verified', stops = ?2, points = ?3, output_text = ?4, output_key = ?5, peak_text = ?6,
           peak_key = ?7, peak_hand = ?8, ring_stop = ?9, log = ?10, submitted_at = ?11 WHERE id = ?1`,
        )
        .bind(body.runId, ...runCols),
      db
        .prepare(
          `INSERT INTO best_daily (day, user_id, stops, points, run_id, achieved_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
           ON CONFLICT(day, user_id) DO UPDATE SET stops = excluded.stops, points = excluded.points, run_id = excluded.run_id,
             achieved_at = excluded.achieved_at
           WHERE excluded.stops > best_daily.stops OR (excluded.stops = best_daily.stops AND excluded.points > best_daily.points)`,
        )
        .bind(day, user.id, summary.stopsCleared, summary.points, body.runId, now),
    );
  } else {
    stmts.push(
      db
        .prepare(
          `INSERT INTO runs (id, user_id, kind, day, seed, engine_ver, content_hash, status, stops, points, output_text, output_key,
             peak_text, peak_key, peak_hand, ring_stop, log, created_at, submitted_at)
           VALUES (?1, ?2, 'standard', NULL, ?3, ?4, ?5, 'verified', ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)`,
        )
        .bind(body.runId, user.id, seed, ENGINE_VERSION, CONTENT_HASH, ...runCols.slice(0, 9), issued, now),
    );
    if (summary.ringStop > 0) {
      stmts.push(
        db
          .prepare(
            `INSERT INTO best_ring (user_id, ring_stop, output_key, output_text, run_id, achieved_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
             ON CONFLICT(user_id) DO UPDATE SET ring_stop = excluded.ring_stop, output_key = excluded.output_key,
               output_text = excluded.output_text, run_id = excluded.run_id, achieved_at = excluded.achieved_at
             WHERE excluded.ring_stop > best_ring.ring_stop
               OR (excluded.ring_stop = best_ring.ring_stop AND excluded.output_key > best_ring.output_key)`,
          )
          .bind(user.id, summary.ringStop, powerKey(out), out.toString(), body.runId, now),
      );
    }
  }
  if (peak > 0n) {
    stmts.push(
      db
        .prepare(
          `INSERT INTO best_peak (user_id, power_key, power_text, hand_type, run_id, achieved_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
           ON CONFLICT(user_id) DO UPDATE SET power_key = excluded.power_key, power_text = excluded.power_text,
             hand_type = excluded.hand_type, run_id = excluded.run_id, achieved_at = excluded.achieved_at
           WHERE excluded.power_key > best_peak.power_key`,
        )
        .bind(user.id, powerKey(peak), peak.toString(), summary.peakHand, body.runId, now),
    );
  }
  await db.batch(stmts);

  const res: SubmitRes = {
    verified: true,
    mismatch: body.claimed?.output !== out.toString() || body.claimed?.peak !== peak.toString(),
    summary: {
      won: summary.won,
      stopsCleared: summary.stopsCleared,
      ringStop: summary.ringStop,
      output: out.toString(),
      peak: peak.toString(),
      peakHand: summary.peakHand,
      points: summary.points,
    },
    ranks: {
      daily: kind === 'daily' && day ? await myRank(env, 'daily', user.id, day) : null,
      peak: peak > 0n ? await myRank(env, 'peak', user.id, null) : null,
      ring: summary.ringStop > 0 ? await myRank(env, 'ring', user.id, null) : null,
    },
  };
  return json(res);
}
