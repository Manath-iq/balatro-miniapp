# Engine contract — «Последний трамвай» (M1, frozen)

This is the exact rule spec for `src/engine`. Code and this document must agree; when in doubt, this document wins
and the code is fixed. Design background: `docs/research/design.md` (but **this** file supersedes it: classic
52-card deck, no trump).

## 0. Purity and determinism (hard rules)

- `src/engine/**` imports nothing outside `src/engine`. No DOM, no `Date`, `performance`, `Math.random`, `Intl`,
  `toLocale*`, `toFixed`, `parseFloat`, `for…in`, float literals, `**`, `Math.pow/sqrt/exp/log/sin/cos/tan/atan2/hypot/cbrt`.
  Every `.sort(` passes a comparator. Enforced by `scripts/check-engine-purity.ts`.
- Numbers: Т and Н are safe integers. Multipliers are exact `Ratio`s `[num, den]`. Power and totals are `bigint`.
  `power = floor(T × N × Πnum × odNum / (Πden × odDen))` — ONE floor at the end.
- Randomness only from `stream(seed, Tag, a, b)` (`rng.ts`). Same seed + same action log ⇒ identical state hash on
  V8 (Node, Workers) and JavaScriptCore (iOS).
- `step()` mutates the state in place. With `{events:false}` it must not allocate event objects (replay speed).

## 1. Files and ownership

| File(s) | Owner |
|---|---|
| `types.ts`, `events.ts`, `rng.ts`, `hash.ts`, `rules.ts#baseRules`, `content/defs.ts`, `content/registry.ts`, `content/balance.ts` (numbers may be tuned by Sim only), `content/testkit.ts` | orchestrator (contract) |
| `index.ts`, `cards.ts`, `hands.ts`, `scoring.ts`, `gauge.ts`, `mastery.ts`, `wave.ts`, `cabin.ts`, `route.ts`, `stop.ts`, `kiosk.ts`, `economy.ts`, `run.ts`, `log.ts`, `replay.ts`, `preview.ts`, `power.ts`, `fx.ts`, `legal.ts` | E-core |
| `content/passengers/*.ts` + `client/i18n/{ru,en}/passengers.ts` + `tests/content/passengers*.test.ts` | E-pass |
| `content/{coupons,punches,inspectors,drivers,conditions}.ts` + `client/i18n/{ru,en}/content.ts` + `tests/content/misc*.test.ts` | E-misc |

E-core may split its work into more files under `src/engine/` as needed (not under `content/`).

## 2. Public API (`src/engine/index.ts` re-exports)

```ts
ENGINE_VERSION: number            // bump when rules change
CONTENT_HASH: number              // from content/registry.ts
newRun(cfg: RunConfig): { state: RunState; events: GameEvent[] }
step(s: RunState, a: Action, opts?: { events?: boolean }): GameEvent[]   // throws IllegalAction; default events: true
legal(s: RunState): Legal
preview(s: RunState, idx: number[]): Preview      // idx = hand slots
evaluate(cards: readonly Card[]): { type: HandType; scoring: number[] }   // indices into cards
replay(cfg: RunConfig, log: Uint8Array): RunSummary   // events off; throws IllegalAction on bad/version-mismatched logs
encodeLog(actions: readonly Action[]): Uint8Array   // includes the header
decodeLog(bytes: Uint8Array): { engine: number; contentHash: number; actions: Action[] }
toBase64Url(bytes: Uint8Array): string; fromBase64Url(s: string): Uint8Array
hashState(s: RunState): number
powerKey(p: bigint): number        // sortable, < 2^53: digits × 1e9 + leading 9 digits (0n → 0)
levelOf(xp: number): number; handBase(type, level): { t, n }
targetOf(stopNo: number, kind: StopKind, conditionMul?: Ratio): bigint
summarize(s: RunState, actions: number): RunSummary
```

## 3. Run structure

- Deck: 52 cards created in order suit 0..3 × rank 2..14, uids 1..52, `nextUid = 53`. Card Ток = rank (A = 14).
- Stops 1..12 in 3 lines of 4. Line `L = ceil(stopNo/4)` (1..3). Stops 4 and 8 are line bosses (`'boss'`), stop 12 is
  Депо (`'final'`). Stops 13+ are the Кольцевая (endless): `'ring'`, or `'ringBoss'` when `(stopNo − 12) % 3 == 0`.
- `newRun`: resolve driver/condition (daily: `stream(seed, DAILY)` → `pick(pools.drivers).code`, then
  `pick(pools.conditions).code`; standard: from cfg, condition forced 0), build deck, cabin of `driver.seats` nulls,
  pocket of 2 nulls, tokens `ECON.startTokens`, gauge `GAUGE.start`, `driver.setup(s)`, `condition.setup(s)`.
  Line bosses: `stream(seed, ROUTE, 0, 0).shuffled(pools.lineBosses)` → line 1 = [b0, b1], line 2 = [b2, b3];
  line 3 = `shuffled(pools.finalBosses)` [f0, f1]. Then enter phase `'route'` for stop 1.
- Route options (phase `'route'`, emitted as `routeOptions`):
  - stops 1, 5, 9: two `'branch'` options (index 0 = Red, 1 = Blue), `boss` = that line's boss for the branch,
    `target` = this stop's normal target. Choosing sets `route.branch[L-1]` and enters a `'normal'` stop.
  - stops 2, 3, 6, 7, 10, 11: `[normal, express]`.
  - stops 4, 8: one `'boss'` option (boss = `lineBosses[L-1][branch[L-1]]`). Stop 12: one `'final'` option
    (boss = `lineBosses[2][branch[2]]`).
  - ring: one option (`'ring'`, boss 0) or (`'ringBoss'`, boss = `pools.lineBosses[stream(seed, ROUTE, 1, ringBosses).int(n)]`,
    `ringBosses++` when entered).
- Targets (`targetOf`): normal/branch = `TARGETS[stopNo]`; express = `floor(TARGETS × 7/5)`; boss/final = `TARGETS[stopNo]`.
  Ring: start from `TARGETS[12]`, for k = 13..stopNo multiply by 17/10 (2/1 when k ≥ 21) with floor at each step;
  ringBoss × 8/5. Then × condition `targetMul` if any. Choosing express sets `s.expressBonus = true`.
- Phases: `route → stop → (reward if boss/ringBoss) → kiosk → route …`; after Депо → `'depot'` (actions `ring`
  (standard only) or `end`); failure → `'over'`. `end` is legal in every phase except `'over'`.
- Result: `won = stats.stopsCleared >= 12` (cleared Депо). `endedAt = stopNo`. `reason` `'failed'|'ended'`.

## 4. Rules pipeline

`buildRules(s)` = `baseRules()` → `driver.rules` → `condition.rules` → (grade: none in v1) → seats in cabin index order
`rules(r, me)` → boss `rules(r)` (boss last). Rebuilt before every hand and at stop start.

## 5. Stop

**Enter** (after a route choice): stop state with hands/discards from rules, `target`, `total 0`, draw pile = all deck
uids sorted by `(deckKey(salt, uid), uid)` where `salt = stream(seed, DECK, stopNo).u32()`; then hooks:
seats `onStopStart` (index order), boss `onStopStart(fx, st)`; then draw `handSize`.
Events: `phase(stop)`, `stopStart`, `bossInfo` (if the boss keeps a value in `bossState[0]`), `draw`.

**Hand evaluation** (`evaluate`): 1–5 cards. Priority: Молния (10-J-Q-K-A one suit) → Пятерня (5 same rank) →
Стрит-флеш → Каре → Фулл-хаус → Флеш → Стрит → Тройка → Две пары → Пара → Старшая. Straights: 5 distinct consecutive
ranks; the wheel A-2-3-4-5 counts (no wrap K-A-2). Flush/straight need exactly 5 cards. Scoring cards: HC = the
single highest rank (first in play order on ties); P/2P/3K/4K/5K = the cards forming the sets; ST/FL/FH/SF/RF = all 5.
Ties among multiple pairs/trips: the type uses the strongest combination (e.g. 3+2 = FH).

**Play** `{idx, od}`: legal if phase stop, `hands > 0`, 1–5 distinct valid slots; `od` requires
`gauge >= rules.odMin`; if `rules.odAlways` the hand is overdriven regardless of `od`. Order:
1. `hands -= 1`, `handsUsed += 1`. played = cards at idx (play order); held = remaining hand (slot order).
2. type/scoring via `evaluate`. waveStep: first hand of the stop → 0; else if `type == prevType` or `waveShield > 0`
   → `prev waveStep + 1`; else 0. level = `rules.masteryFlat ? 1 : levelOf(xp[type])`. base = `handBase(type, level)`.
   Emit `handStart`, `base`.
3. Per scoring card `c` at scoring index `i`: `reps = 1 + punch.retrig + Σ seats onRetrig`. For each rep:
   `t = c.rank`; `t = boss.cardT?(c, t, h, st) ?? t`; T += t; emit `card`. Punch `onScore` → apply + emit `mod`.
   Seats `onCard` in index order → apply + emit `mod{src seat, uid}`. Sparks for this trigger:
   `rng(SPARK, stopNo, handNo).range(sparkMin, sparkMax) + (rank >= 11 ? 2 : 0) + Δ.sparks (punch, seats) + boss.cardSparks`.
4. Held cards (slot order): punch `onHeld`, seats `onHeld` → apply, emit `held` if non-zero.
5. `onHand`: seats in index order, then wave `N += min(waveStep × wavePer, waveMax)` (emit `wave` and `mod{src wave}` if > 0),
   then boss `onHand`. All `t`/`n` add; all `x` collect.
6. N cap: if `rules.nCap !== null && N > nCap` → N = nCap, emit `nCap`. Clamp T, N to ≥ 0.
7. Overdrive: if od, `x_od = [odDen + gauge, odDen]`, emit `overdrive`. power with one floor (§0). `total += power`,
   stats (`handsPlayed++`, `peak/peakHand`). Emit `power`.
8. Gauge: od → `gauge = 0` (emit `gauge`), no sparks. Else `sum = floor(Σ adds × sparkMul)`, `gauge += sum`,
   emit `sparks`. If `gauge >= blowAt`: seats `onBlowout` in index order until one returns true (cancelled; the hook
   sets the gauge). Not cancelled: `gauge = 0`, `blowouts += 1`; penalty `hands > 0 ? hands -= 1 ('hand') :
   tokens -= ECON.blowoutTokens (min 0, 'tokens')`. Emit `blowout`.
9. XP: `add = (perPlay + (od ? 1 : 0) + (played[type] == 0 ? 1 : 0)) × rules.xpMul`; `xp[type] += add`, `played[type]++`.
   Emit `xp`.
10. Seats `onAfterHand(fx, h, power)`; punches: played cards `onPlayed`, held cards `afterHandHeld`; boss `onAfterHand`.
    If the boss keeps `bossState[0]`, emit `bossInfo` again.
11. `prevType = type`, `waveStep = step`, `waveShield = max(0, waveShield − 1)`, `handNo += 1`; played → `spent`.
12. If `total >= target` → **clear** (no draw). Else if `hands == 0` → **fail**. Else refill hand to `handSize` from
    draw (fewer if the pile is empty), emit `draw`, `counters`.

**Discard** `{idx}`: phase stop, `discards > 0`, 1–5 distinct slots. Cards → spent; seats `onDiscard(fx, cards)`;
punch `onDiscard` per card; `discards -= 1`, `discardsUsed += 1`; emit `discard`, refill + `draw`, `counters`.
The wave is not affected.

**Clear**: income list — base by kind (`ECON.income`), `+perUnusedHand × hands`, `+overkillBonus` if
`total >= target × overkillMul`; then seats `onStopEnd(fx, info)`. Tokens added; emit `stopCleared` (with income list).
Stats: `stopsCleared++`, `output += total`, `points += min(floor(100·total/target), DAILY_POINTS_CAP)`; ring stop →
`ringStop = stopNo`. Boss/final/ringBoss: `bossesDefeated++`, and if `piggy > 0`: `bonus = min(floor(piggy × piggyBonus),
piggyCap)`, `tokens += piggy + bonus`, `piggy = 0`, emit `piggyPayout`. Then gauge cooling if `rules.gaugeCools`:
`gauge = floor(gauge / 2)` (emit `gauge`). Next: stop 12 → `'depot'`; boss/ringBoss → `'reward'`; else → kiosk.

**Fail**: emit `stopFailed`, result `{won: stopsCleared >= 12, endedAt: stopNo, reason: 'failed'}`, phase `'over'`, `runOver`.

## 6. Reward (after boss / ringBoss)

Offers: 3 distinct v1 passengers with rarity U or R not in the cabin, via `stream(seed, REWARD, stopNo)`
(fallback: any rarity). `reward{pick 0..2}` needs a free seat (first free index); `pick 15` skips. `sell` is legal here.
Then enter the kiosk.

## 7. Kiosk

Enter: `kioskNo += 1`; KioskRules `{freeShifts: 0, priceDelta: 0}` then seats `onKiosk`. Slots =
`rules.conveyorSlots + (expressBonus ? 1 : 0)`, then `expressBonus = false`. Fill top→bottom with `pull()`.
Workshop offer: two distinct punch codes from `stream(seed, WORKSHOP, kioskNo)`.

`pull()`: `rng = stream(seed, KIOSK, kioskNo, pulls++)`; kind = `weighted(SHOP.mix)`:
passenger → rarity `weighted(rarityOdds[min(line,3)-1])`, candidates = v1 passengers of that rarity not in the cabin
and not on the belt (fallback: any rarity; fallback: coupon); coupon → `pick(pools.coupons)`; card →
`{rank: range(2,14), suit: int(4), punch: pick(pools.punches).code}`. Price = def.price (card: `SHOP.cardPrice`)
`+ priceDelta`, min 1.

Actions (phase kiosk): `buy{slot}` (tokens ≥ price; passenger → first free seat, else illegal; coupon → first free
pocket, else illegal; card → added to deck), slot becomes null. `shift` (cost `k < freeShifts ? 0 : shiftBase + floor(k/2)`,
k = shifts so far): bottom slot falls off, every slot moves down one, top = `pull()`. `workshop{uid, pick}` once per
visit, `SHOP.workshopPrice`, sets the punch. `scrap{uid}` once per visit, `SHOP.scrapPrice`, deck must stay ≥ 20 cards.
`piggy{deposit}` 1..tokens. `piggyBreak` returns `floor(piggy × 3/4)`. `coupon` (when kiosk/any, targets any deck card).
`sell{seat}` / `swap{a,b}` are legal in route, reward and kiosk phases (never during a stop): refund
`rules.sellFull ? price : floor(price/2)`. `leave` → phase route for `stopNo + 1`.

Removing a card from the deck by ANY source calls seats `onCardRemoved(fx, card)` (index order) and emits `cardRemoved`.

## 8. Coupons

`coupon{slot, uids?, hand?}`: slot holds a coupon; `when` matches the phase (stop: `'stop'|'any'`, kiosk: `'kiosk'|'any'`);
`canUse` passes; target: `cards` → `min ≤ uids.length ≤ max`, distinct, during a stop they must be in hand, in a kiosk any
deck card; `hand` → `hand` 0..10. `apply(fx, tgt)`, pocket slot cleared, emit `couponUsed`, `pocket`. During a stop the
hand is refilled to `handSize` afterwards (emit `draw`). Cards added during a stop join the deck, not this stop's pile.

## 9. Fx semantics and events

| Fx call | Effect | Event |
|---|---|---|
| `tokens(n)` | `tokens = max(0, tokens + n)` | `tokens` |
| `xp(h, n)` | `xp[h] += n` | `xp` |
| `sparks(n)` | in a hand: add to this hand's adds; else `gauge = min(gauge + n, blowAt − 1)` | — / `gauge` |
| `setGauge(g)` | `gauge = clamp(g, 0, blowAt − 1)` | `gauge` |
| `hands(n)`, `discards(n)` | current stop counters (min 0) | `counters` |
| `punch/suit/charge` | deck card fields | `cardChanged` |
| `addCard` | push to deck, `nextUid++` | `cardAdded` |
| `removeCard` | remove from deck (and from hand/draw if in a stop) + `onCardRemoved` hooks | `cardRemoved` |
| `target(t)` | stop target | `target` |
| `waveShield(n)` | stop.waveShield = n | — |
| `rotateSeats()` | `cabin[i] = cabin[i−1]`, `cabin[0] = old last` | `seats` |

Fx rng streams: seat hooks `stream(seed, SEAT, stopNo × 16 + seat, handNo)`; boss `stream(seed, BOSS, stopNo, handNo)`
(handNo = 255 for onStopStart); coupons `stream(seed, COUPON, stopNo, handsPlayed × 4 + slot)`.

Inspectors may mutate `st.bossState` directly (it is their scratch space).

## 10. Action log

Header 9 bytes: `'L' 'T'`, format `1`, ENGINE_VERSION u16 LE, CONTENT_HASH u32 LE. Then one record per action:

| Byte | Action | Payload |
|---|---|---|
| `0x10 \| od<<3 \| count` (count 1..5) | play | ceil(count/2) bytes of slot nibbles (low nibble first) |
| `0x20 \| count` | discard | nibbles |
| `0x30 \| choice` | route | — |
| `0x40 \| slot` | coupon | tag byte: 0 none / 1 cards (varint count, varint uids) / 2 hand (byte) |
| `0x50 \| slot` | buy | — |
| `0x60` | shift | — |
| `0x70 \| seat` | sell | — |
| `0x80` | swap | byte `a<<4 \| b` |
| `0x90 \| pick` | workshop | varint uid |
| `0xA0` | scrap | varint uid |
| `0xB0` / `0xB1` | piggy deposit / break | varint amount / — |
| `0xC0 \| pick` | reward | — (15 = skip) |
| `0xD0` / `0xD1` / `0xD2` | leave / ring / end | — |

Varint = unsigned LEB128. Decoder rejects unknown opcodes, truncated payloads, > 4000 actions. base64url without padding.

## 11. Daily

Seed from the server. Driver and condition derived from the seed (§3). Daily runs cannot enter the ring (`ring` illegal).
Ranking: `stopsCleared` desc, then `points` desc.

## 12. v1 content (codes are stable forever)

Prices: C 4, U 6, R 8. i18n keys: `p.<id>.name|desc`, `cp.<id>.*`, `pu.<id>.*`, `in.<id>.name|desc|quote`,
`dr.<id>.*`, `cd.<id>.*`.

### Passengers (E-pass)

| code | id | file | rar | Effect (exact) |
|---|---|---|---|---|
| 1 | zebra | ranks | C | onHand: ≥3 scoring cards and every adjacent pair (play order) differs in colour (red = ♥♦) → x 3/2 |
| 3 | smallChange | ranks | C | onCard: rank ≤ 5 → t + 2×rank |
| 5 | general | ranks | R | onHand: ≥3 scoring cards, all rank ≥ 11 → x 5/2 |
| 7 | aristocrat | ranks | U | onHand: all scoring cards rank ≥ 10 → n + 6 |
| 8 | thousand | ranks | U | onHand: among PLAYED cards, a K and Q of one suit (Мариаж) → t + (♥100, ♦80, ♣60, ♠40; best one), n + 2 |
| 9 | honorStudent | ranks | C | onHand: exactly one Ace among scoring → x 3/2 |
| 10 | twentyOne | ranks | C | onHand: Σ ranks of scoring cards ≤ 21 → n + 8 |
| 11 | student | mastery | U | onAfterHand: fx.xp(type, 1) |
| 12 | professor | mastery | R | onHand: x (10 + level)/10 |
| 13 | twins | mastery | C | onRetrig: type Pair/Two Pair and the card has a same-rank same-colour partner among scoring → 1 |
| 15 | minimalist | mastery | C | onHand: played ≤ 2 cards → t + 2 × baseT |
| 18 | dacha | economy | C | onStopEnd: discardsUsed == 0 → tokens + 2 |
| 19 | seedGranny | economy | C | onKiosk: freeShifts + 1 |
| 21 | bottleCollector | economy | C | onCardRemoved: tokens + 3 |
| 23 | signalman | wave | C | onHand: n + min(3 × waveStep, 12) |
| 24 | stairClimber | wave | U | onHand: prevType ≥ 0 and type > prevType → x 3/2 |
| 26 | electrician | overdrive | C | onCard: sparks + 2; onHand: t + 10 |
| 27 | fuseGrandpa | overdrive | U | stateSize 1; onBlowout: if s[0] ≠ stopNo → s[0] = stopNo, setGauge(50), return true |
| 28 | powerEngineer | overdrive | R | rules: odDen = 70 |
| 30 | adrenaline | overdrive | C | onHand: n + floor(gaugeBefore / 10) |
| 32 | gymRat | growth | U | stateSize 1; onHand: t + s[0]; onAfterHand: 5 scoring cards → s[0] += 4 |
| 34 | veteran | growth | R | onHand: x (4 + bossesDefeated)/4 (skip when 0 bosses) |
| 35 | nonstop | growth | C | stateSize 1; onHand: n + s[0]; onStopEnd: discardsUsed == 0 → s[0] += 3 |
| 36 | accordionist | cabin | U | onHand: neighbours k > 0 → x (10 + k)/10 |

### Coupons (E-misc)

| code | id | price | when | target | Effect |
|---|---|---|---|---|---|
| 1 | copper | 3 | any | cards 1–2 | punch Медь (1) |
| 2 | neon | 3 | any | cards 1–1 | punch Неон (2) |
| 5 | scrap | 3 | any | cards 1–2 | remove the cards |
| 6 | photocopy | 3 | any | cards 1–1 | add a copy (rank, suit, punch) |
| 7 | transfer | 3 | stop | none | waveShield(2) |
| 8 | lectureNotes | 3 | any | hand | xp(hand, 4) |
| 10 | extinguisher | 3 | stop | none | setGauge(0); blowouts > 0 at this stop → hands(1), else discards(1) |
| 12 | spareTicket | 4 | stop | none | hands(1) |

### Punches (E-misc)

| code | id | Effect |
|---|---|---|
| 1 | copper (Медь) | onScore: t + 5, sparks + 3 |
| 2 | neon (Неон) | onScore: n + 2 |
| 3 | doublePunch (Компостер) | retrig 1 |
| 4 | capacitor (Конденсатор) | onScore: t + charge; afterHandHeld: charge = min(charge + 3, 15); onPlayed: charge = 0 |

### Inspectors (E-misc)

| code | id | tier | Effect |
|---|---|---|---|
| 1 | auditor (Ревизор) | line | cardT: unpunched card → floor(t/2); onAfterHand: +1 token per punched scoring card, ≤ 3 per stop (count in bossState[1]) |
| 3 | conductress (Кондукторша Люда) | line | onAfterHand: rotateSeats() |
| 4 | blackIce (Гололёд) | line | onStopStart: setGauge(50); rules: sparkMul 2/1 |
| 5 | blackout (Блэкаут) | line | rules: odMin = 1000000, nCap = 10 |
| 6 | shiftChange (Пересменка) | line | rules: masteryFlat, xpMul 2 |
| 7 | trackWorks (Ремонт путей) | line | bossState[0] = repair rank (rng.range(2,14)) at stop start and after each hand; cardT: that rank → 0; cardSparks: that rank → 6 |
| 21 | depotChief (Начальник депо) | final | onAfterHand: target(floor(target × 23/20)) |
| 22 | lastTram (Последний трамвай) | final | rules: handsPerStop 3, discardsPerStop 0, odAlways, odMin 0, sparkMul 3/2 |

### Drivers and conditions (E-misc)

| kind | code | id | Effect |
|---|---|---|---|
| driver | 1 | petya | seats 6; setup: gauge = 30 |
| driver | 2 | valya | seats 5; setup: xp of every hand = 2 (level 2) |
| condition | 1 | noTwos | setup: remove every rank-2 card |
| condition | 2 | narrowBelt | rules: conveyorSlots = 3 |
| condition | 3 | veteranCrew | setup: xp of every hand = 2; targetMul 6/5 |
| condition | 4 | highVoltage | setup: gauge = 50; rules: blowAt = 90 |

## 13. Tests required

- `evaluate` vs brute force over all C(52,5): RF 4, SF 36, 4K 624, FH 3744, FL 5108, ST 10200, 3K 54912, 2P 123552,
  P 1098240, HC 1302540; plus 1–4 card hands and duplicate (Пятерня) cases.
- Hand-computed scoring examples (incl. the stop-1 check: four 9-9 pairs with the wave = 27 + 54 + 81 + 108 = 270).
- Property: for 1000 bot runs, `replay(cfg, encodeLog(actions)).hash === hashState(live state)`; log round-trip.
- 20 golden runs in `tests/fixtures/golden/*.json` (`{cfg, log, summary, hash}`), asserted by tests and by `test:jsc`.
- Every content item: a unit test through `content/testkit.ts`.
