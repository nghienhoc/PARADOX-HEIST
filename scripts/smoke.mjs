/**
 * Browser smoke test for the production build.
 *
 * Unit tests (`npm test`) cover the timeline, mechanism and scoring logic in isolation;
 * this checks what they cannot — that the built bundle boots a real Phaser game and that
 * Level 01 can actually be *played* to completion: create an Echo, let it hold the
 * pressure switch, walk through the opened door, take the Time Core, reach extraction.
 *
 * State is read through the read-only telemetry snapshot (`src/systems/Telemetry.ts`),
 * which also lets us steer the player accurately instead of guessing key-hold durations.
 * See `scripts/lib/drive.mjs` for why nothing here sleeps for a fixed duration.
 *
 * Usage:  npm run build && npm run smoke
 */
import { chromium } from 'playwright';
import { preview } from 'vite';
import { createDriver, RENDER_ARGS } from './lib/drive.mjs';

const failures = [];

function check(label, condition, detail = '') {
  console.log(`  [${condition ? 'PASS' : 'FAIL'}] ${label}${detail ? ` — ${detail}` : ''}`);
  if (!condition) failures.push(label);
}

let server;
let browser;

try {
  console.log('Starting vite preview...');
  server = await preview({ preview: { port: 4173, strictPort: true, open: false } });

  const url = server.resolvedUrls?.local?.[0];
  if (!url) throw new Error('vite preview did not report a local URL');

  browser = await chromium.launch({ args: RENDER_ARGS });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(`pageerror: ${err.message}`));

  console.log(`Loading ${url}`);
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForSelector('#game-root canvas', { timeout: 15_000 });
  await page.waitForTimeout(2_000);

  const { readState, waitForState, hold, releaseAll, distTo, walkTo, walkToPoint } =
    createDriver(page);

  console.log('\nChecks:');

  // ==========================================================================
  // Boot
  // ==========================================================================
  const canvas = await page.evaluate(() => {
    const el = document.querySelector('#game-root canvas');
    return el ? { w: el.width, h: el.height } : null;
  });
  check(
    'canvas exists at the logical resolution',
    canvas?.w === 1280 && canvas?.h === 720,
    canvas ? `${canvas.w}x${canvas.h}` : 'no canvas',
  );

  // A blank or solid-colour frame compresses to a couple of KB; a rendered vault does not.
  const before = await page.screenshot();
  check(
    'canvas renders a non-trivial frame',
    before.length > 20_000,
    `${(before.length / 1024).toFixed(1)} KB PNG`,
  );

  const initial = await readState();
  check('telemetry is available', initial !== null);
  check('starts on timeline 1 with no Echoes', initial?.loopNumber === 1 && initial?.echoCount === 0);
  check(
    'loop duration comes from the level, not a global',
    initial?.loopDurationMs === 20_000,
    `${initial?.loopDurationMs} ms`,
  );
  check('Echo cap comes from the level', initial?.maxEchoes === 3, `max ${initial?.maxEchoes}`);
  check('door starts closed', initial?.doorOpen === false);
  check('extraction starts disarmed', initial?.extractionArmed === false);
  check(
    'opening objective is shown',
    initial?.objective === 'FIND A WAY THROUGH THE VAULT',
    initial?.objective,
  );

  // ==========================================================================
  // Input drives the simulation
  // ==========================================================================
  await page.mouse.move(900, 300);
  await page.keyboard.down('KeyD');
  await page.waitForTimeout(400);
  await page.keyboard.up('KeyD');
  await page.mouse.down();
  await page.waitForTimeout(300);
  await page.mouse.up();
  await page.keyboard.press('Space');
  await page.waitForTimeout(300);

  const moved = await readState();
  check('the player actually moved', Math.abs(moved.playerX - initial.playerX) > 5);
  check('the loop timer counts down', moved.loopRemainingMs < initial.loopRemainingMs);
  check('frame changes after input', !before.equals(await page.screenshot()));

  // ==========================================================================
  // LOOP 1 — hold the switch, prove the door tracks it, then collapse the timeline
  // ==========================================================================
  const onSwitch = await walkTo((s) => ({ x: s.switchX, y: s.switchY }), (s) => s.switchHeld);
  check('the player can hold the pressure switch', onSwitch.switchHeld === true);
  check('holding the switch opens the door', onSwitch.doorOpen === true);

  // Step off: the door must shut again. This is what makes the level unsolvable alone.
  await hold('KeyS', true);
  const steppedOff = await waitForState((s) => !s.switchHeld, 10_000);
  await releaseAll();
  check('stepping off the switch closes the door', steppedOff.doorOpen === false);

  // Back on the plate, then reset while standing on it — the intended play.
  await walkTo((s) => ({ x: s.switchX, y: s.switchY }), (s) => s.switchHeld);
  await page.keyboard.press('KeyR');

  const loop2 = await waitForState((s) => s.loopNumber === 2);
  check('a reset creates exactly one Echo', loop2.echoCount === 1, `count ${loop2.echoCount}`);
  check('the reset restarts the loop clock', loop2.loopRemainingMs > 19_000);

  // ==========================================================================
  // LOOP 2 — the Echo holds the switch; the player runs the heist
  // ==========================================================================
  // Wait at the doorway, deliberately nowhere near the plate, so a held switch can only be
  // the Echo's doing.
  const atDoor = await walkToPoint((s) => ({ x: s.doorX - 70, y: s.doorY }), 45);
  check(
    'the player waits at the door, far from the switch',
    distTo(atDoor, atDoor.switchX, atDoor.switchY) > 250,
    `${distTo(atDoor, atDoor.switchX, atDoor.switchY).toFixed(0)} px from the switch`,
  );

  const echoHolding = await waitForState((s) => s.switchHeld && s.doorOpen, 40_000);
  check('the Echo holds the pressure switch on its own', echoHolding.switchHeld === true);
  check('the Echo opening the switch opens the door', echoHolding.doorOpen === true);
  check(
    'the player is still nowhere near the switch',
    distTo(echoHolding, echoHolding.switchX, echoHolding.switchY) > 250,
  );

  const withEcho = await page.screenshot();
  check(
    'renders with an Echo replaying',
    withEcho.length > 20_000,
    `${(withEcho.length / 1024).toFixed(1)} KB PNG`,
  );

  // Route through the doorway — greedy steering cannot find a gap in a wall.
  await walkToPoint((s) => ({ x: s.doorX + 60, y: s.doorY }), 45);
  const gotCore = await walkTo((s) => ({ x: s.coreX, y: s.coreY }), (s) => s.coreCollected);
  check('the player can reach and collect the Time Core', gotCore.coreCollected === true);
  check('collecting the Core arms extraction', gotCore.extractionArmed === true);
  check('objective advances to extraction', gotCore.objective === 'REACH EXTRACTION', gotCore.objective);
  check('the level is not complete just from the pickup', gotCore.levelComplete === false);

  const done = await walkTo(
    (s) => ({ x: s.extractionX, y: s.extractionY }),
    (s) => s.levelComplete,
  );
  check('reaching extraction completes the level', done.levelComplete === true);
  check('completed in 2 timelines', done.timelinesUsed === 2, `${done.timelinesUsed} timelines`);
  check('the intended solution earns top marks', done.grade === 'S', done.grade);

  // ==========================================================================
  // Result screen and replay
  // ==========================================================================
  await page.waitForTimeout(2_200);
  const resultShot = await page.screenshot();
  check(
    'the result screen renders',
    resultShot.length > 20_000,
    `${(resultShot.length / 1024).toFixed(1)} KB PNG`,
  );

  await page.keyboard.press('KeyR');
  const replayed = await waitForState((s) => s.loopNumber === 1 && !s.levelComplete);
  check(
    'REPLAY restarts the level cleanly',
    replayed.loopNumber === 1 &&
      replayed.echoCount === 0 &&
      replayed.levelComplete === false &&
      replayed.coreCollected === false &&
      replayed.doorOpen === false,
    `timeline ${replayed.loopNumber}, echoes ${replayed.echoCount}`,
  );
  check('the replayed run counts down again', replayed.loopRemainingMs > 15_000);

  // ==========================================================================
  // Pause must stop the clock
  // ==========================================================================
  await page.keyboard.press('Escape');
  const paused = await waitForState((s) => s.paused, 8_000);
  check('Escape pauses the game', paused.paused === true);

  const pausedAt = paused.loopRemainingMs;
  await page.waitForTimeout(1_800);
  const stillPaused = await readState();
  check(
    'the loop timer does not advance while paused',
    Math.abs(stillPaused.loopRemainingMs - pausedAt) < 1,
    `${pausedAt.toFixed(1)} -> ${stillPaused.loopRemainingMs.toFixed(1)} ms`,
  );

  await page.keyboard.press('Escape');
  const resumed = await waitForState((s) => !s.paused, 8_000);
  check('Escape resumes the game', resumed.paused === false);

  // ==========================================================================
  // Resetting while carrying the Core must put it back
  // ==========================================================================
  // Re-run the two-timeline solution far enough to hold the Core again.
  await walkTo((s) => ({ x: s.switchX, y: s.switchY }), (s) => s.switchHeld);
  await page.keyboard.press('KeyR');
  await waitForState((s) => s.loopNumber === 3);

  await walkToPoint((s) => ({ x: s.doorX - 70, y: s.doorY }), 45);
  await waitForState((s) => s.switchHeld && s.doorOpen, 40_000);
  await walkToPoint((s) => ({ x: s.doorX + 60, y: s.doorY }), 45);
  const carrying = await walkTo((s) => ({ x: s.coreX, y: s.coreY }), (s) => s.coreCollected);
  check('the Core can be collected again after a replay', carrying.coreCollected === true);

  await page.keyboard.press('KeyR');
  const afterCarryReset = await waitForState((s) => s.loopNumber === 4);
  check(
    'a reset while carrying the Core restores it',
    afterCarryReset.coreCollected === false,
    `collected=${afterCarryReset.coreCollected}`,
  );
  check('extraction disarms when the Core goes back', afterCarryReset.extractionArmed === false);
  check(
    'the objective falls back from extraction',
    afterCarryReset.objective !== 'REACH EXTRACTION',
    afterCarryReset.objective,
  );

  // ==========================================================================
  // Timer expiry must collapse the timeline on its own
  // ==========================================================================
  // Stand still and let the clock run out. Slow motion in headless makes a 20s loop take
  // roughly a minute of wall time, hence the generous budget.
  const expired = await waitForState((s) => s.loopNumber === 5, 150_000);
  check('the loop collapses on its own when the timer expires', expired.loopNumber === 5);
  check(
    'an expired timeline still becomes an Echo',
    expired.echoCount === 3,
    `count ${expired.echoCount} / max ${expired.maxEchoes}`,
  );

  // ==========================================================================
  // Echo cap holds under repeated resets
  // ==========================================================================
  let capState = expired;
  for (let target = 6; target <= 8; target++) {
    await page.keyboard.press('KeyR');
    capState = await waitForState((s) => s.loopNumber === target);
  }
  check(
    'Echo count stays capped at the level maximum',
    capState.echoCount === 3,
    `count ${capState.echoCount} / max ${capState.maxEchoes}`,
  );
  check('the timeline counter keeps climbing past the cap', capState.loopNumber === 8);

  check(
    'no console or page errors',
    consoleErrors.length === 0,
    consoleErrors.length ? consoleErrors.join(' | ') : 'clean',
  );
} catch (err) {
  console.error(`\nSmoke run threw: ${err.stack ?? err.message}`);
  failures.push(String(err.message));
} finally {
  await browser?.close();
  await server?.close();
}

if (failures.length > 0) {
  console.error(`\nSMOKE FAILED (${failures.length}):\n - ${failures.join('\n - ')}`);
  process.exit(1);
}
console.log('\nSMOKE PASSED');
process.exit(0);
