/*
 * NOT PART OF THE INTERVIEW.
 * Measures how long the page takes to answer one key press in a form with
 * 300 fields, on a normal CPU and on a CPU made 6 times slower. It needs
 * Playwright and a built demo that is being served:
 *
 *   npm run build && npx vite preview
 *   node scripts/measure-typing.mjs [url] [number of fields]
 *
 * Run it once against `45-minutes` (all values in one state object) and once
 * against `60-minutes` (a store that each field listens to), and compare.
 *
 * These are lab numbers from one desktop machine, not numbers from real users.
 */
import { createRequire } from "node:module";

// `require` also finds a Playwright that is installed for the whole machine.
// A plain `import` only looks in the folders above this file.
const { chromium } = createRequire(import.meta.url)("playwright");

const url = process.argv[2] ?? "http://localhost:4173";

const FIELD_COUNT = Number(process.argv[3] ?? 300);
const CPU_SLOWDOWNS = [1, 6];
const RUNS = 5;
/** 20 characters: the longest text that the fields of the test form allow. */
const TYPED_TEXT = "twenty letters here!";
const FIELD_NAME = "field7";
const KEY_DELAY_MS = 90;
const SETTLE_MS = 800;
/** The Event Timing API does not report an event shorter than this. */
const SHORTEST_REPORTED_MS = 16;

/**
 * Starts two measurements in the page.
 *
 * `window.__scriptMs`: for every key press, the time our own code and React
 * ran. A listener on the way down to the input takes the start time, and a
 * listener on the way back up takes the end time. React draws the change
 * between the two, because it finishes a key press before it gives control back.
 *
 * `window.__events`: what the browser itself reports for the key presses that
 * took 16 ms or longer from the key to the next paint.
 */
function startMeasuring(durationThreshold) {
  window.__scriptMs = [];
  window.__events = [];

  let startedAt = 0;
  window.addEventListener("input", () => (startedAt = performance.now()), { capture: true });
  window.addEventListener("input", () => window.__scriptMs.push(performance.now() - startedAt));

  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      window.__events.push({ name: entry.name, durationMs: entry.duration });
    }
  }).observe({ type: "event", durationThreshold });
}

/** Types in a fresh page and returns what was measured. */
async function measureOneRun(browser, cpuSlowdown) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const devtools = await context.newCDPSession(page);

  await page.goto(`${url}/?fields=${FIELD_COUNT}`);
  const input = page.locator(`[name="${FIELD_NAME}"]`);
  await input.waitFor();
  // The test form of the 60-minute answer hides every tenth field until this
  // box is ticked. With it ticked, both answers have all the fields on screen.
  const showAllFields = page.locator('[name="showExtra"]');
  if ((await showAllFields.count()) > 0) {
    await showAllFields.check();
  }
  await devtools.send("Emulation.setCPUThrottlingRate", { rate: cpuSlowdown });
  await page.evaluate(startMeasuring, SHORTEST_REPORTED_MS);

  await input.pressSequentially(TYPED_TEXT, { delay: KEY_DELAY_MS });
  await page.waitForTimeout(SETTLE_MS);

  const typed = await input.inputValue();
  if (typed !== TYPED_TEXT) {
    throw new Error(`The field holds "${typed}", not the text that was typed.`);
  }

  const measured = await page.evaluate(() => ({
    scriptMs: window.__scriptMs,
    events: window.__events,
  }));
  await context.close();

  return {
    scriptMs: measured.scriptMs,
    slowEvents: measured.events.filter(
      (event) => event.name === "keydown" || event.name === "input",
    ),
  };
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
  const scriptMs = [];
  const slowEvents = [];
  for (let run = 0; run < RUNS; run++) {
    const measured = await measureOneRun(browser, cpuSlowdown);
    scriptMs.push(...measured.scriptMs);
    slowEvents.push(...measured.slowEvents);
  }

  const sortedScriptMs = sorted(scriptMs);
  const durationMs = sorted(slowEvents.map((event) => event.durationMs));

  console.log(
    `${FIELD_COUNT} fields, cpu x${cpuSlowdown}: ${scriptMs.length} key presses over ${RUNS} runs; ` +
      `script ms p50 ${quantile(sortedScriptMs, 0.5).toFixed(1)} ` +
      `p95 ${quantile(sortedScriptMs, 0.95).toFixed(1)} ` +
      `max ${quantile(sortedScriptMs, 1).toFixed(1)}; ` +
      `events >=${SHORTEST_REPORTED_MS}ms: ${slowEvents.length}; ` +
      `duration ms max ${quantile(durationMs, 1)}`,
  );
}

await browser.close();
