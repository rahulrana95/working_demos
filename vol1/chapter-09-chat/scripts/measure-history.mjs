/*
 * NOT PART OF THE INTERVIEW.
 * Measures what a long history costs: it opens the demo with 5,000 old
 * messages, loaded in one page, and prints the size of the page, the memory
 * and the time one new message takes. It needs Playwright and a built demo
 * that is being served:
 *
 *   npm run build && npx vite preview
 *   node scripts/measure-history.mjs [url] [messages]
 *
 * These are lab numbers from one desktop machine, not numbers from real users.
 */
import { createRequire } from "node:module";

// `require` also finds a Playwright that is installed for the whole machine.
// A plain `import` only looks in the folders above this file.
const { chromium } = createRequire(import.meta.url)("playwright");

const url = process.argv[2] ?? "http://localhost:4173";
const messageCount = Number(process.argv[3] ?? 5000);
const RUNS = 5;
const SCREEN = '[aria-label="The screen of Asha"]';

/** The middle value of a list of numbers. */
function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/** Counts the elements of the page and of the message list of one screen. */
function countElements(screen) {
  const log = document.querySelector(`${screen} [role="log"]`);
  return {
    pageElements: document.querySelectorAll("*").length,
    listElements: log.querySelectorAll("*").length,
    rows: log.querySelectorAll(".message").length,
  };
}

/** Sends one message and resolves with the time from the key press to the next paint with its row. */
function timeOneMessage(screen) {
  return new Promise((resolve) => {
    const log = document.querySelector(`${screen} [role="log"]`);
    const input = document.querySelector(`${screen} textarea`);
    const setValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set;
    setValue.call(input, `measured at ${Date.now()}`);
    input.dispatchEvent(new Event("input", { bubbles: true }));

    const rowsBefore = log.querySelectorAll(".message").length;
    const lastBefore = log.lastElementChild;
    new MutationObserver((_changes, observer) => {
      const hasNewRow =
        log.querySelectorAll(".message").length !== rowsBefore ||
        log.lastElementChild !== lastBefore;
      if (hasNewRow) {
        observer.disconnect();
        // Two frames: the first paints the row, the second proves the paint is done.
        requestAnimationFrame(() =>
          requestAnimationFrame(() => resolve(performance.now() - start)),
        );
      }
    }).observe(log, { childList: true });

    const start = performance.now();
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  });
}

async function measureOneRun(browser) {
  const context = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  const page = await context.newPage();
  const devtools = await context.newCDPSession(page);
  await devtools.send("Performance.enable");

  const startedAt = Date.now();
  await page.goto(`${url}/?seed=${messageCount}&page=${messageCount}`);
  await page.waitForSelector(`${SCREEN} .message`, { timeout: 60_000 });
  const loadMs = Date.now() - startedAt;
  // Let the second screen, the receipts and the timers settle.
  await page.waitForTimeout(2500);

  const counts = await page.evaluate(countElements, SCREEN);
  await devtools.send("HeapProfiler.collectGarbage");
  const { metrics } = await devtools.send("Performance.getMetrics");
  const metric = (name) => metrics.find((entry) => entry.name === name).value;

  const messageMs = [];
  for (let index = 0; index < 5; index += 1) {
    messageMs.push(await page.evaluate(timeOneMessage, SCREEN));
    await page.waitForTimeout(700);
  }

  await context.close();
  return {
    ...counts,
    loadMs,
    heapMb: metric("JSHeapUsedSize") / 1024 / 1024,
    domNodes: metric("Nodes"),
    messageMs: median(messageMs),
  };
}

const browser = await chromium.launch();
const runs = [];
for (let run = 0; run < RUNS; run += 1) {
  runs.push(await measureOneRun(browser));
}
await browser.close();

const middle = (key) => median(runs.map((run) => run[key]));
console.log(
  `${messageCount} messages, 2 screens, median of ${RUNS} runs: ` +
    `rows drawn in one list ${middle("rows")}; ` +
    `elements in one list ${middle("listElements")}; ` +
    `elements on the page ${middle("pageElements")}; ` +
    `DOM nodes (with text nodes) ${Math.round(middle("domNodes"))}; ` +
    `JS heap ${middle("heapMb").toFixed(1)} MB; ` +
    `load to first row ${Math.round(middle("loadMs"))} ms; ` +
    `one new message, key press to paint ${middle("messageMs").toFixed(0)} ms`,
);
