/*
 * NOT PART OF THE INTERVIEW.
 * Measures how long the page takes to answer a key press while the user
 * types in the typeahead, on a normal CPU and on a CPU made 4 and 6 times
 * slower. It needs Playwright and a built demo that is being served:
 *
 *   npm run build && npx vite preview
 *   node scripts/measure-typing.mjs [url]
 *
 * These are lab numbers from one desktop machine, not numbers from real users.
 */
import { createRequire } from "node:module";

// `require` also finds a Playwright that is installed for the whole machine.
// A plain `import` only looks in the folders above this file.
const { chromium } = createRequire(import.meta.url)("playwright");

const url = process.argv[2] ?? "http://localhost:4173";

const CPU_SLOWDOWNS = [1, 4, 6];
const RUNS = 5;
const TYPED_TEXT = "mumbai pune jaipur delhi";
const ARROW_PRESSES = 6;
const KEY_DELAY_MS = 90;
const SETTLE_MS = 800;
/** The Event Timing API does not report an event shorter than this. */
const SHORTEST_REPORTED_MS = 16;

/** Starts collecting the slow events of the page in `window.__events`. */
function collectSlowEvents(durationThreshold) {
  window.__events = [];
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      window.__events.push({
        name: entry.name,
        durationMs: entry.duration,
        handlerMs: entry.processingEnd - entry.processingStart,
      });
    }
  }).observe({ type: "event", durationThreshold });
}

/** Types in a fresh page and returns its slow key events. */
async function measureOneRun(browser, cpuSlowdown) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const devtools = await context.newCDPSession(page);

  await page.goto(url);
  await devtools.send("Emulation.setCPUThrottlingRate", { rate: cpuSlowdown });
  await page.evaluate(collectSlowEvents, SHORTEST_REPORTED_MS);

  // The first one, because the production demo has two typeaheads.
  const input = page.getByRole("combobox").first();
  await input.pressSequentially(TYPED_TEXT, { delay: KEY_DELAY_MS });
  for (let press = 0; press < ARROW_PRESSES; press++) {
    await input.press("ArrowDown");
  }
  await page.waitForTimeout(SETTLE_MS);

  const events = await page.evaluate(() => window.__events);
  await context.close();
  return events.filter((event) => event.name === "keydown" || event.name === "input");
}

/** The value below which the given part (0 to 1) of the sorted numbers lies. */
function quantile(sortedNumbers, part) {
  if (sortedNumbers.length === 0) {
    return 0;
  }
  const index = Math.min(sortedNumbers.length - 1, Math.floor(sortedNumbers.length * part));
  return sortedNumbers[index];
}

function sorted(numbers) {
  return [...numbers].sort((a, b) => a - b);
}

const browser = await chromium.launch();

for (const cpuSlowdown of CPU_SLOWDOWNS) {
  const events = [];
  for (let run = 0; run < RUNS; run++) {
    events.push(...(await measureOneRun(browser, cpuSlowdown)));
  }

  const handlerMs = sorted(events.map((event) => event.handlerMs));
  const durationMs = sorted(events.map((event) => event.durationMs));
  const keyPresses = (TYPED_TEXT.length + ARROW_PRESSES) * RUNS;

  console.log(
    `cpu x${cpuSlowdown}: ${keyPresses} key presses over ${RUNS} runs; ` +
      `events >=${SHORTEST_REPORTED_MS}ms: ${events.length}; ` +
      `handler ms p50 ${quantile(handlerMs, 0.5).toFixed(1)} ` +
      `p95 ${quantile(handlerMs, 0.95).toFixed(1)} ` +
      `max ${quantile(handlerMs, 1).toFixed(1)}; ` +
      `duration ms max ${quantile(durationMs, 1)}`,
  );
}

await browser.close();
