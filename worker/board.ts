// Leaderboards: top-N per board with a 30 s isolate cache, plus the caller's rank (capped read cost).
import type { BoardEntry, BoardId, LeaderboardRes, MeRes } from '../src/shared/api';
import { authUser, HttpError, json } from './http';
import { mskDay } from './sign';

interface Row {
  user_id: number;
  first_name: string;
  username: string | null;
  photo_url: string | null;
  show_name: number;
  value: string | number;
  extra: string | number;
}

const TOP = 50;
const RANK_CAP = 1000;

const SQL: Record<BoardId, { top: string; me: string; better: string }> = {
  daily: {
    top: `SELECT b.user_id, u.first_name, u.username, u.photo_url, u.show_name, b.points AS value, b.stops AS extra
          FROM best_daily b JOIN users u ON u.tg_id = b.user_id WHERE b.day = ?1
          ORDER BY b.stops DESC, b.points DESC, b.achieved_at LIMIT ${TOP}`,
    me: `SELECT b.user_id, u.first_name, u.username, u.photo_url, u.show_name, b.points AS value, b.stops AS extra,
           b.stops AS s1, b.points AS s2 FROM best_daily b JOIN users u ON u.tg_id = b.user_id WHERE b.day = ?1 AND b.user_id = ?2`,
    better: `SELECT COUNT(*) AS n FROM (SELECT 1 FROM best_daily WHERE day = ?1 AND (stops > ?2 OR (stops = ?2 AND points > ?3))
             LIMIT ${RANK_CAP})`,
  },
  peak: {
    top: `SELECT b.user_id, u.first_name, u.username, u.photo_url, u.show_name, b.power_text AS value, b.hand_type AS extra
          FROM best_peak b JOIN users u ON u.tg_id = b.user_id ORDER BY b.power_key DESC, b.achieved_at LIMIT ${TOP}`,
    me: `SELECT b.user_id, u.first_name, u.username, u.photo_url, u.show_name, b.power_text AS value, b.hand_type AS extra,
           b.power_key AS s1, 0 AS s2 FROM best_peak b JOIN users u ON u.tg_id = b.user_id WHERE b.user_id = ?1`,
    better: `SELECT COUNT(*) AS n FROM (SELECT 1 FROM best_peak WHERE power_key > ?1 LIMIT ${RANK_CAP})`,
  },
  ring: {
    top: `SELECT b.user_id, u.first_name, u.username, u.photo_url, u.show_name, b.ring_stop AS value, b.output_text AS extra
          FROM best_ring b JOIN users u ON u.tg_id = b.user_id ORDER BY b.ring_stop DESC, b.output_key DESC, b.achieved_at
          LIMIT ${TOP}`,
    me: `SELECT b.user_id, u.first_name, u.username, u.photo_url, u.show_name, b.ring_stop AS value, b.output_text AS extra,
           b.ring_stop AS s1, b.output_key AS s2 FROM best_ring b JOIN users u ON u.tg_id = b.user_id
           WHERE b.user_id = ?1`,
    better: `SELECT COUNT(*) AS n FROM (SELECT 1 FROM best_ring WHERE (ring_stop > ?1 OR (ring_stop = ?1 AND output_key > ?2))
             LIMIT ${RANK_CAP})`,
  },
};

const cache = new Map<string, { at: number; rows: Row[] }>();

function entry(r: Row, rank: number, me: number | null): BoardEntry {
  const hidden = r.show_name === 0;
  return {
    rank,
    userId: r.user_id,
    name: hidden ? `#${r.user_id % 10000}` : r.first_name,
    username: hidden ? null : r.username,
    photo: hidden ? null : r.photo_url,
    value: String(r.value),
    extra: String(r.extra),
    me: r.user_id === me,
  };
}

/** D1 requires the exact number of bindings: daily queries take the day first, the others do not. */
const withDay = (day: string | null, ...rest: unknown[]): unknown[] => (day === null ? rest : [day, ...rest]);

function meStmt(env: Env, board: BoardId, userId: number, day: string | null): D1PreparedStatement {
  return env.DB.prepare(SQL[board].me).bind(...withDay(board === 'daily' ? day : null, userId));
}

export async function myRank(env: Env, board: BoardId, userId: number, day: string | null): Promise<number | null> {
  const me = await meStmt(env, board, userId, day).first<Row & { s1: number; s2: number }>();
  if (!me) return null;
  const args = board === 'peak' ? [me.s1] : [me.s1, me.s2];
  const n = await env.DB.prepare(SQL[board].better)
    .bind(...withDay(board === 'daily' ? day : null, ...args))
    .first<{ n: number }>();
  const better = n?.n ?? 0;
  return better >= RANK_CAP ? 0 : better + 1;
}

export async function leaderboard(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const board = url.searchParams.get('board') as BoardId | null;
  if (board !== 'daily' && board !== 'peak' && board !== 'ring') throw new HttpError(400, 'bad_request');
  const day = board === 'daily' ? (url.searchParams.get('day') ?? mskDay(Date.now())) : null;
  if (day !== null && !/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new HttpError(400, 'bad_request');

  let userId: number | null = null;
  if (req.headers.get('Authorization')) userId = (await authUser(req, env)).id;

  const key = `${board}:${day}`;
  let hit = cache.get(key);
  if (!hit || Date.now() - hit.at > 30_000) {
    const top = env.DB.prepare(SQL[board].top);
    const rows = (await (day === null ? top : top.bind(day)).all<Row>()).results;
    hit = { at: Date.now(), rows };
    cache.set(key, hit);
  }
  const entries = hit.rows.map((r, i) => entry(r, i + 1, userId));
  let me: BoardEntry | null = entries.find((e) => e.me) ?? null;
  if (!me && userId !== null) {
    const row = await meStmt(env, board, userId, day).first<Row>();
    if (row) me = entry(row, (await myRank(env, board, userId, day)) ?? 0, userId);
  }
  const res: LeaderboardRes = { board, day, entries, me, updatedAt: hit.at };
  return json(res);
}

export async function me(req: Request, env: Env): Promise<Response> {
  const user = await authUser(req, env);
  const day = mskDay(Date.now());
  const u = await env.DB.prepare(`SELECT show_name FROM users WHERE tg_id = ?1`).bind(user.id).first<{ show_name: number }>();
  const daily = await env.DB.prepare(`SELECT status, stops, points FROM runs WHERE user_id = ?1 AND day = ?2 AND kind = 'daily'`)
    .bind(user.id, day)
    .first<{ status: string; stops: number | null; points: number | null }>();
  const peak = await env.DB.prepare(`SELECT power_text, hand_type FROM best_peak WHERE user_id = ?1`)
    .bind(user.id)
    .first<{ power_text: string; hand_type: number }>();
  const ring = await env.DB.prepare(`SELECT ring_stop FROM best_ring WHERE user_id = ?1`).bind(user.id).first<{ ring_stop: number }>();
  const res: MeRes = {
    user: { id: user.id, name: user.first_name, username: user.username ?? null, showName: (u?.show_name ?? 1) === 1 },
    daily: {
      day,
      played: daily?.status === 'verified',
      stops: daily?.stops ?? null,
      points: daily?.points ?? null,
    },
    best: { peak: peak?.power_text ?? null, peakHand: peak?.hand_type ?? null, ringStop: ring?.ring_stop ?? null },
  };
  return json(res);
}
