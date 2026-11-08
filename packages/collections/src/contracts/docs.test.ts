/**
 * The examples of the docs as tests (C13). Each `ts` block of the package README and of the guides runs as a module.
 * A block checks its results with `node:assert`, so a doc that does not agree with the code fails here.
 */

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { markdownExamples } from "@mark1russell7/rigor-testkit";
import { describe, expect, it } from "vitest";
import * as layers from "../core/layers.js";
import * as dag from "../dag/index.js";
import * as graph from "../graph/index.js";
import * as rootEntry from "../index.js";
import * as summaryTree from "../summary-tree/index.js";
import * as testing from "../testing/index.js";

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

/** The value names of each entry of the package. A type has no value, so a module namespace does not hold it. */
const entries: Readonly<Record<string, object>> = {
  ".": rootEntry,
  "./dag": dag,
  "./graph": graph,
  "./layers": layers,
  "./summary-tree": summaryTree,
  "./testing": testing,
};

/**
 * The values that no guide names, with the reason. The branch `next` (0.10.0) removes the first group, and it has the
 * guide `bounded.md` of the second group. The merge of `main` into `next` empties this list. The test fails on a
 * name that the package does not export, or that a guide names.
 */
const UNNAMED: Readonly<Record<string, readonly string[]>> = {
  "0.10.0 removes it": [
    // D3 of the API review: the names of utils/helpers.ts
    "arrayContains", "arrayIterator", "arrayRemove", "arrayRemoveAll", "checkBounds", "checkInsertBounds", "checkRangeBounds",
    "clamp", "findIndex", "findLastIndex", "requireNonEmpty", "requireNonNull", "reverseArrayIterator", "stringHashCode",
    // C26: the channels move to @mark1russell7/service/channel
    "AsyncEmitter", "Channel", "EventBatcher", "buffered", "fanIn", "fanOut", "forwardEvent", "onWhen", "pipeline", "ticker",
    "unbuffered", "workerPool",
    // The policy defaults, the builder and the unmodifiable views
    "CollectionBuilder", "DEFAULT_CONFLICT_POLICY", "DEFAULT_EVICTION_POLICY", "DEFAULT_GROWTH_POLICY", "DEFAULT_OVERFLOW_POLICY",
    "DEFAULT_RETRY_POLICY", "DEFAULT_UNDERFLOW_POLICY", "DEFAULT_VALIDATION_POLICY", "KEY_DIGITS", "unmodifiableCollection",
    "unmodifiableList", "unmodifiableMap",
  ],
  "the guide bounded.md of next names it": ["boundedDeque", "boundedList", "boundedMap", "boundedQueue"],
};

describe("the guides name each value of the package (C13)", () => {
  const words = new Set(files.flatMap((file) => readFileSync(join(root, file), "utf8").match(/[A-Za-z_$][\w$]*/gu) ?? []));
  const unnamed = new Set(Object.values(UNNAMED).flat());

  for (const [entry, values] of Object.entries(entries)) {
    it(`names each value of the entry ${entry} in the README or a guide`, () => {
      expect(Object.keys(values).filter((name) => !words.has(name) && !unnamed.has(name))).toEqual([]);
    });
  }

  it("keeps only exceptions that the package exports and that no guide names", () => {
    const exported = new Set(Object.values(entries).flatMap((values) => Object.keys(values)));
    expect([...unnamed].filter((name) => !exported.has(name) || words.has(name))).toEqual([]);
  });
});
