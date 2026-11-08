/**
 * The summary tree as plain functions over a plain record: a persistent sequence of leaves with a summary of each part.
 *
 * The tree is a balanced binary tree (AVL) with one leaf in each node. Each node keeps the summary of its subtree.
 * A summary is a value of a monoid: the caller gives the monoid as data, with `empty` and `combine`. The order of the
 * leaves is kept, so `combine` must be associative, but it can be non-commutative.
 *
 * A tree is a record of its spec and its root. Each function that changes the sequence gives a new record and keeps the
 * old record. The two records share the nodes that did not change. Concatenation, a split at an index or at a summary
 * search, an edit and a lookup are O(log n).
 *
 * Each function is a separate export, so a bundler keeps only the functions that a program calls. The class
 * `SummaryTree` of the root entry wraps the same functions.
 *
 * The algorithms are the "join" algorithms of Blelloch, Ferizovic and Sun, "Just Join for Parallel Ordered Sets"
 * (SPAA 2016).
 *
 * @example
 * // The number of leaves and the total length of the strings
 * import * as Tree from "@mark1russell7/collections/summary-tree";
 * const spec = {
 *   monoid: { empty: { count: 0, length: 0 }, combine: (a, b) => ({ count: a.count + b.count, length: a.length + b.length }) },
 *   measure: (leaf: string) => ({ count: 1, length: leaf.length }),
 * };
 * const tree = Tree.of(spec, ["ab", "cde", "f"]);
 * Tree.summary(tree); // { count: 3, length: 6 }
 * const [left, right] = Tree.split(tree, (prefix) => prefix.length > 2); // left: ["ab"], right: ["cde", "f"]
 */

/** A monoid as data: the identity value `empty` and an associative operation `combine`. */
export interface SummaryMonoid<Summary> {
  /** The summary of a sequence with no leaf. `combine(empty, s)` and `combine(s, empty)` are equal to `s`. */
  readonly empty: Summary;
  /** This function gives the summary of a sequence from the summaries of its two parts, left first. */
  readonly combine: (left: Summary, right: Summary) => Summary;
}

/** The data that a tree needs: the monoid of the summaries and the summary of one leaf. */
export interface SummarySpec<Leaf, Summary> {
  readonly monoid: SummaryMonoid<Summary>;
  /** This function gives the summary of one leaf. */
  readonly measure: (leaf: Leaf) => Summary;
  /**
   * This optional function joins two neighbor leaves at a seam into one leaf, or gives `undefined` to keep both. A seam
   * is the place where `concat`, `append`, `prepend`, `splice`, `insert` or `remove` puts two leaves next to each other.
   * The tree calls it once at each seam, and not between the leaves that one call inserts. `set` does not call it.
   */
  readonly merge?: (left: Leaf, right: Leaf) => Leaf | undefined;
}

/** The result of a summary search: the first leaf whose prefix summary satisfies the predicate. */
export interface SummarySearch<Leaf, Summary> {
  /** The index of the leaf. */
  readonly index: number;
  readonly leaf: Leaf;
  /** The summary of the leaves before the leaf. */
  readonly before: Summary;
  /** The summary of the leaves before the leaf, and of the leaf. */
  readonly through: Summary;
}

/** The result of `locate`: the leaf that holds a position of an additive key, and the position in that leaf. */
export interface SummaryLocation<Leaf> {
  /** The index of the leaf. */
  readonly index: number;
  readonly leaf: Leaf;
  /** The position in the leaf: the target minus the key of the leaves before the leaf. */
  readonly offset: number;
}

/** One node of a tree. The functions do not change a node after they make it. */
export interface SummaryNode<Leaf, Summary> {
  readonly left: SummaryNode<Leaf, Summary> | null;
  readonly leaf: Leaf;
  /** The summary of the leaf of this node only. */
  readonly own: Summary;
  /** The summary of the leaves of the left subtree and the leaf of this node. A copy with the same left subtree and leaf keeps it. */
  readonly inner: Summary;
  readonly right: SummaryNode<Leaf, Summary> | null;
  readonly height: number;
  readonly size: number;
  /** The summary of all the leaves of this subtree. */
  readonly summary: Summary;
}

/**
 * A tree as a plain record: its spec and its root. `of` makes one. A function that changes nothing gives the same
 * record. Two trees join only when they have the same `spec` object.
 */
export interface SummaryTreeRecord<Leaf, Summary> {
  readonly spec: SummarySpec<Leaf, Summary>;
  /** The root node, or `null` for a tree with no leaf. */
  readonly root: SummaryNode<Leaf, Summary> | null;
}

type Tree<L, S> = SummaryNode<L, S> | null;
type Spec<L, S> = SummarySpec<L, S>;

function heightOf<L, S>(tree: Tree<L, S>): number {
  return tree === null ? 0 : tree.height;
}

function sizeOf<L, S>(tree: Tree<L, S>): number {
  return tree === null ? 0 : tree.size;
}

function summaryOfRoot<L, S>(spec: Spec<L, S>, tree: Tree<L, S>): S {
  return tree === null ? spec.monoid.empty : tree.summary;
}

/** This function makes a node. Give `inner` only when it is the summary of `left` and `own`, to save one `combine`. */
function node<L, S>(spec: Spec<L, S>, left: Tree<L, S>, leaf: L, own: S, right: Tree<L, S>, inner?: S): SummaryNode<L, S> {
  if (inner === undefined) inner = left === null ? own : spec.monoid.combine(left.summary, own);
  return {
    left,
    leaf,
    own,
    inner,
    right,
    height: 1 + Math.max(heightOf(left), heightOf(right)),
    size: sizeOf(left) + 1 + sizeOf(right),
    summary: right === null ? inner : spec.monoid.combine(inner, right.summary),
  };
}

/** This function copies a node with a new right subtree. It keeps the summary `inner`, so it calls `combine` once at most. */
function withRight<L, S>(spec: Spec<L, S>, n: SummaryNode<L, S>, right: Tree<L, S>): SummaryNode<L, S> {
  return node(spec, n.left, n.leaf, n.own, right, n.inner);
}

function rotateLeft<L, S>(spec: Spec<L, S>, n: SummaryNode<L, S>): SummaryNode<L, S> {
  const r = n.right!;
  return node(spec, withRight(spec, n, r.left), r.leaf, r.own, r.right);
}

function rotateRight<L, S>(spec: Spec<L, S>, n: SummaryNode<L, S>): SummaryNode<L, S> {
  const l = n.left!;
  return withRight(spec, l, node(spec, l.right, n.leaf, n.own, n.right));
}

/** This function joins a tree that is higher by more than 1 with a leaf and a lower tree on its right. */
function joinRight<L, S>(spec: Spec<L, S>, left: SummaryNode<L, S>, leaf: L, own: S, right: Tree<L, S>): SummaryNode<L, S> {
  const c = left.right;
  if (heightOf(c) <= heightOf(right) + 1) {
    const t = node(spec, c, leaf, own, right);
    if (t.height <= heightOf(left.left) + 1) return withRight(spec, left, t);
    return rotateLeft(spec, withRight(spec, left, rotateRight(spec, t)));
  }
  const t = joinRight(spec, c!, leaf, own, right);
  const joined = withRight(spec, left, t);
  return t.height <= heightOf(left.left) + 1 ? joined : rotateLeft(spec, joined);
}

/** This function joins a lower tree on the left with a leaf and a tree that is higher by more than 1. */
function joinLeft<L, S>(spec: Spec<L, S>, left: Tree<L, S>, leaf: L, own: S, right: SummaryNode<L, S>, inner?: S): SummaryNode<L, S> {
  const c = right.left;
  if (heightOf(c) <= heightOf(left) + 1) {
    const t = node(spec, left, leaf, own, c, inner);
    if (t.height <= heightOf(right.right) + 1) return node(spec, t, right.leaf, right.own, right.right);
    return rotateRight(spec, node(spec, rotateLeft(spec, t), right.leaf, right.own, right.right));
  }
  const t = joinLeft(spec, left, leaf, own, c!, inner);
  const joined = node(spec, t, right.leaf, right.own, right.right);
  return t.height <= heightOf(right.right) + 1 ? joined : rotateRight(spec, joined);
}

/**
 * This function gives the tree of the leaves of `left`, then `leaf`, then the leaves of `right`. Give `inner` only
 * when it is the summary of `left` and `own`.
 */
function join<L, S>(spec: Spec<L, S>, left: Tree<L, S>, leaf: L, own: S, right: Tree<L, S>, inner?: S): SummaryNode<L, S> {
  if (heightOf(left) > heightOf(right) + 1) return joinRight(spec, left!, leaf, own, right);
  if (heightOf(right) > heightOf(left) + 1) return joinLeft(spec, left, leaf, own, right!, inner);
  return node(spec, left, leaf, own, right, inner);
}

/** This function removes the last leaf of a tree, and gives the rest and the node of that leaf. */
function splitLast<L, S>(spec: Spec<L, S>, tree: SummaryNode<L, S>): [Tree<L, S>, SummaryNode<L, S>] {
  if (tree.right === null) return [tree.left, tree];
  const [rest, last] = splitLast(spec, tree.right);
  return [join(spec, tree.left, tree.leaf, tree.own, rest, tree.inner), last];
}

function concatRoots<L, S>(spec: Spec<L, S>, left: Tree<L, S>, right: Tree<L, S>): Tree<L, S> {
  if (left === null) return right;
  if (right === null) return left;
  const [rest, last] = splitLast(spec, left);
  return join(spec, rest, last.leaf, last.own, right);
}

/** This function splits a tree into its first `index` leaves and the other leaves. */
function splitRoot<L, S>(spec: Spec<L, S>, tree: Tree<L, S>, index: number): [Tree<L, S>, Tree<L, S>] {
  if (tree === null) return [null, null];
  const before = sizeOf(tree.left);
  if (index <= before) {
    const [a, b] = splitRoot(spec, tree.left, index);
    return [a, join(spec, b, tree.leaf, tree.own, tree.right)];
  }
  const [a, b] = splitRoot(spec, tree.right, index - before - 1);
  return [join(spec, tree.left, tree.leaf, tree.own, a, tree.inner), b];
}

/** This function splits a tree before the first leaf whose prefix summary, after `acc`, satisfies the predicate. */
function splitRootBy<L, S>(spec: Spec<L, S>, tree: Tree<L, S>, predicate: (prefix: S) => boolean, acc: S): [Tree<L, S>, Tree<L, S>] {
  if (tree === null) return [null, null];
  const { combine } = spec.monoid;
  const throughLeft = tree.left === null ? acc : combine(acc, tree.left.summary);
  if (tree.left !== null && predicate(throughLeft)) {
    const [a, b] = splitRootBy(spec, tree.left, predicate, acc);
    return [a, join(spec, b, tree.leaf, tree.own, tree.right)];
  }
  const throughLeaf = combine(throughLeft, tree.own);
  if (predicate(throughLeaf)) return [tree.left, join(spec, null, tree.leaf, tree.own, tree.right)];
  const [a, b] = splitRootBy(spec, tree.right, predicate, throughLeaf);
  return [join(spec, tree.left, tree.leaf, tree.own, a, tree.inner), b];
}

/** This function replaces the leaf at an index in the tree. It copies only the path to the leaf. */
function replaceAt<L, S>(spec: Spec<L, S>, tree: SummaryNode<L, S>, index: number, leaf: L, own: S): SummaryNode<L, S> {
  const before = sizeOf(tree.left);
  if (index === before) return node(spec, tree.left, leaf, own, tree.right);
  if (index < before) return node(spec, replaceAt(spec, tree.left!, index, leaf, own), tree.leaf, tree.own, tree.right);
  return withRight(spec, tree, replaceAt(spec, tree.right!, index - before - 1, leaf, own));
}

/** This function puts one leaf before the leaf at an index. It copies only the path, and `join` keeps the balance. */
function insertAt<L, S>(spec: Spec<L, S>, tree: Tree<L, S>, index: number, leaf: L, own: S): SummaryNode<L, S> {
  if (tree === null) return node(spec, null, leaf, own, null);
  const before = sizeOf(tree.left);
  if (index <= before) return join(spec, insertAt(spec, tree.left, index, leaf, own), tree.leaf, tree.own, tree.right);
  return join(spec, tree.left, tree.leaf, tree.own, insertAt(spec, tree.right, index - before - 1, leaf, own), tree.inner);
}

/**
 * This function replaces the leaf at an index with one or more leaves. It descends once.
 * At the node of the leaf, it puts the first new leaf in the node.
 * It puts the other new leaves at the start of the right subtree of that node.
 */
function replaceSpan<L, S>(spec: Spec<L, S>, tree: SummaryNode<L, S>, index: number, leaves: readonly L[]): SummaryNode<L, S> {
  const before = sizeOf(tree.left);
  if (index < before) return join(spec, replaceSpan(spec, tree.left!, index, leaves), tree.leaf, tree.own, tree.right);
  if (index > before) return join(spec, tree.left, tree.leaf, tree.own, replaceSpan(spec, tree.right!, index - before - 1, leaves), tree.inner);
  let right = tree.right;
  for (let i = 1; i < leaves.length; i++) right = insertAt(spec, right, i - 1, leaves[i]!, spec.measure(leaves[i]!));
  return join(spec, tree.left, leaves[0]!, spec.measure(leaves[0]!), right);
}

/** This function removes the leaf at an index. It copies only the path, and `join` keeps the balance. */
function removeAt<L, S>(spec: Spec<L, S>, tree: SummaryNode<L, S>, index: number): Tree<L, S> {
  const before = sizeOf(tree.left);
  if (index === before) return concatRoots(spec, tree.left, tree.right);
  if (index < before) return join(spec, removeAt(spec, tree.left!, index), tree.leaf, tree.own, tree.right);
  return join(spec, tree.left, tree.leaf, tree.own, removeAt(spec, tree.right!, index - before - 1), tree.inner);
}

/** This function gives the leaf at an index of the tree. The index must be in the tree. */
function leafAt<L, S>(tree: SummaryNode<L, S>, index: number): L {
  let n = tree;
  for (;;) {
    const before = sizeOf(n.left);
    if (index === before) return n.leaf;
    if (index < before) n = n.left!;
    else {
      index -= before + 1;
      n = n.right!;
    }
  }
}

/** This function joins the leaves at `index` and `index + 1` when `spec.merge` gives one leaf for them. */
function seam<L, S>(spec: Spec<L, S>, tree: Tree<L, S>, index: number): Tree<L, S> {
  const { merge } = spec;
  if (merge === undefined || tree === null || index < 0 || index + 1 >= tree.size) return tree;
  const merged = merge(leafAt(tree, index), leafAt(tree, index + 1));
  if (merged === undefined) return tree;
  return removeAt(spec, replaceAt(spec, tree, index, merged, spec.measure(merged)), index + 1);
}

/** This function makes a balanced tree of the leaves `items[lo]` to `items[hi - 1]`. */
function build<L, S>(spec: Spec<L, S>, items: readonly L[], lo: number, hi: number): Tree<L, S> {
  if (lo >= hi) return null;
  const mid = (lo + hi) >>> 1;
  const leaf = items[mid]!;
  return node(spec, build(spec, items, lo, mid), leaf, spec.measure(leaf), build(spec, items, mid + 1, hi));
}

/** The largest number of removed and inserted leaves for which `splice` copies paths instead of splitting the tree. */
const SMALL_EDIT = 8;

/** This function gives the index of a leaf, with a negative index counted from the end, or -1 when it is not in the tree. */
function indexOf(index: number, size: number): number {
  if (!Number.isInteger(index)) return -1;
  const at = index < 0 ? size + index : index;
  return at >= 0 && at < size ? at : -1;
}

function clamp(value: number, size: number): number {
  if (Number.isNaN(value)) return 0;
  const whole = Math.trunc(value);
  return whole < 0 ? Math.max(0, size + whole) : Math.min(whole, size);
}

/** This function gives the record with a new root, or the same record when the root does not change. */
function withRoot<L, S>(tree: SummaryTreeRecord<L, S>, root: Tree<L, S>): SummaryTreeRecord<L, S> {
  return root === tree.root ? tree : { spec: tree.spec, root };
}

/** A record has no iterator. Each other value of the union is an iterable of leaves, a string too. */
function isRecord<L, S>(value: SummaryTreeRecord<L, S> | Iterable<L>): value is SummaryTreeRecord<L, S> {
  return typeof value === "object" && value !== null && !(Symbol.iterator in value);
}

/** This function gives the root of a record of the same spec, or the root of a new tree of the leaves. */
function rootOf<L, S>(spec: Spec<L, S>, leaves: SummaryTreeRecord<L, S> | Iterable<L>): Tree<L, S> {
  if (isRecord(leaves)) {
    if (leaves.spec !== spec) throw new TypeError("SummaryTree: the two trees have different specs");
    return leaves.root;
  }
  const items = [...leaves];
  return build(spec, items, 0, items.length);
}

/**
 * This function makes a persistent tree of leaves with a summary of each part. Use the same `spec` object for each
 * tree that `concat` or `splice` joins.
 */
export function of<Leaf, Summary>(spec: SummarySpec<Leaf, Summary>, leaves: Iterable<Leaf> = []): SummaryTreeRecord<Leaf, Summary> {
  const items = [...leaves];
  return { spec, root: build(spec, items, 0, items.length) };
}

/** This function gives the number of leaves. */
export function size<Leaf, Summary>(tree: SummaryTreeRecord<Leaf, Summary>): number {
  return sizeOf(tree.root);
}

/** This function tells if the tree has no leaf. */
export function isEmpty<Leaf, Summary>(tree: SummaryTreeRecord<Leaf, Summary>): boolean {
  return tree.root === null;
}

/** This function gives the summary of all the leaves, in their order. An empty tree has the summary `monoid.empty`. */
export function summary<Leaf, Summary>(tree: SummaryTreeRecord<Leaf, Summary>): Summary {
  return summaryOfRoot(tree.spec, tree.root);
}

/** This function gives the height of the tree: 0 for an empty tree. The height is at most 1.45 log2(size + 2). */
export function height<Leaf, Summary>(tree: SummaryTreeRecord<Leaf, Summary>): number {
  return heightOf(tree.root);
}

/**
 * This function gives the leaf at an index, or `undefined` when the index is not in the tree. A negative index counts
 * from the end, as `Array.prototype.at` does.
 */
export function at<Leaf, Summary>(tree: SummaryTreeRecord<Leaf, Summary>, index: number): Leaf | undefined {
  const i = indexOf(index, sizeOf(tree.root));
  return i === -1 ? undefined : leafAt(tree.root!, i);
}

/** This function gives the summary of the leaves from `start` to `end`, with `end` not included. */
export function summaryOf<Leaf, Summary>(tree: SummaryTreeRecord<Leaf, Summary>, start = 0, end: number = sizeOf(tree.root)): Summary {
  return summary(slice(tree, start, end));
}

/** This function gives the tree of the leaves of `tree`, then the leaves of `other`. Two records must have the same spec. */
export function concat<Leaf, Summary>(
  tree: SummaryTreeRecord<Leaf, Summary>,
  other: SummaryTreeRecord<Leaf, Summary> | Iterable<Leaf>,
): SummaryTreeRecord<Leaf, Summary> {
  const { spec } = tree;
  const joined = concatRoots(spec, tree.root, rootOf(spec, other));
  return withRoot(tree, seam(spec, joined, sizeOf(tree.root) - 1));
}

/** This function splits the tree into its first `index` leaves and the other leaves. */
export function splitAt<Leaf, Summary>(
  tree: SummaryTreeRecord<Leaf, Summary>,
  index: number,
): [SummaryTreeRecord<Leaf, Summary>, SummaryTreeRecord<Leaf, Summary>] {
  const [left, right] = splitRoot(tree.spec, tree.root, clamp(index, sizeOf(tree.root)));
  return [withRoot(tree, left), withRoot(tree, right)];
}

/**
 * This function splits the tree before the first leaf whose prefix summary satisfies the predicate. The prefix of a
 * leaf includes the leaf. The predicate must be monotone: after it is true for a prefix, it is true for each longer
 * prefix. When no prefix satisfies it, the right tree is empty.
 */
export function split<Leaf, Summary>(
  tree: SummaryTreeRecord<Leaf, Summary>,
  predicate: (prefix: Summary) => boolean,
): [SummaryTreeRecord<Leaf, Summary>, SummaryTreeRecord<Leaf, Summary>] {
  const [left, right] = splitRootBy(tree.spec, tree.root, predicate, tree.spec.monoid.empty);
  return [withRoot(tree, left), withRoot(tree, right)];
}

/**
 * This function finds the first leaf whose prefix summary satisfies a monotone predicate, as `split` does. It changes
 * nothing. It gives `undefined` when no prefix satisfies the predicate.
 */
export function search<Leaf, Summary>(
  tree: SummaryTreeRecord<Leaf, Summary>,
  predicate: (prefix: Summary) => boolean,
): SummarySearch<Leaf, Summary> | undefined {
  const { combine, empty } = tree.spec.monoid;
  let n = tree.root;
  let acc = empty;
  let index = 0;
  while (n !== null) {
    const throughLeft = n.left === null ? acc : combine(acc, n.left.summary);
    if (n.left !== null && predicate(throughLeft)) {
      n = n.left;
      continue;
    }
    const through = combine(throughLeft, n.own);
    if (predicate(through)) return { index: index + sizeOf(n.left), leaf: n.leaf, before: throughLeft, through };
    index += sizeOf(n.left) + 1;
    acc = through;
    n = n.right;
  }
  return undefined;
}

/**
 * This function finds the leaf that holds a position of an additive key, and it calls no `combine`. The key must be
 * additive and not negative: `key(combine(a, b))` is `key(a) + key(b)`. The function descends by the key of each left
 * subtree and of each leaf, and subtracts it from the target. It gives the first leaf whose prefix key is more than
 * the target, or `undefined` when the target is not in `[0, key(summary))`.
 *
 * @example
 * // The leaf and the offset in it of the code unit at position 1000 of a rope
 * const at = Tree.locate(rope, (s) => s.length, 1000);
 */
export function locate<Leaf, Summary>(
  tree: SummaryTreeRecord<Leaf, Summary>,
  key: (summary: Summary) => number,
  target: number,
): SummaryLocation<Leaf> | undefined {
  if (!(target >= 0)) return undefined;
  let n = tree.root;
  let index = 0;
  let rest = target;
  while (n !== null) {
    if (n.left !== null) {
      const left = key(n.left.summary);
      if (rest < left) {
        n = n.left;
        continue;
      }
      rest -= left;
      index += n.left.size;
    }
    const own = key(n.own);
    if (rest < own) return { index, leaf: n.leaf, offset: rest };
    rest -= own;
    index += 1;
    n = n.right;
  }
  return undefined;
}

/** This function gives the tree of the leaves from `start` to `end`, with `end` not included. A negative index counts from the end. */
export function slice<Leaf, Summary>(
  tree: SummaryTreeRecord<Leaf, Summary>,
  start = 0,
  end: number = sizeOf(tree.root),
): SummaryTreeRecord<Leaf, Summary> {
  const n = sizeOf(tree.root);
  const from = clamp(start, n);
  const to = clamp(end, n);
  if (to <= from) return withRoot(tree, null);
  const [, rest] = splitRoot(tree.spec, tree.root, from);
  const [middle] = splitRoot(tree.spec, rest, to - from);
  return withRoot(tree, middle);
}

/**
 * This function removes `deleteCount` leaves at `start` and puts the leaves of `inserted` there, as
 * `Array.prototype.splice` does. It gives the new tree, not the removed leaves.
 */
export function splice<Leaf, Summary>(
  tree: SummaryTreeRecord<Leaf, Summary>,
  start: number,
  deleteCount: number = sizeOf(tree.root),
  inserted: SummaryTreeRecord<Leaf, Summary> | Iterable<Leaf> = [],
): SummaryTreeRecord<Leaf, Summary> {
  const { spec } = tree;
  const n = sizeOf(tree.root);
  const from = clamp(start, n);
  const count = Math.max(0, Math.min(Number.isNaN(deleteCount) ? 0 : Math.trunc(deleteCount), n - from));
  const leaves = isRecord(inserted) ? undefined : [...inserted];
  const added = leaves === undefined ? sizeOf((inserted as SummaryTreeRecord<Leaf, Summary>).root) : leaves.length;
  if (count === 0 && added === 0) return tree;
  let root = tree.root;
  if (leaves !== undefined && count + added <= SMALL_EDIT) {
    // A small edit copies only the paths to its leaves: 1 or 2 combines for each level of each path
    const replaced = Math.min(count, added);
    if (count > 0 && added > count) {
      // The last removed leaf takes all the extra leaves in one descent
      for (let i = 0; i < count - 1; i++) root = replaceAt(spec, root!, from + i, leaves[i]!, spec.measure(leaves[i]!));
      root = replaceSpan(spec, root!, from + count - 1, leaves.slice(count - 1));
    } else for (let i = 0; i < added; i++) {
      const leaf = leaves[i]!;
      const own = spec.measure(leaf);
      root = i < replaced ? replaceAt(spec, root!, from + i, leaf, own) : insertAt(spec, root, from + i, leaf, own);
    }
    for (let i = replaced; i < count; i++) root = removeAt(spec, root!, from + added);
  } else {
    const middle = leaves === undefined ? rootOf(spec, inserted) : build(spec, leaves, 0, leaves.length);
    const [left, rest] = splitRoot(spec, root, from);
    const [, right] = splitRoot(spec, rest, count);
    root = concatRoots(spec, concatRoots(spec, left, middle), right);
  }
  // The right seam first, so that a merge there does not move the index of the left seam
  if (added > 0) root = seam(spec, root, from + added - 1);
  return withRoot(tree, seam(spec, root, from - 1));
}

/** This function puts the leaves of `inserted` before the leaf at `index`. */
export function insert<Leaf, Summary>(
  tree: SummaryTreeRecord<Leaf, Summary>,
  index: number,
  inserted: SummaryTreeRecord<Leaf, Summary> | Iterable<Leaf>,
): SummaryTreeRecord<Leaf, Summary> {
  return splice(tree, index, 0, inserted);
}

/** This function removes the leaves from `start` to `end`, with `end` not included. */
export function remove<Leaf, Summary>(
  tree: SummaryTreeRecord<Leaf, Summary>,
  start: number,
  end: number = sizeOf(tree.root),
): SummaryTreeRecord<Leaf, Summary> {
  const n = sizeOf(tree.root);
  const from = clamp(start, n);
  return splice(tree, from, Math.max(0, clamp(end, n) - from));
}

/**
 * This function replaces the leaf at an index. A negative index counts from the end, as `Array.prototype.with` does.
 * An index that is not in the tree changes nothing. It copies only the path to the leaf, and it does not call
 * `spec.merge`.
 */
export function set<Leaf, Summary>(tree: SummaryTreeRecord<Leaf, Summary>, index: number, leaf: Leaf): SummaryTreeRecord<Leaf, Summary> {
  const i = indexOf(index, sizeOf(tree.root));
  return i === -1 ? tree : withRoot(tree, replaceAt(tree.spec, tree.root!, i, leaf, tree.spec.measure(leaf)));
}

/** This function adds leaves after the last leaf. */
export function append<Leaf, Summary>(tree: SummaryTreeRecord<Leaf, Summary>, ...leaves: Leaf[]): SummaryTreeRecord<Leaf, Summary> {
  return concat(tree, leaves);
}

/** This function adds leaves before the first leaf. */
export function prepend<Leaf, Summary>(tree: SummaryTreeRecord<Leaf, Summary>, ...leaves: Leaf[]): SummaryTreeRecord<Leaf, Summary> {
  const { spec } = tree;
  const joined = concatRoots(spec, rootOf(spec, leaves), tree.root);
  return withRoot(tree, seam(spec, joined, leaves.length - 1));
}

/** This function gives the leaves in their order. */
export function* leaves<Leaf, Summary>(tree: SummaryTreeRecord<Leaf, Summary>): Generator<Leaf, void, undefined> {
  // An explicit stack: the depth of the tree is O(log n), so the stack stays small
  const stack: SummaryNode<Leaf, Summary>[] = [];
  let n = tree.root;
  while (n !== null || stack.length > 0) {
    while (n !== null) {
      stack.push(n);
      n = n.left;
    }
    const top = stack.pop()!;
    yield top.leaf;
    n = top.right;
  }
}

/** This function gives the leaves in an array. */
export function toArray<Leaf, Summary>(tree: SummaryTreeRecord<Leaf, Summary>): Leaf[] {
  return [...leaves(tree)];
}
