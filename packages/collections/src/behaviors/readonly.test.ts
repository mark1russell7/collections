/**
 * A readonly view blocks each change (C27). `readonly` blocks a list of method names. This test takes each method of
 * each structure of the package, and puts it in the reads below or in the blocked names of `readonly.ts`.
 * A new method fails this test until one of the two lists has its name.
 */

import { describe, expect, it } from "vitest";
import { compose } from "../core/middleware.js";
import { arrayDeque } from "../impl/array-deque.js";
import { arrayList } from "../impl/array-list.js";
import { hashMap } from "../impl/hash-map.js";
import { hashSet } from "../impl/hash-set.js";
import { linkedHashMap } from "../impl/linked-hash-map.js";
import { linkedList } from "../impl/linked-list.js";
import { priorityQueue } from "../impl/priority-queue.js";
import { summaryTree } from "../impl/summary-tree.js";
import { treeMap } from "../impl/tree-map.js";
import { treeSet } from "../impl/tree-set.js";
import type { MapLike } from "../interfaces/map.js";
import type { Queue } from "../interfaces/queue.js";
import { lruCache } from "./lru.js";
import { readonly } from "./readonly.js";

/** The methods that do not change a structure. A name here stays open on a readonly view. */
const READS = new Set([
  // The reads of the interfaces
  "contains", "containsAll", "containsKey", "containsValue", "entries", "eq", "first", "forEach", "get", "getOrDefault",
  "getOrUndefined", "has", "indexOf", "keys", "last", "lastIndexOf", "peek", "peekFirst", "peekFirstOrUndefined",
  "peekLast", "peekLastOrUndefined", "peekOrUndefined", "toArray", "toSortedArray", "toString", "values", "comparator",
  "clone", "getStats", "validate",
  // The navigation of the sorted maps and sets
  "ceiling", "ceilingEntry", "ceilingKey", "floor", "floorEntry", "floorKey", "higher", "higherEntry", "higherKey",
  "lower", "lowerEntry", "lowerKey", "firstEntry", "firstKey", "lastEntry", "lastKey", "descendingIterator",
  "descendingKeys",
  // The views: `readonly` wraps each result again
  "subList", "subMap", "subSet", "headMap", "headSet", "tailMap", "tailSet", "descendingMap", "descendingSet",
  // The set algebra gives a new set
  "difference", "intersection", "isDisjointFrom", "isSubsetOf", "isSupersetOf", "symmetricDifference", "union",
  // The internal reads: TypeScript marks them private, and none of them changes the structure
  "checkIndex", "checkInsertIndex", "checkRange", "getNode", "nextPowerOfTwo", "compare", "bucketIndex",
  "checkUnchanged", "findNode", "keyEq", "valueEq", "getBucketIndex", "hash", "createNode", "findValue", "getFirstNode",
  "getLastNode", "inOrderTraversal", "reverseInOrderTraversal", "empty", "setOf",
  // SummaryTree is persistent: each of these operations gives a new tree and keeps the old tree
  "append", "at", "concat", "locate", "prepend", "search", "slice", "splice", "split", "splitAt", "summaryOf", "treeOf",
  "wrap",
]);

/** This function gives the name of each method of the object and of its prototypes. */
function methodNames(value: object): string[] {
  const names = new Set<string>();
  for (let layer: object | null = value; layer !== null && layer !== Object.prototype; layer = Object.getPrototypeOf(layer)) {
    for (const name of Object.getOwnPropertyNames(layer)) {
      if (name !== "constructor" && !name.startsWith("_") && typeof Reflect.get(value, name) === "function") names.add(name);
    }
  }
  return [...names].sort();
}

const sum = { monoid: { empty: 0, combine: (a: number, b: number) => a + b }, measure: (leaf: number) => leaf };

/** Each structure of the package, with three elements, and a function that gives its content. */
const structures: [string, () => { base: object; content: () => unknown }][] = [
  ["arrayList", () => { const base = arrayList([3, 1, 2]); return { base, content: () => base.toArray() }; }],
  ["linkedList", () => { const base = linkedList([3, 1, 2]); return { base, content: () => base.toArray() }; }],
  ["arrayDeque", () => { const base = arrayDeque([3, 1, 2]); return { base, content: () => base.toArray() }; }],
  ["priorityQueue", () => { const base = priorityQueue([3, 1, 2]); return { base, content: () => base.toSortedArray() }; }],
  ["hashSet", () => { const base = hashSet([3, 1, 2]); return { base, content: () => base.toArray().sort() }; }],
  ["treeSet", () => { const base = treeSet([3, 1, 2]); return { base, content: () => base.toArray() }; }],
  ["hashMap", () => mapOf(hashMap<string, number>())],
  ["linkedHashMap", () => mapOf(linkedHashMap<string, number>())],
  ["treeMap", () => mapOf(treeMap<string, number>())],
  ["lruCache", () => {
    const base = lruCache<string, number>(3);
    base.set("c", 3);
    base.set("a", 1);
    base.set("b", 2);
    return { base, content: () => [...base.entries()] };
  }],
  ["summaryTree", () => { const base = summaryTree(sum, [3, 1, 2]); return { base, content: () => base.toArray() }; }],
];

function mapOf(base: MapLike<string, number>) {
  base.set("c", 3);
  base.set("a", 1);
  base.set("b", 2);
  return { base, content: () => [...base.entries()] };
}

describe("a readonly view blocks each change (C27)", () => {
  for (const [name, make] of structures) {
    it(`${name}: each method is a read or throws the readonly error, and the base does not change`, () => {
      const { base, content } = make();
      const before = content();
      const view = compose(readonly({ errorMessage: "readonly" }))(base) as Record<string, (...args: unknown[]) => unknown>;
      const open: string[] = [];
      for (const method of methodNames(base)) {
        try {
          view[method]!();
          open.push(method);
        } catch (error) {
          // A read with no argument can throw its own error. Only the readonly error tells that the view blocked it.
          if ((error as Error).message !== "readonly") open.push(method);
        }
      }
      expect(open.filter((method) => !READS.has(method))).toEqual([]);
      expect(content()).toEqual(before);
    });
  }

  it("blocks pollOrUndefined, so a readonly queue keeps its elements", () => {
    const queues: Queue<number>[] = [arrayDeque([1, 2]), linkedList([1, 2]), priorityQueue([1, 2])];
    for (const base of queues) {
      const view = compose(readonly<Queue<number>>())(base);
      expect(() => view.pollOrUndefined()).toThrow(/Cannot modify readonly collection/);
      expect(base.size).toBe(2);
    }
  });
});
