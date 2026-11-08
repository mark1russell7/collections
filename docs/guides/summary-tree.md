# Summary trees

A summary tree is a persistent sequence of leaves. Each part of the sequence has a summary, and the tree keeps the summaries current after each change. A text editor uses one as a rope: the leaves are chunks of text, and the summary gives the length and the number of lines.

The package gives the tree in two forms:

| Form | Import | Use it when |
| --- | --- | --- |
| Plain functions over a plain record | `@mark1russell7/collections/summary-tree` | the size of the bundle is important: a bundler keeps only the functions that a program calls |
| The class `SummaryTree` | `@mark1russell7/collections` | you want methods and an iterator. The class wraps the same functions |

Concatenation, a split, an edit and a lookup take logarithmic time. The tree is an AVL tree with one leaf in each node.

## The spec: a monoid and a measure

A tree needs a spec. The spec is data with two parts:

- `monoid` has the summary `empty` of a sequence with no leaf, and the function `combine` that joins the summaries of two parts, left first.
- `measure` gives the summary of one leaf.

`combine` must be associative. `empty` must be its identity. Then the summary of a sequence does not change when the tree has a different shape.

```ts
import assert from "node:assert/strict";
import * as Tree from "@mark1russell7/collections/summary-tree";

interface Size {
  readonly count: number;
  readonly length: number;
}
const words: Tree.SummarySpec<string, Size> = {
  monoid: { empty: { count: 0, length: 0 }, combine: (a, b) => ({ count: a.count + b.count, length: a.length + b.length }) },
  measure: (leaf) => ({ count: 1, length: leaf.length }),
};

const tree = Tree.of(words, ["one", "two", "three"]);
assert.deepEqual(Tree.summary(tree), { count: 3, length: 11 });
assert.deepEqual(Tree.summaryOf(tree, 1, 3), { count: 2, length: 8 });
assert.equal(Tree.size(tree), 3);
assert.equal(Tree.at(tree, -1), "three");
assert.deepEqual(Tree.summary(Tree.of(words)), { count: 0, length: 0 });
```

`summaryOf(tree, start, end)` gives the summary of a range of leaves, with `end` not included. It does not make a new tree.

## Each change gives a new tree

A tree is a record of its spec and its root node. A function that changes the sequence gives a new record. The old record stays the same, and the two records share the nodes that did not change.

```ts
import assert from "node:assert/strict";
import * as Tree from "@mark1russell7/collections/summary-tree";

const text: Tree.SummarySpec<string, string> = {
  monoid: { empty: "", combine: (a, b) => a + b },
  measure: (leaf) => leaf,
};

const first = Tree.of(text, ["a", "b", "c"]);
const second = Tree.set(first, 2, "C");
assert.equal(Tree.summary(first), "abc");
assert.equal(Tree.summary(second), "abC");

// The two trees share the left subtree, because the change is in the right subtree
assert.equal(second.root?.left, first.root?.left);
assert.equal(second.spec, first.spec);

// A function that changes nothing gives the same record
assert.equal(Tree.set(first, 9, "z"), first);
```

Thus you can keep each old tree as a step of an undo history. Each step costs only the new nodes of its path.

## Find a leaf by its summary: search and split

`search` finds the first leaf whose prefix summary satisfies a predicate. The prefix of a leaf includes the leaf. `split` cuts the tree before that leaf.

The predicate must be monotone: after it is true for a prefix, it is true for each longer prefix. The tree descends by the summaries of its subtrees, so it does not examine each leaf.

```ts
import assert from "node:assert/strict";
import * as Tree from "@mark1russell7/collections/summary-tree";

interface Size {
  readonly count: number;
  readonly length: number;
}
const words: Tree.SummarySpec<string, Size> = {
  monoid: { empty: { count: 0, length: 0 }, combine: (a, b) => ({ count: a.count + b.count, length: a.length + b.length }) },
  measure: (leaf) => ({ count: 1, length: leaf.length }),
};
const tree = Tree.of(words, ["one", "two", "three", "four"]);

// The first word that goes past the code unit 5
assert.deepEqual(Tree.search(tree, (prefix) => prefix.length > 5), {
  index: 1,
  leaf: "two",
  before: { count: 1, length: 3 },
  through: { count: 2, length: 6 },
});

const [left, right] = Tree.split(tree, (prefix) => prefix.length > 5);
assert.deepEqual(Tree.toArray(left), ["one"]);
assert.deepEqual(Tree.toArray(right), ["two", "three", "four"]);

// When no prefix satisfies the predicate, search gives undefined, and the right tree of split is empty
assert.equal(Tree.search(tree, (prefix) => prefix.count > 9), undefined);
assert.equal(Tree.size(Tree.split(tree, (prefix) => prefix.count > 9)[1]), 0);
```

`before` is the summary of the leaves before the leaf. `through` also includes the leaf.

## Positions in a text: locate

`locate` finds the leaf that holds a position of an additive key, and the offset in that leaf. A key is additive when the key of a combined summary is the sum of the keys of its parts. A length and a count of lines are additive.

`locate` uses no `combine`. Thus it is faster than `search` for a key of this type.

```ts
import assert from "node:assert/strict";
import * as Tree from "@mark1russell7/collections/summary-tree";

interface Text {
  readonly length: number;
  readonly lines: number;
}
const rope: Tree.SummarySpec<string, Text> = {
  monoid: { empty: { length: 0, lines: 0 }, combine: (a, b) => ({ length: a.length + b.length, lines: a.lines + b.lines }) },
  measure: (chunk) => ({ length: chunk.length, lines: chunk.split("\n").length - 1 }),
};

// The text "let a = 1;\nlet b = 2;\nlet c = 3;\n" in three chunks
const doc = Tree.of(rope, ["let a = 1;\nlet", " b = 2;\n", "let c = 3;\n"]);
assert.deepEqual(Tree.summary(doc), { length: 33, lines: 3 });

// The code unit 16 is the third code unit of the second chunk
assert.deepEqual(Tree.locate(doc, (s) => s.length, 16), { index: 1, leaf: " b = 2;\n", offset: 2 });
assert.equal(Tree.locate(doc, (s) => s.length, 33), undefined);

// The line of a position: the lines before the chunk, and the lines in the chunk before the offset
function lineOf(position: number): number {
  const found = Tree.locate(doc, (s) => s.length, position);
  if (found === undefined) throw new RangeError(`no code unit ${position}`);
  const before = Tree.summaryOf(doc, 0, found.index);
  return before.lines + found.leaf.slice(0, found.offset).split("\n").length - 1;
}
assert.equal(lineOf(0), 0);
assert.equal(lineOf(16), 1);
assert.equal(lineOf(23), 2);
```

A target that is not in `[0, key(summary))` gives `undefined`.

## Edits

The edits take the index of a leaf. A negative index counts from the end, as the methods of an array do.

| Function | Result |
| --- | --- |
| `splice(tree, start, deleteCount, leaves)` | the tree with `deleteCount` leaves at `start` replaced by `leaves`, as `Array.prototype.splice` |
| `insert(tree, index, leaves)` | the tree with `leaves` before the leaf at `index` |
| `remove(tree, start, end)` | the tree without the leaves from `start` to `end` |
| `set(tree, index, leaf)` | the tree with a new leaf at `index` |
| `slice(tree, start, end)` | the tree of the leaves from `start` to `end` |
| `splitAt(tree, index)` | the first `index` leaves and the other leaves, as two trees |
| `concat(tree, other)` | the leaves of `tree`, then the leaves of `other` |
| `append(tree, ...leaves)` and `prepend(tree, ...leaves)` | the tree with leaves at the end or at the start |

```ts
import assert from "node:assert/strict";
import * as Tree from "@mark1russell7/collections/summary-tree";

const text: Tree.SummarySpec<string, string> = {
  monoid: { empty: "", combine: (a, b) => a + b },
  measure: (leaf) => leaf,
};
const tree = Tree.of(text, ["a", "b", "c", "d"]);

assert.equal(Tree.summary(Tree.splice(tree, 1, 2, ["x"])), "axd");
assert.equal(Tree.summary(Tree.insert(tree, 2, ["y", "z"])), "abyzcd");
assert.equal(Tree.summary(Tree.remove(tree, 1, 3)), "ad");
assert.equal(Tree.summary(Tree.slice(tree, -2)), "cd");
assert.equal(Tree.summary(Tree.append(Tree.prepend(tree, "<"), ">")), "<abcd>");

const [head, tail] = Tree.splitAt(tree, 1);
assert.equal(Tree.summary(Tree.concat(tail, head)), "bcda");
assert.deepEqual([...Tree.leaves(tree)], ["a", "b", "c", "d"]);
```

`concat`, `splice` and `insert` take a tree or an iterable of leaves. Two trees join only when they have the same `spec` object. A string is an iterable, so each of its characters becomes one leaf.

```ts
import assert from "node:assert/strict";
import * as Tree from "@mark1russell7/collections/summary-tree";

const text: Tree.SummarySpec<string, string> = {
  monoid: { empty: "", combine: (a, b) => a + b },
  measure: (leaf) => leaf,
};
const tree = Tree.of(text, ["ab"]);

// A string gives one leaf for each character. Put a leaf in an array to add it as one leaf
assert.deepEqual(Tree.toArray(Tree.concat(tree, "cd")), ["ab", "c", "d"]);
assert.deepEqual(Tree.toArray(Tree.concat(tree, ["cd"])), ["ab", "cd"]);

// A copy of the spec is a different object, so the trees do not join
const copy = { ...text };
assert.throws(() => Tree.concat(tree, Tree.of(copy, ["x"])), /different specs/);
```

## A monoid that is not commutative

`combine` must be associative, but its order of arguments can be important. The tree keeps the order of the leaves, so `combine(a, b)` and `combine(b, a)` can be different.

This spec examines brackets. The summary of a sequence is its depth at the end, `sum`, and its lowest depth, `min`. A sequence is balanced when `sum` is 0 and `min` is not negative.

```ts
import assert from "node:assert/strict";
import * as Tree from "@mark1russell7/collections/summary-tree";

interface Depth {
  readonly sum: number;
  readonly min: number;
}
const brackets: Tree.SummarySpec<string, Depth> = {
  monoid: { empty: { sum: 0, min: 0 }, combine: (a, b) => ({ sum: a.sum + b.sum, min: Math.min(a.min, a.sum + b.min) }) },
  measure: (leaf) => (leaf === "(" ? { sum: 1, min: 0 } : { sum: -1, min: -1 }),
};
const balanced = (tree: Tree.SummaryTreeRecord<string, Depth>): boolean => {
  const { sum, min } = Tree.summary(tree);
  return sum === 0 && min >= 0;
};

const tree = Tree.of(brackets, [..."(()())"]);
assert.equal(balanced(tree), true);
assert.equal(balanced(Tree.remove(tree, 0, 1)), false);

// The order is important: "()" is balanced, and ")(" is not
assert.equal(balanced(Tree.of(brackets, [..."()"])), true);
assert.equal(balanced(Tree.of(brackets, [...")("])), false);

// The first close bracket with no open bracket: the first prefix with a negative depth
const bad = Tree.of(brackets, [..."(()))("]);
assert.equal(Tree.search(bad, (prefix) => prefix.min < 0)?.index, 4);
```

After each edit, the tree combines the summaries of only the nodes on the changed paths. Thus `balanced` stays fast for a long text.

## Join neighbor leaves: merge

The spec can have a third part, `merge`. It joins two neighbor leaves into one leaf, or gives `undefined` to keep the two leaves. A rope uses it to keep its chunks large.

The tree uses `merge` once at each seam. A seam is the place where an edit puts two leaves next to each other. The tree does not use `merge` between the leaves of one edit, and `set` does not use it.

```ts
import assert from "node:assert/strict";
import * as Tree from "@mark1russell7/collections/summary-tree";

// A chunk has at most 4 code units
const chunks: Tree.SummarySpec<string, number> = {
  monoid: { empty: 0, combine: (a, b) => a + b },
  measure: (chunk) => chunk.length,
  merge: (left, right) => (left.length + right.length <= 4 ? left + right : undefined),
};

// No merge between the leaves of one edit
assert.deepEqual(Tree.toArray(Tree.of(chunks, ["a", "b"])), ["a", "b"]);

let tree = Tree.of(chunks, ["ab"]);
tree = Tree.append(tree, "c");
assert.deepEqual(Tree.toArray(tree), ["abc"]);

// "abc" and "de" have 5 code units, so the two chunks stay
tree = Tree.append(tree, "de");
assert.deepEqual(Tree.toArray(tree), ["abc", "de"]);

// The seam is between "de" and "f". The two leaves of the edit do not merge
tree = Tree.append(tree, "f", "g");
assert.deepEqual(Tree.toArray(tree), ["abc", "def", "g"]);
assert.equal(Tree.summary(tree), 7);
```

## The height of a tree

`height` gives the number of levels of the tree. An empty tree has the height 0. The tree stays balanced: its height is at most 1.45 log2(size + 2).

```ts
import assert from "node:assert/strict";
import * as Tree from "@mark1russell7/collections/summary-tree";

const count: Tree.SummarySpec<number, number> = {
  monoid: { empty: 0, combine: (a, b) => a + b },
  measure: () => 1,
};

let tree = Tree.of(count);
assert.equal(Tree.height(tree), 0);

// Each append adds a leaf at the right end
for (let i = 0; i < 1000; i++) tree = Tree.append(tree, i);
assert.equal(Tree.size(tree), 1000);
assert.ok(Tree.height(tree) >= Math.log2(1000 + 1));
assert.ok(Tree.height(tree) <= 1.45 * Math.log2(1000 + 2));
```

## The class SummaryTree

The root entry gives the class `SummaryTree` and the function `summaryTree`. Each method uses the function of the same name. The field `record` is the plain record, and `SummaryTree.fromRecord` wraps a record.

```ts
import assert from "node:assert/strict";
import { SummaryTree, summaryTree, type SummarySpec } from "@mark1russell7/collections";
import * as Tree from "@mark1russell7/collections/summary-tree";

const text: SummarySpec<string, string> = {
  monoid: { empty: "", combine: (a, b) => a + b },
  measure: (leaf) => leaf,
};

const tree = summaryTree(text, ["a", "b"]).append("c");
assert.equal(tree.summary, "abc");
assert.equal(tree.size, 3);
assert.deepEqual([...tree], ["a", "b", "c"]);

// The class and the functions use the same record
const record = Tree.insert(tree.record, 0, ["z"]);
assert.equal(SummaryTree.fromRecord(record).summary, "zabc");
assert.equal(tree.summary, "abc");
```

A library that gives trees to its users can keep the record in its own types. Its users then select the class or the functions.
