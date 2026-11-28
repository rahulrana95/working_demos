/*
 * NOT PART OF THE INTERVIEW.
 * Measures how long one `track()` call takes in each of the three folders,
 * in Node and in a real Chromium. It needs `npm install` to have run in each
 * folder, and Playwright for the Chromium part:
 *
 *   node scripts/measure-track.mjs            (Node and Chromium)
 *   node scripts/measure-track.mjs --node     (Node only)
 *
 * Two cases, 10,000 calls each:
 *   "working collector": the page gives the event loop a turn after every 20
 *       calls, as a real page does between two actions of the user, and the
 *       fake collector accepts every batch. The queue stays short.
 *   "collector down": all calls in one go and no batch is ever accepted, so
 *       the queue is full (500 events) for almost all of them.
 *
 * These are lab numbers from one machine, not numbers from real users. In
 * Node, `localStorage` is a fake made of a Map, so storage writes cost less
 * than in a browser. In Chromium the clock of a page has steps of 0.1 ms or
 * 0.005 ms, so a median of 0 means "less than one step of the clock".
 */
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const FOLDERS = ["45-minutes", "60-minutes", "production"];
const CASES = ["working collector", "collector down"];
const chapterDir = fileURLToPath(new URL("..", import.meta.url));

/** Bundles the SDK of one folder into one script that sets the global `Sdk`. */
async function bundle(folder) {
  // `require` from inside the folder finds the esbuild that Vite installed there.
  const esbuild = createRequire(`${chapterDir}${folder}/package.json`)("esbuild");
  const result = await esbuild.build({
    entryPoints: [`${chapterDir}${folder}/src/analytics/index.ts`],
    bundle: true,
    format: "iife",
    globalName: "Sdk",
    write: false,
  });
  return result.outputFiles[0].text;
}

/**
 * Runs in Node and, as text, in the page. Returns the times of 10,000 calls
 * in milliseconds: the median, the 99th percentile, the worst and the mean.
 */
async function measure(Sdk, caseName, calls) {
  localStorage.clear();
  const isDown = caseName === "collector down";
  const analytics = Sdk.createAnalytics({
    endpoint: "/collect",
    writeKey: "measure",
    trackPages: false,
    transport: () => (isDown ? new Promise(() => {}) : Promise.resolve({ kind: "ok" })),
  });
  const properties = { plan: "pro", step: 3, source: "pricing page", items: [1, 2, 3] };
  const times = [];
  let total = 0;

  for (let index = 0; index < calls; index += 1) {
    const before = performance.now();
    analytics.track("checkout_started", properties);
    const took = performance.now() - before;
    times.push(took);
    total += took;
    if (!isDown && index % 20 === 19) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  analytics.optOut();
  times.sort((a, b) => a - b);
  return {
    median: times[Math.floor(calls / 2)],
    p99: times[Math.floor(calls * 0.99)],
    worst: times[calls - 1],
    mean: total / calls,
  };
}

function print(where, folder, caseName, result) {
  const ms = (value) => value.toFixed(4);
  console.log(
    `${where} | ${folder} | ${caseName}: median ${ms(result.median)} ms, p99 ${ms(result.p99)} ms, ` +
      `worst ${ms(result.worst)} ms, mean ${ms(result.mean)} ms`,
  );
}

/** The few browser globals the SDK touches, so it can run in Node. */
function installFakeBrowser() {
  const store = new Map();
  const noEvents = { addEventListener() {}, removeEventListener() {} };
  globalThis.localStorage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear(),
    key: (index) => [...store.keys()][index] ?? null,
    get length() {
      return store.size;
    },
  };
  globalThis.window = { ...noEvents };
  globalThis.document = { ...noEvents, visibilityState: "visible", title: "Measure", referrer: "" };
  globalThis.location = { href: "https://measure.test/", pathname: "/" };
  globalThis.history = { pushState() {}, replaceState() {} };
}

async function measureInNode(bundles, calls) {
  installFakeBrowser();
  for (const folder of FOLDERS) {
    const Sdk = new Function(`${bundles[folder]}; return Sdk;`)();
    for (const caseName of CASES) {
      // One run to warm up the JavaScript engine, then the run we report.
      await measure(Sdk, caseName, calls);
      print("Node    ", folder, caseName, await measure(Sdk, caseName, calls));
    }
  }
}

async function measureInChromium(bundles, calls) {
  // `require` also finds a Playwright that is installed for the whole machine.
  const { chromium } = createRequire(import.meta.url)("playwright");
  const browser = await chromium.launch();
  for (const folder of FOLDERS) {
    for (const caseName of CASES) {
      const page = await browser.newPage();
      // A page with a real origin, so `localStorage` works. Nothing leaves the machine.
      await page.route("https://measure.test/**", (route) =>
        route.fulfill({ contentType: "text/html", body: "<!doctype html><title>Measure</title>" }),
      );
      await page.goto("https://measure.test/");
      await page.addScriptTag({ content: bundles[folder] });
      const run = `(${measure.toString()})(Sdk, ${JSON.stringify(caseName)}, ${calls})`;
      await page.evaluate(run);
      print("Chromium", folder, caseName, await page.evaluate(run));
      await page.close();
    }
  }
  await browser.close();
}

const CALLS = 10_000;
const bundles = {};
for (const folder of FOLDERS) {
  bundles[folder] = await bundle(folder);
}
await measureInNode(bundles, CALLS);
if (!process.argv.includes("--node")) {
  await measureInChromium(bundles, CALLS);
}
