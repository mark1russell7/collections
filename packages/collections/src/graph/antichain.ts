/**
 * The antichain with the largest weight in a directed acyclic graph. The method is the weighted theorem of Dilworth:
 * a minimum flow with lower bounds, and its minimum cut.
 */

import { strongComponentsCompact } from "./strong-components.js";

/** An antichain of a directed acyclic graph, with the sum of the weights of its nodes. */
export interface Antichain<Id> {
  /** The nodes, in the order of `nodes`. No path goes from one of them to a different one. */
  readonly nodes: readonly Id[];
  /** The sum of the weights of the nodes. */
  readonly weight: number;
}

/**
 * This function gives an antichain of a directed acyclic graph with the largest sum of weights. A node `u` comes before
 * a node `v` when a path goes from `u` to `v`. An antichain is a set of nodes with no path between two of them. Thus
 * the nodes of an antichain can occur at the same time. For example, let the nodes be the jobs of a workflow. Let each
 * edge go from a job to a job that needs it. Let the weight be the runners of each job. Then the result is the peak
 * count of runners.
 *
 * - The result is exact. The weighted theorem of Dilworth tells that the largest weight of an antichain is a smallest
 *   flow. That flow sends the weight of each node, or more, through that node.
 * - The function splits each node `v` into an edge `v_in -> v_out` with the lower bound `weight(v)`. Each edge
 *   `u_out -> v_in`, each edge from the source to `v_in` and each edge from `v_out` to the sink has no upper bound.
 * - The first flow sends the weight of each node on its own path. A maximum flow back from the sink to the source, by
 *   Dinic, makes it the smallest flow.
 * - The minimum cut of that flow gives the antichain. It has each node `v` with `v_in` on the side of the source and
 *   `v_out` on the side of the sink.
 * - The time is the time of Dinic on `2n + 2` nodes and `3n + m` edges, for `n` nodes and `m` edges.
 * - The default weight is 1. Then the result is the width of the graph: the largest count of nodes in an antichain.
 * - A node with the weight 0 can be in the result or not.
 * - A successor that is not in `nodes` is not an edge. A node that comes two times in `nodes` counts one time. An edge
 *   that comes two times counts one time. The function compares the nodes as a `Map` compares its keys.
 * - The same graph in the same order gives the same result. No node gives the empty antichain with the weight 0.
 * - A weight that is not a whole number from 0 throws a `RangeError`. A sum of weights above
 *   `Number.MAX_SAFE_INTEGER` also throws one.
 * - A cycle throws a `RangeError` that names the nodes of the cycle. An edge from a node to itself is a cycle.
 *
 * The function is pure. It keeps no state, and it does not change its arguments.
 *
 * @param nodes - The nodes. Their order gives the order of the result.
 * @param successors - The function that gives the nodes that an edge from a node reaches.
 * @param weight - The weight of a node: a whole number from 0. The default is 1.
 * @returns An antichain with the largest weight, and that weight.
 */
export function maxWeightAntichain<Id>(
  nodes: Iterable<Id>,
  successors: (node: Id) => Iterable<Id>,
  weight: (node: Id) => number = () => 1,
): Antichain<Id> {
  const ids: Id[] = [];
  const index = new Map<Id, number>();
  for (const id of nodes) {
    if (index.has(id)) continue;
    index.set(id, ids.length);
    ids.push(id);
  }
  const n = ids.length;
  const start = new Int32Array(n + 1);
  const targets: number[] = [];
  for (let v = 0; v < n; v += 1) {
    start[v] = targets.length;
    const seen = new Set<number>();
    for (const to of successors(ids[v]!)) {
      const t = index.get(to);
      if (t === undefined || seen.has(t)) continue;
      if (t === v) throw new RangeError(`The graph has a cycle: an edge goes from the node ${String(ids[v])} to itself.`);
      seen.add(t);
      targets.push(t);
    }
  }
  start[n] = targets.length;
  for (const members of strongComponentsCompact(n, start, targets).list) {
    if (members.length > 1) {
      throw new RangeError(`The graph has a cycle through the nodes ${members.map((v) => String(ids[v])).join(", ")}.`);
    }
  }
  const weights = ids.map((id) => {
    const w = weight(id);
    if (!Number.isSafeInteger(w) || w < 0) throw new RangeError(`The weight of a node is a whole number from 0, not ${w}.`);
    return w;
  });
  const total = weights.reduce((sum, w) => sum + w, 0);
  if (total > Number.MAX_SAFE_INTEGER) {
    throw new RangeError(`The sum of the weights is ${total}, above Number.MAX_SAFE_INTEGER.`);
  }

  // The network: v_in is 2v, v_out is 2v + 1, the source is 2n and the sink is 2n + 1.
  const source = 2 * n;
  const sink = 2 * n + 1;
  const network = new Network(2 * n + 2);
  for (let v = 0; v < n; v += 1) {
    const w = weights[v]!;
    // The first flow sends w on the path source -> v_in -> v_out -> sink. Each edge has no upper bound, so the arc
    // forward has the residual Infinity. The arc back has the residual flow minus lower bound.
    network.edge(2 * v, 2 * v + 1, 0);
    network.edge(source, 2 * v, w);
    network.edge(2 * v + 1, sink, w);
    for (let e = start[v]!; e < start[v + 1]!; e += 1) network.edge(2 * v + 1, 2 * targets[e]!, 0);
  }
  const cancelled = network.maxFlow(sink, source);
  const fromSink = network.reachable(sink);
  const picked: Id[] = [];
  let sum = 0;
  for (let v = 0; v < n; v += 1) {
    if (fromSink[2 * v] === 0 && fromSink[2 * v + 1] === 1) {
      picked.push(ids[v]!);
      sum += weights[v]!;
    }
  }
  if (sum !== total - cancelled) {
    throw new Error(`Internal error: the cut has the weight ${sum}, but the smallest flow is ${total - cancelled}.`);
  }
  return { nodes: picked, weight: sum };
}

// A residual network for Dinic. The arcs come in pairs: the arc a and the arc a ^ 1 go in opposite directions.
class Network {
  private readonly size: number;
  private readonly head: number[];
  private readonly to: number[] = [];
  private readonly next: number[] = [];
  private readonly residual: number[] = [];

  constructor(size: number) {
    this.size = size;
    this.head = Array.from({ length: size }, () => -1);
  }

  // An edge with no upper bound from u to v, and the residual `back` on its arc from v to u.
  edge(u: number, v: number, back: number): void {
    this.arc(u, v, Number.POSITIVE_INFINITY);
    this.arc(v, u, back);
  }

  private arc(u: number, v: number, residual: number): void {
    this.to.push(v);
    this.residual.push(residual);
    this.next.push(this.head[u]!);
    this.head[u] = this.to.length - 1;
  }

  // The maximum flow from `from` to `to` by Dinic, with its own stack. Each path of the network from `from` to `to`
  // has an arc with a finite residual, so the flow is finite.
  maxFlow(from: number, to: number): number {
    let flow = 0;
    const level = new Int32Array(this.size);
    const current = new Int32Array(this.size);
    const path: number[] = [];
    for (;;) {
      if (!this.levels(from, to, level)) return flow;
      for (let u = 0; u < this.size; u += 1) current[u] = this.head[u]!;
      let u = from;
      for (;;) {
        if (u === to) {
          let push = Number.POSITIVE_INFINITY;
          for (const a of path) push = Math.min(push, this.residual[a]!);
          for (const a of path) {
            this.residual[a] = this.residual[a]! - push;
            this.residual[a ^ 1] = this.residual[a ^ 1]! + push;
          }
          flow += push;
          path.length = 0;
          u = from;
          continue;
        }
        let a = current[u]!;
        while (a !== -1 && (this.residual[a]! <= 0 || level[this.to[a]!] !== level[u]! + 1)) a = this.next[a]!;
        current[u] = a;
        if (a !== -1) {
          path.push(a);
          u = this.to[a]!;
          continue;
        }
        // A dead end: no path from u in this phase. Go back one arc and skip it.
        if (u === from) break;
        level[u] = -1;
        const back = path.pop()!;
        u = this.to[back ^ 1]!;
        current[u] = this.next[current[u]!]!;
      }
    }
  }

  // The levels of a breadth-first search from `from` on the arcs with a residual. It gives false when `to` has no level.
  private levels(from: number, to: number, level: Int32Array): boolean {
    level.fill(-1);
    level[from] = 0;
    const queue = [from];
    for (let i = 0; i < queue.length; i += 1) {
      const u = queue[i]!;
      for (let a = this.head[u]!; a !== -1; a = this.next[a]!) {
        const v = this.to[a]!;
        if (this.residual[a]! > 0 && level[v] === -1) {
          level[v] = level[u]! + 1;
          queue.push(v);
        }
      }
    }
    return level[to] !== -1;
  }

  // A mark of 1 for each node that an arc with a residual reaches from `from`.
  reachable(from: number): Uint8Array {
    const seen = new Uint8Array(this.size);
    seen[from] = 1;
    const queue = [from];
    for (let i = 0; i < queue.length; i += 1) {
      const u = queue[i]!;
      for (let a = this.head[u]!; a !== -1; a = this.next[a]!) {
        const v = this.to[a]!;
        if (this.residual[a]! > 0 && seen[v] === 0) {
          seen[v] = 1;
          queue.push(v);
        }
      }
    }
    return seen;
  }
}
