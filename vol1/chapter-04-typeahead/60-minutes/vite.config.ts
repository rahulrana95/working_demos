/* NOT PART OF THE INTERVIEW. Settings for the build tool and the tests. */
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/setupTests.ts",
    // Without this, Vitest gives tests an empty string for every CSS file.
    // The styles test reads the real CSS text.
    css: true,
  },
});
