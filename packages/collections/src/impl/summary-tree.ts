/**
 * SummaryTree: the class form of the summary tree, a persistent sequence of leaves with a summary of each part.
 *
 * The class wraps the plain functions of the entry `@mark1russell7/collections/summary-tree`. Its `record` is the
 * plain record that those functions take. A bundle that uses the class keeps each of its methods, so a program that
 * calls only a few operations imports the functions instead.
 *
 * @example
 * // The number of leaves and the total length of the strings
 * const spec = {
 *   monoid: { empty: { count: 0, length: 0 }, combine: (a, b) => ({ count: a.count + b.count, length: a.length + b.length }) },
 *   measure: (leaf: string) => ({ count: 1, length: leaf.length }),
 * };
 * const tree = summaryTree(spec, ["ab", "cde", "f"]);
 * tree.summary; // { count: 3, length: 6 }
 * const [left, right] = tree.split((prefix) => prefix.length > 2); // left: ["ab"], right: ["cde", "f"]
 */

import * as Tree from "../summary-tree/functions.js";
import type { SummaryLocation, SummaryNode, SummarySearch, SummarySpec, SummaryTreeRecord } from "../summary-tree/functions.js";

export type { SummaryLocation, SummaryMonoid, SummaryNode, SummarySearch, SummarySpec, SummaryTreeRecord } from "../summary-tree/functions.js";

/**
 * A persistent sequence of leaves with a summary of each part. Make one with `summaryTree`. Each method that changes
 * the sequence gives a new tree.
 */
export class SummaryTree<Leaf, Summary> implements Iterable<Leaf> {
  /** The plain record of the tree: its spec and its root. The functions of the entry `./summary-tree` take it. */
  readonly record: SummaryTreeRecord<Leaf, Summary>;

  private constructor(record: SummaryTreeRecord<Leaf, Summary>) {
    this.record = record;
  }

  /** This function makes a tree of a spec from leaves, as `summaryTree` does. */
  static of<Leaf, Summary>(spec: SummarySpec<Leaf, Summary>, leaves: Iterable<Leaf> = []): SummaryTree<Leaf, Summary> {
    return new SummaryTree(Tree.of(spec, leaves));
  }

  /** This function wraps a plain record of the entry `./summary-tree` in a tree. It does not copy the nodes. */
  static fromRecord<Leaf, Summary>(record: SummaryTreeRecord<Leaf, Summary>): SummaryTree<Leaf, Summary> {
    return new SummaryTree(record);
  }

  private wrap(record: SummaryTreeRecord<Leaf, Summary>): SummaryTree<Leaf, Summary> {
    return record === this.record ? this : new SummaryTree(record);
  }

  /** The spec of the tree: its monoid and its measure. */
  get spec(): SummarySpec<Leaf, Summary> {
    return this.record.spec;
  }

  /** The number of leaves. */
  get size(): number {
    return Tree.size(this.record);
  }

  get isEmpty(): boolean {
    return Tree.isEmpty(this.record);
  }

  /** The summary of all the leaves, in their order. An empty tree has the summary `monoid.empty`. */
  get summary(): Summary {
    return Tree.summary(this.record);
  }

  /** The height of the tree: 0 for an empty tree. The height is at most 1.45 log2(size + 2). */
  get height(): number {
    return Tree.height(this.record);
  }

  /**
   * This function gives the leaf at an index, or `undefined` when the index is not in the tree. A negative index counts
   * from the end, as `Array.prototype.at` does.
   */
  at(index: number): Leaf | undefined {
    return Tree.at(this.record, index);
  }

  /** This function gives the summary of the leaves from `start` to `end`, with `end` not included. */
  summaryOf(start = 0, end: number = this.size): Summary {
    return Tree.summaryOf(this.record, start, end);
  }

  /** This function gives the tree of the leaves of this tree, then the leaves of `other`. The two trees must have the same spec. */
  concat(other: SummaryTree<Leaf, Summary> | Iterable<Leaf>): SummaryTree<Leaf, Summary> {
    return this.wrap(Tree.concat(this.record, recordOf(other)));
  }

  /** This function splits the tree into its first `index` leaves and the other leaves. */
  splitAt(index: number): [SummaryTree<Leaf, Summary>, SummaryTree<Leaf, Summary>] {
    const [left, right] = Tree.splitAt(this.record, index);
    return [this.wrap(left), this.wrap(right)];
  }

  /**
   * This function splits the tree before the first leaf whose prefix summary satisfies the predicate. The prefix of a
   * leaf includes the leaf. The predicate must be monotone: after it is true for a prefix, it is true for each longer
   * prefix. When no prefix satisfies it, the right tree is empty.
   */
  split(predicate: (prefix: Summary) => boolean): [SummaryTree<Leaf, Summary>, SummaryTree<Leaf, Summary>] {
    const [left, right] = Tree.split(this.record, predicate);
    return [this.wrap(left), this.wrap(right)];
  }

  /**
   * This function finds the first leaf whose prefix summary satisfies a monotone predicate, as `split` does. It changes
   * nothing. It gives `undefined` when no prefix satisfies the predicate.
   */
  search(predicate: (prefix: Summary) => boolean): SummarySearch<Leaf, Summary> | undefined {
    return Tree.search(this.record, predicate);
  }

  /**
   * This function finds the leaf that holds a position of an additive key, and it calls no `combine`. The key must be
   * additive and not negative: `key(combine(a, b))` is `key(a) + key(b)`. The function descends by the key of each left
   * subtree and of each leaf, and subtracts it from the target. It gives the first leaf whose prefix key is more than
   * the target, or `undefined` when the target is not in `[0, key(summary))`.
   *
   * @example
   * // The leaf and the offset in it of the code unit at position 1000 of a rope
   * const at = rope.locate((s) => s.length, 1000);
   */
  locate(key: (summary: Summary) => number, target: number): SummaryLocation<Leaf> | undefined {
    return Tree.locate(this.record, key, target);
  }

  /** This function gives the tree of the leaves from `start` to `end`, with `end` not included. A negative index counts from the end. */
  slice(start = 0, end: number = this.size): SummaryTree<Leaf, Summary> {
    return this.wrap(Tree.slice(this.record, start, end));
  }

  /**
   * This function removes `deleteCount` leaves at `start` and puts the leaves of `inserted` there, as
   * `Array.prototype.splice` does. It gives the new tree, not the removed leaves.
   */
  splice(start: number, deleteCount: number = this.size, inserted: SummaryTree<Leaf, Summary> | Iterable<Leaf> = []): SummaryTree<Leaf, Summary> {
    return this.wrap(Tree.splice(this.record, start, deleteCount, recordOf(inserted)));
  }

  /** This function puts the leaves of `inserted` before the leaf at `index`. */
  insert(index: number, inserted: SummaryTree<Leaf, Summary> | Iterable<Leaf>): SummaryTree<Leaf, Summary> {
    return this.wrap(Tree.insert(this.record, index, recordOf(inserted)));
  }

  /** This function removes the leaves from `start` to `end`, with `end` not included. */
  remove(start: number, end: number = this.size): SummaryTree<Leaf, Summary> {
    return this.wrap(Tree.remove(this.record, start, end));
  }

  /**
   * This function replaces the leaf at an index. A negative index counts from the end, as `Array.prototype.with` does.
   * An index that is not in the tree changes nothing. It copies only the path to the leaf, and it does not call
   * `spec.merge`.
   */
  set(index: number, leaf: Leaf): SummaryTree<Leaf, Summary> {
    return this.wrap(Tree.set(this.record, index, leaf));
  }

  /** This function adds leaves after the last leaf. */
  append(...leaves: Leaf[]): SummaryTree<Leaf, Summary> {
    return this.wrap(Tree.append(this.record, ...leaves));
  }

  /** This function adds leaves before the first leaf. */
  prepend(...leaves: Leaf[]): SummaryTree<Leaf, Summary> {
    return this.wrap(Tree.prepend(this.record, ...leaves));
  }

  /** This function gives the leaves in their order. */
  [Symbol.iterator](): Iterator<Leaf> {
    return Tree.leaves(this.record);
  }

  /** This function gives the leaves in an array. */
  toArray(): Leaf[] {
    return Tree.toArray(this.record);
  }
}

/** This function gives the record of a tree, or the leaves when they are not a tree. */
function recordOf<Leaf, Summary>(leaves: SummaryTree<Leaf, Summary> | Iterable<Leaf>): SummaryTreeRecord<Leaf, Summary> | Iterable<Leaf> {
  return leaves instanceof SummaryTree ? leaves.record : leaves;
}

/**
 * This function makes a persistent tree of leaves with a summary of each part. Use the same `spec` object for each
 * tree that `concat` or `splice` joins.
 */
export function summaryTree<Leaf, Summary>(spec: SummarySpec<Leaf, Summary>, leaves: Iterable<Leaf> = []): SummaryTree<Leaf, Summary> {
  return SummaryTree.of(spec, leaves);
}

/**
 * @internal This function examines the invariants of a tree: the AVL balance, the heights, the sizes and the
 * summaries. It gives a list of the faults, empty when there is no fault. The tests use it.
 */
export function summaryTreeFaults<Leaf, Summary>(
  tree: SummaryTree<Leaf, Summary> | SummaryTreeRecord<Leaf, Summary>,
  equal: (a: Summary, b: Summary) => boolean,
): string[] {
  const { spec, root } = tree instanceof SummaryTree ? tree.record : tree;
  const { combine, empty } = spec.monoid;
  const heightOf = (n: SummaryNode<Leaf, Summary> | null): number => (n === null ? 0 : n.height);
  const sizeOf = (n: SummaryNode<Leaf, Summary> | null): number => (n === null ? 0 : n.size);
  const summaryOf = (n: SummaryNode<Leaf, Summary> | null): Summary => (n === null ? empty : n.summary);
  const faults: string[] = [];
  const visit = (node: SummaryNode<Leaf, Summary> | null, path: string): void => {
    if (node === null) return;
    visit(node.left, `${path}L`);
    visit(node.right, `${path}R`);
    const hl = heightOf(node.left);
    const hr = heightOf(node.right);
    if (Math.abs(hl - hr) > 1) faults.push(`${path}: balance ${hl - hr}`);
    if (node.height !== 1 + Math.max(hl, hr)) faults.push(`${path}: height ${node.height}`);
    if (node.size !== sizeOf(node.left) + 1 + sizeOf(node.right)) faults.push(`${path}: size ${node.size}`);
    const inner = combine(summaryOf(node.left), spec.measure(node.leaf));
    if (!equal(node.inner, inner)) faults.push(`${path}: inner`);
    if (!equal(node.summary, combine(inner, summaryOf(node.right)))) faults.push(`${path}: summary`);
  };
  visit(root, "^");
  return faults;
}
