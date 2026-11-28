/*
 * NOT PART OF THE INTERVIEW.
 * Counts what an open order status page sends to the server in 10 minutes:
 * once with polling, once with the stream. It drives the 60-minute demo in a
 * real Chromium with a fake clock, so the 10 minutes take a few seconds.
 * It needs Playwright and a built demo that is being served:
 *
 *   cd 60-minutes && npm run build && npx vite preview
 *   node scripts/measure-requests.mjs [url]
 *
 * The order of the demo stays 8 minutes in each status (`?stepMs=480000`),
 * so it is not delivered during the measurement, like a real order of 40 minutes.
 * The server is a fake in the page. These are counts, not times.
 */
import { createRequire } from "node:module";

// `require` also finds a Playwright that is installed for the whole machine.
// A plain `import` only looks in the folders above this file.
const { chromium } = createRequire(import.meta.url)("playwright");

const baseUrl = process.argv[2] ?? "http://localhost:4173";

const STEP_MS = 8 * 60 * 1000;
const MEASURED_MS = 10 * 60 * 1000;
/** The fake clock moves in small steps, so the answers of the fake server arrive in order. */
const CLOCK_STEP_MS = 1000;

/** The menu request and the order request. They come before the status page opens. */
const REQUESTS_BEFORE_STATUS_PAGE = 2;

function readRequestCount(page) {
  return page
    .getByText(/Requests sent to the server: \d+/)
    .innerText()
    .then((text) => Number(text.match(/\d+/)[0]));
}

/** Places an order, keeps the status page open for 10 minutes, and counts. */
async function measure(browser, usesStream) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.clock.install();
  await page.goto(`${baseUrl}/?stepMs=${STEP_MS}`);

  const stream = page.getByLabel("Use the live stream");
  if (usesStream) {
    await stream.check();
  } else {
    await stream.uncheck();
  }

  // The fake server answers on a timer, so the clock must move for every answer.
  await page.clock.runFor(2000);
  await page.getByRole("button", { name: "Add Paneer Tikka" }).click();
  await page.getByRole("button", { name: "Place order" }).click();

  for (let elapsedMs = 0; elapsedMs < MEASURED_MS; elapsedMs += CLOCK_STEP_MS) {
    await page.clock.runFor(CLOCK_STEP_MS);
  }

  const logLines = (await readRequestCount(page)) - REQUESTS_BEFORE_STATUS_PAGE;
  // The panel shows the last 12 lines. With the stream that is every line.
  const shown = await page
    .getByRole("list", { name: "Last requests" })
    .locator("li")
    .allInnerTexts();
  const status = await page.locator(".order__status").innerText();
  await context.close();
  return {
    logLines,
    status,
    connections: shown.filter((line) => /STREAM.*opened/.test(line)).length,
    events: shown.filter((line) => /→ event:/.test(line)).length,
  };
}

const browser = await chromium.launch();

const polling = await measure(browser, false);
console.log(
  `polling: ${polling.logLines} requests in 10 minutes; status at the end: "${polling.status}"`,
);

const stream = await measure(browser, true);
const requests = stream.logLines - stream.connections - stream.events;
console.log(
  `stream:  ${stream.connections} connection and ${requests} request in 10 minutes, ` +
    `${stream.events} event received; status at the end: "${stream.status}"`,
);

await browser.close();
