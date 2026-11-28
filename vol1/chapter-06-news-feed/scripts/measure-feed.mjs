/*
 * NOT PART OF THE INTERVIEW.
 * Measures two things in a real Chromium:
 *
 *   1. After 1,000 posts are loaded by scrolling: how many DOM nodes the page
 *      has and how big the JavaScript heap is, in the 45-minute answer (every
 *      post is in the DOM) and in the 60-minute answer (virtual list).
 *   2. The layout shift score while images load, with the `aspect-ratio` box
 *      around every image and without it, in the 45-minute answer.
 *
 * It needs Playwright and the two built demos, each being served:
 *
 *   cd 45-minutes && npm run build && npx vite preview --port 4173
 *   cd 60-minutes && npm run build && npx vite preview --port 4174
 *   node scripts/measure-feed.mjs [url of 45-minutes] [url of 60-minutes]
 *
 * The heap size comes from `performance.memory`, which only Chromium has.
 * These are lab numbers from one desktop machine, not numbers from real users.
 */
import { createRequire } from "node:module";

// `require` also finds a Playwright that is installed for the whole machine.
// A plain `import` only looks in the folders above this file.
const { chromium } = createRequire(import.meta.url)("playwright");

const urls = {
  "45-minutes": process.argv[2] ?? "http://localhost:4173",
  "60-minutes": process.argv[3] ?? "http://localhost:4174",
};

const PHONE = { width: 412, height: 915 };
const POSTS_TO_LOAD = 1000;
const LOAD_TIMEOUT_MS = 5 * 60 * 1000;
const SETTLE_MS = 1000;
const IMAGE_DELAY_MS = 400;
const SCROLL_STEPS = 40;
const SCROLL_STEP_PX = 300;
const SCROLL_PAUSE_MS = 150;
const BYTES_PER_MB = 1024 * 1024;

/** Reads the number that the demo panel shows under a test id. */
async function readPanelNumber(page, testId) {
  return Number(await page.textContent(`[data-testid="${testId}"]`));
}

/** Scrolls to the end again and again until the feed holds 1,000 posts. */
async function loadPosts(page) {
  const startedAt = Date.now();
  while ((await readPanelNumber(page, "posts")) < POSTS_TO_LOAD) {
    if (Date.now() - startedAt > LOAD_TIMEOUT_MS) {
      throw new Error("The feed did not reach 1,000 posts in time");
    }
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(100);
  }
  await page.waitForTimeout(SETTLE_MS);
}

async function measureSize(browser, name) {
  const page = await browser.newPage({ viewport: PHONE });
  await page.goto(urls[name]);
  await page.waitForSelector("article");
  await loadPosts(page);

  const result = await page.evaluate(() => {
    // `gc` exists because the browser was started with --expose-gc. Without
    // a collection first, the heap also holds garbage that is already dead.
    window.gc();
    return {
      posts: Number(document.querySelector('[data-testid="posts"]').textContent),
      articles: document.querySelectorAll("article").length,
      nodes: document.querySelectorAll("*").length,
      heapBytes: performance.memory.usedJSHeapSize,
    };
  });
  await page.close();

  console.log(
    `${name}: ${result.posts} posts loaded; ${result.articles} posts in the DOM; ` +
      `${result.nodes} DOM nodes; JS heap ${(result.heapBytes / BYTES_PER_MB).toFixed(1)} MB`,
  );
}

/**
 * Starts adding up the layout shifts of the page in `window.__shift`. A
 * shift that moved a post is counted apart: the "Load more" button also
 * moves down when a page arrives while it is on screen, and that is not
 * what the aspect-ratio box is for.
 */
function collectLayoutShifts() {
  window.__shift = { score: 0, postScore: 0, postShifts: 0 };
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      // A shift right after a tap or a key press is expected, and does not count.
      if (entry.hadRecentInput) {
        continue;
      }
      window.__shift.score += entry.value;
      const movedPost = entry.sources.some(
        (source) => source.node instanceof Element && source.node.closest("article") !== null,
      );
      if (movedPost) {
        window.__shift.postScore += entry.value;
        window.__shift.postShifts += 1;
      }
    }
  }).observe({ type: "layout-shift", buffered: true });
}

/** Removes the shape of the box, so an image takes its room only when it has loaded. */
function removeAspectRatioBox() {
  const style = document.createElement("style");
  style.textContent = ".post__media { aspect-ratio: auto !important; }";
  document.addEventListener("DOMContentLoaded", () => document.head.append(style));
}

async function measureLayoutShift(browser, withBox) {
  const page = await browser.newPage({ viewport: PHONE });
  // Every picture arrives late, like on a slow phone network.
  await page.route("**/media/**", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, IMAGE_DELAY_MS));
    await route.continue();
  });
  await page.addInitScript(collectLayoutShifts);
  if (!withBox) {
    await page.addInitScript(removeAspectRatioBox);
  }

  await page.goto(urls["45-minutes"]);
  await page.waitForSelector("article");
  for (let step = 0; step < SCROLL_STEPS; step++) {
    await page.evaluate((stepPx) => window.scrollBy(0, stepPx), SCROLL_STEP_PX);
    await page.waitForTimeout(SCROLL_PAUSE_MS);
  }
  await page.waitForTimeout(SETTLE_MS);

  const shift = await page.evaluate(() => window.__shift);
  await page.close();

  console.log(
    `layout shift ${withBox ? "with" : "without"} the aspect-ratio box: ` +
      `${shift.postShifts} shifts moved a post, score ${shift.postScore.toFixed(3)}; ` +
      `score of all shifts ${shift.score.toFixed(3)}`,
  );
}

const browser = await chromium.launch({
  args: ["--enable-precise-memory-info", "--js-flags=--expose-gc"],
});

await measureSize(browser, "45-minutes");
await measureSize(browser, "60-minutes");
await measureLayoutShift(browser, true);
await measureLayoutShift(browser, false);

await browser.close();
