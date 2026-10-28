-- Players (from validated Telegram initData). show_name=0 hides the name on public boards.
CREATE TABLE users (
  tg_id INTEGER PRIMARY KEY,
  first_name TEXT NOT NULL,
  last_name TEXT,
  username TEXT,
  photo_url TEXT,
  lang TEXT,
  show_name INTEGER NOT NULL DEFAULT 1,
  banned INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- One row per ranked run. Power values are BigInt: stored as decimal text + sortable key (< 2^53).
CREATE TABLE runs (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(tg_id),
  kind TEXT NOT NULL CHECK (kind IN ('daily', 'standard')),
  day TEXT,
  seed TEXT NOT NULL,
  engine_ver INTEGER NOT NULL,
  content_hash INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'started' CHECK (status IN ('started', 'verified', 'rejected')),
  stops INTEGER,
  points INTEGER,
  output_text TEXT,
  output_key INTEGER,
  peak_text TEXT,
  peak_key INTEGER,
  peak_hand INTEGER,
  ring_stop INTEGER,
  log BLOB,
  created_at INTEGER NOT NULL,
  submitted_at INTEGER
);
CREATE INDEX idx_runs_user ON runs(user_id, created_at DESC);
CREATE UNIQUE INDEX uq_daily_once ON runs(user_id, day) WHERE kind = 'daily';

-- Best rows per user per board (one row per user keeps top-N cheap).
CREATE TABLE best_daily (
  day TEXT NOT NULL,
  user_id INTEGER NOT NULL,
  stops INTEGER NOT NULL,
  points INTEGER NOT NULL,
  run_id TEXT NOT NULL,
  achieved_at INTEGER NOT NULL,
  PRIMARY KEY (day, user_id)
);
CREATE INDEX idx_best_daily_rank ON best_daily(day, stops DESC, points DESC, achieved_at);

CREATE TABLE best_peak (
  user_id INTEGER PRIMARY KEY,
  power_key INTEGER NOT NULL,
  power_text TEXT NOT NULL,
  hand_type INTEGER NOT NULL,
  run_id TEXT NOT NULL,
  achieved_at INTEGER NOT NULL
);
CREATE INDEX idx_best_peak_rank ON best_peak(power_key DESC, achieved_at);

CREATE TABLE best_ring (
  user_id INTEGER PRIMARY KEY,
  ring_stop INTEGER NOT NULL,
  output_key INTEGER NOT NULL,
  output_text TEXT NOT NULL,
  run_id TEXT NOT NULL,
  achieved_at INTEGER NOT NULL
);
CREATE INDEX idx_best_ring_rank ON best_ring(ring_stop DESC, output_key DESC, achieved_at);
