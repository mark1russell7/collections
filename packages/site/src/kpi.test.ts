import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { importedValues, siteMeasures, structureKeys, structuresWithDemo } from "./kpi.ts";

const KEYS = structureKeys(["hash-map.ts", "linked-hash-map.ts", "summary-tree.ts"]);
const siteDir = fileURLToPath(new URL("..", import.meta.url));
const packageDir = fileURLToPath(new URL("../../collections", import.meta.url));

describe("the count of the structures with a demo", () => {
  it("has a key for each file of src/impl, the LRU cache and the DAG", () => {
    expect(KEYS).toEqual(["hashmap", "linkedhashmap", "summarytree", "lrucache", "dag"]);
  });

  it("reads the values of an import, and leaves out the types and other packages", () => {
    const source = [
      'import { lruCache, type LRUCache, summaryTree as tree } from "@mark1russell7/collections";',
      'import { buildLeveledDAG } from "@mark1russell7/collections/dag";',
      'import type { HashMap } from "@mark1russell7/collections";',
      'import { hashMap } from "other";',
    ].join("\n");
    expect(importedValues(source)).toEqual([
      { name: "lruCache", entry: "" },
      { name: "summaryTree", entry: "" },
      { name: "buildLeveledDAG", entry: "/dag" },
    ]);
  });

  it("counts a name for the longest key, and each structure one time", () => {
    const sources = ['import { linkedHashMap, createLinkedHashMap } from "@mark1russell7/collections";', 'import { executeDAG, createProcessor } from "@mark1russell7/collections/dag";'];
    expect(structuresWithDemo(sources, KEYS)).toEqual(["dag", "linkedhashmap"]);
  });

  it("does not count a type or an unknown name", () => {
    expect(structuresWithDemo(['import { type HashMap, compose } from "@mark1russell7/collections";'], KEYS)).toEqual([]);
  });

  it("reads the real site: the demos and the explorer show each of the 12 structures of the package", () => {
    expect(siteMeasures(siteDir, packageDir)).toEqual([{ id: "structures-with-demo", value: 12, unit: "structures" }]);
    const files = readdirSync(`${packageDir}/src/impl`).filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts"));
    expect(structureKeys(files)).toHaveLength(12);
  });
});
