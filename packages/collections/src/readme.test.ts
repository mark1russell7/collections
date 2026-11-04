import { describe, expect, it } from "vitest";
import { arrayList, compose, hashMap, lruMap, summaryTree, type SummarySpec } from "./index.js";
import { buildLeveledDAG, getTopologicalOrder } from "./dag/index.js";
import { hubBreadthFirstOrder } from "./graph/index.js";

describe("the examples of the README", () => {
  it("lists and behaviors", () => {
    const list = arrayList<number>();
    list.add(1);
    list.add(2);
    expect(list.size).toBe(2);

    const cache = compose(lruMap<string, number>({ capacity: 2 }))(hashMap<string, number>());
    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("c", 3);
    expect(cache.has("a")).toBe(false);
  });

  it("the summary tree", () => {
    const text: SummarySpec<string, string> = {
      monoid: { empty: "", combine: (a, b) => a + b },
      measure: (leaf) => leaf,
    };
    expect(summaryTree(text, ["a", "b", "c"]).summary).toBe("abc");
  });

  it("dependency graphs", () => {
    const nodes = new Map([
      ["app", { id: "app", dependencies: ["lib"] }],
      ["lib", { id: "lib", dependencies: [] }],
    ]);
    expect(getTopologicalOrder(buildLeveledDAG(nodes)).map((node) => node.id)).toEqual(["lib", "app"]);
    expect(hubBreadthFirstOrder(3, [{ a: 0, b: 1 }, { a: 1, b: 2 }])).toEqual([1, 0, 2]);
  });
});
