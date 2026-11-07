import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    // markdownExamples imports each block of the docs. Vitest compiles that import only when it compiles the testkit too.
    server: { deps: { inline: ["@mark1russell7/rigor-testkit"] } },
  },
});
