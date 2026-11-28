/*
 * NOT PART OF THE INTERVIEW.
 * Measures the memory of 100 steps of undo history for a board of 10,000
 * shapes, kept in three ways:
 *   1. commands:   each step keeps the command and its inverse (what the code does).
 *   2. snapshots:  each step keeps a full, separate copy of the scene.
 *   3. shared:     each step keeps the scene that `apply` returned. Shapes that
 *                  did not change are the same objects in every step.
 *
 * It uses the real `apply` and `invert` of the 45-minute answer:
 *
 *   node --expose-gc scripts/measure-history.mjs
 *
 * The numbers are from one machine and one version of Node. They change a
 * little from run to run.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

if (typeof globalThis.gc !== "function") {
  console.error("Run it with: node --expose-gc scripts/measure-history.mjs");
  process.exit(1);
}

const SHAPE_COUNT = 10_000;
const STEPS = 100;

// The source is TypeScript. esbuild turns the one file we need into JavaScript.
const here = dirname(fileURLToPath(import.meta.url));
const project = join(here, "..", "45-minutes");
const outDir = mkdtempSync(join(tmpdir(), "whiteboard-history-"));
const outFile = join(outDir, "commands.mjs");
execFileSync(
  "npx",
  ["esbuild", "src/whiteboard/commands.ts", "--bundle", "--format=esm", `--outfile=${outFile}`],
  { cwd: project, stdio: "ignore" },
);
const { apply, invert } = await import(pathToFileURL(outFile).href);
rmSync(outDir, { recursive: true });

function createScene() {
  const scene = { shapesById: {}, order: [] };
  for (let index = 0; index < SHAPE_COUNT; index++) {
    const id = String(index + 1);
    const x = (index % 100) * 60;
    const y = Math.floor(index / 100) * 60;
    scene.shapesById[id] = { id, kind: "rect", x, y, width: 40, height: 30 };
    scene.order.push(id);
  }
  return scene;
}

/** The step-th command: a move of one shape, a different shape each time. */
function commandFor(step) {
  return { type: "move", id: String(1 + step * 97), dx: 10 + step, dy: -step };
}

function heapUsed() {
  globalThis.gc();
  globalThis.gc();
  return process.memoryUsage().heapUsed;
}

/** Runs `build` and returns the bytes of heap that its result holds on to. */
function measure(build) {
  const scene = createScene();
  const before = heapUsed();
  const kept = build(scene);
  const after = heapUsed();
  // Use `kept` after the measurement, so it cannot be freed before it.
  return { bytes: after - before, entries: kept.length };
}

const commands = measure((scene) => {
  const stack = [];
  let current = scene;
  for (let step = 0; step < STEPS; step++) {
    const command = commandFor(step);
    stack.push({ command, inverse: invert(command, current) });
    current = apply(current, command);
  }
  return stack;
});

const snapshots = measure((scene) => {
  const stack = [];
  let current = scene;
  for (let step = 0; step < STEPS; step++) {
    stack.push(structuredClone(current));
    current = apply(current, commandFor(step));
  }
  return stack;
});

const shared = measure((scene) => {
  const stack = [];
  let current = scene;
  for (let step = 0; step < STEPS; step++) {
    stack.push(current);
    current = apply(current, commandFor(step));
  }
  return stack;
});

const sceneAlone = measure((scene) => [structuredClone(scene)]);
const jsonSize = JSON.stringify(createScene()).length;

function kb(bytes) {
  return `${(bytes / 1024).toFixed(0)} KB`;
}

console.log(
  `board: ${SHAPE_COUNT} shapes, ${kb(sceneAlone.bytes)} of heap, ${kb(jsonSize)} as JSON`,
);
console.log(`history of ${STEPS} steps`);
console.log(`  as commands with inverses:            ${kb(commands.bytes)}`);
console.log(`  as scenes that share unchanged shapes: ${kb(shared.bytes)}`);
console.log(`  as full copies of the scene:          ${kb(snapshots.bytes)}`);
console.log(
  `  full copies are ${(snapshots.bytes / commands.bytes).toFixed(0)} times the commands, ` +
    `shared scenes ${(shared.bytes / commands.bytes).toFixed(0)} times`,
);
