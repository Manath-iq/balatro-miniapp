// Client ⇄ Worker API contract. FROZEN CONTRACT (M1). BigInt values travel as decimal strings.
// Every request carries `Authorization: tma <initData>`.

export type ErrorCode =
  | 'no_init_data'
  | 'bad_hash'
  | 'expired'
  | 'no_user'
  | 'bot_token_missing'
  | 'rate_limited'
  | 'bad_request'
  | 'too_large'
  | 'not_found'
  | 'daily_taken'
  | 'already_submitted'
  | 'engine_outdated'
  | 'bad_token'
  | 'replay_failed';

export interface ApiError {
  error: ErrorCode;
}

/** POST /api/run/start */
export interface StartReq {
  kind: 'daily' | 'standard';
  driver?: number;
}
export interface StartRes {
  runId: string;
  kind: 'daily' | 'standard';
  /** 32 hex chars (Seed). */
  seed: string;
  /** Moscow date YYYY-MM-DD for daily runs. */
  day: string | null;
  driver: number;
  condition: number;
  engine: number;
  contentHash: number;
  issuedAt: number;
  /** Server signature over the run descriptor; echoed back on submit. */
  token: string;
}

/** POST /api/run/submit */
export interface SubmitReq {
  runId: string;
  token: string;
  /** encodeLog() as base64url. */
  log: string;
  /** What the client computed; only used to flag mismatches. */
  claimed: { output: string; peak: string; stops: number; ringStop: number };
}
export interface SubmitRes {
  verified: boolean;
  mismatch: boolean;
  summary: {
    won: boolean;
    stopsCleared: number;
    ringStop: number;
    output: string;
    peak: string;
    peakHand: number;
    points: number;
  };
  /** Ranks after this submit (null = board not affected). */
  ranks: { daily: number | null; peak: number | null; ring: number | null };
}

export type BoardId = 'daily' | 'peak' | 'ring';

export interface BoardEntry {
  rank: number;
  userId: number;
  name: string;
  username: string | null;
  photo: string | null;
  /** Main value: daily points, peak power (decimal string) or ring stop. */
  value: string;
  /** Secondary value: daily stops cleared, peak hand type, ring output (decimal string). */
  extra: string;
  me: boolean;
}

/** GET /api/leaderboard?board=daily|peak|ring[&day=YYYY-MM-DD] */
export interface LeaderboardRes {
  board: BoardId;
  day: string | null;
  entries: BoardEntry[];
  /** The caller's row ("1000+" ranks are reported as rank 0 with value). */
  me: BoardEntry | null;
  updatedAt: number;
}

/** GET /api/me */
export interface MeRes {
  user: { id: number; name: string; username: string | null; showName: boolean };
  daily: { day: string; played: boolean; stops: number | null; points: number | null };
  best: { peak: string | null; peakHand: number | null; ringStop: number | null };
}

/** POST /api/me/prefs */
export interface PrefsReq {
  showName: boolean;
}
