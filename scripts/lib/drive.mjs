/**
 * Shared helpers for driving the game from Playwright.
 *
 * Both the smoke test and the screenshot capture script need to read live game state and
 * steer the player around Level 01, so that logic lives here rather than being copied
 * (and then diverging) between the two.
 *
 * Two things to know before using this:
 *
 * 1. **Never sleep for a fixed time to wait for game state.** Headless Chromium renders at
 *    roughly 18–30 FPS, and Phaser's delta clamp correctly turns a low frame rate into slow
 *    motion rather than fast-forwarding. Wall-clock durations are therefore unpredictable.
 *    Poll state with `waitForState`.
 * 2. **Steering is greedy, not a pathfinder.** Holding both axes lets arcade physics slide
 *    the player along a wall, but greedy movement cannot find a *gap* in a wall — it will
 *    slide away from the doorway. Route through waypoints with `walkToPoint`.
 */

/** Chromium flags that roughly double the headless frame rate. */
export const RENDER_ARGS = [
  '--use-gl=angle',
  '--use-angle=swiftshader',
  '--enable-gpu-rasterization',
];

export function createDriver(page) {
  const held = new Set();

  const readState = () => page.evaluate(() => globalThis.paradoxHeist?.state ?? null);

  /** Poll telemetry until `predicate` holds. Returns the last state seen either way. */
  const waitForState = async (predicate, timeoutMs = 30_000) => {
    const deadline = Date.now() + timeoutMs;
    let last = await readState();
    while (Date.now() < deadline) {
      if (last && predicate(last)) return last;
      await page.waitForTimeout(100);
      last = await readState();
    }
    return last;
  };

  const hold = async (key, want) => {
    if (want && !held.has(key)) {
      await page.keyboard.down(key);
      held.add(key);
    } else if (!want && held.has(key)) {
      await page.keyboard.up(key);
      held.delete(key);
    }
  };

  const releaseAll = async () => {
    for (const key of [...held]) await hold(key, false);
  };

  const distTo = (state, x, y) => Math.hypot(x - state.playerX, y - state.playerY);

  /**
   * Walk toward a target until `done(state)` or the budget expires.
   * @param getTarget Called each poll with current state; returns {x, y}.
   */
  const walkTo = async (getTarget, done, budgetMs = 45_000) => {
    const deadline = Date.now() + budgetMs;
    while (Date.now() < deadline) {
      const s = await readState();
      if (!s) break;
      if (done(s)) {
        await releaseAll();
        return s;
      }
      const target = getTarget(s);
      await hold('KeyD', target.x - s.playerX > 10);
      await hold('KeyA', target.x - s.playerX < -10);
      await hold('KeyS', target.y - s.playerY > 10);
      await hold('KeyW', target.y - s.playerY < -10);
      await page.waitForTimeout(110);
    }
    await releaseAll();
    return readState();
  };

  /** Walk to a waypoint, stopping once within `tolerance` px. */
  const walkToPoint = (getPoint, tolerance = 40, budgetMs = 45_000) =>
    walkTo(
      getPoint,
      (s) => {
        const p = getPoint(s);
        return distTo(s, p.x, p.y) <= tolerance;
      },
      budgetMs,
    );

  return { readState, waitForState, hold, releaseAll, distTo, walkTo, walkToPoint };
}

/**
 * Play Level 01's intended two-timeline solution.
 *
 * Loop 1: walk onto the pressure switch and collapse the timeline while standing on it.
 * Loop 2: wait at the door until the Echo holds the switch, then run the heist.
 *
 * @param hooks Optional callbacks fired at each beat, for taking screenshots.
 */
export async function playLevel01(page, driver, hooks = {}) {
  const { waitForState, walkTo, walkToPoint } = driver;

  await hooks.onStart?.(await driver.readState());

  // --- Loop 1: get into position, then reset. ---
  await walkTo((s) => ({ x: s.switchX, y: s.switchY }), (s) => s.switchHeld);
  await hooks.onSwitchHeld?.(await driver.readState());

  await page.keyboard.press('KeyR');
  await waitForState((s) => s.loopNumber === 2);

  // --- Loop 2: let the Echo do the holding. ---
  await walkToPoint((s) => ({ x: s.doorX - 70, y: s.doorY }), 45);
  const echoHolding = await waitForState((s) => s.switchHeld && s.doorOpen, 40_000);
  await hooks.onEchoHolding?.(echoHolding);

  await walkToPoint((s) => ({ x: s.doorX + 60, y: s.doorY }), 45);
  const gotCore = await walkTo((s) => ({ x: s.coreX, y: s.coreY }), (s) => s.coreCollected);
  await hooks.onCoreCollected?.(gotCore);

  const done = await walkTo(
    (s) => ({ x: s.extractionX, y: s.extractionY }),
    (s) => s.levelComplete,
  );
  await hooks.onComplete?.(done);

  return done;
}
