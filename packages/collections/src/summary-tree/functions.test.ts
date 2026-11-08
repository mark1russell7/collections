/**
 * The entry `./summary-tree` gives the same trees as the class `SummaryTree` (C35). A model test applies each
 * sequence of edits to an array, to a plain record and to a class tree, and compares the leaves, the summary and the
 * invariants. The class and the functions share their records.
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import * as Tree from "./index.js";
import { SummaryTree, summaryTreeFaults } from "../impl/summary-tree.js";
import type { SummarySpec, SummaryTreeRecord } from "./index.js";

/** A non-commutative monoid: the concatenation of the leaves. */
const text: SummarySpec<string, string> = { monoid: { empty: "", combine: (a, b) => a + b }, measure: (leaf) => leaf };

/** The same text, with a merge of two leaves when their total length is 4 or less. */
const merging: SummarySpec<string, string> = { ...text, merge: (a, b) => (a.length + b.length <= 4 ? a + b : undefined) };

const same = (a: string, b: string): boolean => a === b;

type Edit =
  | { readonly kind: "splice"; readonly start: number; readonly count: number; readonly items: string[] }
  | { readonly kind: "insert"; readonly index: number; readonly items: string[] }
  | { readonly kind: "remove"; readonly start: number; readonly end: number }
  | { readonly kind: "set"; readonly index: number; readonly item: string }
  | { readonly kind: "slice"; readonly start: number; readonly end: number }
  | { readonly kind: "concat"; readonly items: string[] }
  | { readonly kind: "append"; readonly items: string[] }
  | { readonly kind: "prepend"; readonly items: string[] }
  | { readonly kind: "split-join"; readonly index: number };

const leaf = fc.string({ minLength: 1, maxLength: 3 });
const items = (max: number) => fc.array(leaf, { maxLength: max });
const edit: fc.Arbitrary<Edit> = fc.oneof(
  fc.record({ kind: fc.constant("splice" as const), start: fc.integer({ min: -5, max: 70 }), count: fc.integer({ min: 0, max: 20 }), items: items(20) }),
  fc.record({ kind: fc.constant("insert" as const), index: fc.integer({ min: -5, max: 70 }), items: items(12) }),
  fc.record({ kind: fc.constant("remove" as const), start: fc.integer({ min: -10, max: 70 }), end: fc.integer({ min: -10, max: 80 }) }),
  fc.record({ kind: fc.constant("set" as const), index: fc.integer({ min: -70, max: 70 }), item: leaf }),
  fc.record({ kind: fc.constant("slice" as const), start: fc.integer({ min: -10, max: 70 }), end: fc.integer({ min: -10, max: 80 }) }),
  fc.record({ kind: fc.constant("concat" as const), items: items(40) }),
  fc.record({ kind: fc.constant("append" as const), items: items(5) }),
  fc.record({ kind: fc.constant("prepend" as const), items: items(10) }),
  fc.record({ kind: fc.constant("split-join" as const), index: fc.integer({ min: 0, max: 70 }) }),
);

function applyToRecord(tree: SummaryTreeRecord<string, string>, e: Edit): SummaryTreeRecord<string, string> {
  switch (e.kind) {
    case "splice":
      return Tree.splice(tree, e.start, e.count, e.items);
    case "insert":
      return Tree.insert(tree, e.index, Tree.of(tree.spec, e.items));
    case "remove":
      return Tree.remove(tree, e.start, e.end);
    case "set":
      return Tree.set(tree, e.index, e.item);
    case "slice":
      return Tree.slice(tree, e.start, e.end);
    case "concat":
      return Tree.concat(tree, Tree.of(tree.spec, e.items));
    case "append":
      return Tree.append(tree, ...e.items);
    case "prepend":
      return Tree.prepend(tree, ...e.items);
    case "split-join": {
      const [left, right] = Tree.splitAt(tree, e.index);
      return Tree.concat(left, right);
    }
  }
}

function applyToClass(tree: SummaryTree<string, string>, e: Edit): SummaryTree<string, string> {
  switch (e.kind) {
    case "splice":
      return tree.splice(e.start, e.count, e.items);
    case "insert":
      return tree.insert(e.index, SummaryTree.of(tree.spec, e.items));
    case "remove":
      return tree.remove(e.start, e.end);
    case "set":
      return tree.set(e.index, e.item);
    case "slice":
      return tree.slice(e.start, e.end);
    case "concat":
      return tree.concat(SummaryTree.of(tree.spec, e.items));
    case "append":
      return tree.append(...e.items);
    case "prepend":
      return tree.prepend(...e.items);
    case "split-join": {
      const [left, right] = tree.splitAt(e.index);
      return left.concat(right);
    }
  }
}

describe("the functions of ./summary-tree", () => {
  it.each([
    ["without merge", text],
    ["with merge", merging],
  ] as const)("give the leaves, the summary and the invariants of the class after each edit (%s)", (_name, spec) => {
    fc.assert(
      fc.property(items(60), fc.array(edit, { maxLength: 12 }), (start, edits) => {
        let record = Tree.of(spec, start);
        let tree = SummaryTree.of(spec, start);
        for (const e of edits) {
          record = applyToRecord(record, e);
          tree = applyToClass(tree, e);
          expect(Tree.toArray(record)).toEqual(tree.toArray());
          expect(Tree.summary(record)).toBe(tree.summary);
          expect(Tree.size(record)).toBe(tree.size);
          expect(Tree.height(record)).toBe(tree.height);
          expect(summaryTreeFaults(record, same)).toEqual([]);
        }
      }),
      { seed: 0xc35, numRuns: 200 },
    );
  });

  it("read the tree as the class does", () => {
    const record = Tree.of(text, ["ab", "c", "def"]);
    const tree = SummaryTree.fromRecord(record);
    for (let i = -4; i < 4; i++) expect(Tree.at(record, i)).toBe(tree.at(i));
    expect(Tree.isEmpty(record)).toBe(false);
    expect(Tree.isEmpty(Tree.of(text))).toBe(true);
    expect(Tree.summaryOf(record, 1)).toBe("cdef");
    expect(Tree.search(record, (prefix) => prefix.length > 2)).toEqual(tree.search((prefix) => prefix.length > 2));
    expect(Tree.locate(record, (s) => s.length, 3)).toEqual({ index: 2, leaf: "def", offset: 0 });
    expect(Tree.split(record, (prefix) => prefix.length > 2).map(Tree.toArray)).toEqual([["ab"], ["c", "def"]]);
    expect([...Tree.leaves(record)]).toEqual(["ab", "c", "def"]);
  });

  it("give the same record for an edit that changes nothing, and keep the old record", () => {
    const record = Tree.of(text, ["a", "b", "c"]);
    expect(Tree.splice(record, 1, 0, [])).toBe(record);
    expect(Tree.set(record, 7, "x")).toBe(record);
    expect(Tree.concat(record, [])).toBe(record);
    const edited = Tree.set(Tree.insert(record, 1, ["x"]), 0, "y");
    expect(Tree.toArray(edited)).toEqual(["y", "x", "b", "c"]);
    expect(Tree.toArray(record)).toEqual(["a", "b", "c"]);
  });

  it("take a string as an iterable of leaves, not as a record", () => {
    const chars: SummarySpec<string, number> = { monoid: { empty: 0, combine: (a, b) => a + b }, measure: () => 1 };
    expect(Tree.toArray(Tree.concat(Tree.of(chars, "ab"), "cd"))).toEqual(["a", "b", "c", "d"]);
  });

  it("refuse to join two records of different specs", () => {
    const other: SummarySpec<string, string> = { ...text };
    expect(() => Tree.concat(Tree.of(text, ["a"]), Tree.of(other, ["b"]))).toThrow(TypeError);
    expect(() => Tree.splice(Tree.of(text, ["a"]), 0, 0, Tree.of(other, ["b"]))).toThrow(TypeError);
  });
});

describe("SummaryTree and its record", () => {
  it("share the nodes, so a tree and a record join without a copy", () => {
    const tree = SummaryTree.of(text, ["a", "b"]);
    expect(SummaryTree.fromRecord(tree.record).record).toBe(tree.record);
    const joined = Tree.concat(tree.record, SummaryTree.of(text, ["c"]).record);
    expect(SummaryTree.fromRecord(joined).toArray()).toEqual(["a", "b", "c"]);
    expect(tree.set(9, "x")).toBe(tree);
  });

  it("refuses to join a tree with a record of another spec", () => {
    const other: SummarySpec<string, string> = { ...text };
    expect(() => SummaryTree.of(text, ["a"]).concat(SummaryTree.of(other, ["b"]))).toThrow(TypeError);
  });
});
