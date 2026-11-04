/**
 * The state of the three demos, with no page code. Each demo calls the real package. The test of
 * this file reads the same results that the page shows.
 */
import { lruCache, summaryTree, type LRUCache, type SummarySpec, type SummaryTree } from "@mark1russell7/collections";
import { buildLeveledDAG, type DAGNode, type DependencyDAG } from "@mark1russell7/collections/dag";

/** The result of one read of the cache. */
export interface CacheRead {
  /** This value is true when the cache had the key. */
  readonly hit: boolean;
  /** The key that the cache dropped for this read, if any. */
  readonly left: string | undefined;
}

/** This class keeps an LRU cache and counts its hits and misses. */
export class CacheModel {
  capacity: number;
  hits = 0;
  misses = 0;
  private cache: LRUCache<string, number>;
  private left: string[] = [];

  constructor(capacity: number, keys: readonly string[] = []) {
    this.capacity = capacity;
    this.cache = this.make(capacity);
    for (const key of keys) this.cache.set(key, 1);
  }

  private make(capacity: number): LRUCache<string, number> {
    return lruCache<string, number>(capacity, (key) => this.left.push(key));
  }

  /** This method reads a key. A miss loads the key into the cache. */
  read(key: string): CacheRead {
    this.left = [];
    const hit = this.cache.get(key) !== undefined;
    if (hit) this.hits += 1;
    else {
      this.misses += 1;
      this.cache.set(key, 1);
    }
    return { hit, left: this.left[0] };
  }

  /** This method gives the keys, the newest first. */
  keys(): string[] {
    return [...this.cache.keys()];
  }

  /** This method changes the capacity, and it gives each key that left the cache. */
  resize(capacity: number): string[] {
    const oldestFirst = this.keys().reverse();
    this.left = [];
    this.capacity = capacity;
    this.cache = this.make(capacity);
    for (const key of oldestFirst) this.cache.set(key, 1);
    return [...this.left];
  }
}

/** The summary of a span of leaves. */
export interface TreeStats {
  readonly count: number;
  readonly sum: number;
  readonly max: number;
}

/** The monoid of the tree of the demo: each node keeps the count, the sum and the maximum of its leaves. */
export const STATS: SummarySpec<number, TreeStats> = {
  monoid: {
    empty: { count: 0, sum: 0, max: 0 },
    combine: (a, b) => ({ count: a.count + b.count, sum: a.sum + b.sum, max: Math.max(a.max, b.max) }),
  },
  measure: (leaf) => ({ count: 1, sum: leaf, max: leaf }),
};

/** This class keeps each version of a summary tree. An edit makes a new tree, and the old trees stay whole. */
export class TreeModel {
  readonly versions: SummaryTree<number, TreeStats>[];
  index = 0;

  constructor(leaves: readonly number[]) {
    this.versions = [summaryTree(STATS, leaves)];
  }

  /** This getter gives the version that the page shows. */
  get tree(): SummaryTree<number, TreeStats> {
    const tree = this.versions[this.index];
    if (tree === undefined) throw new Error(`There is no version ${String(this.index)}.`);
    return tree;
  }

  /** This method adds the result of an edit of the shown version as the newest version. */
  edit(change: (tree: SummaryTree<number, TreeStats>) => SummaryTree<number, TreeStats>): void {
    this.versions.push(change(this.tree));
    this.index = this.versions.length - 1;
  }
}

/** The next value of a leaf, from 1 to 9. */
export const nextValue = (value: number): number => ((value + 1) % 9) + 1;

/** The tasks of the demo and what each task needs. */
export const TASKS: Readonly<Record<string, readonly string[]>> = {
  lint: [],
  types: [],
  test: ["types"],
  build: ["lint", "types"],
  docs: ["build"],
  deploy: ["test", "build"],
};

/** What each task needs. */
export type Needs = Map<string, Set<string>>;

/** This function gives a copy of the tasks that the page can change. */
export const startNeeds = (): Needs => new Map(Object.entries(TASKS).map(([task, needs]) => [task, new Set(needs)]));

/** A plan: the levels of the graph, or the message of the package when the graph has a cycle. */
export type Plan = { readonly dag: DependencyDAG<DAGNode> } | { readonly error: string };

/** This function gives the plan of the tasks. */
export function planOf(needs: Needs): Plan {
  const nodes = new Map([...needs].map(([id, set]): [string, DAGNode] => [id, { id, dependencies: [...set] }]));
  try {
    return { dag: buildLeveledDAG(nodes) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}
