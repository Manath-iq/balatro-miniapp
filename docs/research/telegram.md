# Telegram Mini Apps platform report for a portrait Balatro-style game (as of 2026-10-28)

Primary sources, fetched today:
- Mini Apps docs: https://core.telegram.org/bots/webapps (latest Mini Apps changelog entry: Bot API 10.1, 2026-06-11)
- Bot API changelog: https://core.telegram.org/bots/api-changelog (latest: Bot API 10.3, 2026-08-24)
- Link spec: https://core.telegram.org/api/links
- MTProto Mini Apps spec: https://core.telegram.org/api/bots/webapps

---

## 1. `Telegram.WebApp` features: version, detection and notes

**How to detect support:** use `const tg = window.Telegram?.WebApp; const can = (v: string) => !!tg && tg.isVersionAtLeast(v);`. `tg.version` is the client's Bot API level. The official script falls back to `'6.0'` if the client doesn't report a version.

**What happens on old clients:**
- Most setters only print a console warning, e.g. `"[Telegram.WebApp] Changing swipes behavior is not supported in version X"`.
- Newer methods **throw** `Error('WebAppMethodUnsupported')`. This includes `requestFullscreen`, `exitFullscreen`, `addToHomeScreen` and `checkHomeScreenStatus`, and `CloudStorage`, `DeviceStorage` and `SecureStorage` also log errors. Wrap these calls in a version check plus `try`.

This was checked against the live script (`telegram-web-app.js`, Last-Modified 2026-10-06).

| Feature | Bot API | Notes |
|---|---|---|
| `ready()`, `expand()`, `close()`, `isExpanded` | 6.0 | Call `ready()` as early as possible: it hides Telegram's loading placeholder. The main Mini App already opens at full height, so `expand()` only matters for menu-button or inline launches. |
| `viewportHeight` / `viewportStableHeight` | 6.0 | CSS vars `--tg-viewport-height` / `--tg-viewport-stable-height`. The script defaults them to `100vh` until the first event. Use the *stable* value for anything pinned to the bottom. Listen to `viewportChanged` and check `isStateStable`. |
| `themeParams` | 6.0+ | `--tg-theme-*` vars and `--tg-color-scheme`. Not very useful for a game with a fixed palette. |
| `BackButton` | 6.1 | `.show()`, `.hide()`, `.onClick()`, `.offClick()`, chainable. Use it for in-game navigation such as shop → run. |
| `HapticFeedback` | 6.1 | `impactOccurred('light'\|'medium'\|'heavy'\|'rigid'\|'soft')`, `notificationOccurred('error'\|'success'\|'warning')`, `selectionChanged()`. The docs say to use `selectionChanged()` only when a selection changes, not on confirm. Does nothing on desktop. |
| `setHeaderColor` / `setBackgroundColor` | 6.1 | Accept `#RRGGBB` or the keywords `bg_color` / `secondary_bg_color`. Arbitrary header colors need **6.9+**. In fullscreen the header is transparent, but still set it: Telegram uses it to choose contrasting status-bar and control colors. |
| `setBottomBarColor` | 7.10 | Also accepts `bottom_bar_bg_color`. It also colors the Android navigation bar. |
| `enableClosingConfirmation` | 6.2 | Plus `disableClosingConfirmation` and `isClosingConfirmationEnabled`. Turn it on during a run. |
| `platform` | 6.4 | e.g. `ios`, `android`, `android_x`, `tdesktop`, `macos`, `weba`, `webk`, `web`, `unigram`, `unknown`. |
| `CloudStorage` | 6.9 | Up to **1024 keys per user per bot**. Key is 1–128 chars from `[A-Za-z0-9_-]`; value is 0–4096 chars. Methods: `setItem`, `getItem`, `getItems`, `removeItem`, `removeItems`, `getKeys`. All take callbacks. Syncs across devices. |
| `disableVerticalSwipes` / `enableVerticalSwipes` / `isVerticalSwipesEnabled` | 7.7 | Stops content swipes from minimizing or closing the app. **Swiping the header still closes it.** |
| `shareToStory(media_url, {text, widget_link})` | 7.8 | `media_url` must be HTTPS. Text is 0–200 chars (2048 for Premium users). `widget_link` is `{url, name≤48}`, and only Premium users can post stories with links. |
| Main Mini App (profile "Launch app" button, `?startapp` links) | 7.8 | Opens at full height by default. |
| `requestFullscreen()` / `exitFullscreen()`, `isFullscreen` | 8.0 | Events: `fullscreenChanged`, and `fullscreenFailed` with error `UNSUPPORTED` or `ALREADY_FULLSCREEN`. Works in both portrait and landscape. |
| `lockOrientation()` / `unlockOrientation()`, `isOrientationLocked` | 8.0 | Locks the **current** orientation. Only call it when `innerHeight > innerWidth`. |
| `safeAreaInset` / `contentSafeAreaInset` | 8.0 | CSS vars `--tg-safe-area-inset-{top,bottom,left,right}` and `--tg-content-safe-area-inset-*`. The script initializes them to `0px`. Events: `safeAreaChanged`, `contentSafeAreaChanged`. In fullscreen, the content inset sits *inside* the safe area, so total top padding = `safe.top + contentSafe.top`. |
| `isActive` and the `activated` / `deactivated` events | 8.0 | Fire on minimize/restore and tab switches. Use them to pause the game loop and audio. On older clients, fall back to `visibilitychange`. |
| `addToHomeScreen()`, `checkHomeScreenStatus(cb)` | 8.0 | Statuses: `unsupported`, `unknown`, `added`, `missed`. The `homeScreenAdded` event may not fire on some devices. |
| `shareMessage(id, cb)` | 8.0 | `id` comes from the Bot API method `savePreparedInlineMessage(user_id, result: InlineQueryResult, allow_user_chats/allow_bot_chats/allow_group_chats/allow_channel_chats)`, which returns `PreparedInlineMessage{id, expiration_date}`. Events: `shareMessageSent`, `shareMessageFailed`. Your Worker can call it with the bot token, e.g. to share a score card with a `?startapp=` button. Whether the bot needs inline mode enabled (/setinline) is unverified: test it. |
| `downloadFile`, `setEmojiStatus`, `requestEmojiStatusAccess`, `Accelerometer` / `Gyroscope` / `DeviceOrientation`, `LocationManager` | 8.0 | Optional. Emoji status could be used as an in-game badge. |
| `initDataUnsafe.user.photo_url` | 8.0 for all apps | Depends on the user's privacy settings. Can be .jpeg or .svg. |
| Android `User-Agent` suffix | 8.0 | `Telegram-Android/{ver} ({maker} {model}; Android {v}; SDK {n}; LOW\|AVERAGE\|HIGH)`. Use the performance class to scale down effects. |
| Loading-screen icon and colors | 8.0 | Set in BotFather: Configure Mini App. |
| `DeviceStorage` | 9.0 | **5 MB per user per bot**, stored on the device. `setItem`, `getItem`, `removeItem`, `clear`. A good fit for full run saves. |
| `SecureStorage` | 9.0 | Up to 10 items, backed by Keychain/Keystore. Not needed for this game. |
| `hideKeyboard()` | 9.1 | Useful if you ever add a nickname input. |
| `BottomButton.iconCustomEmojiId` | 9.5 | Not relevant. |
| `requestChat` (with `savePreparedKeyboardButton`) | 9.6 | Not relevant. |
| **Origin hardening** | **10.2** (2026-07-14) | Mini App methods are blocked from any origin other than the Mini App's own domain. Enforced for all apps since **2026-07-20**; you can opt out in the BotFather Mini App. **What this means for you:** keep the game on the exact domain registered in BotFather. No redirect to another domain, and no iframes from other origins. Use a separate dev bot whose URL is your tunnel. `fetch` calls to a workers.dev API are not affected. |

**`initDataUnsafe` fields:**
- `user`: `id` (up to 52 bits, safe as a JS number or a D1 INTEGER), `first_name`, `last_name?`, `username?`, `language_code?` (user only), `is_premium?`, `allows_write_to_pm?`, `photo_url?`.
- Also: `auth_date`, `hash`, `signature`, `query_id?`, `chat_type?`, `chat_instance?`, `start_param?`.
- `chat_type` and `chat_instance` are only sent for direct-link or main-app links opened inside a chat. **They make a per-group leaderboard possible.**
- `initData` is **empty** for keyboard-button or inline-mode launches and outside Telegram. Treat those players as guests.

**`start_param` and `startapp`:**
- `t.me/<bot>?startapp=XYZ` delivers `XYZ` in `start_param` and also in the URL GET parameter `tgWebAppStartParam`.
- The WebAppInitData table still says "startattach only", but the main-app and direct-link sections say `startapp` is passed too. Test it.
- Limits: `^[\w-]{0,512}$`, i.e. up to 512 chars of `[A-Za-z0-9_-]` (https://docs.telegram-mini-apps.com/platform/start-parameter). Good for referrals or shared seeds such as `startapp=seed_ab12`.

**Other events:** `themeChanged`, `viewportChanged`, `backButtonClicked`.

---

## 2. Validating `initData` on the server

### Bot-token check (HMAC), per https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
1. Parse the `initData` query string. The values are URL-decoded.
2. Remove **only** `hash`. **`signature` stays in the string for this check.** The tma.js reference implementation (`@tma.js/init-data-node@2.0.8`) does the same.
3. Build `data_check_string`: every `key=value` pair, sorted alphabetically, joined with `\n`.
4. `secret_key = HMAC_SHA256(key="WebAppData", msg=bot_token)`.
5. Check `hex(HMAC_SHA256(key=secret_key, msg=data_check_string)) === hash`, using a constant-time compare.
6. Check freshness from `auth_date`. Telegram gives no maximum; tma.js defaults to **86400 s**.
   - `auth_date` is the time the app was **opened**, and it does not change during the session. So pick a limit of 1–24 h, or validate once and issue your own short-lived session token.

### Third-party check (Ed25519, Bot API 8.0)
1. Remove `hash` **and** `signature`, then sort and join the rest the same way.
2. Prefix the string with `${bot_id}:WebAppData\n`. `bot_id` is the number before the `:` in the bot token.
3. `signature` is base64url and may have no padding.
4. Public keys (hex):
   - Production: `e7bf03a2fa4602af4580703d88dda5bb59f32ed8b02a56c187fe7d34caed242d`
   - Test environment: `40055058a4ee38156a06562e52eece92a771bcd8346a8c4615cb7376eddf72ec`
5. Check `auth_date` here too.

Cloudflare Workers support `Ed25519` (Secure Curves API), HMAC, and the non-standard `crypto.subtle.timingSafeEqual` (https://developers.cloudflare.com/workers/runtime-apis/web-crypto/).

### Sketch (TypeScript, Workers-compatible, no Node Buffer)
```ts
const enc = new TextEncoder();
const fromHex = (h: string) => new Uint8Array(h.match(/../g)!.map(x => parseInt(x, 16)));
const b64url = (s: string) => {
  s = s.replace(/-/g, '+').replace(/_/g, '/'); s += '='.repeat((4 - (s.length % 4)) % 4);
  return Uint8Array.from(atob(s), c => c.charCodeAt(0));
};
const hmac = async (key: BufferSource, msg: string) =>
  new Uint8Array(await crypto.subtle.sign('HMAC',
    await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']),
    enc.encode(msg)));
const checkString = (p: URLSearchParams, exclude: string[]) => {
  const pairs: string[] = [];
  p.forEach((v, k) => { if (!exclude.includes(k)) pairs.push(`${k}=${v}`); });
  return pairs.sort().join('\n');
};
const fresh = (p: URLSearchParams, maxAge: number) => {
  const t = Number(p.get('auth_date'));
  if (!t || Date.now() / 1000 - t > maxAge) throw new Error('initData expired');
};

export interface TgUser { id: number; first_name: string; last_name?: string; username?: string; language_code?: string; photo_url?: string; is_premium?: true }

// Bot-token (HMAC) validation: use this on your own Worker
export async function validateInitData(raw: string, botToken: string, maxAge = 86400): Promise<TgUser> {
  const p = new URLSearchParams(raw);
  const hash = p.get('hash'); if (!hash) throw new Error('no hash');
  const secret = await hmac(enc.encode('WebAppData'), botToken);   // key="WebAppData", msg=token
  const calc = await hmac(secret, checkString(p, ['hash']));        // signature stays IN
  const given = fromHex(hash);
  if (given.length !== calc.length || !crypto.subtle.timingSafeEqual(calc, given)) throw new Error('bad hash');
  fresh(p, maxAge);
  return JSON.parse(p.get('user') ?? 'null');
}

// Ed25519 third-party validation (no token needed)
const TG_PK = { prod: 'e7bf03a2fa4602af4580703d88dda5bb59f32ed8b02a56c187fe7d34caed242d',
                test: '40055058a4ee38156a06562e52eece92a771bcd8346a8c4615cb7376eddf72ec' };
export async function validateInitData3rd(raw: string, botId: number, test = false, maxAge = 86400) {
  const p = new URLSearchParams(raw);
  const sig = p.get('signature'); if (!sig) throw new Error('no signature');
  const key = await crypto.subtle.importKey('raw', fromHex(test ? TG_PK.test : TG_PK.prod), { name: 'Ed25519' }, false, ['verify']);
  const msg = `${botId}:WebAppData\n${checkString(p, ['hash', 'signature'])}`;
  if (!(await crypto.subtle.verify({ name: 'Ed25519' }, key, b64url(sig), enc.encode(msg)))) throw new Error('bad signature');
  fresh(p, maxAge);
  return JSON.parse(p.get('user') ?? 'null') as TgUser;
}
```

**Client side:** send `fetch(API + '/score', { method: 'POST', headers: { Authorization: 'tma ' + Telegram.WebApp.initData }, body })`. The `tma <initData>` scheme is the tma.js convention (https://docs.telegram-mini-apps.com/platform/init-data).

**CORS:** if the frontend is on GitHub Pages and the API on workers.dev, the API must answer the preflight (`OPTIONS`) and allow the `Authorization` header. The simpler route is to serve the static assets and the API from **one Worker**.

**Off-the-shelf alternative:** the `@tma.js/init-data-node/web` export (v2.0.8, 2026-06-20) uses Web Crypto. Its third-party validation uses `Buffer`, so it needs `nodejs_compat` on Workers. `@telegram-apps/init-data-node` is marked deprecated in favor of it.

**Anti-cheat:** this check only proves who is submitting, not that the score is real. Any score the client computes can be forged. Mitigations: seeded deterministic RNG plus an action log that the server replays, rate limits, and plausibility caps.

---

## 3. BotFather setup and links

1. **Create the bot.** `/newbot` → display name → username ending in `bot` → you get the token. Store it as a Worker secret: `wrangler secret put BOT_TOKEN`.
2. **Main Mini App.** `/mybots` → choose the bot → **Bot Settings → Configure Mini App → Enable Mini App** → send the HTTPS URL. The same menu has loading-screen customization (icon, light/dark colors). After this:
   - The bot profile shows a **Launch app** button, and the bot appears in search's Apps tab for users who have launched it.
   - You can upload localized preview photos and videos.
   - The docs mention this path for loading-screen settings (https://core.telegram.org/bots/webapps); the label "Enable Mini App" comes from the docs plus third-party guides. BotFather's own Mini App UI may phrase options differently.
3. **Menu button** (optional, recommended). **Bot Settings → Menu Button** or `/setmenubutton` → URL plus a label such as "Play". It can also be set per user with the Bot API `setChatMenuButton` and `MenuButtonWebApp`.
4. **Named direct-link app** (optional). `/newapp` → choose the bot → title → description → 640×360 photo → optional GIF → URL → `short_name`. This gives `t.me/<bot>/<short_name>`.
5. **Privacy policy.** Telegram's Standard Privacy Policy for Bots and Mini Apps applies by default. If you store more (user id, name, photo for the leaderboard), check that it covers your use, or register your own policy in BotFather (Bot Developer Terms, https://telegram.org/tos/bot-developers).
6. **Test environment.** It is completely separate: a separate test account and a new bot made with the test-env BotFather. HTTP without TLS is allowed there. Bot API calls go to `https://api.telegram.org/bot<token>/test/METHOD`.

**Links** (https://core.telegram.org/api/links#main-mini-app-links):
- Main app: `https://t.me/<bot>?startapp`, `https://t.me/<bot>?startapp=<param>`, `...&mode=compact`, `...&mode=fullscreen`.
- Direct app: `https://t.me/<bot>/<short_name>?startapp=<param>&mode=compact|fullscreen`.

**Fullscreen by default:**
- The client spec says that when a link has `mode=fullscreen`, clients must set the `fullscreen` flag on `messages.requestMainWebView` / `messages.requestAppWebView`. So **put `&mode=fullscreen` in every link you share.** The Bot API page itself only documents `mode=compact`.
- The docs say only that the main app's default full height can be changed "via @BotFather". I found no confirmed BotFather toggle that makes fullscreen the default.
- The menu button and the profile button cannot carry `mode`. So call `requestFullscreen()` on startup when `can('8.0')` and the platform is mobile, and listen for `fullscreenFailed`.

**Built-in alternative (not recommended):** Telegram's HTML5 Games platform (`/newgame`, `sendGame`, `setGameScore`, `getGameHighScores`) has free per-chat high-score tables. But those games run through the Games proxy, not the Mini App API, so you would lose fullscreen, safe areas and storage.

---

## 4. Official script vs SDK

| | Official script `https://telegram.org/js/telegram-web-app.js?64` | `@tma.js/sdk` **3.3.0** (2026-07-14) |
|---|---|---|
| Size | 117 KB raw, about **19 KB gzipped**. Loaded from telegram.org, `cache-control: max-age=345600` (4 days). | 90.5 KB minified, about **26 KB gzipped** (bundlephobia). Tree-shakeable. Depends on valibot and fp-ts. |
| Versioning | The `?64` suffix is a cache-buster that Telegram bumps. The unversioned URL serves the same file (Last-Modified 2026-10-06). The docs say to put it in `<head>` before other scripts. | The project was renamed from `@telegram-apps/sdk` (last release 3.11.8, 2025-10-08) to `@tma.js/*`. The React package is `@tma.js/sdk-react` 3.0.23. |
| Pros | Official. Always matches what clients support. Synchronous `window.Telegram.WebApp`. Sets the `--tg-*` CSS vars itself. Typed via `@types/telegram-web-app` **10.1.0** (2026-08-29). | ESM with signals. Typed launch-param parsing. `mockTelegramEnv` lets you develop outside Telegram. Unified errors. |
| Cons | A global, plus a render-blocking request to a third-party host. If telegram.org is slow or blocked, the game must still start (guard `window.Telegram?.WebApp`). | Breaking changes between majors and a package rename. Can lag new Bot API features. Larger, with more abstraction than a game needs. |

**Recommendation for a small Vite + TS game:**
- Use the **official script plus `@types/telegram-web-app`** behind a ~50-line wrapper of your own (version checks, try/catch, no-op fallbacks outside Telegram).
- Add `eruda` 3.4.3 behind a `?debug` flag.
- If you want mocks, use a hand-written dev stub for `window.Telegram.WebApp`.

---

## 5. WebView gotchas for games

**Runtimes:**
- iOS: WKWebView, so the engine is the iOS version's Safari.
- Android: System WebView (Chromium, version varies; the docs' example UA shows Chrome/113).
- Telegram Desktop: a system webview (WebView2 on Windows, WebKitGTK on Linux). This is common knowledge, not taken from the docs.
- Telegram macOS: WKWebView.
- Telegram Web (`weba`/`webk`): an iframe in the user's browser.

**Audio on iOS** (WebKit bugs [240646](https://bugs.webkit.org/show_bug.cgi?id=240646), [263627](https://bugs.webkit.org/show_bug.cgi?id=263627), [243727](https://bugs.webkit.org/show_bug.cgi?id=243727)):
- Create or `resume()` the `AudioContext` inside the first `touchend` / `click` / `pointerup` handler, and play a silent 1-sample buffer.
- On `deactivated`, call `ctx.suspend()`. On `activated` or the next tap, call `resume()`.
- `state` can read `"running"` while nothing is audible, or `"interrupted"` after a call. The fix is to recreate or resume the context on the next gesture.
- The ring/silent switch mutes Web Audio. Feature-detect `navigator.audioSession` and use `'ambient'`, which respects the switch, or `'playback'`, which ignores it. The `unmute` library (https://github.com/swevans/unmute) is a workaround. Howler.js handles the unlock step.
- Keep SFX in a single audio sprite.

**Lifecycle:**
- Pause the requestAnimationFrame loop, timers and audio on `deactivated` (8.0+). Fall back to `visibilitychange` on older clients.
- Turn on `enableClosingConfirmation()` during a run, and save often (`DeviceStorage`, then `localStorage`, then `CloudStorage` for a small summary).

**WebGL context loss** (minimize/background, memory pressure, the Android GPU process being killed):
- Listen for `webglcontextlost` and call `preventDefault()`. On `webglcontextrestored`, re-upload textures.
- Keep atlases at 2048² or smaller. If you use PixiJS (8.22.0 is current), test that context restore actually works.

**Low-end Android:**
- Read the performance class from the UA (`LOW`/`AVERAGE`/`HIGH`). On LOW: cap `devicePixelRatio` at 1–1.5, turn off the CRT/scanline shader and particles, and optionally lock to 30 fps.
- Animate only `transform` and `opacity`. Avoid `backdrop-filter`, large `box-shadow`s and CSS `filter`s.

**Viewport and keyboard:**
- Don't use `100vh`. Use `height: var(--tg-viewport-stable-height, 100dvh)` and `position: fixed; inset: 0`.
- Padding: `calc(var(--tg-safe-area-inset-top) + var(--tg-content-safe-area-inset-top))` on top, and likewise for the bottom.
- Re-layout only on `viewportChanged` when `isStateStable` is true, and on `safeAreaChanged`.
- On Android the keyboard resizes the webview; on iOS it overlays it. Best to avoid text inputs entirely and use the Telegram name. Otherwise call `hideKeyboard()` (9.1+) after submit.

**Swipe-to-close vs dragging cards:**
- Call `disableVerticalSwipes()` (7.7+). Swiping the header can still close the app.
- Use Pointer Events with `touch-action: none` on the card and hand areas, plus `setPointerCapture`.
- For clients below 7.7, use the "sticky app" trick: `body{overflow:hidden}` with an inner scroll container (https://docs.telegram-mini-apps.com/platform/sticky-app).
- Set `overscroll-behavior: none` on `html` and `body`.

**Selection, callout and zoom prevention:**
- Viewport meta: `width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover`. WKWebView honors scale limits, unlike Safari.
- CSS: `user-select:none; -webkit-user-select:none; -webkit-touch-callout:none; -webkit-tap-highlight-color:transparent;`, and `touch-action: manipulation` on buttons.
- Prevent the `contextmenu` event. On images: `draggable="false"`, `-webkit-user-drag:none`.

**Pixel-art rendering:**
- Render at a fixed low internal resolution (e.g. 360×640 logical), then scale up by an integer factor with NEAREST filtering.
  - WebGL: `NEAREST` texture filtering.
  - Canvas 2D: `ctx.imageSmoothingEnabled=false`.
  - CSS: `image-rendering: pixelated`.
- Backing store = CSS size × min(devicePixelRatio, 2), rounded.
- Letterbox to keep portrait proportions on desktop and in landscape.

**Desktop and Web:**
- The app opens in a resizable window. `expand` has no effect, haptics do nothing, and vertical swipes don't apply.
- Fullscreen may raise `fullscreenFailed: UNSUPPORTED`. Which platforms support it is unverified, so handle the event.
- Use `BackButton` for navigation, since it shows up in the header.
- Avatars: `photo_url` may be SVG. Showing it in a DOM `<img>` is fine. Drawing it onto a WebGL canvas needs CORS headers (unverified), so proxy it through the Worker if needed.

**Debugging** (https://core.telegram.org/bots/webapps#testing-mini-apps):
- **iOS:** tap Settings 10 times → enable "Allow Web View Inspection" → connect by USB → Mac Safari → Develop → [device].
- **Android:** turn on USB debugging. In Telegram Settings, long-press the version number twice → "Enable WebView Debug" → open `chrome://inspect/#devices`.
- **Telegram Desktop (Windows/Linux):** Beta build → Settings → Advanced → Experimental → "Enable webview inspection" → right-click → Inspect.
- **Telegram macOS:** Beta build → click Settings 5 times → "Debug Mini Apps".
- **Test environment:**
  - iOS: tap Settings 10 times → Accounts → Login to another account → Test.
  - Desktop: Shift+Alt+right-click "Add Account".
  - macOS: ⌘+click "Add Account".
- **Local HTTPS:** a cloudflared quick tunnel pointed at the Vite dev server. **Since Bot API 10.2 the URL in BotFather must be that tunnel's domain**, so use a separate dev bot.
- On devices without an inspector, load eruda with `?debug=1` or a `start_param` flag.

---

## 6. Policies for a poker-themed game with no payments

**Gambling:**
- Neither the Mini Apps ToS (https://telegram.org/tos/mini-apps) nor the Bot Developer Terms (https://telegram.org/tos/bot-developers) bans card or poker themes.
- §5.2(h) of the Developer Terms forbids "illegal, pirated, **regulated** or questionable goods and services", and real-money gambling is regulated.
- **A poker-hand-scoring roguelike with no stakes, nothing to buy, no prizes and no cash-out is not gambling**, so it is fine. Never add betting in Stars or TON, prizes of value, or paid loot boxes.
- Telegram Ads guidelines §5.6 (https://ads.telegram.org/guidelines) ban ads for gambling "involving real money, prizes, or goods of any value". Simulated gambling isn't mentioned.
- Precedent: PEGI moved Balatro from 18 to 12 on appeal, citing "mitigating fantastical elements" (https://www.techradar.com/gaming/balatro-has-had-its-pegi-18-age-rating-overturned-following-appeal-i-hope-this-change-will-allow-developers-to-create-without-being-unfairly-punished).
- Avoid casino or betting wording ("bet", "jackpot", "casino") in the name, description and any ads.

**Payments:**
- §6.2: digital goods and services **must** be sold only for Telegram Stars, with `/paysupport` support. With **no payments, nothing applies**.
- If you ever add tips or unlocks: Stars (`XTR`) via `createInvoiceLink` plus `WebApp.openInvoice`.
- Featuring in the Mini App Store favors apps that accept Stars. That is optional, not a requirement.
- Crypto rules (§7, TON-only): stay away from tokens and wallets entirely.

**Branding and IP:**
- §5.2(c) forbids impersonating any entity that hasn't authorized you. §8.1 forbids using Telegram's IP.
- **Don't use the "Balatro" name, its logo, sprites, joker art or exact UI assets.** Its owners (LocalThunk / Playstack) haven't authorized you. Copying the *style* with original art and an original name is the safe path. Check the license of any pixel font you use.

**Data:**
- Store only what you need (user id, display name, score).
- §4 forbids collecting data beyond what's essential, and you need a privacy policy (the Standard Policy applies by default).
- Players' names and photos appear on the leaderboard, so let players hide them or use only first name or `@username`.