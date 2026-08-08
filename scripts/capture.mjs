/**
 * Capture a gameplay screenshot from the production build.
 *
 * Useful for visually reviewing changes without playing by hand — including for an
 * AI developer, which cannot see the running game any other way.
 *
 * Usage:  npm run build && node scripts/capture.mjs [outputPath]
 *
 * CAPTURE_LOOPS controls how many timelines to record before capturing, i.e. how
 * many Echoes appear in the shot. Set it to 0 to photograph a clean first loop.
 *
 * CAPTURE_GOAL=1 additionally runs to the Time Core afterwards, so the shot shows the
 * objective being completed.
 */
import { chromium } from 'playwright';
import { preview } from 'vite';

const OUT = process.argv[2] ?? 'capture.png';
const LOOPS = Number(process.env.CAPTURE_LOOPS ?? 3);
const GOAL = process.env.CAPTURE_GOAL === '1';

const server = await preview({ preview: { port: 4174, strictPort: true, open: false } });
const url = server.resolvedUrls.local[0];

// Headless Chromium renders at ~18 FPS with the default software path. Phaser's
// `fps.min` delta clamp then correctly runs the simulation in slow motion, which means
// scripted input covers far less ground than it would at 60 FPS. SwiftShader roughly
// doubles the frame rate; the hold durations below are still generous to compensate.
const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-gpu-rasterization'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
page.on('pageerror', (e) => console.error('PAGEERROR', e.message));
page.on('console', (m) => {
  if (m.type() === 'error') console.error('CONSOLE', m.text());
});

await page.goto(url, { waitUntil: 'load' });
await page.waitForSelector('#game-root canvas');
await page.waitForTimeout(1500);

// Build timelines with enough travel that the Echoes are still visibly moving (and
// therefore still trailing) a second into the following loop.
for (let loop = 0; loop < LOOPS; loop++) {
  await page.mouse.move(700 + loop * 120, 250 + loop * 90);
  await page.keyboard.down('KeyD');
  await page.mouse.down();
  await page.waitForTimeout(1_600);
  await page.mouse.up();
  await page.keyboard.up('KeyD');
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(1_400);
  await page.keyboard.up('KeyW');
  await page.keyboard.press('KeyR');
  // Long enough for the 220ms reset transition to finish even in slow motion.
  await page.waitForTimeout(1_200);
}

if (GOAL) {
  // Steer to the Core using the live telemetry snapshot rather than guessing at
  // key-hold durations — the pickup radius is far tighter than blind timing can hit,
  // especially at the reduced headless frame rate.
  await page.mouse.move(1000, 250);
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

  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const s = await page.evaluate(() => globalThis.paradoxHeist?.state ?? null);
    if (!s || s.coreCollected) break;
    await hold('KeyD', s.coreX - s.playerX > 12);
    await hold('KeyA', s.coreX - s.playerX < -12);
    await hold('KeyS', s.coreY - s.playerY > 12);
    await hold('KeyW', s.coreY - s.playerY < -12);
    await page.waitForTimeout(120);
  }
  for (const key of [...held]) await hold(key, false);
  await page.waitForTimeout(800);
} else {
  // Let the new timeline run on so the Echoes are mid-replay and clearly separated
  // from the live player, rather than all stacked on the spawn point.
  await page.mouse.move(500, 480);
  await page.keyboard.down('KeyS');
  await page.waitForTimeout(900);
  await page.keyboard.up('KeyS');
  await page.mouse.down();
  await page.waitForTimeout(260);
  await page.mouse.up();
  await page.waitForTimeout(120);
}

await page.screenshot({ path: OUT });
console.log('saved', OUT);

await browser.close();
await server.close();
process.exit(0);
