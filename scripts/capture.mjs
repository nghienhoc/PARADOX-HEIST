/**
 * Capture gameplay screenshots from the production build by actually playing Level 01.
 *
 * Useful for visually reviewing changes without playing by hand — including for an AI
 * developer, which cannot see the running game any other way.
 *
 * Usage:  npm run build && node scripts/capture.mjs [outputPrefix]
 *
 * Writes one PNG per beat of the intended solution:
 *   <prefix>-1-room.png      the room at the start of timeline 1
 *   <prefix>-2-switch.png    player holding the pressure switch, door open
 *   <prefix>-3-echo.png      the Echo holding the switch while the player waits at the door
 *   <prefix>-4-core.png      the Time Core collected, extraction armed
 *   <prefix>-5-complete.png  extraction reached
 *   <prefix>-6-result.png    the result screen
 */
import { chromium } from 'playwright';
import { preview } from 'vite';
import { createDriver, playLevel01, RENDER_ARGS } from './lib/drive.mjs';

const PREFIX = process.argv[2] ?? 'capture';

const server = await preview({ preview: { port: 4174, strictPort: true, open: false } });
const url = server.resolvedUrls.local[0];

const browser = await chromium.launch({ args: RENDER_ARGS });
const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
page.on('pageerror', (e) => console.error('PAGEERROR', e.message));
page.on('console', (m) => {
  if (m.type() === 'error') console.error('CONSOLE', m.text());
});

await page.goto(url, { waitUntil: 'load' });
await page.waitForSelector('#game-root canvas');
await page.waitForTimeout(1_600);

const shot = async (name) => {
  const path = `${PREFIX}-${name}.png`;
  await page.screenshot({ path });
  console.log('saved', path);
};

const driver = createDriver(page);

await playLevel01(page, driver, {
  onStart: () => shot('1-room'),
  onSwitchHeld: () => shot('2-switch'),
  onEchoHolding: () => shot('3-echo'),
  onCoreCollected: () => shot('4-core'),
  onComplete: async () => {
    await page.waitForTimeout(350);
    await shot('5-complete');
  },
});

// The result panel appears a beat after the victory effect.
await page.waitForTimeout(2_200);
await shot('6-result');

await browser.close();
await server.close();
process.exit(0);
