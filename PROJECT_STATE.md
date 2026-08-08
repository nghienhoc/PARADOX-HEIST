# PROJECT_STATE — PARADOX HEIST

> **Read this file first.** It is the single source of truth for where the project
> stands. It is written for an AI developer picking the work up cold, so it should be
> enough on its own — you should not need to read every source file to continue.
>
> Companion files: [`CHANGELOG_AI.md`](CHANGELOG_AI.md) (what changed, when, by whom)
> and [`MASTER_GAME_SPEC.md`](MASTER_GAME_SPEC.md) (the full target design).

- **Last updated:** 2026-08-08
- **Updated by:** Claude (Opus 5) — session 2
- **Current phase:** Phase 2 — Core vertical slice. The Echo mechanic is complete and stable.
- **Build status:** `npm test` 112/112 pass · `npm run build` succeeds · `npm run smoke` 20/20 checks pass

---

## 1. What this game is

Top-down action-puzzle game built on time loops. When a loop ends, the timeline you
just played becomes an **Echo** that replays your exact movements and actions alongside
you. You solve each vault by cooperating with an army of your past selves.

---

## 2. Current state in one paragraph

The Echo mechanic — the thing the whole game is built on — is implemented, tested and
verified working in a real browser. A finished timeline becomes an Echo; every Echo
replays its recorded route and its recorded shots in perfect sync with the live player,
on one shared loop clock; recorded actions fire exactly once regardless of frame rate.
Loop duration and Echo count are **per level**, not global. The Time Core is collectable
and completes the level. Interaction is routed through a generic
`Interactor`/`Interactable` layer where an Echo and the live player are indistinguishable
to the world, which is what the pressure-switch puzzle needs next. Not built yet:
switches, doors, enemies, EMP, health/damage, scoring, audio, menus, levels 2–3, boss.

---

## 3. Tech stack (installed and pinned)

| Package | Version | Notes |
| --- | --- | --- |
| phaser | ^3.90.0 | Phaser **3**, not 4. npm's `latest` resolves to 4 — do not let it drift. |
| vite | ^8.2.1 | |
| typescript | ^5.9.3 | Pinned to 5.x deliberately; TS 7's native compiler is not validated against Phaser 3's type defs here. |
| vitest | ^4.1.10 | `environment: 'node'` — see §6. |
| playwright | ^1.x | Smoke test + screenshot capture only. Chromium already downloaded. |

Node 24.11.1, npm 11.6.3 on Windows.

---

## 4. Commands

```bash
npm install          # deps
npm run dev          # dev server on :5173, opens the browser
npm run build        # tsc --noEmit && vite build  -> dist/
npm run preview      # serve dist/ on :4173
npm test             # vitest run (112 unit tests)
npm run test:watch   # vitest watch mode
npm run typecheck    # tsc --noEmit only
npm run smoke        # browser smoke test against the built bundle (run build first)

# Take a gameplay screenshot — the only way an AI dev can see the game.
npm run build && node scripts/capture.mjs shot.png
CAPTURE_LOOPS=0 node scripts/capture.mjs shot.png              # clean first loop, no Echoes
CAPTURE_LOOPS=3 node scripts/capture.mjs shot.png              # 3 Echoes mid-replay
CAPTURE_GOAL=1 CAPTURE_LOOPS=1 node scripts/capture.mjs w.png  # run to the Core and win
```

`F3` in a dev build toggles the performance overlay.

**On Windows, always quote npm version ranges** — `npm i -D "typescript@^5.9.3"`. The
`npm.cmd` shim routes args through `cmd.exe`, where `^` is the escape character, so an
unquoted caret is silently stripped and you install an exact version.

---

## 5. File map

```
src/
├── main.ts                       Game bootstrap, tab-visibility pause, HMR cleanup
├── style.css                     Page shell around the canvas
├── config/
│   ├── resolution.ts             GAME_WIDTH/HEIGHT (1280x720). Phaser-free on purpose.
│   ├── gameConfig.ts             Phaser.Game config
│   ├── balance.ts                ALL tuning numbers. NO loop duration / echo count here.
│   ├── theme.ts                  COLORS palette + DEPTH layer constants
│   └── controls.ts               Key bindings as data
├── scenes/
│   ├── SceneKeys.ts              Scene key registry
│   ├── BootScene.ts              Generates textures, starts GameScene
│   └── GameScene.ts              Orchestration + the timeline reset sequence
├── entities/
│   ├── Player.ts                 Movement, aim, dash, weapon, interact. Is an Interactor.
│   ├── Echo.ts                   One replayed timeline. Kinematic sprite, is an Interactor.
│   ├── EchoTrail.ts              3-ghost afterimage trail per Echo
│   ├── Projectile.ts             Projectile + ProjectilePool
│   ├── TimeCore.ts               Objective pickup RULES                 [pure]
│   └── TimeCoreView.ts           Objective pickup VISUALS
├── systems/
│   ├── LoopClock.ts              The authoritative loop clock            [pure]
│   ├── EchoRecorder.ts           Fixed-rate sampling of player state     [pure]
│   ├── EchoPlaybackCursor.ts     Replays one timeline                    [pure]
│   ├── LoopManager.ts            Clock + recorder + timeline archive      [pure]
│   ├── InteractionSystem.ts      Presence + Interact dispatch             [pure]
│   ├── EchoManager.ts            Pool of Echo sprites, action dispatch
│   ├── InputSystem.ts            Latched input snapshot, dash buffering
│   ├── EffectsSystem.ts          Fixed-size particle pool
│   └── Telemetry.ts              Read-only state snapshot for the smoke test
├── ui/
│   ├── HUD.ts                    Timer, timeline bar, counters, notices, banner
│   └── DebugOverlay.ts           F3 perf overlay, dev builds only
├── levels/
│   ├── level01.ts                Level 01 data, incl. its own timeline config
│   └── levelBuilder.ts           Turns level data into scene objects
├── types/
│   ├── echo.ts                   EchoFrame / EchoAction / EchoTimeline
│   ├── interaction.ts            Interactor / Interactable               [pure]
│   └── level.ts                  LevelDef + TimelineConfig + validateLevel  [pure]
└── utils/
    ├── math.ts                   clamp, lerp, lerpAngle, clampDelta       [pure]
    └── textures.ts               ALL art, generated procedurally at boot

tests/          9 files, 112 tests — all against [pure] modules
scripts/        smoke.mjs (browser smoke test), capture.mjs (screenshot)
```

`[pure]` = **contains no Phaser import.** See §6 — this is load-bearing.

---

## 6. Architectural rules — do not break these

1. **Core simulation logic stays Phaser-free.** Everything marked `[pure]` above is
   imported by unit tests running in a plain Node environment. Phaser touches
   `window`/`document` at import time, so adding `import Phaser` to any of those
   modules (or to anything they import) instantly breaks the test suite. This is why
   `config/resolution.ts` is separate from `config/gameConfig.ts`, and why `TimeCore`
   (rules) is separate from `TimeCoreView` (visuals).

2. **Loop duration and Echo count are per level, never global.** They live in
   `LevelDef.timeline` and flow to `LoopManager`, `EchoManager` and `HUD` from there.
   `config/balance.ts` deliberately has no `durationMs` or `maxEchoes`. Do not
   reintroduce one, and do not hardcode `20000` or an Echo count anywhere.

3. **Record poses, never replay inputs.** Echoes are driven by recorded authoritative
   poses, not by re-simulating stored keypresses through physics. Replaying inputs
   accumulates float drift and desynchronises Echoes.

4. **Echoes are kinematic.** `Echo` is a plain `Sprite` with no physics body, so
   nothing in the world can push it off its recorded path. Echoes may overlap freely.

5. **Sample times come from the loop clock, not accumulated deltas.**
   `EchoRecorder` stamps frame `i` at exactly `i * 1000 / sampleRateHz`, so a 20s
   timeline records exactly 1201 frames at 30, 60 or 144 FPS. Tested at all three.
   Two numerical details matter here and are easy to undo by accident:
   - Capacity is `floor(durationMs * rate / 1000) + 1`. The equivalent-looking
     `durationMs / (1000 / rate)` rounds badly and loses a frame at 15s and 30s.
   - The schedule comparison carries a 1e-6 ms epsilon, because the clock accumulates
     deltas and can sit at 799.9999999999999 when a slot is scheduled at exactly 800.
     Without it that slot slips a frame and records a stale pose.

6. **An action fires exactly once, in both directions.** *Recording:* if several sample
   slots elapse in one rendered frame, only the first carries the action mask —
   otherwise one trigger pull replays as several shots. *Playback:*
   `EchoPlaybackCursor` consumes action frames with a monotonic cursor, so a long frame
   can neither duplicate nor skip an event. Use `readPoseAt()` — never `update()` — when
   you only want to look at a pose, or you will consume action frames as a side effect.

7. **Only clear the player's pending actions once a frame was actually committed.**
   `GameScene` checks `loop.samplesWritten > 0` before calling
   `player.clearPendingActions()`. At 144 FPS most ticks fall between samples; clearing
   unconditionally silently loses shots.

8. **Prime the recording at the start of every loop.** `loop.primeRecording(state)` must
   be called after every spawn/respawn, before the first `tick`. Without it, frame 0 is
   written by the first tick — which has already advanced the clock — so an Echo's
   starting mark is the pose one frame after spawn.

9. **Input is latched, not polled.** `InputSystem` records presses from Phaser's `DOWN`
   event into a set that `update()` drains. Do **not** switch back to
   `Phaser.Input.Keyboard.JustDown`: it is a polled flag that `Key.onUp()` clears, so a
   tap whose keydown and keyup land in one frame is lost entirely. This was a real,
   reproducible dropped-input bug.

10. **Resetting a timeline reuses objects, never recreates them.** Projectiles,
    particles and Echo sprites are all pooled and allocated once at level start. This is
    what keeps the reset instant and memory flat across dozens of loops.

11. **`GameScene.controls`, not `GameScene.input`.** `Scene.input` is Phaser's own
    `InputPlugin` and must not be shadowed.

12. **All tuning numbers go in `config/balance.ts`.** All colours and layer depths go in
    `config/theme.ts`. Do not scatter literals.

13. **No external asset files.** Every texture is drawn procedurally in
    `utils/textures.ts`. Audio will be the first real exception — update
    `ASSET_CREDITS.md` when that happens.

---

## 7. How Echo recording works

**What is recorded.** `EchoRecorder` samples the player's authoritative state at a fixed
**60 Hz** (`LOOP.sampleRateHz`, the one genuinely global timeline constant). Each frame
is a flat `EchoFrame`:

```ts
{ time, x, y, rotation, animationState, actionMask }
```

`actionMask` is a bitmask of `EchoAction` (`Shoot`, `Interact`, `Dash`, `EMP`, `Pickup`,
`Drop`) so one frame can carry several simultaneous events with no allocation. `EMP`,
`Pickup` and `Drop` are declared but not yet produced — add them by OR-ing into
`Player.pendingActions` and handling the bit in `EchoManager.tick`.

**Frame count.** `floor(durationMs * 60 / 1000) + 1`, both endpoints sampled:
20s → 1201 frames, 15s → 901, 30s → 1801. Identical at any render frame rate.

**Zero allocation per tick.** The frame buffer is allocated once at level start and
reused across loops. `takeSnapshot()` deep-copies into a standalone timeline on close,
so the recorder can immediately keep reusing its buffer.

**Pipeline each frame** (`GameScene.simulateLoop`):

```
player.tick()                                  move / aim / dash / shoot / interact
loop.tick(delta, player.readSampleState())     clock.advance + recorder.sample
  -> if samplesWritten > 0: player.clearPendingActions()
echoes.tick(clock.elapsedMs, delta)            same clock => everything stays in sync
interactions.update(interactors)               presence pass, after Echoes have moved
```

---

## 8. How Echo playback works

One `EchoPlaybackCursor` per timeline, all driven by the **same** `clock.elapsedMs`.

- **Pose:** interpolated between the two surrounding samples (`lerp` for position,
  `lerpAngle` for rotation, discrete for animation state), so Echoes stay smooth when
  the display rate does not match 60 Hz. The pose is written into a reused `EchoPose`
  object — no per-frame allocation.
- **Actions:** a separate monotonic `actionIndex` consumes every frame whose `time` has
  become due and ORs their masks together. Each recorded action therefore fires exactly
  once, and a 500 ms hitch fires everything it swallowed rather than dropping it.
- **Presence:** once `loopTime` passes the recording's end, the Echo fades back and
  `isPresent` goes false — it stops holding switches, because its timeline never
  recorded it being there. A 3-second manual-reset timeline gives you a 3-second helper.

**Reset sequence** (`GameScene.beginNextLoop`, 220 ms after the reset is triggered):

```
loop.closeTimeline()          snapshot -> archive (FIFO capped), clock.restart()
echoes.syncTimelines(...)     bind timelines to pooled Echo slots
rebuildInteractors()          [player, ...active echoes]
bullets.releaseAll(); fx.clear(); echoes.restartAll(); interactions.resetForLoop()
player.respawn(spawn); loop.primeRecording(...)
```

`echoes.restartAll()` rewinds every cursor to 0, so all Echoes start together.

---

## 9. Current level configuration

Declared in `src/levels/level01.ts` under `timeline`:

| Level | loopDurationMs | maxEchoes | completeOnCoreCollected |
| --- | --- | --- | --- |
| `level01` | 20 000 | 3 | `true` |

`LOOP.echoHardCap` (8) is an engine ceiling; `validateLevel` rejects any level asking
for more, or for a loop shorter than one sample interval, or a non-integer `maxEchoes`.

**Behaviour at the Echo cap (documented, not silent):** FIFO — the **oldest** timeline is
discarded and the timeline just recorded is always kept. Losing the loop you just played
would be the more confusing choice. `LoopManager.evictedOnLastClose` reports it and the
HUD shows `ECHO LIMIT 3 — OLDEST TIMELINE DISCARDED` plus an orange `ECHOES 3/3 (FULL)`
counter.

**Time Core rules:** collected by the live player walking into it (34 px radius) or
pressing `E` in range. Collected once per loop; `livePlayerOnly` means an **Echo can
never collect it** — filtered at the `InteractionSystem` level and re-checked in
`TimeCore.collect()`. With `completeOnCoreCollected: true` the pickup permanently
completes the level, the clock stops, and `R` restarts the whole level. With `false` the
pickup is per-loop and every reset restores the Core — that is the mode a level with an
extraction point will use.

---

## 10. Done / not done

### Done and verified
- [x] Vite + TS + Phaser 3 + Vitest project, clean modular structure
- [x] `npm install` / `dev` / `build` / `preview` all work
- [x] Procedural art pipeline (9 textures, zero asset files)
- [x] One vault room built from validated level data
- [x] Movement, mouse aiming, hold-to-fire shooting, dash with input buffering
- [x] `E` interact, recorded and replayed
- [x] Per-level `loopDuration` and `maxEchoes`, honoured by clock, recorder, pool and HUD
- [x] Loop timer with a warning state in the final 5 seconds
- [x] `R` manual timeline reset + automatic reset on expiry, guarded against double-trigger
- [x] **Echo recording** at 60 Hz, frame count independent of render rate
- [x] **Echo playback** — multiple Echoes, all synchronised on one clock, interpolated
- [x] **Echo actions** — shooting and dash replay; interact dispatch wired end to end
- [x] Exactly-once action firing, verified at 12/30/60/144 FPS playback and 30/60 FPS recording
- [x] FIFO Echo eviction at the cap, announced in the HUD
- [x] Echo visuals: violet, semi-transparent, additive marker, 3-ghost afterimage trail, older Echoes dimmer
- [x] **Time Core pickup** — once only, Echo-proof, restores on reset, completes the level
- [x] Completion banner + `R` to replay the level from scratch
- [x] Generic `Interactor`/`Interactable` layer ready for switches and doors
- [x] HUD: timer, timeline bar, counters, dash meter, objective, transient notices, banner
- [x] Camera soft-follow with cursor look-ahead, trauma-decay shake
- [x] Particle pool (150 cap), reset shockwave, muzzle flashes, impact sparks
- [x] Tab-visibility pause; delta clamping; listener teardown on shutdown
- [x] F3 dev-only performance overlay
- [x] 112 unit tests + a 20-check browser smoke test + screenshot tooling

### Not started
- [ ] **Pressure switch + locked door** — the actual Level 01 puzzle (next task, §12)
- [ ] Extraction point (carry the Core somewhere) and a proper level-complete flow
- [ ] Enemies (security drone), lasers, alarm state, EMP, player health/damage
- [ ] Scoring + grades, result screen
- [ ] Audio (nothing at all yet)
- [ ] Menus: loading, main menu, level select, settings, pause, credits
- [ ] Save/load (LocalStorage), quality presets, accessibility options
- [ ] Levels 2 and 3, Chrono Warden boss
- [ ] Signature timeline-reset animation (currently a flash + shockwave)
- [ ] Device-pixel-ratio cap, adaptive quality
- [ ] `TECHNICAL_DESIGN.md`

---

## 11. Known issues and deliberate shortcuts

- **No puzzle yet.** The room has no switch or door, so Level 01 is solvable in a single
  timeline and does not yet *require* an Echo. The mechanic is proven; the level design
  that forces cooperation is the next task.
- **`EchoAction.Interact` has no shipped consumer.** `E` is recorded and dispatched
  through `InteractionSystem`, and the Time Core accepts it, but no interactable
  *requires* it yet. The pressure switch will be the first real one. The pathway is
  covered by unit tests with stub interactables.
- **The room is exactly one screen (1280×720)**, so the camera never scrolls and the
  look-ahead code has no visible effect yet. It is in place for larger rooms.
- **Completion is a banner, not a result screen.** No score, grade or level transition.
  The clock stops and `R` replays.
- **Echo position resolution is capped by the render rate.** At 30 FPS consecutive
  60 Hz sample slots receive identical positions. The frame *count* stays correct; only
  smoothness degrades, and playback interpolation hides most of it.
- **Actions are quantised to ≤16.7 ms.** A shot fired between two sample slots is
  recorded at the next slot. Imperceptible in play.
- **Echoes have no collision at all** — they cannot block bullets or bodies. That is
  correct for now (kinematic authority) but will need a decision when enemies arrive.
- **A reset pressed during the 220 ms reset transition is intentionally ignored**, so a
  held `R` cannot queue resets. Visible in tests as a "lost" press.
- **`window.paradoxHeist.state` ships in production.** A deliberate read-only test seam
  (`src/systems/Telemetry.ts`) so the smoke test can verify the mechanic in the same
  bundle players get. Harmless, but keep it to a handful of numbers.
- **Headless Chromium renders at ~18–29 FPS**, so Phaser's delta clamp correctly runs
  the simulation in slow motion there. Scripted input in `scripts/` therefore uses
  generous waits, and the smoke test steers by telemetry rather than by timing. This is
  a test-environment property, not a game bug — at 60 FPS everything runs full speed.
- **No `.git` repository in this folder.** `git rev-parse` here resolves to
  `C:/Users/BEAU` — the user's home directory is an accidental repo. Run `git init`
  inside `paradox-heist/` before committing anything.

---

## 12. Next task (start here)

**Build the Level 01 Echo puzzle: pressure switch + locked door + Time Core.**

The goal is a room that is **impossible in one timeline and solvable in two**: timeline 1
stands on the switch, timeline 2 walks through the opened door and takes the Core. All
the architecture you need already exists — do not special-case Echoes anywhere.

1. **`src/entities/PressureSwitch.ts`** — implement `Interactable` with
   `reactsToPresence: true`, `reactsToInteractAction: false`, `livePlayerOnly: false`.
   Held while `onPresence` receives a non-empty list; released on the empty call.
   Keep it pure (no Phaser) with an `onStateChange` callback, mirroring how `TimeCore`
   splits from `TimeCoreView`. An Echo will hold it for free — that is the payoff of the
   `Interactor` abstraction.
2. **`src/entities/Door.ts`** — open while its linked switch is held, closed otherwise.
   Its arcade static body must toggle (`body.enable = false` / `refreshBody()`), and it
   must reset with the loop. Keep the rules pure and the body/visuals in a view class.
3. **Extend `LevelDef`** in `src/types/level.ts` with `switches: SwitchDef[]` and
   `doors: DoorDef[]`, where each door carries a `switchId`. Extend `validateLevel` to
   reject a door referencing a missing switch id, and add a unit test for it.
4. **Update `LEVEL_01`**: put the Core behind the door, place the switch far enough from
   the door that one player cannot hold it and pass through. Verify with the existing
   "reachable within one loop" test.
5. **Wire it in `GameScene`**: build switches/doors in `levelBuilder`, register them with
   `this.interactions`, add the door body to the player collider, and reset them in
   `beginNextLoop()` (`interactions.resetForLoop()` already fans out — make sure the new
   entities implement it).
6. **Tests:** switch hold/release including an Echo holding it, door open/close mirroring
   the switch, door reset on loop, and the dangling-`switchId` validation.
7. **Verify:** `npm test && npm run build && npm run smoke`, then extend `smoke.mjs` to
   drive the two-timeline solution via telemetry (stand on switch → `R` → walk through
   the door → collect Core) and screenshot it with `scripts/capture.mjs`.

Two small things worth doing while in there:
- Add `switchHeld` / `doorOpen` to `Telemetry` so the smoke test can assert the puzzle.
- Cap device pixel ratio (spec §17) — currently uncapped.
