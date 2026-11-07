import { defineConfig } from "tsdown";

// This file gives the build of the six public entries. Each entry has its own file in `build`.
export default defineConfig({
  entry: {
    index: "src/index.ts",
    "dag/index": "src/dag/index.ts",
    "graph/index": "src/graph/index.ts",
    "core/layers": "src/core/layers.ts",
    "summary-tree/index": "src/summary-tree/index.ts",
    "testing/index": "src/testing/index.ts",
  },
  outDir: "build",
  format: "esm",
  platform: "neutral",
  sourcemap: true,
  hash: false,
  publint: true,
  attw: { profile: "esm-only" },
});
