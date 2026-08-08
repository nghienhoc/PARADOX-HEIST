/**
 * Browser smoke test for the production build.
 *
 * Unit tests (`npm test`) cover the timeline and interaction logic in isolation; this
 * checks what they cannot — that the built bundle boots a real Phaser game, renders,
 * and that the Echo mechanic and Time Core pickup actually work when wired together.
 *
 * Game state is read through the read-only telemetry snapshot (see
 * `src/systems/Telemetry.ts`), which also lets us steer the player accurately instead
 * of guessing key-hold durations.
 *
 * Uses Vite's JS API rather than spawning a CLI, which keeps it portable across
 * platforms and avoids Windows' `npx` spawn restrictions.
 *
 * Usage:  npm run build && npm run smoke
 */
import { chromium } from 'playwright';
import { preview } from 'vite';

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

  // Headless Chromium renders at ~18 FPS on the default software path; SwiftShader
  // roughly doubles that. Phaser's delta clamp then correctly runs the simulation in
  // slow motion rather than fast-forwarding, so scripted input covers less ground than
  // it would at 60 FPS. All waits below are generous for that reason.
  browser = await chromium.launch({
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-gpu-rasterization'],
  });
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

  const readState = () => page.evaluate(() => globalThis.paradoxHeist?.state ?? null);

  /**
   * Poll telemetry until `predicate` holds, or give up.
   *
   * Fixed sleeps are unusable here: headless frame rate varies with machine load, and
   * Phaser's delta clamp turns a slow frame rate into slow motion, so the wall-clock
   * duration of the 220ms reset transition is not predictable. Polling state is.
   */
  const waitForState = async (predicate, timeoutMs = 20_000) => {
    const deadline = Date.now() + timeoutMs;
    let last = await readState();
    while (Date.now() < deadline) {
      if (last && predicate(last)) return last;
      await page.waitForTimeout(100);
      last = await readState();
    }
    return last;
  };

  console.log('\nChecks:');

  // --- Boot ---
  const canvas = await page.evaluate(() => {
    const el = document.querySelector('#game-root canvas');
    return el ? { w: el.width, h: el.height } : null;
  });
  check(
    'canvas exists at the logical resolution',
    canvas?.w === 1280 && canvas?.h === 720,
    canvas ? `${canvas.w}x${canvas.h}` : 'no canvas',
  );

  // A blank or solid-colour frame compresses to a couple of KB; a rendered vault with a
  // floor grid, walls, glow and HUD text does not.
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

  // --- Input drives the simulation ---
  await page.mouse.move(900, 300);
  for (const key of ['KeyW', 'KeyA', 'KeyS', 'KeyD']) {
    await page.keyboard.down(key);
    await page.waitForTimeout(150);
    await page.keyboard.up(key);
  }
  await page.mouse.down();
  await page.waitForTimeout(400);
  await page.mouse.up();
  await page.keyboard.press('Space');
  await page.waitForTimeout(300);

  const afterInput = await page.screenshot();
  check('frame changes after input (the game is simulating)', !before.equals(afterInput));

  const moved = await readState();
  check(
    'the player actually moved',
    Math.abs(moved.playerX - initial.playerX) + Math.abs(moved.playerY - initial.playerY) > 5,
  );
  check('the loop timer counts down', moved.loopRemainingMs < initial.loopRemainingMs);

  // --- One reset creates exactly one Echo ---
  await page.keyboard.press('KeyR');
  const afterOneReset = await waitForState((s) => s.loopNumber === 2);
  check('a reset creates exactly one Echo', afterOneReset.echoCount === 1, `count ${afterOneReset.echoCount}`);
  check('a reset advances the timeline counter', afterOneReset.loopNumber === 2);
  check('a reset restarts the loop clock', afterOneReset.loopRemainingMs > moved.loopRemainingMs);

  // --- Echoes accumulate up to the level cap, then hold steady ---
  // Wait for each reset to land before triggering the next. A reset pressed inside the
  // 220ms transition window is deliberately ignored (so a held R cannot queue resets),
  // and that window is unpredictably long in wall-clock terms at headless frame rates.
  let afterManyResets = afterOneReset;
  for (let target = 3; target <= 6; target++) {
    await page.keyboard.press('KeyR');
    afterManyResets = await waitForState((s) => s.loopNumber === target);
  }
  check(
    'Echo count is capped at the level maximum',
    afterManyResets.echoCount === 3,
    `count ${afterManyResets.echoCount} / max ${afterManyResets.maxEchoes}`,
  );
  check(
    'every reset registers, and the counter climbs past the Echo cap',
    afterManyResets.loopNumber === 6,
    `timeline ${afterManyResets.loopNumber} after 5 resets`,
  );

  const withEchoes = await page.screenshot();
  check(
    'still renders with multiple Echoes replaying',
    withEchoes.length > 20_000,
    `${(withEchoes.length / 1024).toFixed(1)} KB PNG`,
  );

  // --- Time Core pickup: steer the player to it using live telemetry ---
  const held = new Set();
  const hold = async (key, want) => {
    if (want && !held.has(key)) {
      await page.keyboard.down(key);
      held.add(key);
    } else if (!want && held.has(key)) {
      await page.keyboard.up(key);
      held.delete(key);
    }
  };

  let collected = false;
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const s = await readState();
    if (s.coreCollected) {
      collected = true;
      break;
    }
    // Greedy steering with a deadband. Sliding along walls handles the one obstacle
    // between the spawn and the Core.
    const dx = s.coreX - s.playerX;
    const dy = s.coreY - s.playerY;
    await hold('KeyD', dx > 12);
    await hold('KeyA', dx < -12);
    await hold('KeyS', dy > 12);
    await hold('KeyW', dy < -12);
    await page.waitForTimeout(120);
  }
  for (const key of [...held]) await hold(key, false);
  await page.waitForTimeout(600);

  check('the player can collect the Time Core', collected);

  const completed = await readState();
  check('collecting the Core completes the level', completed.levelComplete === true);

  const afterWin = await page.screenshot();
  check(
    'the completion state renders',
    afterWin.length > 20_000,
    `${(afterWin.length / 1024).toFixed(1)} KB PNG`,
  );

  // --- R after completion restarts the level cleanly ---
  await page.keyboard.press('KeyR');
  const afterRestart = await waitForState((s) => s.loopNumber === 1 && !s.levelComplete);
  check(
    'R restarts the level after completion',
    afterRestart.loopNumber === 1 &&
      afterRestart.echoCount === 0 &&
      afterRestart.levelComplete === false &&
      afterRestart.coreCollected === false,
    `timeline ${afterRestart.loopNumber}, echoes ${afterRestart.echoCount}`,
  );

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
