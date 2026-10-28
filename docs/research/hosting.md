# Free hosting and leaderboards for a Vite + TypeScript Telegram Mini App on Cloudflare (as of 2026-10-28)

## TL;DR

- **Recommended setup:** run everything as one Cloudflare Worker on `*.workers.dev`. The Worker serves the static game files and the `/api/*` routes, stores leaderboards in D1, and authenticates players with Telegram `initData` checked by HMAC. Scores are verified by replaying the run on the server with the same deterministic engine the client uses. All of this fits the Workers Free plan.
- **Wrangler version problem:** the global Wrangler on this machine is **4.14.4**. That is too old for this setup:
  - array-form `run_worker_first` needs ≥4.20.0;
  - the rate-limit binding needs ≥4.36.0;
  - `@cloudflare/vite-plugin@1.65.0` needs wrangler `^4.152.0`.
  
  The latest Wrangler on npm is **4.154.0**, released 2026-10-27, and it requires Node `>=22`. Local Node is v25.5.0. Vite is 8.3.5, and the plugin supports Vite 6, 7 and 8. Install Wrangler per project and run it with `npx wrangler`.
- **Main risks:**
  1. **CPU cap:** the Free plan allows 10 ms of CPU per request, so the replay engine must stay lean.
  2. **Rank queries cost D1 reads:** a "what is my rank" query reads one row per player above you, which adds up fast.
  3. **Russia:** Russian ISPs have throttled Cloudflare since June 2025 (details in Risks).

---

## 1. Workers Static Assets: one Worker serves the files and `/api`

**How routing works** ([static-assets docs](https://developers.cloudflare.com/workers/static-assets/), [run_worker_first](https://developers.cloudflare.com/workers/static-assets/binding/#run_worker_first), [SPA routing](https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/)):

- Requests that match `run_worker_first` (`/api/*`) always run the Worker. These count as billable invocations.
- Every other request is served as a static asset first. Asset requests do not run the Worker and are "free and unlimited".
- A request that matches no file gets `index.html` with status 200, because `not_found_handling` is set to `"single-page-application"`. The Worker is not invoked.
- The array form of `run_worker_first` turns off the `Sec-Fetch-Mode: navigate` heuristic, so routing is explicit. It also supports `!` exclusions and up to 100 entries.

`wrangler.jsonc`:
```jsonc
{
  "$schema": "./node_modules/wrangler/config-schema.json",
  "name": "balatro-mini",
  "main": "./worker/index.ts",
  "compatibility_date": "2026-10-20",          // the day you create the project; Wrangler warns if it is newer than its bundled runtime
  "assets": {
    // "directory": "./dist",                 // ignored by @cloudflare/vite-plugin (it uses Vite's client output); only needed for plain `wrangler deploy`
    "binding": "ASSETS",
    "not_found_handling": "single-page-application",
    "run_worker_first": ["/api/*"]
  },
  "d1_databases": [{ "binding": "DB", "database_name": "balatro-db", "database_id": "<uuid>", "migrations_dir": "migrations" }],
  "ratelimits": [{ "name": "SUBMIT_RL", "namespace_id": "1001", "simple": { "limit": 20, "period": 60 } }],
  "secrets": { "required": ["BOT_TOKEN", "SEED_SECRET"] },   // added 2026-03; deploy fails if these are missing
  "vars": { "ENGINE_VERSION": "1" },
  "observability": { "enabled": true }
}
```
Sources: [wrangler configuration](https://developers.cloudflare.com/workers/wrangler/configuration/), [secrets property changelog](https://developers.cloudflare.com/changelog/post/2026-03-24-secrets-config-property/).

**Vite plugin workflow** ([get started](https://developers.cloudflare.com/workers/vite-plugin/get-started/), [tutorial](https://developers.cloudflare.com/workers/vite-plugin/tutorial/)):

- `vite.config.ts`: `plugins: [cloudflare()]`.
- `package.json` scripts: `dev: vite dev`, `build: vite build`, `preview: npm run build && vite preview`, `deploy: npm run build && wrangler deploy`.
- `vite dev` runs the Worker inside workerd, with a local D1 stored under `.wrangler/state`, plus HMR.
- `vite build` writes `dist/client` and `dist/<worker>/` together with a generated output `wrangler.json`. `wrangler deploy` finds that file automatically.
- Do not use `wrangler deploy --env`. Choose the environment at build time with `CLOUDFLARE_ENV=x vite build` ([migration notes](https://developers.cloudflare.com/workers/vite-plugin/reference/migrating-from-wrangler-dev/)).
- From Wrangler 4.150 and plugin 1.64, source maps are uploaded by default ([changelog](https://developers.cloudflare.com/changelog/post/2026-10-20-source-maps-on-by-default/)).
- Run `npx wrangler types` to generate the `Env` type.

**Free-plan limits** ([limits](https://developers.cloudflare.com/workers/platform/limits/), [pricing](https://developers.cloudflare.com/workers/platform/pricing/)):

| Item | Free plan |
|---|---|
| Worker requests | **100,000/day**, resets 00:00 UTC; after that, error 1027. Only `/api/*` counts here. |
| CPU per HTTP request | **10 ms**. Waiting on I/O, including D1, does not count. Exceeding it gives error 1102. |
| Memory / startup | 128 MB / 1 s to run the global scope |
| Subrequests | 50 external, 1,000 to Cloudflare services; D1 allows 50 queries per invocation |
| Worker bundle | 64 MiB uncompressed |
| Static assets | Requests free and unlimited; **20,000 files** per version; **25 MiB per file** |
| Request body | 100 MB (Free plan); URL 16 KB; headers 128 KB |

- **Do not turn on Workers Caching** (`cache.enabled`). With it on, every request is billed, including static-asset requests that are otherwise free ([Workers Cache](https://developers.cloudflare.com/workers/cache/)). On the Free plan that would make asset requests count toward the 100k/day.
- The docs only promise a working `caches.default` Cache API on custom domains ([Cache API](https://developers.cloudflare.com/workers/runtime-apis/cache/)). On workers.dev, cache the leaderboard in memory inside the Worker (a module-level `Map` with a 30–60 s TTL).
- Add a `public/_headers` file so hashed Vite files are cached for a long time: `/assets/*` → `Cache-Control: public, max-age=31536000, immutable`.

**workers.dev and Telegram:** the URL is `https://<worker>.<subdomain>.workers.dev` with a valid HTTPS certificate. That is all Telegram needs. Telegram allows plain HTTP only in its test environment ([Mini Apps docs](https://core.telegram.org/bots/webapps)).

---

## 2. Storage for leaderboards

| | **D1** | KV | Durable Objects (SQLite) |
|---|---|---|---|
| Free reads | 5M rows/day | 100k/day | 5M rows/day |
| Free writes | 100k rows/day; **index updates count as extra rows** | **1,000/day**; 1 write/s per key | 100k rows/day |
| Storage | 5 GB total, 500 MB per database, 10 databases | 1 GB | 5 GB |
| Other | Time Travel backups for 7 days; Free-tier limits **enforced since 2026-09-01** (queries fail until midnight UTC) | Eventually consistent; no ORDER BY | 100k requests/day and 13,000 GB-s/day; only the SQLite backend is available on Free |
| Fit | **Recommended** | Unsuitable: even writing a cached top-N once a minute is 1,440 writes/day | Upgrade path for exact ranks or strict rate limits |

Sources: [D1 pricing and definitions](https://developers.cloudflare.com/workers/platform/pricing/#d1), [D1 limits](https://developers.cloudflare.com/d1/platform/limits/), [D1 enforcement changelog](https://developers.cloudflare.com/changelog/post/2026-09-01-d1-free-tier-limit-enforcement/), [KV limits](https://developers.cloudflare.com/kv/platform/limits/), [DO pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/).

**Schema** (`migrations/0001_init.sql`). The leaderboard tables keep **one best row per user**. A board built straight from `runs` would show the same player several times, and removing duplicates would need a scanning `GROUP BY`.

```sql
CREATE TABLE users (
  tg_id INTEGER PRIMARY KEY, first_name TEXT NOT NULL, last_name TEXT, username TEXT,
  photo_url TEXT,                 -- optional in initData; may be absent
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, banned INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE runs (
  id TEXT PRIMARY KEY,            -- server-issued, 128-bit random
  user_id INTEGER NOT NULL REFERENCES users(tg_id),
  mode TEXT NOT NULL CHECK (mode IN ('daily','endless')),
  day TEXT,                       -- 'YYYY-MM-DD' UTC for daily
  seed TEXT NOT NULL, engine_ver INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'started',   -- started|verified|rejected
  score INTEGER, stage_reached INTEGER, best_hand INTEGER,
  verified INTEGER NOT NULL DEFAULT 0,
  actions BLOB,                   -- optional: lets you re-verify after engine fixes
  created_at INTEGER NOT NULL, submitted_at INTEGER
);
CREATE INDEX idx_runs_user ON runs(user_id, created_at DESC);
CREATE UNIQUE INDEX uq_daily_once ON runs(user_id, day) WHERE mode = 'daily';

CREATE TABLE best_daily (day TEXT NOT NULL, user_id INTEGER NOT NULL, score INTEGER NOT NULL,
  run_id TEXT NOT NULL, achieved_at INTEGER NOT NULL, PRIMARY KEY (day, user_id));
CREATE INDEX idx_best_daily_rank ON best_daily(day, score DESC, achieved_at);

CREATE TABLE best_alltime (mode TEXT NOT NULL, user_id INTEGER NOT NULL, score INTEGER NOT NULL,
  stage_reached INTEGER NOT NULL, run_id TEXT NOT NULL, achieved_at INTEGER NOT NULL,
  PRIMARY KEY (mode, user_id));
CREATE INDEX idx_best_alltime_rank ON best_alltime(mode, score DESC, achieved_at);
```

**Queries:**

- **Write a best score.** Run these in one `env.DB.batch([...])`, which is a single transaction. The `WHERE` makes the update happen only when the new score is higher:
  ```sql
  INSERT INTO best_daily(day,user_id,score,run_id,achieved_at) VALUES (?1,?2,?3,?4,?5)
  ON CONFLICT(day,user_id) DO UPDATE SET score=excluded.score, run_id=excluded.run_id, achieved_at=excluded.achieved_at
  WHERE excluded.score > best_daily.score;
  ```
- **Top N:**
  ```sql
  SELECT b.user_id,u.first_name,u.username,u.photo_url,b.score FROM best_daily b JOIN users u ON u.tg_id=b.user_id WHERE b.day=?1 ORDER BY b.score DESC, b.achieved_at LIMIT 50;
  ```
  Cost: about 100–150 rows read.
- **My rank, with a capped read cost:**
  ```sql
  SELECT COUNT(*)+1 AS rank FROM (SELECT 1 FROM best_alltime WHERE mode=?1 AND score>?2 LIMIT 1000);
  ```
  The rows read equal the number of players above you, up to 1,000. Without the cap, 5,000 players means about 5k reads per lookup, and 1,000 lookups would use the whole 5M daily read budget. Above the cap, show "1000+" or a percentile.
- Check queries with `EXPLAIN QUERY PLAN`, and watch `meta.rows_read` ([use indexes](https://developers.cloudflare.com/d1/best-practices/use-indexes/)).

**Write budget:**

- A daily run costs about 6–8 rows written: the start insert plus 2 index rows, the submit update, and the two best-score upserts (each one row plus its index, only when the score improves). That allows roughly 12–16k runs per day.
- Endless runs start stateless (a signed token, no D1 write), which saves about 3 rows per run.
- In practice the 100k Worker requests/day limit is reached before the D1 limits.

**Migration commands** ([migrations](https://developers.cloudflare.com/d1/reference/migrations/)):
```
npx wrangler d1 create balatro-db
npx wrangler d1 migrations create balatro-db init
npx wrangler d1 migrations apply balatro-db --local
npx wrangler d1 migrations apply balatro-db --remote
```
`d1 create` prints the `database_id` to put in the config; newer Wrangler versions offer to add it for you.

---

## 3. Secrets

Sources: [secrets](https://developers.cloudflare.com/workers/configuration/secrets/), [local dev variables](https://developers.cloudflare.com/workers/local-development/environment-variables/).

- **Production:** `npx wrangler secret put BOT_TOKEN` and `npx wrangler secret put SEED_SECRET` (generate it with `openssl rand -hex 32`). Each value appears in code as `env.BOT_TOKEN`.
- **Local development:** put `BOT_TOKEN="..."` and `SEED_SECRET="..."` in `.dev.vars` next to `wrangler.jsonc`.
  - Use either `.dev.vars` or `.env`, not both. If `.dev.vars` exists, `.env` is ignored.
  - Add `.dev.vars*`, `.env*` and `.wrangler` to `.gitignore`.
- **`secrets.required`:**
  - `vite dev` and `wrangler dev` load only the listed keys.
  - `wrangler types` generates their types.
  - `wrangler deploy` fails if any listed secret is not set.

---

## 4. Anti-cheat by replaying the run on the server

**The limit:** **10 ms of CPU per HTTP request on Workers Free.** The docs say isolates have "some built-in flexibility" for occasional overruns, but consistent overruns are killed with error 1102. Paid is $5/month: 30 s by default, up to 5 min. D1 waiting time is not CPU time.

**Measurement on this machine** (Node v25.5.0, V8), with a simplified engine: 24 blinds × 7 play/discard actions, 5 jokers, poker hand evaluation, and the sfc32 random generator.

| Measurement | Result |
|---|---|
| First (cold) run | **2.1 ms** |
| Warm run | **0.16 ms** |
| `JSON.parse` of a 6 KB action log | 0.06 ms |

**Estimate for the real engine:** if it is 3–10× heavier (tarot and planet cards, enhancements, retriggers, boss blinds), expect about **0.5–2 ms warm and 5–15 ms on a cold isolate in the worst case**. The HMAC checks use native WebCrypto and are negligible. Verdict: **feasible, with some risk on cold starts**.

How to stay under the limit:

- Build lookup tables at module scope. That work falls under the 1 s startup limit, not the per-request CPU.
- Avoid allocating objects for every card.
- Watch CPU-time percentiles in the dashboard and in Workers Logs.
- **Plan B:** verify one ante at a time. After each ante, the server returns an HMAC-signed state digest, so each request does only part of the replay.
- **Plan C:** move to Workers Paid.

**Protocol:**

1. **Authentication.** Every API call sends `Authorization: tma <initData>`. To check it ([Telegram docs](https://core.telegram.org/bots/webapps)):
   - Take every field except `hash` (keep `signature`), sort the `key=value` pairs, and join them with `\n`.
   - Compute `secret = HMAC_SHA256(key="WebAppData", msg=BOT_TOKEN)`, then `HMAC_SHA256(secret, data_check_string)`. Its hex value must equal `hash`. Compare with `crypto.subtle.timingSafeEqual`.
   - Reject `auth_date` older than about 24 h.
   - Cache the derived key at module scope.
2. **`POST /api/run/start {mode}`.** The server creates `run_id` from 16 random bytes.
   - **Daily mode:** `seed = HMAC(SEED_SECRET, "daily:"+UTC_date)`, so everyone gets the same seed, revealed only at start. The start is written to D1, and the unique index allows **one counted attempt per user per day**.
   - **Endless mode:** `seed = HMAC(SEED_SECRET, run_id)`. The server returns `sig = HMAC(SEED_SECRET, run_id|user_id|mode|seed|issued_at|engine_ver)`, with no D1 write.
3. **`POST /api/run/submit {run_id, sig, actions, claimed}`.** The server:
   - checks `sig`, the run's age (a maximum, and optionally a plausible minimum duration), that the run was not already submitted, and that `engine_ver` matches;
   - checks the action list against a schema;
   - **replays the run**, then writes the recomputed score with `verified=1` and updates the best-score tables in one batch.
   
   The claimed score is only used to detect mismatches.

**Determinism rules.** iOS Telegram runs JavaScriptCore inside WKWebView, while Workers run V8, so the engine must give identical results on both:

- Use integers and `+ - * /` only, plus `Math.floor`.
- Do not use `Math.random` or `Date` inside the engine.
- Do not use `Math.pow`, `**`, `exp`, `log` or `sin`. The spec leaves their precision to each implementation, so results can differ between engines.
- Derive a separate random stream for each purpose (deck, shop, boss, packs) from the seed, so one choice does not shift the others.
- Keep scores within `Number.MAX_SAFE_INTEGER`, or clamp them (D1 INTEGER is 64-bit, but JS numbers lose precision above 2^53).
- Version the engine and keep the stored action logs, so runs can be re-verified later.

**Rate limiting on Free:**

- **Rate-limit binding** (`ratelimits`, GA since 2025-09-19, needs Wrangler ≥4.36). Key it on the Telegram user id; the window is 10 or 60 s, and counts are approximate per data center. The docs do not say whether it is available on Free, so confirm it works after the first deploy ([docs](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)).
- **D1 rules:** the unique index for one daily run per user, plus a per-user cooldown.
- **Not usable here:** the WAF rate-limiting rule needs a custom domain (zone), so it does not apply to workers.dev.
- **For strict global limits:** use a Durable Object.

**Request size:** the platform accepts bodies up to 100 MB, so enforce your own limits:

- Require `Content-Length ≤ 64 KB`, and also check `arrayBuffer().byteLength`, because chunked uploads have no Content-Length.
- Cap the number of actions (for example 2,000).
- Encode actions in 1–3 bytes each, which is about 1–3 KB per run.

**What replay cannot stop:**

- Players who know the seed can search for the best line offline with their own solver. Revealing the daily seed only at start and counting one attempt limits this.
- Multiple Telegram accounts.

---

## 5. Alternative: GitHub Pages for the game + a Worker for the API

| | Single Worker | GitHub Pages + Worker |
|---|---|---|
| Deploys | One. Client and verifier engine always ship the **same version**, which matters for replay. | Two. Client and verifier can be on different versions, so old verifiers must be kept. |
| CORS | None (same origin, `fetch('/api/...')`) | Required. A JSON POST or an `Authorization` header triggers an **OPTIONS preflight, which is another Worker invocation counting toward 100k/day**. |
| Static limits | Free, unlimited requests; 20k files; 25 MiB per file; `_headers` supported | 1 GB site, 100 GB/month soft bandwidth, 10 builds/hour soft limit, 10-minute deploy timeout ([limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)); no custom headers; free accounts need a **public repo**; SPA needs a `404.html` workaround and Vite `base: '/repo/'` |
| Custom domain | Optional; needs a domain on Cloudflare (not free) | Optional `CNAME` |
| Local dev | `vite dev` runs the client and API together | Two processes, plus CORS setup |

**Recommendation: a single Worker.** Still read the API base URL from `VITE_API_BASE`, so the static files can move to another host with a config change if the Russia problem below applies.

---

## 6. Beginner deploy steps

**The user must do these by hand:**

1. Create a free Cloudflare account and verify the email. Choose a workers.dev subdomain on first deploy, or under Workers & Pages in the dashboard.
2. In Telegram, use @BotFather:
   - `/newbot` gives you `BOT_TOKEN`.
   - After deploying: `/mybots` → Bot Settings → Configure Mini App, set the Mini App URL to the workers.dev URL, and set the menu button. Alternatively, `/newapp` creates a `t.me/<bot>/<app>` link.
3. Optional: a GitHub account and repo. CI would also need a Cloudflare API token ("Edit Cloudflare Workers" template plus D1 edit) and the account ID.

**Commands**, run in `/Users/manath/myAI/balatro-mini`:
```
npm i -D wrangler@latest vite @cloudflare/vite-plugin typescript
npx wrangler --version        # expect 4.154.x (the global 4.14.4 is too old)
npx wrangler login            # browser OAuth
npx wrangler whoami
npx wrangler d1 create balatro-db          # put database_id into wrangler.jsonc
npx wrangler d1 migrations create balatro-db init   # write the schema into migrations/0001_init.sql
npx wrangler d1 migrations apply balatro-db --local
npx wrangler d1 migrations apply balatro-db --remote
npx wrangler secret put BOT_TOKEN
npx wrangler secret put SEED_SECRET        # before the first deploy if secrets.required is set; Wrangler offers to create the Worker
# .dev.vars: BOT_TOKEN=... SEED_SECRET=...
npx wrangler types
npm run dev                                 # local
npm run deploy                              # vite build && wrangler deploy → prints the https://….workers.dev URL
npx wrangler tail                           # live logs
```

To test inside Telegram before deploying, you need an HTTPS tunnel to `vite dev`, for example `cloudflared tunnel --url http://localhost:5173`. Add the tunnel's host to Vite's `server.allowedHosts`. Otherwise, just deploy and test on workers.dev.

---

## Risks and open questions

- **Russia:** since 9 June 2025, Russian ISPs (Rostelecom, MTS, MegaFon, Beeline) cap connections to Cloudflare at about 16 KB. Hetzner, DigitalOcean and OVH are also reported affected ([The Record](https://therecord.media/cloudflare-russia-restricting-access-crackdown), [Zona](https://en.zona.media/article/2025/06/27/cloud_confirmed), [heise](https://heise.de/-10465087)).
  - I found no confirmed status for 2026, and nothing that names workers.dev specifically.
  - A game of several MB may not load for Russian players without a VPN.
  - **Test from a Russian mobile network with a file of 1 MB or more before building further.**
  - If it is blocked, host the static files elsewhere. GitHub Pages is not named in the throttling reports, but I could not verify that it loads. The small API responses might still get through.
- **Rate-limit binding on Free:** the docs do not state whether it is available. Test it.
- **CPU:** benchmark the real engine early. Above about 5 ms cold, switch to per-ante signed checkpoints.
- **Cloudflare's new `cf` CLI** is in beta and uses `cloudflare.config.ts`. Stay on Wrangler for now ([cf docs](https://developers.cloudflare.com/cf/wrangler/reference/)).

No files were created. Relevant path: /Users/manath/myAI/balatro-mini (project root; currently uses global wrangler 4.14.4).