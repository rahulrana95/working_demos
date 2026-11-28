/*
 * NOT PART OF THE INTERVIEW.
 * Measures how often React draws the player while a video plays: the whole
 * player, and the seek bar alone. It runs twice: with a "timeupdate" event
 * every 250 ms, the slowest a browser sends them, and every 15 ms, the
 * fastest. It needs Playwright and a built demo that is being served:
 *
 *   npm run build && npx vite preview
 *   node scripts/measure-renders.mjs [url]
 *
 * The demo page counts for us and puts the numbers in `window.__playerDebug`:
 *   playerRenders:   calls of the Player function by React.
 *   seekBarUpdates:  times the seek bar or the time text changed on the page.
 *   timeUpdates:     "timeupdate" events of the (simulated) video element.
 *
 * These are lab numbers from one desktop machine with a simulated video.
 */
import { createRequire } from "node:module";

// `require` also finds a Playwright that is installed for the whole machine.
// A plain `import` only looks in the folders above this file.
const { chromium } = createRequire(import.meta.url)("playwright");

const url = process.argv[2] ?? "http://localhost:4173";

const TICKS_MS = [250, 15];
const MEASURE_SECONDS = 10;
/** The controls of the production player hide after 3 seconds. We start after that. */
const SETTLE_MS = 4500;

function readCounters() {
  const { playerRenders, seekBarUpdates, timeUpdates } = window.__playerDebug;
  return { playerRenders, seekBarUpdates, timeUpdates };
}

const browser = await chromium.launch();

for (const tickMs of TICKS_MS) {
  const page = await browser.newPage();
  await page.goto(`${url}/?tick=${tickMs}`);
  // The demo starts by itself. Wait until the video moves.
  await page.waitForSelector('.player[data-status="playing"]');
  await page.waitForTimeout(SETTLE_MS);

  const before = await page.evaluate(readCounters);
  await page.waitForTimeout(MEASURE_SECONDS * 1000);
  const after = await page.evaluate(readCounters);
  await page.close();

  const perSecond = (name) => ((after[name] - before[name]) / MEASURE_SECONDS).toFixed(1);
  console.log(
    `timeupdate every ${tickMs} ms, ${MEASURE_SECONDS} s of playback: ` +
      `timeupdate events ${perSecond("timeUpdates")}/s; ` +
      `whole player drawn ${perSecond("playerRenders")}/s ` +
      `(${after.playerRenders - before.playerRenders} times); ` +
      `seek bar changed ${perSecond("seekBarUpdates")}/s`,
  );
}

await browser.close();
