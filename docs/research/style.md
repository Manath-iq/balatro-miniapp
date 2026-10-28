# Research report: Balatro-grade style for an original portrait poker-roguelite (Telegram Mini App)

Checked 2026-10-28. "Verified" means I checked it myself (Google Fonts metadata API, npm/PyPI registries, GitHub API, primary pages). Claims about Balatro's internals come from secondary sources or play observation and are marked as such.

---

## 0. TL;DR

- **What makes Balatro look premium.** It is not one effect but four layers stacked:
  1. A low-saturation slate UI with a few loud colours that each carry meaning.
  2. A live procedural background that reacts to game state.
  3. Every number and card animated in sequence, each change paired with a sound.
  4. A full-screen CRT pass on top, with a slider to tone it down.
- **Portrait is open ground.** Balatro mobile is landscape-only and uses drag-to-zone controls ([Shacknews](https://shacknews.com/article/141549/balatro-mobile-impressions)). A one-thumb vertical layout is our own design territory.
- **Web stack.**
  - Background: a WebGL2 shader rendered at very low resolution and scaled up with nearest-neighbour.
  - Game: a single canvas (PixiJS 8.22 + pixi-filters 6.1.5, which includes `CRTFilter`, `AdvancedBloomFilter`, `PixelateFilter`, `ShockwaveFilter`; verified on npm) or DOM with CSS transforms.
  - Motion: springs written by hand.
  - CRT: a cheap CSS overlay on weak phones, a final shader pass on strong ones. Pick per device using Telegram's `LOW/AVERAGE/HIGH` performance class.
- **Fonts.** Use **Tiny5** for UI and numbers, and **Pixeloid Sans** for body and joker text. Both are OFL with verified Cyrillic.
- **Art pipeline.**
  1. Generate in ChatGPT Images on a flat chroma background, at a declared grid.
  2. Recover the pixel grid with `proper-pixel-art` 2.0.0 or `spritefusion-pixel-snapper`.
  3. Map to our fixed palette without dithering.
  4. Make alpha binary and redraw the outline in code.
  5. Do a hand pass in Pixelorama or Aseprite.
- **Do not reuse** Balatro's font (m6x11plus), its red-mult/blue-chips pair, its shader code, its edition names (Foil/Holo/Polychrome/Negative) or its layout.

---

## 1. Balatro's visual and feel language

### 1.1 Palette

- **Neutral base.** UI panels are dark blue-grey slate with rounded corners and a darker drop shadow underneath (buttons appear to sink when pressed). This keeps the busy background and the loud signal colours from fighting each other.
- **Signal colours, one meaning each.** Chips are blue (`#009dff`), mult is red (`#fe5f55`), money is gold. A third-party breakdown lists these hex values; it is not developer documentation ([Blake Crosley](https://blakecrosley.com/guides/design/balatro)). Joker rarity is also colour-coded: common blue, uncommon green, rare red, legendary purple. Card sets (Tarot, Planet, Spectral) each have their own colour.
- **Background colour carries state.** The swirl changes colour with the blind type or boss and with the type of pack being opened.
- **Accessibility option.** "High Contrast Cards" changes the suit colours: clubs become light blue, diamonds orange, hearts a more saturated red, spades darker ([balatrowiki Options](https://balatrowiki.org/w/Options)).
- **What we take from this:** a neutral field plus 3–4 loud colours with fixed meanings. A four-colour deck by default is both more readable on a small screen and visibly not Balatro.

### 1.2 Post-processing

- The whole frame gets a CRT pass: scanlines, slight tube curvature, vignette and noise. It has its own slider in Graphics settings, and 0 turns it off ([Steam thread](https://steamcommunity.com/app/2379780/discussions/0/4201364375109001844)).
- Bloom is a separate toggle ([same thread](https://steamcommunity.com/app/2379780/discussions/0/4201364375109001844)). Shadows and CRT can both be disabled ([Family Gaming Database](https://www.familygamingdatabase.com/accessibility/Balatro)).
- Players mention a "smooth pixels" option: sprites are filtered when rotated or scaled, not hard nearest-neighbour ([Steam](https://steamcommunity.com/app/2379780/discussions/0/4346606879520736858)). **This matters.** Balatro's sprites rotate and wobble freely while still reading as pixel art. See the sampler in §3.3.
- **Lesson:** any heavy effect needs a slider. Players do complain about haze and motion.

### 1.3 The animated paint swirl (concept only)

Reconstructed from community ports. One port is marked CC0, but its own comments say it was adapted from Balatro's source, so a third party's CC0 label does not clear LocalThunk's rights. **Do not use it.** The steps below are the general technique ([godotshaders port description](https://godotshaders.com/shader/balatro-paint-mix/)):

1. **Pixelate the coordinates first.** Snap each fragment's UV to a coarse grid (`floor(uv*N)/N`) so the result comes out as chunky blocks.
2. **Polar swirl.** Rotate each point by an angle that depends on its distance from the centre, plus a slow time term. Points near the centre turn more, which gives the whirlpool.
3. **Iterative domain warp.** Loop a few times (the port uses 5), each time adding sine/cosine offsets that depend on the current coordinates and time. This folds space into a marbled, oil-paint look. Inigo Quilez's [domain warping article](https://iquilezles.org/articles/warp/) is the clean reference for the general idea.
4. **Scalar to bands.** Take the length of the warped vector, scale it by a contrast term, clamp it, and split it into 2–3 weights that mix 3 colours. Higher contrast gives harder band edges.
5. **Drive it from gameplay.** Colours and spin speed or amount are uniforms. The game changes them with state (boss, pack, menu).

What we should do differently is covered in §3.1: fbm-noise warp instead of a sine loop, banding through a palette lookup texture, and Bayer dither at the band edges.

### 1.4 Type and text effects

- **Font.** In-game text uses Daniel Linssen's m6x11 family. Balatro ships `m6x11plus.ttf`, and a fan added Cyrillic because the Russian localisation font looked off ([Natto Games](https://nattogames.itch.io/m6x11cyrillic), [managore](https://managore.itch.io/m6x11)). **Avoid this font family.** It is the most recognisable part of Balatro's identity.
- **Per-glyph text objects** (from play observation):
  - Each letter is its own sprite with offset, rotation and scale.
  - Titles float in a sine wave, each letter out of phase with the next.
  - Notifications pop in letter by letter with overshoot.
  - Numbers "bump" (a quick scale impulse) every time they change.
  - Every glyph has a 1-px dark shadow so it stays readable over the moving background.
- **Huge numbers** switch to e-notation.

### 1.5 Card "juice" (play observation, partly confirmed by [Crosley](https://blakecrosley.com/guides/design/balatro); his CSS numbers are illustrative, not the game's)

| Moment | What happens |
|---|---|
| Idle | Cards in hand and jokers bob and rotate slightly, each out of phase with the others |
| Hover/press | Scale up a little and a fake-3D tilt toward the pointer. Tooltip with the card's description. |
| Drag | The card leans in the direction it is moving, in proportion to velocity. Neighbouring cards slide aside to make room. |
| Select | Lifts up with springy overshoot |
| Play | Cards fly to the play area. Each scoring card in turn does a scale-pop and rotation wiggle, and a "+N" pops above it in the chips colour. The chips counter bumps. |
| Jokers | Trigger left to right. The triggering joker shakes, and "+Mult" / "×Mult" text pops out. |
| Resolve | Chips × mult is calculated, then the total counts up into the round score. If one hand beats the whole blind target, the chips/mult boxes catch fire, and the fire is stronger the bigger the overshoot. |
| Big score | Screen shake scales with magnitude. Crosley gives tiers of roughly 2/4/8 px over 0.2/0.3/0.5 s, but those are his illustration. |
| Destroy | Card burns away with a noise-threshold dissolve and a glowing edge |
| Editions | Foil, Holographic, Polychrome and Negative are shader overlays on the card |

### 1.6 Sound

- **Music.** One theme by LouisF with variants per context (main, shop, Tarot pack, and so on, listed as separate tracks on [Last.fm](https://www.last.fm/music/LouisF/_/3+Tarot+Pack+Theme)). In play they behave like stems of the same tempo and key that crossfade without seams. That is my observation, not a documented fact.
- **Sound effects.** Short and dry: card flicks, chip ticks, a distinct mult sound, coin jingles. Successive scoring triggers rise in pitch, which builds tension through the sequence. Crosley describes C-D-E-F-G for a 5-card hand ([source](https://blakecrosley.com/guides/design/balatro)); the exact intervals are unverified.
- **Mobile.** Light haptics on card taps, button presses and when the hand is dealt ([Shacknews](https://shacknews.com/article/141549/balatro-mobile-impressions)).

### 1.7 Pacing

- Strictly one event at a time, left to right. The order *teaches* the player which combinations matter.
- Game Speed setting tops out at 4×, and players still ask for faster; mods go to 16× ([Steam](https://steamcommunity.com/app/2379780/discussions/0/6426156954538745672)). **Lesson:** ship 1×/2×/4× and tap-and-hold to fast-forward from day one, and shorten each beat when a hand has many triggers.

### 1.8 Mobile port facts

- **Landscape only.** A company rep said there would be no portrait at launch ([Shacknews](https://shacknews.com/article/141549/balatro-mobile-impressions), [Reddit summary](https://reddit.ny4.dev/r/iosgaming/comments/1f9nrx0/balatro_coming_to_apple_arcade)). It released on iOS, Android and Apple Arcade on 2024-09-26 with "Remastered Controls for touch" ([Gematsu](https://www.gematsu.com/2024/09/balatro-coming-to-ios-android-and-apple-arcade-on-september-26)).
- **Tap-then-button became drag-to-zone.** Drag a pack to the top to buy it, drag a Planet to the right to buy and use it, drag a card to the top-right to sell it ([Shacknews](https://shacknews.com/article/141549/balatro-mobile-impressions)).
- **Review complaints** ([Engadget](https://www.engadget.com/gaming/balatro-is-an-almost-perfect-mobile-port-163050971.html)):
  - Accidental taps on the Skip button in packs, which lost the player Jokers or Spectral cards.
  - Text is hard to read on tiny screens.
  - Foldables' extra vertical space goes unused.
- **Implications for us:**
  - Put destructive actions behind a hold or confirm.
  - Long-press shows details (there is no hover on touch).
  - Use drag zones, but always keep a tap fallback.

---

## 2. Translating this to an original 9:19.5 portrait direction

### 2.1 Principles, Balatro's version, and ours

| Principle | Balatro | Ours |
|---|---|---|
| Neutral field plus loud signal colours | slate panels; blue chips / red mult | our own palette pairs (below). Four-colour deck by default. |
| Live background as a state signal | polar paint swirl | a different motif per direction: kaleidoscope rug, neon puddle, ink-in-water. Palette lookup bands with dither. |
| Every number is an event | "+N" pops, counter bumps | the same principle, but pops come out of a themed object (ticket stub, token, bubble) |
| A frame that makes it feel premium | full CRT | a themed screen frame (kinescope bezel, neon glass, porthole) with a lighter CRT |
| Sequential scoring | left to right in landscape | **top to bottom in portrait:** jokers rail → score panel → played row → hand. The eye follows the cascade downward. |

### 2.2 Portrait layout (internal art canvas ≈ 270 px wide, height flexes from about 540 to 640)

| Zone (top → bottom) | Approx. art px |
|---|---|
| `contentSafeAreaInset.top` (Telegram's fullscreen header) | reserved |
| Blind/target and money bar | 28–36 |
| Joker rail: 5 × 48×66 cards, swipe sideways if there are more | ~72 |
| Score panel: points × mult boxes, hand name, round total | 70–90 |
| Play area: 5 played cards | ~80, absorbs the spare height |
| Consumables, hands/discards counters, deck | ~40 |
| Hand: 8 cards fanned, overlapping about 30 px, on an arc | ~90 |
| Play / Discard buttons in the thumb zone, plus `safeAreaInset.bottom` | ≥34 |

**Gestures**
- Tap to select. Drag sideways to reorder.
- Swipe the selection up past a line to play it, and down to discard. Draw the drop zones while dragging. Keep buttons as a fallback.
- Long-press shows the tooltip.

**Telegram setup**
- Call `disableVerticalSwipes()` (Bot API 7.7). Without it, vertical drags collapse the sheet.
- Call `requestFullscreen()` and `lockOrientation()` (both 8.0).
- Lay out with the CSS variables `--tg-safe-area-inset-*`, `--tg-content-safe-area-inset-*` and `--tg-viewport-stable-height` instead of `100vh`. All from [core.telegram.org/bots/webapps](https://core.telegram.org/bots/webapps).

**Haptics** (`HapticFeedback`, 6.1+)
- `selectionChanged()` when reordering.
- `impactOccurred('light')` when selecting, `'rigid'` on each scoring tick (rate-limited).
- `notificationOccurred('success')` when the blind is cleared.
- `DeviceOrientation` / `Gyroscope` (8.0, `refresh_rate` 20–1000 ms) can drive foil parallax in place of hover tilt.

### 2.3 Three original palette and motif directions

Each palette is a **5–8 step background/neutral ramp**, **two scoring signal ramps**, **money**, **danger/boss**, **rare**, and **a white reserved for flashes**. Shadows shift cooler and highlights warmer, as in standard pixel-art practice.

**A. "Неоновый ломбард" (Neon Pawnshop, synth-noir night market).** 20 colours.
- **Motif:** perforated pawn-ticket labels, neon-tube outlines with bloom, brass tokens with a hole as currency, rain-streak particles, a shop behind a cage grille.
- **Background:** "neon reflected in a puddle", meaning warped bands plus vertical ripple streaks.
- **Roles:** points = teal, mult = sodium orange, money = brass, boss = neon pink.

```
bg/neutral : #0B0912 #171226 #251B3A #382852 #54407A #7D67A8 #B9A9D9 #F1EAFB(card face)
points     : #0B5C5A #15A898 #6FF2D8
mult       : #9C3A0C #F07A1A #FFC46B
money      : #7A5A1C #D9AE3F
boss       : #8E1550 #FF3E86
rare       : #9BE03A          flash: #FFFBEF
suits      : ♥ #FF3E86  ♦ #F07A1A  ♣ #15A898  ♠ #382852
```

**B. "Автомат-87" (Soviet-era arcade hall and wall carpet).** 22 colours, warm CRT tint.
- **Motif:** enamel-badge buttons with a 1-px brass rim, brass tokens (жетоны), a kinescope TV bezel framing the screen, card backs in a carpet ornament.
- **Background:** a breathing kaleidoscope carpet (polar coordinates with 8-fold angular repeat, then warp).
- **Sound:** relay clicks, a coin-slot clunk, a typewriter bell when the round is won.
- Keep it domestic and nostalgic. No state symbols.
- **Roles:** points = malachite, mult = enamel red, money = brass.

```
carpet/bg  : #140B0A #2C1210 #4D1A16 #7E2219
mult       : #B8371F #E8693A #F5A35E
cream      : #F3E2C3(card face) #FFF7E6
points     : #12302B #23594B #3E9677 #94D9B4
ink/info   : #121A33(text/outline) #2A3F78 #5C7FC4
money      : #6B4E1A #C79A36 #F2D57E
greys      : #4A3F3B #8F8178 #C9BDB0
suits      : ♥ #B8371F  ♦ #C79A36  ♣ #3E9677  ♠ #2A3F78
```

**C. "Бездна" (Abyssal Lounge, bioluminescent deep-sea casino).** 20 colours.
- **Background:** slow ink-in-water warp with bright caustic ridges (ridged noise), 2×2-px bubbles rising, "marine snow" particles.
- **Cards:** nacre face; foil is a mother-of-pearl shimmer quantised to six palette steps.
- **Panels:** bubble glass.
- **Sound:** low-pass filtered music in menus, sonar pings for points (rising pitch), bubble pops for mult.
- **Roles:** points = bioluminescent mint-cyan, mult = coral, money = pearl gold, rare/boss = jelly violet.

```
bg/neutral : #03060D #08131F #0E2232 #153447 #1F4D5F #2F6E78 #5FA6A0 #BFEFE2
points     : #0FB39A #2FF0C8 #A9FFF0
mult       : #8A1F4A #FF5A86 #FFB0C2
money      : #9C7A3A #F2D48C
rare/boss  : #3B2470 #8E62FF
card       : #E9F2EF(face) #141A26(ink/outline)
```

**Rules for all three directions**
- The background only ever uses the low-contrast 3–4 darkest steps.
- Signal colours appear only on gameplay numbers and pops.
- The flash white is reserved for hits.
- Every number gets a 1-px dark outline plus a drop shadow.
- [Lospec palette list](https://lospec.com/palette-list) is useful for sanity-checking ramps.

---

## 3. Web technique list

### 3.1 Background: WebGL2 fragment shader, rendered small, scaled up with nearest-neighbour

**Pipeline**
1. Use a separate `<canvas>` (or the first pass of the game canvas) at **1/3 to 1/6 of the art resolution**, for example 90×195. That is about 17k fragments, which is trivial even with 5 warp steps.
2. Upscale with CSS `image-rendering: pixelated`, or with a nearest-sampled blit.

**Shader steps (our variant)**
1. `uv` → snap to the block grid.
2. Rotate by `uTime*speed`, plus a swirl term `k*r` or `k/(r+ε)`. Direction B instead does a polar kaleidoscope fold (`a = mod(atan, 2π/N)`, then mirror).
3. Domain-warp with fbm (`p += A*vec2(fbm(p+t), fbm(p+5.2−t))`, 2–3 octaves × 2 warps).
4. Quantise the scalar `v` into 4–6 bands.
5. Add a 4×4 Bayer offset (`v += (bayer(gl_FragCoord)−0.5)/bands*0.6`) so band edges dither in a pixel-art way instead of looking smooth.
6. Look up the colour in a **1-D palette texture** (8–16 texels, `NEAREST`). Swap the texture or crossfade between two to change state (boss, shop, pack).

**Gameplay hooks:** on big hits, briefly raise `uSpeed`, `uSwirl` and contrast, then let a spring bring them back down. This is the "the world reacts" feel.

**Performance on mid-range Android WebView**
- Context flags: `{antialias:false, alpha:false, depth:false, stencil:false, preserveDrawingBuffer:false, powerPreference:'default'}`.
- Use `precision mediump float` and wrap time so it doesn't grow large (`uTime = (now/1000) % 600.0`). Many mobile GPUs run mediump as fp16, and `sin()` of a large time value starts to jitter.
- Redraw the background at **20–30 fps** (15 on LOW). Stepped motion also reads as more pixel-art.
- Pause on `visibilitychange` and on Telegram's `deactivated` event (8.0), and check `isActive`.
- Handle `webglcontextlost` and restore. Keep one WebGL context only.
- Cap device pixel ratio for the game canvas. Fill-rate, not geometry, is what kills mobile GPUs ([PlayCanvas](https://developer.playcanvas.com/user-manual/optimization/runtime-devicepixelratio/), [three.js forum](https://discourse.threejs.org/t/low-fps-on-ios-mobile-with-pixel-ration-set-as-window-devicepixelratio/4963)).
- **Quality tier from Telegram's user agent.** Android sends `Telegram-Android/{ver} ({manufacturer} {model}; Android {v}; SDK {n}; {LOW|AVERAGE|HIGH})` ([docs](https://core.telegram.org/bots/webapps)), so `/; (LOW|AVERAGE|HIGH)\)/.exec(navigator.userAgent)` gives the tier.

| Tier | Background res / fps / warp steps | Device pixel ratio cap | Bloom | CRT | Particle cap |
|---|---|---|---|---|---|
| LOW | 1/6 / 15 / 2 | 2 | off | CSS only | 40 |
| AVERAGE | 1/4 / 30 / 3 | 2.5 | at 1/4 res | CSS or light shader | 120 |
| HIGH / iOS | 1/3 / 30 / 5 | 3 | on | full shader | 300 |

- WebGL2 support: Chrome 56+, Safari/iOS 15+, about 97% global ([caniuse data](https://github.com/Fyrd/caniuse/blob/main/features-json/webgl2.json)).
- Fallback order: GLSL ES 1.0 build → looping lossless animated WebP.

### 3.2 Rendering architecture

- **Recommended:** one PixiJS v8 canvas (pixi.js 8.22.0, pixi-filters 6.1.5 with peer `pixi.js >=8`; verified on npm).
  - The UI can be DOM layered over it, but then it isn't affected by the shader CRT.
  - Phaser 4 is now stable (4.0.0 released 2026-04-10, latest 4.2.1) if you prefer a fuller engine.
- **Sprites** are drawn at output resolution, positioned in art units, sampled with the "smooth pixel" sampler (§3.3). That way the ±3° wobble and pop scaling don't crawl or shimmer.
- **Text:** bake the pixel font into a bitmap atlas at its design size (Pixi `BitmapFont.install`, `scaleMode:'nearest'`). Per-glyph wave and jitter then cost almost nothing.

### 3.3 Card wobble, tilt and pop (springs)

```js
// one spring per channel (x, y, rot, scale); run 2–4 fixed substeps per frame
function spring(s, target, k, zeta, dt){        // s = {x, v}
  const c = 2*zeta*Math.sqrt(k);                // damping from damping ratio, mass 1
  s.v += (-k*(s.x-target) - c*s.v)*dt;          // semi-implicit Euler: stable
  s.x += s.v*dt;
}
```

**Starting values**

| Effect | Setting |
|---|---|
| Select lift | target y −10 art px, k≈500, ζ≈0.5 |
| Drag follow | k≈900, ζ≈0.8 |
| Drag lean | `rotTarget = clamp(vx*0.0004, −0.2, 0.2)` rad, springs back to 0 |
| Score pop | add `scale.v += 8`, `rot.v += ±(4–8)` |
| Idle sway | `rot = 1.5°·sin(1.4t+φᵢ)`, `y = 0.7px·sin(1.1t+φᵢ)` |
| Fake-3D tilt | CSS `perspective(400px) rotateX/rotateY` from touch offset or `DeviceOrientation`; in Pixi, a vertex skew |

**Smooth-pixel sampler** (texture set to LINEAR; keeps pixels crisp under rotation and scale; widely known `fwidth` technique):

```glsl
vec2 p = vUv*uTexSize; vec2 s = floor(p+0.5);
p = s + clamp((p-s)/fwidth(p), -0.5, 0.5);
o = texture(uTex, p/uTexSize);
```

**Screen shake.** Use the trauma model: `shake = trauma²` × Perlin noise, trauma decays at about 1/s, and each event adds `≈ 0.1·log10(gain)` ([Eiserloh, GDC 2016 "Juicing Your Cameras With Math"](https://www.gdcvault.com/play/1023557/Math-for-Game-Programmers-Juicing)).

**Count-up.** easeOutCubic over 400–900 ms. Bump the number's scale on each step change, rate-limit tick sounds to about 20/s, switch to e-notation above about 1e11.

**Pacing.**
- At 1×: 140 ms per scoring card, 220 ms per joker, about 350 ms hold before the multiply.
- Each beat: `base·max(0.35, 1/√(n/6))` when there are many events.
- Pitch per trigger: `playbackRate = 2^(i/12)`, capped at +12 semitones, ±2% random jitter.
- Use Web Audio, and unlock the audio context on the first tap.

**DOM UI springs.** CSS `linear()` can encode a spring curve (Chrome 113+, Safari 17.2+, Firefox 112+). Generate curves with [linear-easing-generator](https://linear-easing-generator.netlify.app/). Libraries if wanted: Motion 14.7.1 (MIT), GSAP 3.15.0 ("standard no-charge" licence) (both verified on npm).

### 3.4 CRT overlay

**(a) CSS, nearly free.** A `pointer-events:none` fixed layer:
- Scanlines: `repeating-linear-gradient(to bottom, rgba(0,0,0,.2) 0 var(--sl), transparent var(--sl) var(--period))`.
  - Set `--period = artScale/devicePixelRatio` px (one art row) and `--sl = 1/devicePixelRatio` px (one device row), computed in JS. Otherwise you get moiré.
- Vignette: `radial-gradient(transparent 55%, rgba(0,0,0,.45))`.
- Limits: no curvature. Don't add a flicker animation.

**(b) Final shader pass** (Pixi `CRTFilter`, or your own):
- Scanlines tied to art rows: `fract(uv*artH)`.
- Barrel distortion of at most 2–3%. Also map touch input through the same distortion, or keep curvature only at the frame edges.
- Red/blue channel offset of about 0.5–1 device px.
- Vignette, grain, and bloom computed at 1/4 resolution.

Always expose a CRT slider and a bloom toggle, as Balatro does.

### 3.5 Holographic / foil cards

**CSS version**
- Layers: a pseudo-element with `linear-gradient(115deg, …)` whose `background-position` is driven by `--px/--py` (from touch or gyro), `mix-blend-mode: color-dodge` or `overlay`, `filter: brightness() contrast() saturate()`, and `mask-image` to limit it to the art window.
- Sparkle: a small noise PNG with `screen` blend.
- Animate only the active card. Blend modes and filters are expensive in WebView.
- Reference: [simeydotme/pokemon-cards-css](https://github.com/simeydotme/pokemon-cards-css). **It is GPL-3.0: study the technique, don't copy the code.**

**Shader version (more distinctive)**
1. `hue = fract(dot(cellUV, dir)*bands + tiltAngle*k + t*0.05)`, where `cellUV = floor(uv*artSize)/artSize` so the foil moves in whole art pixels.
2. Quantise the hue to 6–8 colours from **our palette**, not a smooth rainbow.
3. Mask it with a per-card foil mask.
4. Twinkle: `hash(cell) > 0.97` pulsing with time.
5. Blend with screen/add at 30–60%.

**Invent our own edition names and looks**, for example A: Neon / Chrome, B: Enamel / Gilt, C: Nacre / Phosphor.

**Dissolve:** threshold on noise, about 0.6 s, with an accent-coloured edge band, quantised to art pixels.

---

## 4. Pixel fonts with Cyrillic

"GF meta" means verified against the live Google Fonts metadata API today.

| Font | Cyrillic | Licence | Source | Design size | Notes |
|---|---|---|---|---|---|
| **Tiny5** | ✅ (GF meta: cyrillic, cyrillic-ext, greek, latin) | OFL 1.1 | [GF](https://fonts.google.com/specimen/Tiny5) · [GitHub](https://github.com/Gissio/font_Tiny5) | 5-px glyphs; set at multiples of 8 px | The upstream repo (updated 2026-10-09) and google/fonts main already ship a variable version with axes **wght, wdth, ROND, BLED, JITT (jitter)** plus italic, and a **Tiny5 Duo** (double stems) for headings. The live API is still static (lastModified 2025-05-30), so take the variable files from GitHub. |
| **Pixeloid** (Sans / Sans Bold / Mono) | ✅ (Russian, Ukrainian, Bulgarian, Belarusian, Serbian, Macedonian listed) | OFL 1.1 | [itch](https://ggbot.itch.io/pixeloid-font) | 9 px (use 9/18/36) | Best for readable body and joker-description text |
| Pixelify Sans | ✅ (GF meta: cyrillic, latin, latin-ext) | OFL | [GF](https://fonts.google.com/specimen/Pixelify+Sans) · [GitHub](https://github.com/eifetx/Pixelify-Sans) | outline font in pixel style; variable weight 400–700; grid not documented | Good for big titles; check crispness at your scale |
| Press Start 2P | ✅ (GF meta: cyrillic, cyrillic-ext, greek) | OFL | [GF](https://fonts.google.com/specimen/Press+Start+2P) | 8×8, multiples of 8 | Very wide. Russian runs long, so numbers and short labels only. |
| monogram | ✅ (Russian listed) | CC0 | [itch](https://datagoblin.itch.io/monogram) (v1.1.0, 2024-03-15) | monospace, 5-px advance | Good for counters and debug |
| DotGothic16 | ✅ (GF meta) | OFL | [GF](https://fonts.google.com/specimen/DotGothic16) | 16×16 dot | Softer, Japanese-retro feel |
| Handjet | ✅ (GF meta, many scripts) | OFL | [GF](https://fonts.google.com/specimen/Handjet) | variable dot-matrix built from 23 element shapes | LED scoreboard digits |
| Silver | ✅ (Russian, Ukrainian, Bulgarian) | CC BY 4.0 (credit required; projects over $100k must contact the author) | [itch](https://poppyworks.itch.io/silver) | not stated | |
| ⛔ m6x11plus / m6x11cyrillic | ✅ | attribution | [itch](https://nattogames.itch.io/m6x11cyrillic) | 16/32/48 | **This is Balatro's font. Don't use it.** |
| ❌ No Cyrillic | Silkscreen, VT323, Jersey 10/15/20/25, Micro 5, Sixtyfour, Bytesized, Workbench, Doto, Bitcount, Geist Pixel, Coral Pixels (GF meta); Cozette (Cyrillic only on its roadmap, [README](https://github.com/slavfox/Cozette)); Ark/Fusion Pixel (pan-Latin + CJK) | | | | Rubik Pixels has Cyrillic but is a textured outline font, not a real pixel grid |

**Top 2:** **Tiny5** (with Tiny5 Duo) for HUD, numbers, buttons and headings, and **Pixeloid Sans** for descriptions.
- Before committing, test the hard Cyrillic letters ё й щ ъ ы ж ю at 1×.
- Self-host woff2 subset to Latin + Cyrillic.
- Bake both into bitmap atlases at their design sizes.

---

## 5. Pipeline: ChatGPT-generated art → clean, consistent pixel art

### 5.1 Model state (Oct 2026)

- **ChatGPT Images 2.0 / `gpt-image-2`:** released 2026-04-21 (API) and 2026-04-22 (ChatGPT). Better multi-image consistency, up to 8 images per prompt, aspect ratios from 3:1 to 1:3 ([designcompass](https://designcompass.org/en/2026/04/22/chatgpt-image-2-0-public/), [thurrott](https://thurrott.com/a-i/openai-a-i/335196/openai-announces-chatgpt-images-2-0)).
- **ChatGPT Images 2.5:** released 2026-09-08. API models `gpt-image-2.5-flare` (fast) and `gpt-image-2.5-sunburst` (precise edits) ([datanorth](https://datanorth.ai/news/openai-launches-chatgpt-images-2-5)).
- **Transparency in the API:** `background:"transparent"` with `output_format:"png"|"webp"` ([OpenAI docs](https://developers.openai.com/api/docs/guides/image-generation)). It reached gpt-image-2 as a preview around 2026-08-21, and OpenAI advises *not* describing a background in the prompt when using it ([the-decoder](https://the-decoder.com/openais-gpt-image-2-can-now-generate-images-without-a-background/)).
- **`gpt-image-1`** was shut down 2026-10-23 (OpenAI docs).
- **In the ChatGPT UI, transparency is less reliable**, so use a chroma background (below).

### 5.2 Prompt patterns

- **Lock a style bible first.** Make a palette swatch PNG and a "style anchor" sheet of 6–8 approved sprites, and attach both to every request.
- **Generate sheets, not single sprites.** Ask for "4 sprites on a 2×2 grid", or edit an existing sheet ("replace sprite 3 with …"). This keeps style consistent.
- **AI draws only the illustration** inside a fixed art window, for example 40×40. Card frames, pips, rank glyphs, 9-slice panels and **all text (including Cyrillic)** are made in code, so they are perfectly consistent.
- **Template (English works most reliably):**

  > "Pixel art game sprite of {subject}. True low-resolution pixel art on a {48×48} grid, each pixel rendered as a crisp {16×16} block, no anti-aliasing, no blur, no gradients, no noise. Limited palette, use ONLY these colors: {hex list}. 1-pixel outline in {#141A26}, 2–3 flat shading steps, light from top-left. Centered, occupies ~80% of the frame, single object, no text, no ground shadow. Solid flat {#FF00FF} background. Match the style of the attached reference sheet exactly (same pixel size, outline, palette)."

  For the API with transparency, drop the background sentence and set `background:"transparent"`.
- **Ask for a declared grid at about 16 px per art pixel.** Grid detection then becomes almost exact.
- **Use a chroma colour that is not in the palette** (magenta). After quantisation it maps to exactly one index, which becomes alpha 0.

### 5.3 Cleanup tools (all verified to exist; versions and stars checked today)

| Tool | What it does | Notes |
|---|---|---|
| [proper-pixel-art](https://github.com/KennethJAllen/proper-pixel-art) (`pip install proper-pixel-art`, **v2.0.0**, 2026-10-10, MIT, 591★) | Edge and Hough-line grid detection, one colour per cell | `ppa in.png -o out/ -c 24 -t`; `--color-method palette`. Also handles GIF/video with a shared grid and palette. `ppa web` for a local UI. |
| [spritefusion-pixel-snapper](https://github.com/Hugo-Dz/spritefusion-pixel-snapper) (Rust CLI / WASM, MIT, 3.4k★) | Grid snap plus k-means palette | `spritefusion-pixel-snapper in.png out.png 16 --palette 0B0912,171226,…` forces **our** palette. Batch over a folder. Web version at spritefusion.com/pixel-snapper. |
| [unfake.js](https://github.com/jenissimo/unfake.js) (MIT, 938★, updated 2026-09) | Scale detection (runs-based or edge-aware), fixed palettes via imagequant, morphological and jaggy cleanup, **alpha binarisation** | Runs in the browser; [itch demo](https://jenissimo.itch.io/unfaker). Downscale inputs to about 560 px first if they error. |
| [unfake.py](https://github.com/painebenjamin/unfake.py) (v1.0.7, MIT) | Python take on the same ideas | |
| [pixeldetector](https://github.com/Astropulse/pixeldetector) (MIT, last push 2024-04) | Restores pixel art that was downscaled or JPG-damaged | Older |
| [pyxelate](https://github.com/sedthh/pyxelate) (MIT) | Turns *non*-pixel images into pixel art | Use when the AI output is painterly |
| Pillow 13.0.0 / ImageMagick 7.1.2-34 | Quantise, alpha, outline | Snippets below |
| [Pixelorama](https://github.com/Orama-Interactive/Pixelorama) v1.2.3 (MIT, free, has a web build) / Aseprite v1.3.18.6 (paid) | Hand pass | Lock the palette in the editor |

### 5.4 Pipeline steps (scriptable; add a check step in CI)

1. **Grid recovery and downscale.** Use ppa or pixel-snapper to get true resolution.
   - If the source is painterly: `Image.resize(size, Resampling.BOX)`, then step 2.
   - Nearest-neighbour is only correct when the source grid is already clean.
2. **Map to the fixed palette, no dithering.**
   ```python
   pal = Image.new("P",(1,1)); rgb=[int(h[i:i+2],16) for h in PAL for i in (0,2,4)]
   pal.putpalette(rgb + rgb[:3]*(256-len(PAL)))   # pad with a REAL colour, not black
   q = img.convert("RGB").quantize(palette=pal, dither=Image.Dither.NONE)
   ```
   ImageMagick: `magick in.png -filter point -resize 48x48 +dither -remap pal.png out.png` (build the palette strip with `magick xc:'#0B0912' xc:'#171226' … +append pal.png`).
   For perceptually better matching, do nearest colour in OKLab with numpy, or use [image-q](https://www.npmjs.com/package/image-q) (v4.0.0, MIT; CIEDE2000) in JS.
3. **Alpha.** Threshold alpha at 128 to 0/255. Turn the chroma index into transparent. Kill 1-px halos where opaque pixels touch transparent ones and are near the chroma colour.
4. **Outline.** Strip the AI's inconsistent outline: erode alpha by 1, then re-dilate.
   - 4-neighbour dilation gives a crisp look; 8-neighbour (`ImageFilter.MaxFilter(3)` on alpha) gives a heavier one.
   - Fill new pixels with the outline colour, or use a selective outline (the darkest ramp step of the neighbouring colour).
   - Remove orphan pixels and fix doubled pixels or jaggies, automatically (unfake) or by hand.
5. **Validate.** All colours must be in the palette, size exact, alpha only 0 or 255, sprite centred, with 1-px padding.
6. **Pack an atlas.** Export as indexed or lossless PNG and run oxipng. **Never lossy WebP/JPEG for pixel art.**

### 5.5 Sprite sizes for 3×–4× integer scaling

- **Art canvas width 270:** 1080 px-wide phones get exactly 4×. 1170/1179/1206 iPhones get 4× with side margins filled by the background shader. 720-px budget phones get 2× (or fractional at 2.67×, acceptable at 3 or more device px per art px).
- **Scale:** `s = clamp(floor(physW/270), 2, 5)`.
- **Height:** `floor(physH/s)`, with the play area absorbing the slack.

| Asset | Art px | Generate at (≈16× per art px) |
|---|---|---|
| Playing card / joker card | **48×66** (hand of 8 at 30-px overlap = 258 px; row of 5 = 256 px) | frame made in code |
| Joker or illustration window | 40×40 | 640–1024² |
| Consumable | 32×44 | 512×704 |
| Boss / blind emblem | 64×64 | 1024² |
| Icons (suits, coin, UI) | 8×8 / 12×12 / 16×16 | draw by hand; AI is unreliable this small |
| Buttons | 9-slice, 3–4-px border, **≥30–33 art px tall at 4×** (about 44 CSS px at DPR 2.6–3) | code |

- **One art-pixel size across all assets.** Never place sprites at a non-integer art scale. Transient pop and tilt scaling is fine with the §3.3 sampler.

---

## Legal guardrails

- Art *style* isn't ownable. Specific assets, code, names and trade dress are.
- Do not use: the m6x11 font, Balatro shader ports (the "CC0" Godot port is derived from Balatro's source), edition and joker names, the blue-chips / red-mult pair, the landscape layout, or "Balatro" in the title or store text.
- [pokemon-cards-css](https://github.com/simeydotme/pokemon-cards-css) is GPL-3.0: use it to learn the technique only.