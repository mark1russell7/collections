/**
 * The examples of the docs as tests (C13). Each `ts` block of the package README and of the guides runs as a module.
 * A block checks its results with `node:assert`, so a doc that does not agree with the code fails here.
 */

import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { markdownExamples } from "@mark1russell7/rigor-testkit";
import { describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const guides = readdirSync(join(root, "docs/guides"))
  .filter((name) => name.endsWith(".md"))
  .map((name) => `docs/guides/${name}`);
const files = ["packages/collections/README.md", ...guides];

const source = "packages/collections/src";
const cases = markdownExamples(files, {
  root,
  // The block files are under the package, so Vitest compiles the source that they import
  cacheDir: join(root, "packages/collections/.cache/rigor-testkit"),
  imports: {
    "@mark1russell7/collections": `${source}/index.ts`,
    "@mark1russell7/collections/dag": `${source}/dag/index.ts`,
    "@mark1russell7/collections/graph": `${source}/graph/index.ts`,
    "@mark1russell7/collections/layers": `${source}/core/layers.ts`,
    "@mark1russell7/collections/testing": `${source}/testing/index.ts`,
  },
});

describe("the examples of the docs", () => {
  it("has the examples of each guide", () => {
    for (const guide of guides) expect(cases.some((example) => example.file.endsWith(guide.split("/").pop()!))).toBe(true);
  });

  for (const example of cases) it(example.name, example.run);
});
