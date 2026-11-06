import { resolve } from "node:path";
import { describe, it } from "vitest";
import { markdownExamples } from "../../../../rigor-wt/testkit/packages/testkit/src/index.ts";

const root = resolve(import.meta.dirname, "../../..");
const src = "packages/collections/src";
const imports = {
  "@mark1russell7/collections": `${src}/index.ts`,
  "@mark1russell7/collections/dag": `${src}/dag/index.ts`,
  "@mark1russell7/collections/graph": `${src}/graph/index.ts`,
  "@mark1russell7/collections/layers": `${src}/core/layers.ts`,
  "@mark1russell7/collections/testing": `${src}/testing/index.ts`,
};
const files = ["layers", "dag", "graph", "testing", "collections"].map((name) => `docs/guides/${name}.md`).concat(["packages/collections/README.md"]);

describe("the examples of the guides and the README", () => {
  for (const example of markdownExamples(files, { root, imports })) it(example.name, example.run);
});
