/*
 * NOT PART OF THE INTERVIEW.
 * Measures how long `layoutDay` takes for one day with 50, 500 and 5,000
 * events, in Node. It reads the TypeScript file of one folder, so that folder
 * must have its packages installed (`npm install`):
 *
 *   node scripts/measure-layout.mjs [folder]
 *
 * The folder is `45-minutes` when none is given.
 *
 * These are numbers from one machine. They show how the time grows with the
 * number of events, not how fast a phone is.
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const folder = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  process.argv[2] ?? "45-minutes",
);
// esbuild comes with Vite. It turns the TypeScript file into JavaScript in memory.
const { transformSync } = createRequire(resolve(folder, "package.json"))("esbuild");
const source = readFileSync(resolve(folder, "src/calendar/layoutDay.ts"), "utf8");
const { code } = transformSync(source, { loader: "ts", format: "esm" });
const { layoutDay } = await import(
  `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`
);

const EVENT_COUNTS = [50, 500, 5000];
const RUNS = 100;
const WARM_UP_RUNS = 20;
const MINUTE_MS = 60_000;
const DAY_START = Date.UTC(2026, 2, 3);
const DAY_END = Date.UTC(2026, 2, 4);

/** A small random number generator with a seed, so every run measures the same days. */
function createRandom(seed) {
  let state = seed;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) % 4_294_967_296;
    return state / 4_294_967_296;
  };
}

/** Events with a random start in the day and a length from 5 minutes to 3 hours. */
function randomEvents(count, random) {
  return Array.from({ length: count }, (_, index) => {
    const start = DAY_START + Math.floor(random() * 24 * 60) * MINUTE_MS;
    const end = start + (5 + Math.floor(random() * 175)) * MINUTE_MS;
    return {
      id: `e${index}`,
      title: `Event ${index}`,
      start: new Date(start).toISOString(),
      end: new Date(end).toISOString(),
    };
  });
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

for (const count of EVENT_COUNTS) {
  const events = randomEvents(count, createRandom(count));
  for (let run = 0; run < WARM_UP_RUNS; run++) {
    layoutDay(events, DAY_START, DAY_END);
  }
  const times = [];
  let boxes = [];
  for (let run = 0; run < RUNS; run++) {
    const startedAt = performance.now();
    boxes = layoutDay(events, DAY_START, DAY_END);
    times.push(performance.now() - startedAt);
  }
  const columns = Math.max(...boxes.map((box) => box.columnCount));
  console.log(
    `${String(count).padStart(5)} events: median ${median(times).toFixed(3)} ms of ${RUNS} runs` +
      ` (fastest ${Math.min(...times).toFixed(3)}, slowest ${Math.max(...times).toFixed(3)});` +
      ` widest part of the day: ${columns} columns`,
  );
}
