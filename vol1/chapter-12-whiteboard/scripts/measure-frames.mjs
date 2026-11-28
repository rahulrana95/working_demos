/*
 * NOT PART OF THE INTERVIEW.
 * Measures how smooth the whiteboard is with many shapes: it drags one shape,
 * and where the demo can pan it pans with the wheel, on boards of 1,000 and
 * 10,000 shapes, once on a normal CPU and once on a CPU made 6 times slower.
 * For each run it prints the frames per second, how long the gaps between
 * frames were, and how long the main thread worked for one frame. It needs
 * Playwright and a built demo that is being served:
 *
 *   npm run build && npx vite preview
 *   node scripts/measure-frames.mjs [url]
 *
 * These are lab numbers from one desktop machine, not numbers from real users.
 */
import { createRequire } from "node:module";

// `require` also finds a Playwright that is installed for the whole machine.
// A plain `import` only looks in the folders above this file.
const { chromium } = createRequire(import.meta.url)("playwright");

const url = process.argv[2] ?? "http://localhost:4173";

// A third argument gives other board sizes, for example "100000". A size
// without a button in the demo is loaded through the address ("?shapes=100000"),
// which the 45-minute and the 60-minute demos understand.
const SHAPE_COUNTS = process.argv[3]?.split(",").map(Number) ?? [1000, 10000];
const CPU_SLOWDOWNS = [1, 6];
const RUN_MS = 3000;
/** A frame at 60 frames a second takes 16.7 ms. A gap this long means a frame was missed. */
const MISSED_FRAME_MS = 25;

/** Starts to write down the time of every frame in `window.__frames`. */
function recordFrames() {
  window.__frames = [];
  window.__recording = true;
  requestAnimationFrame(function note(now) {
    window.__frames.push(now);
    if (window.__recording) {
      requestAnimationFrame(note);
    }
  });
}

function stopRecording() {
  window.__recording = false;
  return window.__frames;
}

function summarise(frameTimes) {
  const gaps = frameTimes.slice(1).map((time, index) => time - frameTimes[index]);
  const sorted = [...gaps].sort((a, b) => a - b);
  const total = frameTimes[frameTimes.length - 1] - frameTimes[0];
  return {
    framesPerSecond: (gaps.length * 1000) / total,
    medianMs: sorted[Math.floor(sorted.length / 2)],
    p95Ms: sorted[Math.floor(sorted.length * 0.95)],
    longestMs: sorted[sorted.length - 1],
    missed: gaps.filter((gap) => gap > MISSED_FRAME_MS).length,
    frames: gaps.length,
  };
}

function print(label, summary) {
  console.log(
    `${label}: ${summary.framesPerSecond.toFixed(1)} frames a second; ` +
      `gap between frames ms median ${summary.medianMs.toFixed(1)} ` +
      `p95 ${summary.p95Ms.toFixed(1)} longest ${summary.longestMs.toFixed(1)}; ` +
      `gaps over ${MISSED_FRAME_MS} ms: ${summary.missed} of ${summary.frames}; ` +
      `main thread ms per frame ${summary.workMs.toFixed(1)}`,
  );
}

/** The seconds the main thread of the page has worked so far, as the browser counts them. */
async function taskSeconds(devtools) {
  const { metrics } = await devtools.send("Performance.getMetrics");
  return metrics.find((metric) => metric.name === "TaskDuration").value;
}

/** Runs `step` again and again for RUN_MS while the frames are recorded. */
async function measure(page, devtools, step) {
  await page.evaluate(recordFrames);
  const workBefore = await taskSeconds(devtools);
  const startedAt = Date.now();
  let count = 0;
  while (Date.now() - startedAt < RUN_MS) {
    await step(count++);
  }
  const workAfter = await taskSeconds(devtools);
  const summary = summarise(await page.evaluate(stopRecording));
  // All work of the page in that time (events, React, drawing calls), spread over the frames.
  return { ...summary, workMs: ((workAfter - workBefore) * 1000) / summary.frames };
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1300, height: 1000 } });
const devtools = await page.context().newCDPSession(page);
await devtools.send("Performance.enable");
await page.goto(url);
// The 60-minute and production demos can pan. The 45-minute demo cannot.
const canPan = ((await page.locator("main").textContent()) ?? "").includes("moves the view");

for (const shapeCount of SHAPE_COUNTS) {
  for (const cpuSlowdown of CPU_SLOWDOWNS) {
    await devtools.send("Emulation.setCPUThrottlingRate", { rate: 1 });
    const loadButton = page.getByRole("button", {
      name: `Load ${shapeCount.toLocaleString("en")} shapes`,
    });
    if ((await loadButton.count()) > 0) {
      await loadButton.click();
    } else {
      await page.goto(`${url}/?shapes=${shapeCount}`);
    }
    await page.waitForTimeout(1500);
    // The first one, because the production demo has two boards.
    const canvas = page.locator("canvas").first();
    const box = await canvas.boundingBox();
    await page.getByRole("button", { name: "Select" }).first().click();
    await devtools.send("Emulation.setCPUThrottlingRate", { rate: cpuSlowdown });
    const label = `${shapeCount} shapes, cpu x${cpuSlowdown}`;

    // Drag the first shape of the demo scene around in a circle.
    await page.mouse.move(box.x + 32, box.y + 32);
    await page.mouse.down();
    const dragged = await measure(page, devtools, (count) =>
      page.mouse.move(
        box.x + 200 + Math.cos(count / 15) * 150,
        box.y + 200 + Math.sin(count / 15) * 150,
      ),
    );
    await page.mouse.up();
    print(`${label}, drag one shape`, dragged);

    if (canPan) {
      await page.mouse.move(box.x + 300, box.y + 200);
      const panned = await measure(page, devtools, (count) =>
        page.mouse.wheel(Math.cos(count / 40) * 30, Math.sin(count / 40) * 30),
      );
      print(`${label}, pan with the wheel`, panned);

      // Zoom out as far as it goes, so that many more shapes are in view, and pan again.
      await page.keyboard.down("Control");
      for (let notch = 0; notch < 12; notch++) {
        await page.mouse.wheel(0, 100);
      }
      await page.keyboard.up("Control");
      await page.waitForTimeout(300);
      const pannedZoomedOut = await measure(page, devtools, (count) =>
        page.mouse.wheel(Math.cos(count / 40) * 30, Math.sin(count / 40) * 30),
      );
      print(`${label}, pan when zoomed out to 10%`, pannedZoomedOut);
    }
  }
}

await browser.close();
