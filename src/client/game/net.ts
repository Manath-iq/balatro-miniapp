// API client: every call carries the Telegram initData; without it the game runs offline (unranked).
import type { ApiError, ErrorCode } from '../../shared/api';
import { initDataRaw } from '../platform/tg';

const BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? '';

export class ApiFail extends Error {
  readonly code: ErrorCode | 'network';
  constructor(code: ErrorCode | 'network') {
    super(code);
    this.code = code;
  }
}

export const online = (): boolean => initDataRaw().length > 0;

export async function api<T>(path: string, body?: unknown): Promise<T> {
  if (!online()) throw new ApiFail('no_init_data');
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 10000);
  try {
    const init: RequestInit = { headers: { Authorization: `tma ${initDataRaw()}` }, signal: ctl.signal };
    if (body !== undefined) {
      init.method = 'POST';
      init.headers = { ...init.headers, 'content-type': 'application/json' };
      init.body = JSON.stringify(body);
    }
    const r = await fetch(BASE + path, init);
    const data = (await r.json()) as T | ApiError;
    if (!r.ok) throw new ApiFail((data as ApiError).error ?? 'bad_request');
    return data as T;
  } catch (e) {
    if (e instanceof ApiFail) throw e;
    throw new ApiFail('network');
  } finally {
    clearTimeout(timer);
  }
}
