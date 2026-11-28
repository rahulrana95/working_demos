/*
 * NOT PART OF THE INTERVIEW.
 * Measures the three folders without a browser:
 *   1. the time to apply one remote operation in a document of 1,000,
 *      10,000 and 100,000 characters;
 *   2. the time our code needs for one key press in those documents;
 *   3. the memory for one character, what tombstones cost, and the size
 *      of a snapshot.
 *
 * Run `npm install` in `45-minutes` first (the script borrows its esbuild),
 * then, in this folder's parent:
 *
 *   node --expose-gc scripts/measure.mjs
 *
 * Without `--expose-gc` the memory part is skipped. These are lab numbers
 * from one machine. Yours will differ.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const chapter = join(dirname(fileURLToPath(import.meta.url)), "..");
const esbuild = createRequire(join(chapter, "45-minutes/package.json"))("esbuild");
const outDir = mkdtempSync(join(tmpdir(), "collab-measure-"));

const SIZES = [1_000, 10_000, 100_000];
const SAMPLES = 300;

/** Compiles one TypeScript file with what it imports, and loads it. */
async function load(name, entry) {
  const result = await esbuild.build({
    entryPoints: [join(chapter, entry)],
    bundle: true,
    format: "esm",
    write: false,
    logLevel: "silent",
  });
  const file = join(outDir, `${name}.mjs`);
  writeFileSync(file, result.outputFiles[0].text);
  return import(pathToFileURL(file).href);
}

/** A random generator with a seed, so every run measures the same edits. */
function createRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function summary(samplesMs) {
  const sorted = [...samplesMs].sort((a, b) => a - b);
  const at = (part) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * part))];
  const mean = sorted.reduce((sum, value) => sum + value, 0) / sorted.length;
  const micro = (ms) => `${(ms * 1000).toFixed(1)} us`;
  return `mean ${micro(mean)}, p50 ${micro(at(0.5))}, p95 ${micro(at(0.95))}`;
}

function timeEach(count, run) {
  const samples = [];
  for (let index = 0; index < count; index += 1) {
    const startedAt = performance.now();
    run(index);
    samples.push(performance.now() - startedAt);
  }
  return samples;
}

const text = (length) =>
  "the quick brown fox jumps over the lazy dog\n".repeat(length).slice(0, length);

/** The three folders behind one small interface, so the same test runs on each. */
async function folders() {
  const v45 = await load("rga45", "45-minutes/src/collab/index.ts".replace("index.ts", "rga.ts"));
  const change45 = await load("change45", "45-minutes/src/collab/textChange.ts");
  const v60 = await load("rga60", "60-minutes/src/collab/rga.ts");
  const session60 = await load("session60", "60-minutes/src/collab/session.ts");
  const prod = await load("rgaProd", "production/src/collab/crdt/rga.ts");
  const engineProd = await load("engineProd", "production/src/collab/crdt/crdtEngine.ts");

  return [
    {
      name: "45-minutes",
      /** A document of `length` characters, typed by site "a". */
      build(length) {
        const doc = new v45.Rga("reader");
        let after = null;
        for (let counter = 1; counter <= length; counter += 1) {
          const id = { site: "a", counter };
          doc.apply({ type: "insert", id, after, char: "x" });
          after = id;
        }
        return doc;
      },
      remoteInsert: (counter, after) => ({
        type: "insert",
        id: { site: "b", counter },
        after,
        char: "y",
      }),
      remoteDelete: (ids) => ids.map((id) => ({ type: "delete", id })),
      editor(length) {
        const doc = new v45.Rga("a");
        change45.applyTextChange(doc, text(length), length);
        return { edit: (value, caret) => change45.applyTextChange(doc, value, caret), doc };
      },
    },
    ...[
      ["60-minutes", v60, (length) => new session60.CollabSession({ site: "a" })],
      ["production", prod, (length) => new engineProd.CrdtEngine({ site: "a", name: "A" })],
    ].map(([name, module, makeEngine]) => ({
      name,
      build(length) {
        const doc = new module.Rga("reader");
        doc.apply({
          type: "insert",
          id: { site: "a", counter: 1 },
          after: null,
          text: "x".repeat(length),
        });
        return doc;
      },
      remoteInsert: (counter, after) => ({
        type: "insert",
        id: { site: "b", counter },
        after,
        text: "y",
      }),
      remoteDelete: (ids) => [{ type: "delete", ids }],
      editor(length) {
        const engine = makeEngine(length);
        engine.edit(text(length), length);
        return { edit: (value, caret) => engine.edit(value, caret), doc: engine.doc, engine };
      },
    })),
  ];
}

const all = await folders();

console.log("1. Apply one remote insert at a random place");
for (const folder of all) {
  for (const size of SIZES) {
    const random = createRandom(1);
    const doc = folder.build(size);
    const ids = doc.ids();
    const ops = Array.from({ length: SAMPLES }, (_, index) =>
      folder.remoteInsert(size + 1 + index, ids[Math.floor(random() * ids.length)]),
    );
    const samples = timeEach(SAMPLES, (index) => doc.apply(ops[index]));
    console.log(
      `  ${folder.name.padEnd(11)} ${String(size).padStart(7)} characters: ${summary(samples)}`,
    );
  }
}

console.log("\n2. One key press in the middle of the text (our code only, no React, no browser)");
for (const folder of all) {
  for (const size of SIZES) {
    const { edit, doc, engine } = folder.editor(size);
    const middle = Math.floor(size / 2);
    const samples = timeEach(SAMPLES, (index) => {
      const old = doc.text();
      const at = middle + index;
      edit(old.slice(0, at) + "k" + old.slice(at), at + 1);
    });
    engine?.dispose();
    console.log(
      `  ${folder.name.padEnd(11)} ${String(size).padStart(7)} characters: ${summary(samples)}`,
    );
  }
}

console.log("\n3. Memory (a document of 20,000 characters)");
if (typeof globalThis.gc !== "function") {
  console.log("  Skipped. Run with: node --expose-gc scripts/measure.mjs");
} else {
  const SIZE = 20_000;
  const heap = () => {
    globalThis.gc();
    globalThis.gc();
    return process.memoryUsage().heapUsed;
  };
  /** The bytes that only the document keeps alive: the heap with it, less the heap without it. */
  const bytesOf = (make) => {
    const holder = { doc: make() };
    const withIt = heap();
    holder.doc = null;
    return withIt - heap();
  };
  /** Every second character deleted: half of the list is tombstones. */
  const halfDeleted = (folder, andCollect) => () => {
    const doc = folder.build(SIZE);
    const doomed = doc.ids().filter((_, index) => index % 2 === 1);
    folder.remoteDelete(doomed).forEach((op) => doc.apply(op));
    if (andCollect) {
      doc.collect(doomed);
    }
    return doc;
  };

  for (const folder of all) {
    const full = bytesOf(() => folder.build(SIZE));
    const half = bytesOf(halfDeleted(folder, false));
    console.log(
      `  ${folder.name.padEnd(11)} ${(full / SIZE).toFixed(0)} bytes for each character; ` +
        `with every second character deleted: ${(half / SIZE).toFixed(0)} bytes for each character ` +
        `ever typed, which is ${(half / (SIZE / 2)).toFixed(0)} for each one still shown`,
    );
  }

  const production = all[2];
  const collected = bytesOf(halfDeleted(production, true));
  console.log(
    `  production  after the tombstones are removed: ` +
      `${(collected / (SIZE / 2)).toFixed(0)} bytes for each character still shown`,
  );
  const typedOnce = JSON.stringify(production.build(SIZE).toRuns()).length;
  const worstCase = JSON.stringify(halfDeleted(production, true)().toRuns()).length;
  const withTombstones = JSON.stringify(halfDeleted(production, false)().toRuns()).length;
  console.log(
    `  production  snapshot as JSON: ${typedOnce} bytes for ${SIZE} characters typed in one run; ` +
      `${withTombstones} bytes when every second character is a tombstone; ` +
      `${worstCase} bytes for the ${SIZE / 2} characters left when those tombstones are removed`,
  );
}

rmSync(outDir, { recursive: true, force: true });
