/**
 * The weight of each entry in a bundle (C35). esbuild bundles a small program of each case, minifies it and gzips it.
 * A case fails when its gzip bytes pass its limit. So a new class or a module with side effects cannot grow the
 * bundle of each user. Each limit is the measured weight plus 10 percent.
 *
 * To change a limit, measure the case again, give the reason in the commit, and keep the 10 percent margin.
 */

import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";

/** The folder of the package, so that each case imports the package by its own name, through its exports field. */
const packageDir = fileURLToPath(new URL("../..", import.meta.url));

const spec = "const spec = { monoid: { empty: 0, combine: (a, b) => a + b }, measure: (leaf) => leaf.length };";

interface WeightCase {
  /** The program. It imports only the entry of the package. */
  readonly code: string;
  /** The weight at the time of the limit: minified, then gzip at level 9. */
  readonly measured: number;
  /** The largest weight that passes: the measured weight plus 10 percent. */
  readonly limit: number;
}

/** A program that uses one or more names of each entry. */
const cases: Record<string, WeightCase> = {
  "the rope of typeset: of, at, locate, set, splice, slice, concat, insert, size, height, summary of ./summary-tree": {
    code: `import { of, at, locate, set, splice, slice, concat, insert, size, height, summary } from "@mark1russell7/collections/summary-tree";
${spec}
let t = of(spec, ["a"]);
t = concat(slice(insert(set(splice(t, 0, 0, ["b"]), 0, "c"), 1, ["d"]), 0, 1), t);
console.log(locate(t, (s) => s, 0), at(t, 0), size(t), height(t), summary(t), t.spec);`,
    measured: 1842,
    limit: 2027,
  },
  "a read of ./summary-tree: of, locate, summary": {
    code: `import { of, locate, summary } from "@mark1russell7/collections/summary-tree";
${spec}
const t = of(spec, ["ab", "c"]);
console.log(locate(t, (s) => s, 1), summary(t));`,
    measured: 496,
    limit: 546,
  },
  "the class SummaryTree of the root entry, with each method that the rope calls": {
    code: `import { SummaryTree } from "@mark1russell7/collections";
${spec}
let t = SummaryTree.of(spec, ["a"]);
t = t.splice(0, 0, ["b"]).set(0, "c").insert(1, ["d"]).slice(0, 1).concat(t);
console.log(t.locate((s) => s, 0), t.at(0), t.size, t.height, t.summary, t.spec);`,
    measured: 2551,
    limit: 2807,
  },
  "arrayList of the root entry": {
    code: `import { arrayList } from "@mark1russell7/collections";
console.log(arrayList([1, 2]).size);`,
    measured: 1715,
    limit: 1887,
  },
  "getTopologicalOrder of ./dag": {
    code: `import { getTopologicalOrder } from "@mark1russell7/collections/dag";
console.log(getTopologicalOrder(new Map([["a", { id: "a", dependencies: [] }]])));`,
    measured: 111,
    limit: 123,
  },
  "hubBreadthFirstOrder of ./graph": {
    code: `import { hubBreadthFirstOrder } from "@mark1russell7/collections/graph";
console.log(hubBreadthFirstOrder(["a", "b"], [{ source: "a", target: "b", weight: 1 }]));`,
    measured: 532,
    limit: 586,
  },
  "compose of ./layers": {
    code: `import { compose } from "@mark1russell7/collections/layers";
console.log(compose((next) => next));`,
    measured: 98,
    limit: 108,
  },
  "holds of ./testing": {
    code: `import { holds } from "@mark1russell7/collections/testing";
holds(true, "true");`,
    measured: 116,
    limit: 128,
  },
};

/** Each entry, with one name that a program imports and does not use. */
const unused: Record<string, string> = {
  ".": "SummaryTree",
  "./dag": "executeDAG",
  "./graph": "hubBreadthFirstOrder",
  "./layers": "compose",
  "./summary-tree": "splice",
  "./testing": "ContractViolation",
};

/** This function gives the minified bundle of a program, and its gzip bytes at level 9. */
async function weigh(code: string): Promise<{ minified: string; gzip: number }> {
  const result = await build({
    stdin: { contents: code, resolveDir: packageDir, loader: "ts" },
    bundle: true,
    minify: true,
    write: false,
    format: "esm",
    platform: "neutral",
    logLevel: "silent",
  });
  const output = result.outputFiles[0]!;
  return { minified: output.text, gzip: gzipSync(output.contents, { level: 9 }).length };
}

describe("the weight of each entry in a bundle", () => {
  it.each(Object.entries(cases))("%s", async (_name, weightCase) => {
    const { gzip } = await weigh(weightCase.code);
    expect(weightCase.limit).toBe(Math.ceil(weightCase.measured * 1.1));
    expect(gzip, `gzip bytes ${gzip}, measured ${weightCase.measured}`).toBeLessThanOrEqual(weightCase.limit);
  });

  it.each(Object.entries(unused))("an import of %s that uses nothing adds no byte", async (entry, name) => {
    const path = entry === "." ? "@mark1russell7/collections" : `@mark1russell7/collections/${entry.slice(2)}`;
    const { minified } = await weigh(`import { ${name} } from "${path}";`);
    expect(minified).toBe("");
  });

  it("the rope of typeset weighs less with the functions than with the class", async () => {
    const rope = await weigh(Object.values(cases)[0]!.code);
    const tree = await weigh(Object.values(cases)[2]!.code);
    expect(rope.gzip).toBeLessThan(tree.gzip);
  });
});
