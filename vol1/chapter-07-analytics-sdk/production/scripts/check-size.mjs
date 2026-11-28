/*
 * NOT PART OF THE INTERVIEW: production version.
 * Fails when the SDK grows past its size budget. Run it with `npm run size`,
 * which builds the library first.
 *
 * The file measured is the UMD build, minified, compressed with gzip: what a
 * page downloads through the loader snippet. The budget is the size we
 * measured when this was written, plus a little room. To raise it, change
 * the number here in a commit that says why the bytes are worth it.
 */
import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";

const FILE = new URL("../dist-lib/analytics.umd.js", import.meta.url);
const BUDGET_BYTES = Number(process.env.SIZE_BUDGET_BYTES ?? 5200);

let bytes;
try {
  bytes = gzipSync(readFileSync(FILE), { level: 9 }).length;
} catch {
  console.error("dist-lib/analytics.umd.js is missing. Run `npm run build:lib` first.");
  process.exit(1);
}

if (bytes > BUDGET_BYTES) {
  console.error(`Too big: ${bytes} bytes (min + gzip). The budget is ${BUDGET_BYTES} bytes.`);
  process.exit(1);
}
console.log(`OK: ${bytes} bytes (min + gzip). The budget is ${BUDGET_BYTES} bytes.`);
