/*
 * NOT PART OF THE INTERVIEW.
 * Measures typing in a real browser, in a document of 100,000 characters.
 * It needs Playwright and a built demo of `60-minutes` or `production` that
 * is being served (the 45-minute demo has no button to make a long text):
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

const CPU_SLOWDOWNS = [1, 4];
const TYPED_TEXT = "typing in a long document ";
const KEY_DELAY_MS = 90;
const SETTLE_MS = 800;
/** The Event Timing API does not report an event shorter than this. */
const SHORTEST_REPORTED_MS = 16;

/** Starts collecting the events of the page in `window.__events`. */
function collectEvents(durationThreshold) {
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

/** The value below which the given part (0 to 1) of the sorted numbers lies. */
function quantile(sortedNumbers, part) {
  if (sortedNumbers.length === 0) {
    return 0;
  }
  const index = Math.min(sortedNumbers.length - 1, Math.floor(sortedNumbers.length * part));
  return sortedNumbers[index];
}

async function measure(browser, cpuSlowdown, longDocument) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const devtools = await context.newCDPSession(page);
  await page.goto(url);

  if (longDocument) {
    await page.getByRole("button", { name: "Add 100,000 characters" }).click();
    await page.waitForFunction(
      () => document.querySelector('[data-testid="texts-equal"]')?.textContent === "yes",
    );
  }
  await devtools.send("Emulation.setCPUThrottlingRate", { rate: cpuSlowdown });
  await page.evaluate(collectEvents, SHORTEST_REPORTED_MS);

  // The first editor. The caret goes to the start, so every key press
  // changes the place of all 100,000 characters after it.
  const editor = page.getByRole("textbox").first();
  await editor.focus();
  await page.keyboard.press("Control+Home");
  await editor.pressSequentially(TYPED_TEXT, { delay: KEY_DELAY_MS });
  await page.waitForTimeout(SETTLE_MS);

  const events = (await page.evaluate(() => window.__events)).filter(
    (event) => event.name === "input" || event.name === "keydown" || event.name === "keypress",
  );
  const length = await page.getByTestId("text-length").textContent();
  await context.close();

  const handlerMs = events.map((event) => event.handlerMs).sort((a, b) => a - b);
  const durationMs = events.map((event) => event.durationMs).sort((a, b) => a - b);
  console.log(
    `${length.padStart(7)} characters, cpu x${cpuSlowdown}: ${TYPED_TEXT.length} key presses; ` +
      `events >=${SHORTEST_REPORTED_MS}ms: ${events.length}; ` +
      `handler ms p50 ${quantile(handlerMs, 0.5).toFixed(1)} ` +
      `p95 ${quantile(handlerMs, 0.95).toFixed(1)} ` +
      `max ${quantile(handlerMs, 1).toFixed(1)}; ` +
      `duration ms max ${quantile(durationMs, 1)}`,
  );
}

const browser = await chromium.launch();
for (const longDocument of [false, true]) {
  for (const cpuSlowdown of CPU_SLOWDOWNS) {
    await measure(browser, cpuSlowdown, longDocument);
  }
}
await browser.close();
