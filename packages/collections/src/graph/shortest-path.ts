import { PriorityQueue } from "../impl/priority-queue.js";

/**
 * A directed edge of `shortestPath` and `alternativePaths`, from the node `from` to the node `to`. Its `weight` is a
 * finite number from 0. An undirected edge is two directed edges, one in each direction.
 */
export interface PathEdge<Node> {
  readonly from: Node;
  readonly to: Node;
  readonly weight: number;
}

/** A path from the source to the target. */
export interface WeightedPath<Node> {
  /** The nodes of the path, from the source to the target. A path from a node to the same node has one node. */
  readonly nodes: readonly Node[];
  /** The indices of the edges of the path in the edge list, in the order from the source to the target. */
  readonly edges: readonly number[];
  /** The sum of the weights of the edges of the path, in the order of the path. */
  readonly cost: number;
}

/** The options of `shortestPath`. */
export interface ShortestPathOptions<Node> {
  /**
   * This function gives a lower bound of the cost from a node to the target: a finite number from 0. With it, the
   * search is A*. A bound above the true cost gives a path that is not always the shortest.
   */
  readonly heuristic?: ((node: Node) => number) | undefined;
}

/**
 * The result of `shortestPath`. `steps` counts the nodes that the search took from its heap and expanded.
 *
 * - `path`: the path with the smallest cost.
 * - `none`: no path goes from the source to the target.
 */
export type ShortestPath<Node> =
  | (WeightedPath<Node> & { readonly kind: "path"; readonly steps: number })
  | { readonly kind: "none"; readonly steps: number };

/** A path of `alternativePaths`, with its overlap with the first path. */
export interface AlternativePath<Node> extends WeightedPath<Node> {
  /**
   * The share of the cost of this path on edges of the first path, from 0 to 1. The first path has the overlap 1. A
   * path with the cost 0 uses the share of its edges, and a path with no edges has the overlap 1.
   */
  readonly overlap: number;
}

/** The options of `alternativePaths`. */
export interface AlternativePathsOptions<Node> extends ShortestPathOptions<Node> {
  /** The largest count of paths in the result, with the first path. A whole number from 1. The default is 3. */
  readonly count?: number | undefined;
  /**
   * The rule of the next search.
   *
   * - `penalty`, the default: the next search multiplies the weight of each edge of the last path by `penalty`.
   * - `disjoint`: the next search does not use an edge of an earlier path. Each path shares no edge with another path.
   */
  readonly mode?: "penalty" | "disjoint" | undefined;
  /** The factor of the mode `penalty`: a finite number above 1. The default is 2. */
  readonly penalty?: number | undefined;
  /**
   * The largest overlap of a path after the first, from 0 to 1. The result does not keep a path with more overlap,
   * but the search still adds the penalty to its edges. The default is 1, so each new path stays.
   */
  readonly maxOverlap?: number | undefined;
  /** The largest count of searches. A whole number from 1. The default is three times `count`. */
  readonly maxRounds?: number | undefined;
}

/**
 * The result of `alternativePaths`. `paths` is empty when no path goes from the source to the target. Else the first
 * path is the result of `shortestPath`, and the next paths come in the order that the searches found them.
 * `rounds` counts the searches.
 */
export interface AlternativePaths<Node> {
  readonly paths: readonly AlternativePath<Node>[];
  readonly rounds: number;
}

/**
 * This function gives the path with the smallest cost from `from` to `to`, by the algorithm of Dijkstra on a binary
 * heap. With the option `heuristic`, the search is A*.
 *
 * - Each edge is directed. An undirected edge is two edges. Two equal nodes are one node, by the rule of `Map`.
 * - A weight that is not a finite number from 0 throws a `RangeError`, with the index of the edge. A heuristic value
 *   that is not a finite number from 0 also throws a `RangeError`.
 * - Ties: the search takes the edges of a node in the order of the edge list. A path of the same cost does not replace
 *   a path that the search found first. Two heap items with the same key come out in the order that they went in. So
 *   the same edges in the same order always give the same path.
 * - When `from` is `to`, the path has one node, no edges and the cost 0.
 * - A* reopens a node when it finds a cheaper path to it, so a heuristic that is a lower bound always gives the
 *   smallest cost.
 *
 * The function is pure. It keeps no state, and it does not change its arguments.
 */
export function shortestPath<Node>(
  edges: readonly PathEdge<Node>[],
  from: Node,
  to: Node,
  options: ShortestPathOptions<Node> = {},
): ShortestPath<Node> {
  const graph = buildGraph(edges);
  const weights = Float64Array.from(edges, (edge) => edge.weight);
  return search(graph, weights, from, to, options.heuristic);
}

/**
 * This function gives a shortest path from `from` to `to`, and different paths after it. Each search after the first
 * changes the weights by the option `mode`, and then searches again.
 *
 * - The mode `penalty` multiplies the weight of each edge of the last path by `penalty`. The next path avoids the
 *   edges of the earlier paths, but it can use some of them. An edge with the weight 0 keeps the weight 0.
 * - The mode `disjoint` removes the edges of each path. Thus the paths share no edge. The order is greedy: a graph
 *   can have more disjoint paths than the result.
 * - Each path has its true cost, with the weights of the edge list, and its overlap with the first path.
 * - A path with the same edges as an earlier path is not in the result again. It counts as a search.
 * - The searches stop at `count` paths, at `maxRounds` searches, or when no path is left.
 * - The rules of the edges, of `heuristic` and of the ties are the rules of `shortestPath`. A bad `count`,
 *   `penalty`, `maxOverlap` or `maxRounds` throws a `RangeError`.
 *
 * The function is pure. It keeps no state, and it does not change its arguments.
 */
export function alternativePaths<Node>(
  edges: readonly PathEdge<Node>[],
  from: Node,
  to: Node,
  options: AlternativePathsOptions<Node> = {},
): AlternativePaths<Node> {
  const count = options.count ?? 3;
  const mode = options.mode ?? "penalty";
  const penalty = options.penalty ?? 2;
  const maxOverlap = options.maxOverlap ?? 1;
  const maxRounds = options.maxRounds ?? 3 * count;
  if (!Number.isInteger(count) || count < 1) throw new RangeError(`The count of the paths is a whole number from 1, not ${count}.`);
  if (mode !== "penalty" && mode !== "disjoint") throw new RangeError(`The mode is "penalty" or "disjoint", not ${String(mode)}.`);
  if (!Number.isFinite(penalty) || penalty <= 1) throw new RangeError(`The penalty is a finite number above 1, not ${penalty}.`);
  if (!(maxOverlap >= 0 && maxOverlap <= 1)) throw new RangeError(`The overlap maxOverlap is from 0 to 1, not ${maxOverlap}.`);
  if (!Number.isInteger(maxRounds) || maxRounds < 1) throw new RangeError(`The count maxRounds is a whole number from 1, not ${maxRounds}.`);

  const graph = buildGraph(edges);
  const weights = Float64Array.from(edges, (edge) => edge.weight);
  const paths: AlternativePath<Node>[] = [];
  const seen = new Set<string>();
  let first: Set<number> | undefined;
  let rounds = 0;
  while (paths.length < count && rounds < maxRounds) {
    const found = search(graph, weights, from, to, options.heuristic);
    rounds += 1;
    if (found.kind === "none") break;
    const key = found.edges.join(",");
    if (!seen.has(key)) {
      seen.add(key);
      const cost = sumOf(edges, found.edges);
      first ??= new Set(found.edges);
      const overlap = overlapOf(edges, found.edges, cost, first);
      if (paths.length === 0 || overlap <= maxOverlap) paths.push({ nodes: found.nodes, edges: found.edges, cost, overlap });
    }
    // The edges of a path from a node to itself are none, so each later search gives the same path.
    if (found.edges.length === 0) break;
    for (const index of found.edges) weights[index] = mode === "disjoint" ? Number.POSITIVE_INFINITY : weights[index]! * penalty;
  }
  return { paths, rounds };
}

/** The graph in a compact form: the nodes by their first occurrence, and the out-edges of each node in edge order. */
interface Graph<Node> {
  readonly index: Map<Node, number>;
  readonly nodes: readonly Node[];
  /** The out-edges of the node `v` are the items of `out` from `start[v]` up to `start[v + 1]`. */
  readonly start: Int32Array;
  readonly out: Int32Array;
  readonly source: Int32Array;
  readonly target: Int32Array;
}

function buildGraph<Node>(edges: readonly PathEdge<Node>[]): Graph<Node> {
  const index = new Map<Node, number>();
  const nodes: Node[] = [];
  const at = (node: Node): number => {
    let i = index.get(node);
    if (i === undefined) {
      i = nodes.length;
      index.set(node, i);
      nodes.push(node);
    }
    return i;
  };
  const source = new Int32Array(edges.length);
  const target = new Int32Array(edges.length);
  for (const [e, edge] of edges.entries()) {
    const weight = edge.weight;
    if (typeof weight !== "number" || !Number.isFinite(weight) || weight < 0) {
      throw new RangeError(`The weight of the edge ${e} is a finite number from 0, not ${String(weight)}.`);
    }
    source[e] = at(edge.from);
    target[e] = at(edge.to);
  }
  const n = nodes.length;
  const start = new Int32Array(n + 1);
  for (let e = 0; e < edges.length; e += 1) start[source[e]! + 1] = start[source[e]! + 1]! + 1;
  for (let v = 0; v < n; v += 1) start[v + 1] = start[v + 1]! + start[v]!;
  const fill = start.slice(0, n);
  const out = new Int32Array(edges.length);
  // The edges go in the order of their indices, so the out-edges of each node keep the order of the edge list.
  for (let e = 0; e < edges.length; e += 1) {
    const v = source[e]!;
    out[fill[v]!] = e;
    fill[v] = fill[v]! + 1;
  }
  return { index, nodes, start, out, source, target };
}

interface HeapItem {
  readonly key: number;
  readonly cost: number;
  readonly node: number;
  readonly order: number;
}

function search<Node>(
  graph: Graph<Node>,
  weights: Float64Array,
  from: Node,
  to: Node,
  heuristic: ((node: Node) => number) | undefined,
): ShortestPath<Node> {
  // The rule of `Map`: `NaN` equals `NaN`, and 0 equals -0.
  if (from === to || (from !== from && to !== to)) return { kind: "path", nodes: [from], edges: [], cost: 0, steps: 0 };
  const source = graph.index.get(from);
  const target = graph.index.get(to);
  if (source === undefined || target === undefined) return { kind: "none", steps: 0 };

  const n = graph.nodes.length;
  const cost = new Float64Array(n).fill(Number.POSITIVE_INFINITY);
  const via = new Int32Array(n).fill(-1);
  const bound = new Float64Array(n).fill(Number.NaN);
  const estimate = (v: number): number => {
    if (heuristic === undefined) return 0;
    let h = bound[v]!;
    if (Number.isNaN(h)) {
      h = heuristic(graph.nodes[v]!);
      if (typeof h !== "number" || !Number.isFinite(h) || h < 0) {
        throw new RangeError(`The heuristic gives a finite number from 0, not ${String(h)}.`);
      }
      bound[v] = h;
    }
    return h;
  };
  const heap = new PriorityQueue<HeapItem>({ compare: (a, b) => a.key - b.key || a.order - b.order });
  let order = 0;
  cost[source] = 0;
  heap.offer({ key: estimate(source), cost: 0, node: source, order: order++ });
  let steps = 0;
  while (heap.size > 0) {
    const item = heap.poll();
    const v = item.node;
    // A stale item: the search found a cheaper path to the node after the item went in.
    if (item.cost > cost[v]!) continue;
    if (v === target) break;
    steps += 1;
    for (let k = graph.start[v]!; k < graph.start[v + 1]!; k += 1) {
      const e = graph.out[k]!;
      const weight = weights[e]!;
      if (weight === Number.POSITIVE_INFINITY) continue;
      const w = graph.target[e]!;
      const next = item.cost + weight;
      if (next < cost[w]!) {
        cost[w] = next;
        via[w] = e;
        heap.offer({ key: next + estimate(w), cost: next, node: w, order: order++ });
      }
    }
  }
  if (cost[target] === Number.POSITIVE_INFINITY) return { kind: "none", steps };

  const list: number[] = [];
  for (let v = target; v !== source; ) {
    const e = via[v]!;
    list.push(e);
    v = graph.source[e]!;
  }
  list.reverse();
  const nodes: Node[] = [graph.nodes[source]!];
  for (const e of list) nodes.push(graph.nodes[graph.target[e]!]!);
  return { kind: "path", nodes, edges: list, cost: sumWeights(weights, list), steps };
}

function sumWeights(weights: Float64Array, list: readonly number[]): number {
  let total = 0;
  for (const e of list) total += weights[e]!;
  return total;
}

function sumOf<Node>(edges: readonly PathEdge<Node>[], list: readonly number[]): number {
  let total = 0;
  for (const e of list) total += edges[e]!.weight;
  return total;
}

function overlapOf<Node>(edges: readonly PathEdge<Node>[], list: readonly number[], cost: number, first: ReadonlySet<number>): number {
  if (list.length === 0) return 1;
  if (cost === 0) return list.filter((e) => first.has(e)).length / list.length;
  let shared = 0;
  for (const e of list) if (first.has(e)) shared += edges[e]!.weight;
  return shared / cost;
}
