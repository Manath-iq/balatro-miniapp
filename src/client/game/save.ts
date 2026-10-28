// Local save: config + action log; resuming replays the log through the engine.
import {
  type Action,
  decodeLog,
  encodeLog,
  fromBase64Url,
  type RunConfig,
  seedFromHex,
  seedToHex,
  toBase64Url,
} from '../../engine';

const KEY = 'lt.run.v1';

export interface ServerRun {
  runId: string;
  token: string;
}

interface Saved {
  seed: string;
  kind: RunConfig['kind'];
  driver: number;
  log: string;
  day?: string;
  server?: ServerRun;
}

export function saveRun(cfg: RunConfig, actions: readonly Action[], day?: string, server?: ServerRun): void {
  try {
    const data: Saved = {
      seed: seedToHex(cfg.seed),
      kind: cfg.kind,
      driver: cfg.driver,
      log: toBase64Url(encodeLog(actions)),
    };
    if (day) data.day = day;
    if (server) data.server = server;
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {}
}

export function loadRun(): { cfg: RunConfig; actions: Action[]; day?: string; server?: ServerRun } | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as Saved;
    const cfg: RunConfig = {
      seed: seedFromHex(d.seed),
      kind: d.kind,
      driver: d.driver,
      grade: 1,
      condition: 0,
    };
    const out: { cfg: RunConfig; actions: Action[]; day?: string } = {
      cfg,
      actions: decodeLog(fromBase64Url(d.log)).actions,
    };
    if (d.day) out.day = d.day;
    return out;
  } catch {
    return null;
  }
}

export function clearRun(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {}
}

export function bestLocal(): { stops: number; peak: string } {
  try {
    return JSON.parse(localStorage.getItem('lt.best') ?? '') as { stops: number; peak: string };
  } catch {
    return { stops: 0, peak: '0' };
  }
}

export function recordBest(stops: number, peak: bigint): void {
  const b = bestLocal();
  const out = {
    stops: Math.max(b.stops, stops),
    peak: (peak > BigInt(b.peak || '0') ? peak : BigInt(b.peak || '0')).toString(),
  };
  try {
    localStorage.setItem('lt.best', JSON.stringify(out));
  } catch {}
}
