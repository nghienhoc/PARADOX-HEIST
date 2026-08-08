# PARADOX HEIST

> You have 20 seconds to steal the Time Core. Every failed timeline becomes your next teammate.

A top-down action-puzzle game built on repeated 20-second time loops. When a loop
ends, the timeline you just played returns as an **Echo** that replays your exact
movements and shots. You solve each vault by cooperating with a growing team made
entirely of your past selves.

Runs entirely in the browser. No backend, no API keys, no external asset files.

> **Status: early development.** The core Echo mechanic is complete, tested and stable:
> timelines record, Echoes replay in sync, and the Time Core can be collected to finish
> the level. The switch/door puzzle, enemies, audio, menus and later levels are not built
> yet. See [`PROJECT_STATE.md`](PROJECT_STATE.md) for an exact breakdown.

---

## Play it locally

```bash
npm install
npm run dev
```

Then open the URL Vite prints (default `http://localhost:5173`).

## Controls

| Input | Action |
| --- | --- |
| `W` `A` `S` `D` / arrows | Move |
| Mouse | Aim |
| Left mouse (hold) | Shoot |
| `Space` | Dash |
| `E` | Interact |
| `R` | Reset timeline (creates an Echo) |
| `F3` | Performance overlay (dev builds only) |

Planned: `Q` EMP, `Esc` pause, `M` mute.

## What works today

- One vault chamber built from validated level data
- Responsive movement, mouse aiming, hold-to-fire shooting, dash with input buffering
- **Per-level loop duration and Echo limit** — each level declares its own rules
- Loop timer with a warning state in the final 5 seconds
- Automatic reset on expiry and manual reset with `R`
- **Echo recording and playback** — past timelines replaying in sync, including their
  shots, dashes and interactions, with every recorded action firing exactly once
- **Time Core objective** — collectable once, Echo-proof, completes the level
- Echo visuals: semi-transparent violet, afterimage trails, older timelines dimmer
- HUD: timer, timeline bar, loop counter, Echo counter, dash meter, objective, notices
- Camera soft-follow with cursor look-ahead and trauma-decay screen shake
- Pooled projectiles and particles with hard budget caps

## Commands

```bash
npm run dev          # dev server
npm run build        # typecheck + production build -> dist/
npm run preview      # serve the production build on :4173
npm test             # unit tests (Vitest)
npm run test:watch   # unit tests in watch mode
npm run typecheck    # tsc --noEmit
npm run smoke        # browser smoke test against the built bundle (run build first)
```

Screenshot the running game without playing it:

```bash
npm run build && node scripts/capture.mjs shot.png
CAPTURE_LOOPS=0 node scripts/capture.mjs shot.png   # clean first loop, no Echoes
```

## Tech stack

Vite · TypeScript · Phaser 3 (WebGL with Canvas fallback) · Vitest · Playwright

Logical resolution is 1280×720, scaled to fit the viewport.

## Deployment

`npm run build` produces a fully static `dist/`. `base` is set to `'./'`, so the
output works from any path — GitHub Pages project sites, Netlify, Vercel, or any
static host — with no further configuration.

## Project structure

See [`PROJECT_STATE.md`](PROJECT_STATE.md) §5 for the annotated file map and §6 for the
architectural rules (in particular: the core simulation modules are deliberately
Phaser-free so they can be unit tested in plain Node).

## Testing

- **112 unit tests** covering the loop clock, Echo recording, Echo playback, timeline
  archiving, per-level timeline config, the interaction layer, Time Core rules, and
  level-data validation — including an end-to-end test that drives a scripted route
  through the real recording pipeline and asserts the Echo reproduces it and fires
  exactly one shot at any frame rate.
- **A 20-check browser smoke test** (`npm run smoke`) that loads the production build in
  Chromium and asserts the mechanic actually works: a reset creates exactly one Echo, the
  Echo count caps at the level maximum, the player can collect the Time Core, completion
  works, `R` restarts the level, and nothing logs a console error.

## Performance notes

- Single canvas; no DOM elements for gameplay objects
- All art is procedurally generated at boot — no texture downloads
- Projectiles, particles and Echo sprites are pooled and allocated once per level;
  a timeline reset recreates nothing, so memory stays flat across dozens of loops
- Static room geometry is baked into one draw call; only the HUD bars redraw per frame
- Frame deltas are clamped and the simulation pauses on tab hide, so a stall can never
  fast-forward the loop
- Echo timeline memory is bounded by the Echo cap (6 × 1201 frames ≈ 170 KB), not by
  how many loops have been played

## Known limitations

Documented honestly in [`PROJECT_STATE.md`](PROJECT_STATE.md) §9. The headline one:
**the Time Core is currently decorative and Level 01 cannot yet be won.**

## Assets and licensing

Every visual in the game is drawn procedurally at runtime; the project contains no
third-party image, audio or font files. See [`ASSET_CREDITS.md`](ASSET_CREDITS.md).

## Documentation

| File | Purpose |
| --- | --- |
| [`PROJECT_STATE.md`](PROJECT_STATE.md) | Current state, architecture rules, next task |
| [`CHANGELOG_AI.md`](CHANGELOG_AI.md) | Development history and the reasoning behind decisions |
| [`MASTER_GAME_SPEC.md`](MASTER_GAME_SPEC.md) | Full target design specification |
| [`ASSET_CREDITS.md`](ASSET_CREDITS.md) | Asset provenance and licensing |

## License

MIT.
