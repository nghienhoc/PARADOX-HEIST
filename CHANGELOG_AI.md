# CHANGELOG_AI — PARADOX HEIST

Append-only log of AI development sessions. Newest entry on top.

**Conventions for whoever writes the next entry:**
- One `##` section per session: date, which AI/model, and the phase worked on.
- Record *decisions and their reasons*, not just file lists — the reasoning is the
  part the next session cannot recover from the diff.
- Note anything you tried that did **not** work, so it is not retried.
- Update [`PROJECT_STATE.md`](PROJECT_STATE.md) in the same session; this file is the
  history, that file is the current truth.

---

## 2026-08-08 — Claude (Opus 5) — session 3 — Level 01 complete vertical slice

### Scope
Prompt 3: turn the prototype into the first complete playable level. Pressure switch, door,
Time Core, extraction, objective HUD, signature reset VFX v1, result screen with grading and
a LocalStorage best. Out of scope and untouched: levels 02–03, boss, drone AI, menus, audio,
adaptive quality. Nothing from sessions 1–2 was rebuilt.

### The design decision worth reading first

**A finished Echo now holds its final pose and keeps interacting.** Session 2 had the
opposite rule — an Echo stopped counting once its recording ran out — and I documented it as
deliberate. Building the level proved it wrong.

The natural play in Level 01 is "walk onto the plate, press R". Under the old rule that
produced an Echo which walked to the plate and then evaporated, so the door shut before the
player could cross, and the only way to get a useful Echo was to stand on the switch idling
for most of a 20-second loop. The browser smoke test caught it as a hard failure, not a
nitpick: the level was uncompletable by its own intended solution.

Reversing it turns the manual reset into a *positioning tool*, matches the game's fantasy (a
timeline that ended standing on a switch left somebody standing on that switch), and
satisfies the spec's rule that a failed timeline must still feel useful (§4). `isPresent`
stays on the `Interactor` interface — it is still the hook for an unbound Echo slot and for
the boss phase that hides an Echo (§8). Visually a finished Echo settles to 80% of its alpha
and stops trailing, rather than fading to near-invisible.

### Built

**Level 01 layout, rebuilt as a real puzzle.** Two chambers split by a wall whose only gap is
the security door; the pressure switch is west, the Core and extraction are east. Standing on
the switch opens the door, and stepping off shuts it — so the room is **structurally**
unsolvable by one timeline rather than gated on distance or reflexes. Nine layout tests
assert the geometry actually enforces that (switch on the near side, Core and extraction both
beyond the door, divider leaves exactly one gap, full route fits in one loop).

**Reusable mechanisms**, each split into pure rules + a `*View`, in the pattern already
established by `TimeCore`:
- `PressureSwitch` — held while any present interactor is in range, released the instant
  nobody is. `livePlayerOnly: false`, so an Echo holds it with **zero** special-casing;
  `holderCount` already supports multi-body plates.
- `Door` — opens only while *every* linked switch is held, making the simultaneous-switch
  puzzles in later levels a data change rather than a code change. A door with no linked
  switches stays permanently shut, so bad level data fails closed instead of handing out a
  free route. `DoorView` toggles a static arcade body and retracts a red barrier to a cyan
  frame in 140 ms.
- `ExtractionZone` — disarmed until the Core is held, Echo-proof via two independent guards,
  latches after one use.

**Level data** gained `switches`, `doors` (with `switchIds: string[]`), `extraction` and
`scoring`, plus validation for dangling switch references, duplicate ids, degenerate doors,
switch-out-of-bounds and bad scoring targets.

**Objective progression** — `LevelRun.currentPhase()` derives the HUD objective from world
state, ordered most-advanced-first so it never regresses when a door shuts behind the player:
FIND A WAY THROUGH THE VAULT → HOLD THE PRESSURE SWITCH → STEAL THE TIME CORE → REACH
EXTRACTION → PARADOX COMPLETE.

**Signature timeline reset VFX v1** (`TimelineResetVfx`), ~440 ms total. Physics freezes; a
camera flash, shake and small inward zoom fire; a shockwave and time shards burst at the
collapse point; and the afterimages are read **backwards out of `EchoRecorder`** so they
follow the player's genuine recorded path, stretched along travel and dissolved across the
rewind. Real data, no physics rewind, no full-screen passes, no tweens driving it — all
preallocated and clock-driven, so it can be retimed or disabled from `RESET` config in one
place. `ACCESSIBILITY.reducedMotion` strips it to a plain colour flash.

**Result screen** (`ResultScene`) as an overlay over a paused `GameScene`: LEVEL COMPLETE,
level name, animated grade, NEW BEST badge, timelines used / completion time / manual resets
/ Echoes created, the stored best, and a REPLAY button (click, `R` or `Enter`). Deliberately
**no CONTINUE** — there is no level select or level 02 to continue to, and a button that goes
nowhere is worse than none.

**Grading and saving.** `gradeFor()`: S = within par timelines *and* par time, A = within par
timelines, B = par + 2, C = beyond. Manual resets are deliberately not penalised — resetting
is the core verb. `SaveManager` persists a best per level in LocalStorage with injected
storage so it is unit testable, and wraps every access: LocalStorage throws in private
browsing and can hold corrupt data from an older build, and neither should break the game.

**Pause** (`Esc`) that sets `time.paused`, which is the important part — it stops the scene
clock so the loop timer, projectile lifetimes and any pending reset timer all hold rather
than silently advancing.

**Also:** carried-Core representation (player state + HUD `◆ TIME CORE` badge + gold ring, no
physical object), transient HUD notices, four new procedural textures (two switch states,
door barrier, extraction pad), and `LoopManager.totalTimelinesCreated` for the run stat.

### Bugs found and fixed

**Extraction armed state was a frame stale.** Pushing `setArmed(core.isCollected)` before the
interaction pass meant the pad's armed state always lagged the Core pickup by one frame — and
worse, its correctness depended on whether the caller happened to sync before or after the
presence pass. Caught by a unit test asserting the pad arms the same frame the Core is taken.
Fixed by making armed state **derived**: the zone asks an `isCoreHeld` supplier at the moment
it matters, and `refresh()` exists only to emit visual callbacks. This removes the whole class
of bug rather than reordering two lines, and is now rule 10 in `PROJECT_STATE.md` §6.

**`ResultScene.data` shadowed Phaser's `Scene.data`** (its DataManager) — a type error, and a
runtime hazard if it had compiled. Renamed to `payload`. Same family of mistake as
`GameScene.controls` vs `Scene.input` from session 1.

### Testing

**196 unit tests** (up from 112), 12 files. New: `mechanisms.test.ts` (switch, door,
extraction, and a full Level 01 objective-chain suite), `levelRun.test.ts` (objective phases,
grade boundaries, run stats), `saveManager.test.ts` (best-result comparison, corrupt data,
quota failures, no-storage). Extended `level.test.ts` with switch/door/scoring validation and
nine Level 01 geometry assertions.

The objective-chain suite is the important one: it builds the real room out of the real
classes and asserts the level **cannot** be solved by one timeline (stepping off the plate
shuts the door), **can** be solved in two with an Echo holding the plate, restores the Core on
a reset before extraction, and cannot be finished by Echoes standing on the Core and the pad.

**Browser smoke test rewritten to play the level**, ~45 checks against the production bundle.
It walks onto the switch, verifies the door tracks it, steps off and verifies it shuts,
resets, then **waits at the doorway 394 px from the plate** — so a held switch can only be the
Echo's doing — walks through, takes the Core, extracts, and checks the result screen, REPLAY,
pause-stops-the-clock, reset-while-carrying-restores-the-Core, timer expiry, and the Echo cap.
Zero console errors throughout.

Steering and state-polling helpers moved into `scripts/lib/drive.mjs`, shared by the smoke
test and the capture script so they cannot drift apart. `capture.mjs` now plays the intended
solution and screenshots all six beats.

**Visually verified** every beat: the room reading clearly with locked red door, the player
holding the glowing switch, the violet Echo holding it while the live player waits at the
retracted door, the Core collected with the gold carry ring and armed extraction pad, and the
S-grade result panel.

### Worth knowing for next session

**Greedy steering in `scripts/lib/drive.mjs` is not a pathfinder.** It slides along walls
fine, but it cannot find a *gap* in one — heading up-and-right toward the Core it slid up the
divider wall away from the doorway and stalled in a corner. This looked exactly like "the
player cannot reach the Core" for a while. Route via waypoints (`walkToPoint` through
`doorX`/`doorY`, now exposed in telemetry).

Mechanism update order inside a frame is fixed and load-bearing: `player.tick` → `loop.tick`
→ `echoes.tick` → `interactions.update` → `door.update` → `extraction.refresh`. Doors must
settle after the presence pass or they lag a frame behind their switch.

### Did not do
- No enemies, audio, menus, save-slot UI, levels 02–03 or boss. Next task is the security
  drone — see `PROJECT_STATE.md` §12.
- `ACCESSIBILITY.reducedMotion` and `shakeScale` are read by effect code but nothing sets
  them; they need a settings menu and persistence.
- No `git init` (still the user's call), no `TECHNICAL_DESIGN.md`.

---

## 2026-08-08 — Claude (Opus 5) — session 2 — Core Echo system

### Scope
Prompt 2: make the Echo mechanic complete and stable. Per-level timeline configuration,
Echo actions, multiple synchronised Echoes, Echo visuals, and fixing the Time Core
pickup. Explicitly out of scope: boss, levels 2–3, enemies, menus, audio, scoring, and
the signature reset animation. Nothing from session 1 was rebuilt.

### Built

**Per-level timeline configuration.** `LevelDef.timeline` now carries `loopDurationMs`
and `maxEchoes`, and they flow from the level into `LoopManager`, `EchoManager` and
`HUD`. `config/balance.ts` no longer has a global `durationMs` or `maxEchoes` at all —
the only global timeline constant left is `sampleRateHz`. `LoopManager`'s constructor
takes a `TimelineConfig` rather than loose numbers, so a level cannot forget to supply
them. `validateLevel` rejects a loop shorter than one sample interval, a non-integer or
`< 1` `maxEchoes`, and anything above the engine's `echoHardCap` of 8. The HUD draws its
timeline tick marks from the level's duration. Level 01 declares 20 000 ms / 3 Echoes.

**Echo actions.** `Interact` (`E`) is now recorded and replayed alongside `Shoot` and
`Dash`. `EchoManager` dispatches all three via `onShoot` / `onDash` / `onInteract`.

**Generic interaction layer.** New `types/interaction.ts` (`Interactor`, `Interactable`)
and `systems/InteractionSystem.ts`. Both `Player` and `Echo` implement `Interactor`,
differing only in `isLivePlayer`. The system does a per-frame presence pass and
nearest-target dispatch for explicit Interact actions. This is the Part 7 groundwork: a
pressure plate will simply ask "is anybody on me?" and a replayed timeline answers yes
exactly as the live player does, with no special-casing anywhere.

**Time Core fixed.** Split into `TimeCore` (pure rules, unit testable) and
`TimeCoreView` (Phaser visuals) driven by callbacks. Collected by walking into it (34 px)
or pressing `E` in range; exactly once per loop; `livePlayerOnly` means an Echo can never
collect it, enforced twice (filtered in `InteractionSystem`, re-checked in `collect()`).
`completeOnCoreCollected` on the level decides whether pickup permanently completes the
level or is per-loop and restored by every reset — the second mode is what an extraction
point will use. On completion the clock stops, a `PARADOX COMPLETE` banner appears, and
`R` restarts the whole level.

**Echo visuals.** New `EchoTrail`: a fixed ring of 3 additive afterimage sprites per
Echo, stamped on a 70 ms timer and faded arithmetically (no tweens, no allocation).
Newest Echo is brightest, oldest dimmest, interpolated from `ECHO_VISUALS`. Echoes now
snap to their recorded starting mark on spawn instead of sliding in from wherever the
previous loop left them, and squash/stretch when replaying a dash.

**Echo cap behaviour, made explicit.** FIFO: the oldest timeline is discarded, the
timeline just recorded is always kept. `LoopManager.evictedOnLastClose` reports it; the
HUD shows a transient `ECHO LIMIT n — OLDEST TIMELINE DISCARDED` notice and turns the
counter orange at `n/n (FULL)`. Never silent.

**HUD additions:** transient notice line, persistent completion banner, cap indicator,
objective text that reflects Core state, `E interact` in the control guide.

### Bugs found and fixed

**Dropped inputs — `JustDown` is unsafe.** The browser smoke test caught `R` doing
nothing: five presses produced zero resets. Cause: `Phaser.Input.Keyboard.JustDown` is a
*polled* flag and `Key.onUp()` clears it, so any tap whose keydown and keyup land inside
one rendered frame is lost outright. At 60 FPS a human tap spans frames and usually
survives; on a slow frame it does not. `InputSystem` now **latches** presses from
Phaser's `DOWN` event into a set that `update()` drains, which cannot miss a press
regardless of frame timing, and also gives the input buffering spec §5 asks for. Also
added `InputSystem.destroy()` and called it from scene shutdown, since we now hold
listeners.

**Frame 0 was recorded one frame late.** The first `tick` has already advanced the clock,
so slot 0 was being stamped `time: 0` but filled with the pose from ~16.7 ms in. Added
`LoopManager.primeRecording(state)`, called after every spawn/respawn, which writes frame
0 with the true spawn pose. This is exactly the value "all Echoes start synchronised at
time 0" depends on, and an integration test now asserts it.

**Frame count depended on floating-point luck.** `capacity = floor(durationMs /
(1000 / rate)) + 1` gave 1201 frames for 20 s but 900 (not 901) for 15 s, because
`1000 / 60` is not exact. Switched to the integer-first `floor(durationMs * rate / 1000)
+ 1` and to computing each slot's time as the exact rational `(index * 1000) / rate`
rather than repeatedly multiplying by a rounded interval.

**A sample slot could slip a frame and record a stale pose.** Even with exact slot times,
the clock *accumulates* deltas, so after 48 frames it sits at 799.9999999999999 while
slot 48 is scheduled at exactly 800 — the slot is skipped that frame and written the next
one with data 16.7 ms too new. Added a 1e-6 ms epsilon to the schedule comparison. This
was the last 3.33 px of error in the route-reproduction test.

**Added `EchoPlaybackCursor.readPoseAt()`.** `Echo.restart()` originally called
`update(0, pose)` and then re-`reset()` to place the Echo on its starting mark, which
worked but consumed action frames as a side effect — one careless edit away from
duplicate shots. `readPoseAt` is a read-only pose lookup that touches no cursor.

### Testing

**112 unit tests** (up from 49), 9 files. New: `interaction.test.ts` (18),
`timeCore.test.ts` (20), `echoIntegration.test.ts` (9), plus timeline-config coverage in
`level.test.ts` and `loopManager.test.ts`, and `readPoseAt` coverage.

`echoIntegration.test.ts` is the automated form of the prompt's manual test scenario: it
drives a scripted "walk left, pause, walk right, shoot once" route through the real
pipeline (`LoopManager` → `EchoRecorder` → `closeTimeline` → `EchoPlaybackCursor`) and
asserts the replayed route matches the script within 3 px, that the shot fires exactly
once at 12/30/60/144 FPS playback and at 30/60 FPS recording, that replay is identical
across five consecutive loops, and that three Echoes stay in lockstep.

**Browser smoke test rewritten: 20 checks, and it now tests the mechanic rather than just
that the page renders.** It asserts a reset creates exactly one Echo, the count caps at
the level maximum while the timeline counter keeps climbing, the loop duration and Echo
cap come from the level, the player can collect the Core, collection completes the level,
and `R` restarts it — all against the production bundle, with zero console errors.

To make that possible, added `src/systems/Telemetry.ts`: a small read-only snapshot on
`window.paradoxHeist.state`. It ships in production on purpose so the smoke test
exercises the same bundle players get, and it lets the test *steer* the player to the
Core using live positions instead of guessing key-hold durations. Documented as a test
seam; keep it to a handful of numbers.

**Visually verified** via `scripts/capture.mjs`: Echoes replaying as semi-transparent
violet with visible afterimage trails and correct age-based brightness, cyan and violet
bullets in flight together, the cap notice, and the full pickup → `TIME CORE SECURED` →
`PARADOX COMPLETE` sequence.

### Worth knowing for next session

**Headless Chromium renders at ~18 FPS** (≈29 with SwiftShader flags), and Phaser's
`fps.min: 30` delta clamp then correctly runs the simulation in slow motion rather than
fast-forwarding. So scripted input covers much less ground than at 60 FPS. This wasted
time before it was measured — the first Core-pickup captures looked like the pickup was
broken when the player simply had not arrived. `scripts/` now uses generous waits, the
SwiftShader flags, and telemetry-based steering. **Do not read a failed scripted
traversal as a gameplay bug without checking the frame rate first.**

`scripts/capture.mjs` gained `CAPTURE_GOAL=1` (steer to the Core and win) alongside
`CAPTURE_LOOPS=n`.

**Never use fixed sleeps to wait for game state in the smoke test.** The first version
did, and it passed alone but failed under machine load: a slower frame rate stretches the
220 ms reset transition unpredictably in wall-clock terms. The test now polls telemetry
via a `waitForState(predicate)` helper and waits for each reset to land before triggering
the next. Verified stable across repeated runs.

### Did not do
- No pressure switch or door yet — Level 01 is still solvable in one timeline, so it does
  not yet *require* an Echo. That is the next task (`PROJECT_STATE.md` §12).
- No `git init` (still the user's call), no `TECHNICAL_DESIGN.md`, no audio, scoring,
  menus, enemies, save data or quality presets.

---

## 2026-08-08 — Claude (Opus 5) — Phase 1 complete, Phase 2 started

### Scope
Repository audit, project scaffolding, and the beginning of the Phase 2 vertical
slice. Explicitly **out of scope** this session: boss, levels 2–3, and advanced
systems (audio, scoring, menus, enemies).

### Repository audit
The repo contained exactly one file: `MASTER_GAME_SPEC.md`. No code, no
`package.json`, no build config. Nothing to preserve, so scaffolding was greenfield.

Also found: `git rev-parse --show-toplevel` from this folder resolves to
`C:/Users/BEAU`. The user's home directory is an accidental git repository and this
project is not itself a repo. Left untouched — flagged for the user rather than
silently creating or modifying git state.

### Built
**Toolchain:** Vite 8.2.1, TypeScript 5.9.3, Phaser 3.90.0, Vitest 4.1.10.
Strict TS (`strict`, `noUnusedLocals`, `noImplicitOverride`, `verbatimModuleSyntax`),
`@/*` path alias, `base: './'` so the build deploys to any static host subpath, and
Phaser split into its own Rollup chunk.

**Vertical slice, all playable:** one data-driven vault room; WASD/arrow movement with
short accel/decel ramps; mouse aiming; hold-LMB shooting with pooled projectiles;
dash with input buffering and squash-and-stretch; a 20-second loop timer with a final
5-second warning; `R` for manual timeline reset plus automatic reset on expiry.

**Echo recording and playback — included deliberately, see decisions below.** Up to
six past timelines replay their movement *and* their shots, in sync.

**Support:** HUD (timer, timeline bar, loop/echo counters, dash meter, objective,
control guide), camera soft-follow with cursor look-ahead, a 150-cap particle pool,
F3 dev-only performance overlay, tab-visibility pause, delta clamping.

**Art:** all 9 textures generated procedurally at boot in `utils/textures.ts`. The
project ships zero image, audio or font files.

### Decisions and why

**Echo recording was included even though the task list stopped at "R to reset
timeline."** A timeline reset with no Echo is half a mechanic — spec §26 names
recording and one Echo as the Phase 2 slice, and without it the requested Vitest
setup would have had almost nothing meaningful to test. Flagging rather than hiding:
this is slightly more than the literal list asked for.

**Phaser 3 had to be pinned explicitly.** `npm install phaser` resolves to **Phaser
4.2.1** now. The spec and the request both say Phaser 3.

**TypeScript pinned to 5.9.3 rather than npm's default.** `npm install -D typescript`
resolves to **7.0.2** (the native Go compiler). Phaser 3's type definitions are very
large and are not validated against TS 7 here; stability outranked novelty. Revisit
later if desired.

**The core simulation is Phaser-free, and this is structural.** `LoopClock`,
`EchoRecorder`, `EchoPlaybackCursor`, `LoopManager`, `math.ts`, `types/*` and
`levels/level01.ts` import no Phaser, so all 49 unit tests run in a plain Node
environment with no DOM, jsdom or WebGL stub. This is why `config/resolution.ts` was
split out of `config/gameConfig.ts` — `level01.ts` needs the room size, and pulling
it from `gameConfig.ts` would have dragged Phaser into the test run.

**Record poses, not inputs** (spec §6). Replaying keypresses through physics drifts.

**Sample times are derived from the loop clock, not accumulated deltas.** Frame `i` is
stamped at `i * intervalMs`, so a 20-second timeline records exactly 1201 frames
whether the browser runs at 30, 60 or 144 FPS. Tested at all three rates.

**Two duplicate-action bugs were designed out, in both directions.**
*Recording:* when several sample slots elapse in one rendered frame, only the first
carries the action mask — copying it into every slot would make one trigger pull
replay as several shots. *Playback:* action frames are consumed by a monotonic
cursor, so a long frame can neither duplicate nor skip an event. Both tested.

**Pending actions are cleared only after a frame is actually committed.**
`GameScene` gates `player.clearPendingActions()` on `loop.samplesWritten > 0`. At
144 FPS most ticks fall between 60 Hz sample slots, so clearing unconditionally would
silently drop shots. This is subtle and easy to reintroduce.

**Everything is pooled; the reset recreates nothing.** Projectiles, particles and Echo
sprites are allocated once at level start. `beginNextLoop()` only repositions and
re-enables. Verified stable over 40 simulated consecutive loops in unit tests and
repeated resets in the browser.

**`GameScene.controls`, not `GameScene.input`** — `Scene.input` is Phaser's
`InputPlugin` and shadowing it is a type error and a runtime hazard.

**Pointer world position is refreshed every frame** via
`pointer.updateWorldPoint(camera)`. Phaser only recomputes `worldX/worldY` on pointer
*movement*, so a scrolling camera would otherwise leave aim silently stale.

### Verification
- `npm test` — 49 tests across 6 files, all passing.
- `npm run build` — succeeds. Game code 25.4 KB (8.8 KB gzip); Phaser 1.20 MB
  (319 KB gzip) in its own chunk.
- `npm run smoke` — new Playwright smoke test against the **production** build:
  canvas present at 1280×720, renders a non-trivial frame, responds to
  movement/aim/shoot/dash, survives four consecutive `R` resets, and reports **zero
  console or page errors**.
- Visually inspected via `scripts/capture.mjs` screenshots — confirmed the HUD, the
  glowing Time Core, cyan player bullets and violet Echo bullets in flight
  simultaneously, and Echoes replaying offset from the live player.

### Fixed during the session
- `manualChunks` object form is no longer accepted by Vite 8's bundler — switched to
  the function form.
- `spawn('npx.cmd', …)` fails with `EINVAL` on Node 24 / Windows, and
  `require.resolve('vite/bin/vite.js')` is blocked by Vite 8's package `exports`.
  The smoke script now uses Vite's JS API (`preview()`) and spawns nothing.
- First screenshot review showed the bottom control guide was unreadable against the
  vault wall, and the player's aim nose was too small to read facing at a glance.
  Added a bottom HUD band and enlarged the nose.
- Unquoted `npm install -D typescript@^5.9.3` on Windows silently loses the `^` and
  requests an exact version. The `npm.cmd` shim routes arguments through `cmd.exe`,
  where `^` is the escape character (PowerShell's own escape character is the
  backtick, so this is easy to misdiagnose). Always quote npm version ranges on
  Windows: `npm install -D "typescript@^5.9.3"`.

### Did not do
- No `git init` (see audit above) — the user's call.
- No `TECHNICAL_DESIGN.md` yet; `PROJECT_STATE.md` §6–7 covers the architecture for now.
- No audio, scoring, menus, enemies, save data, or quality presets.
- The Time Core is still decorative — **Level 01 is not yet winnable.** This is the
  next task, detailed in `PROJECT_STATE.md` §10.
