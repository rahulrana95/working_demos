/*
 * NOT PART OF THE INTERVIEW: production version.
 * Settings for the library build. `npm run build:lib` runs it twice:
 *   1. the SDK alone, as an ES module and as a UMD file for a `<script>` tag;
 *   2. with `--mode react`, the React wrapper as an ES module. React itself
 *      is not put in the file: the host app brings its own.
 */
import { defineConfig } from "vite";

export default defineConfig(({ mode }) => ({
  publicDir: false,
  build: {
    outDir: "dist-lib",
    // The second run must not delete the files of the first.
    emptyOutDir: mode !== "react",
    lib:
      mode === "react"
        ? { entry: "src/analytics/react.tsx", formats: ["es"], fileName: () => "react.js" }
        : {
            entry: "src/analytics/index.ts",
            name: "AnalyticsSdk",
            formats: ["es", "umd"],
            fileName: (format) => (format === "es" ? "analytics.js" : "analytics.umd.js"),
          },
    rollupOptions: { external: mode === "react" ? ["react", "react/jsx-runtime"] : [] },
  },
}));
