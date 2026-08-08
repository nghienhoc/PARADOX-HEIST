# PROJECT_STATE — PARADOX HEIST

> **Read this file first.** It is the single source of truth for where the project stands.
> It is written for an AI developer picking the work up cold, so it should be enough on its
> own — you should not need to read every source file to continue.
>
> Companion files: [`CHANGELOG_AI.md`](CHANGELOG_AI.md) (what changed, when, by whom) and
> [`MASTER_GAME_SPEC.md`](MASTER_GAME_SPEC.md) (the full target design).

- **Last updated:** 2026-08-08
- **Updated by:** Claude (Opus 5) — session 3
- **Current phase:** Phase 2 complete. **Level 01 is fully playable start to finish.**
- **Build status:** `npm test` 196/196 pass · `npm run build` succeeds · `npm run smoke` plays the level to completion

---

## 1. What this game is

Top-down action-puzzle game built on time loops. When a loop ends, the timeline you just
played becomes an **Echo** that replays your exact movements and actions alongside you. You
solve each vault by cooperating with an army of your past selves.

---

## 2. Current state in one paragraph

Level 01 "FIRST ECHO" is a complete vertical slice: the room is structurally unsolvable by
one timeline, and solvable in two. The player walks onto a pressure switch, collapses the
timeline while standing on it, and their Echo then holds that switch for the whole next
loop — opening the security door so the live player can cross, steal the Time Core, and
reach extraction. Completion shows a graded result screen with a LocalStorage best, and
REPLAY restarts cleanly. Loop duration and Echo count are per level. The timeline reset has
its first signature effect (freeze, shockwave, afterimages sampled from the real recording,
camera impulse) at ~440 ms. Not built yet: enemies, EMP, health/damage, audio, menus,
levels 02–03, boss.

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
npm test             # vitest run (196 unit tests)
npm run test:watch   # vitest watch mode
npm run typecheck    # tsc --noEmit only
npm run smoke        # browser smoke test: plays Level 01 to completion (run build first)

# Screenshot the whole intended solution — the only way an AI dev can see the game.
npm run build && node scripts/capture.mjs shots/p
# -> shots/p-1-room.png, -2-switch.png, -3-echo.png, -4-core.png, -5-complete.png, -6-result.png
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
│   ├── SceneKeys.ts              Scene keys + the REPLAY_EVENT name
│   ├── BootScene.ts              Generates textures, starts GameScene
│   ├── GameScene.ts              Orchestration, reset sequence, objective wiring
│   └── ResultScene.ts            Graded result overlay
├── entities/
│   ├── Player.ts                 Movement, aim, dash, weapon, interact. Is an Interactor.
│   ├── Echo.ts                   One replayed timeline. Kinematic sprite, is an Interactor.
│   ├── EchoTrail.ts              3-ghost afterimage trail per Echo
│   ├── Projectile.ts             Projectile + ProjectilePool
│   ├── PressureSwitch.ts         Plate RULES                              [pure]
│   ├── PressureSwitchView.ts     Plate visuals
│   ├── Door.ts                   Door RULES (switch-driven)                [pure]
│   ├── DoorView.ts               Door visuals + toggling static body
│   ├── TimeCore.ts               Objective pickup RULES                    [pure]
│   ├── TimeCoreView.ts           Objective pickup visuals
│   ├── ExtractionZone.ts         Exit pad RULES                            [pure]
│   └── ExtractionZoneView.ts     Exit pad visuals
├── systems/
│   ├── LoopClock.ts              The authoritative loop clock              [pure]
│   ├── EchoRecorder.ts           Fixed-rate sampling of player state       [pure]
│   ├── EchoPlaybackCursor.ts     Replays one timeline                      [pure]
│   ├── LoopManager.ts            Clock + recorder + timeline archive        [pure]
│   ├── InteractionSystem.ts      Presence + Interact dispatch               [pure]
│   ├── LevelRun.ts               Objective phases, run stats, grading       [pure]
│   ├── SaveManager.ts            LocalStorage best results (storage injected) [pure]
│   ├── EchoManager.ts            Pool of Echo sprites, action dispatch
│   ├── InputSystem.ts            Latched input snapshot, dash buffering
│   ├── EffectsSystem.ts          Fixed-size particle pool
│   ├── TimelineResetVfx.ts       Signature timeline-collapse effect
│   └── Telemetry.ts              Read-only state snapshot for the smoke test
├── ui/
│   ├── HUD.ts                    Timer, timeline bar, counters, objective, notices, banner
│   └── DebugOverlay.ts           F3 perf overlay, dev builds only
├── levels/
│   ├── level01.ts                Level 01 data: timeline, scoring, walls, switch, door, core, extraction
│   └── levelBuilder.ts           Turns level data into scene objects
├── types/
│   ├── echo.ts                   EchoFrame / EchoAction / EchoTimeline
│   ├── interaction.ts            Interactor / Interactable                 [pure]
│   └── level.ts                  LevelDef + validateLevel                  [pure]
└── utils/
    ├── math.ts                   clamp, lerp, lerpAngle, clampDelta        [pure]
    └── textures.ts               ALL art, generated procedurally at boot

tests/          12 files, 196 tests — all against [pure] modules
scripts/        smoke.mjs, capture.mjs, lib/drive.mjs (shared Playwright steering)
```

`[pure]` = **contains no Phaser import.** See §6 — this is load-bearing.

---

## 6. Architectural rules — do not break these

1. **Core simulation logic stays Phaser-free.** Everything marked `[pure]` is imported by
   unit tests running in plain Node. Phaser touches `window`/`document` at import time, so
   adding `import Phaser` to any of those modules (or anything they import) instantly breaks
   the test suite. This is why every mechanism is split into rules + a `*View`.

2. **Loop duration and Echo count are per level, never global.** They live in
   `LevelDef.timeline`. `config/balance.ts` deliberately has no `durationMs` or `maxEchoes`.

3. **Record poses, never replay inputs.** Replaying keypresses through physics drifts.

4. **Echoes are kinematic.** `Echo` is a plain `Sprite` with no physics body, so nothing —
   player, door, or another Echo — can push it off its recorded path.

5. **Sample times come from the loop clock, not accumulated deltas.** Frame `i` is stamped
   at exactly `i * 1000 / sampleRateHz`. Two numerical details are easy to undo by accident:
   capacity must be `floor(durationMs * rate / 1000) + 1` (the `durationMs / (1000/rate)`
   form loses a frame at 15 s and 30 s), and the schedule comparison carries a 1e-6 ms
   epsilon because the clock accumulates deltas.

6. **An action fires exactly once, in both directions.** Recording: only the first of a
   catch-up batch carries the action mask. Playback: a monotonic cursor consumes action
   frames. Use `readPoseAt()` — never `update()` — when you only want to look at a pose.

7. **Only clear the player's pending actions once a frame was committed.** `GameScene`
   checks `loop.samplesWritten > 0`.

8. **Prime the recording at the start of every loop.** `loop.primeRecording(state)` after
   every spawn/respawn, before the first `tick`.

9. **Input is latched, not polled.** Do not switch back to `JustDown`: it is a polled flag
   that `Key.onUp()` clears, so a tap landing inside one frame is lost entirely.

10. **Derive state, do not push it, when ordering could bite.** `ExtractionZone` asks a
    supplier whether the Core is held rather than being told, so it cannot be a frame stale.
    Prefer this shape for anything read during the interaction pass.

11. **Mechanism update order inside a frame is fixed** and matters:
    `player.tick` → `loop.tick` → `echoes.tick` → `interactions.update` → `door.update` →
    `extraction.refresh`. Doors must settle *after* the presence pass or they lag a frame.

12. **Resetting reuses objects, never recreates them.** Projectiles, particles, Echo sprites
    and reset-VFX ghosts are pooled and allocated once at level start.

13. **`GameScene.controls`, not `GameScene.input`.** `Scene.input` is Phaser's InputPlugin.
    Likewise `ResultScene.payload`, not `.data` — `Scene.data` is Phaser's DataManager.

14. **All tuning numbers in `config/balance.ts`; all colours and depths in `config/theme.ts`.**

15. **No external asset files.** Every texture is drawn procedurally in `utils/textures.ts`.

---

## 7. How Echo recording works

`EchoRecorder` samples the player's authoritative state at a fixed **60 Hz**
(`LOOP.sampleRateHz`, the one genuinely global timeline constant). Each frame is a flat
`EchoFrame`: `{ time, x, y, rotation, animationState, actionMask }`. `actionMask` is a
bitmask of `EchoAction` (`Shoot`, `Interact`, `Dash`, `EMP`, `Pickup`, `Drop`) so one frame
can carry several events with no allocation. `EMP`, `Pickup` and `Drop` are declared but not
yet produced.

Frame count is `floor(durationMs * 60 / 1000) + 1`, both endpoints sampled: 20 s → 1201
frames, 15 s → 901, 30 s → 1801 — identical at any render frame rate. The buffer is
allocated once and reused; `takeSnapshot()` deep-copies on close.

---

## 8. How Echo playback works

One `EchoPlaybackCursor` per timeline, all driven by the same `clock.elapsedMs`.

- **Pose:** interpolated between the two surrounding samples, written into a reused object.
- **Actions:** a monotonic `actionIndex` consumes every frame that has become due, so each
  recorded action fires exactly once and a long hitch fires everything it swallowed.
- **After the recording ends:** the Echo **holds its final pose and keeps interacting.**
  See §9 — this is a deliberate design decision and the thing that makes Level 01 teachable.

**Reset sequence** (`beginNextLoop`, `RESET_TOTAL_MS` = 440 ms after the trigger):

```
loop.closeTimeline()        snapshot -> archive (FIFO capped), clock.restart()
echoes.syncTimelines(...)   bind timelines to pooled Echo slots
rebuildInteractors()        [player, ...active echoes]
bullets/fx/resetVfx clear; echoes.restartAll(); interactions.resetForLoop(); doors reset
player.respawn(); loop.primeRecording()
```

---

## 9. Level 01 — current state

**Layout.** Two chambers split by a wall whose only gap is the security door. The pressure
switch is in the west chamber; the Time Core and extraction pad are both east.

```
┌──────────── WEST CHAMBER ────────────┬───┬──── EAST CHAMBER ────────┐
│  [switch]                            │   │        (core)            │
│                                      │ D │                          │
│  (spawn)                             │   │              [extract]   │
└──────────────────────────────────────┴───┴──────────────────────────┘
```

Standing on the switch opens the door — but stepping off to walk through shuts it again.
The room is therefore **structurally** unsolvable by one timeline, not gated on distance or
reflexes, which is what makes the first Echo feel necessary rather than convenient.

**Configuration** (all in `src/levels/level01.ts`):

| Setting | Value |
| --- | --- |
| `timeline.loopDurationMs` | 20 000 |
| `timeline.maxEchoes` | 3 |
| `scoring.parTimelines` | 2 |
| `scoring.parTimeMs` | 50 000 |
| `completeOnCoreCollected` | `false` (extraction is the win condition) |

**Pressure switch** (`PressureSwitch`). Held while *any* present interactor is within its
radius (36 px) — live player or Echo, no special-casing. Releases the moment nobody is on
it. `onStateChange` fires only on a real transition. Resets released on every loop.
Reusable: `holderCount` already supports multi-body plates, and a level can declare any
number of switches.

**Door** (`Door`). Opens only while **every** linked switch is held, so the
simultaneous-switch puzzles in later levels are a data change, not a code change. A door
with no linked switches stays permanently shut — bad level data fails closed. `DoorView`
toggles a static arcade body and retracts a red energy barrier to a cyan frame in 140 ms.
Echoes are unaffected either way: they have no physics body.

**Time Core** (`TimeCore`). Collected by the live player walking into it (34 px) or pressing
`E` in range. Exactly once per loop. `livePlayerOnly` means an Echo can **never** collect it,
enforced twice. Because `completeOnCoreCollected` is false, a loop reset before extraction
restores the Core to its pedestal. Possession is shown by player state + a HUD `◆ TIME CORE`
badge + a gold ring around the player — no physical carried object.

**Extraction** (`ExtractionZone`). Disarmed until the Core is held; armed state is *derived*
from a supplier, so it can never be a frame stale. Armed it turns gold and pulses. Entering
it as the live player completes the level; an Echo never can (two independent guards), and
completion latches so it cannot fire twice.

**Echo cap behaviour.** FIFO — the oldest timeline is discarded and the one just recorded is
always kept. `LoopManager.evictedOnLastClose` reports it, and the HUD shows
`ECHO LIMIT 3 — OLDEST TIMELINE DISCARDED` plus an orange `ECHOES 3/3 (FULL)` counter.

**Objective HUD.** Derived by `currentPhase()` from world state, ordered
most-advanced-first so it never regresses when a door shuts behind the player:
`FIND A WAY THROUGH THE VAULT` → `HOLD THE PRESSURE SWITCH` → `STEAL THE TIME CORE` →
`REACH EXTRACTION` → `PARADOX COMPLETE`.

**Result screen** (`ResultScene`). Overlay over a paused `GameScene`. Shows LEVEL COMPLETE,
the level name, a big grade, NEW BEST when applicable, and timelines used / completion time
/ manual resets / Echoes created, plus the stored best. `REPLAY` (click, `R` or `Enter`)
resumes and restarts. **No CONTINUE button** — there is no level select or level 02 to go to
yet, and a button that goes nowhere is worse than none.

**Grading.** `gradeFor(timelines, time, scoring)`: S = within par timelines *and* par time,
A = within par timelines, B = up to par + 2, C = beyond. Manual resets are deliberately
**not** penalised — resetting is the core verb. Best result per level is stored in
LocalStorage; fewer timelines wins, ties broken by time.

**Reset VFX status.** Version 1, ~440 ms total (`RESET.freezeMs` 110 + `rewindMs` 330, plus a
cosmetic 140 ms materialise that does not block play). Physics freezes; a camera flash,
shake and small inward zoom fire; a shockwave and time shards burst at the collapse point;
and `RESET.ghostCount` afterimages are placed **backwards along the genuine recorded path**
read out of `EchoRecorder`, stretched along travel and dissolved over the rewind window. No
physics rewind, no full-screen passes, no tweens driving it — everything is preallocated and
clock-driven, so it can be retimed or disabled from `RESET` config in one place.
`ACCESSIBILITY.reducedMotion` strips it to a plain colour flash.

---

## 10. Done / not done

### Done and verified
- [x] Vite + TS + Phaser 3 + Vitest project, clean modular structure
- [x] Movement, mouse aiming, hold-to-fire shooting, dash with input buffering, `E` interact
- [x] Per-level `loopDuration` / `maxEchoes` / scoring, honoured by clock, recorder, pool, HUD
- [x] Echo recording at 60 Hz, frame count independent of render rate
- [x] Multiple Echoes replaying in lockstep on one clock, with exactly-once actions
- [x] Echo visuals: violet, semi-transparent, afterimage trails, older Echoes dimmer
- [x] **Pressure switch held by Echoes — the mechanic's first real proof**
- [x] **Security door driven by switch state, with a toggling collision body**
- [x] **Time Core pickup, restored by a reset before extraction**
- [x] **Extraction zone, armed by Core possession, Echo-proof, fires once**
- [x] **Level 01 completable start to finish in two timelines**
- [x] Objective phase HUD, transient notices, carried-Core badge and ring
- [x] Signature timeline reset VFX v1 with recorded-path afterimages
- [x] Result screen with C/B/A/S grade and LocalStorage best; REPLAY restarts cleanly
- [x] `Esc` pause that genuinely stops the loop clock
- [x] FIFO Echo eviction at the cap, announced in the HUD
- [x] Camera soft-follow, look-ahead, accessibility-scaled shake
- [x] Pooled projectiles, particles and VFX ghosts; listener teardown on shutdown
- [x] 196 unit tests + a browser smoke test that plays the level to completion

### Not started
- [ ] Enemies (security drone), lasers, alarm state, EMP, player health/damage
- [ ] Audio (nothing at all yet)
- [ ] Menus: loading, main menu, level select, settings, pause menu, credits
- [ ] Levels 02 and 03, Chrono Warden boss
- [ ] Campaign progression / level unlocks
- [ ] Quality presets, adaptive quality, device-pixel-ratio cap
- [ ] Accessibility *settings UI* (the flags exist in `ACCESSIBILITY`, nothing drives them)
- [ ] `TECHNICAL_DESIGN.md`

---

## 11. Known issues and deliberate shortcuts

- **A finished Echo holds its final pose and keeps interacting.** This reverses session 2's
  rule and is deliberate: it makes the manual reset a *positioning tool* ("walk onto the
  plate, press R, my past self stands there") instead of forcing the player to idle on a
  switch for most of a loop. Without it Level 01 is far harder to teach. Flagged because it
  is a genuine design decision, not a bug fix.
- **`EchoAction.Interact` has no shipped consumer that requires it.** `E` is recorded,
  replayed and dispatched, and the Core and extraction pad both accept it, but no mechanism
  *needs* it. The pathway is unit tested with stub interactables.
- **Pause is a frozen overlay, not a menu.** No settings, no restart button.
- **No CONTINUE on the result screen** — nowhere to continue to yet.
- **`ACCESSIBILITY` flags are compile-time constants.** `reducedMotion` and `shakeScale` are
  read by the effect code but nothing sets them; they need a settings menu and persistence.
- **The room is exactly one screen (1280×720)**, so the camera never scrolls and the
  look-ahead code has no visible effect yet. It is in place for larger rooms.
- **Echoes have no collision at all** — they cannot block bullets or bodies. Correct for now
  (kinematic authority) but needs a decision when enemies arrive.
- **A reset pressed during the reset transition is intentionally ignored**, so a held `R`
  cannot queue resets.
- **`window.paradoxHeist.state` ships in production.** A deliberate read-only test seam
  (`src/systems/Telemetry.ts`) so the smoke test can play the real bundle.
- **Headless Chromium renders at ~18–29 FPS**, so Phaser's delta clamp correctly runs the
  simulation in slow motion there. Scripted input in `scripts/` therefore polls state and
  never sleeps for a fixed duration. This is a test-environment property, not a game bug.
  **Do not read a failed scripted traversal as a gameplay bug without checking frame rate.**
- **Greedy steering in `scripts/lib/drive.mjs` is not a pathfinder** — it cannot find a gap
  in a wall and will slide away from the doorway. Route via waypoints (`walkToPoint`).
- **No `.git` repository in this folder.** `git rev-parse` here resolves to `C:/Users/BEAU`
  — the user's home directory is an accidental repo. Run `git init` inside `paradox-heist/`
  before committing anything.

---

## 12. Next task (start here)

**Phase 3 — enemies and hazards: the security drone.** Level 01 proves the Echo mechanic
against static mechanisms; the next thing the game needs is a reason to *plan* rather than
just route, which means something that can see you and shoot back.

1. **`src/entities/Drone.ts`** — pure-logic finite state machine (Patrol → Suspicious →
   Alert → Chase → Attack → Disabled → Destroyed → Return), driven by waypoints from level
   data. Keep it Phaser-free with a `DroneView` for visuals, following the established split.
   Behaviour must be **deterministic** so recorded Echo plans stay valid (spec §22) — use a
   seeded RNG if any variation is needed, never `Math.random()` in AI decisions.
2. **Vision cone + telegraph.** A visible cone, an audible/visual tell before firing, and no
   instant attacks. Echoes must be able to attract or distract it — they are already
   `Interactor`s, so give the drone a target list rather than a hardcoded player reference.
3. **Player health and damage.** `PLAYER.maxHealth` already exists and is unused. Decide what
   death does: most likely collapse the timeline immediately (which is thematically perfect
   and reuses the existing reset path) rather than a game-over.
4. **Extend `LevelDef`** with `drones: DroneDef[]` (patrol waypoints, vision range, fire
   rate) and validate it.
5. **Reset correctly** — drone position, state, health and projectiles all restore per loop
   (spec §7); add them to `beginNextLoop`.
6. **Tests:** FSM transitions, determinism across repeated identical inputs, Echo-as-target,
   reset restoration.
7. **Verify:** `npm test && npm run build && npm run smoke`, then screenshot with
   `scripts/capture.mjs`.

Smaller items worth picking up alongside:
- `EchoAction.EMP` is declared but never produced — wire `Q` once there is something to
  disable.
- Cap device pixel ratio (spec §17).
- A minimal main menu, so the result screen can finally have a CONTINUE button.
