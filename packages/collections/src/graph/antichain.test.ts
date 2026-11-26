import { random, seedsFrom, type Random } from "@mark1russell7/rigor-generators";
import { describe, expect, it } from "vitest";
import { maxWeightAntichain } from "./index.js";

const SEEDS = seedsFrom(process.env["SEED"], [1, 2, 3, 4, 5, 6, 7, 8]);

/** This function gives the graph of a record of successors. */
function graph(edges: Record<string, readonly string[]>): [string[], (node: string) => readonly string[]] {
  return [Object.keys(edges), (node) => edges[node] ?? []];
}

/** This function gives a mark for each pair `(u, v)` with a path from `u` to `v` of one edge or more. */
function reach(n: number, out: readonly (readonly number[])[]): boolean[][] {
  const r = Array.from({ length: n }, () => Array.from({ length: n }, () => false));
  for (let u = 0; u < n; u += 1) {
    const stack = [...out[u]!];
    while (stack.length > 0) {
      const v = stack.pop()!;
      if (r[u]![v]) continue;
      r[u]![v] = true;
      stack.push(...out[v]!);
    }
  }
  return r;
}

/** This function gives the largest weight of an antichain, by a test of each subset of the nodes. */
function bruteForce(n: number, r: readonly (readonly boolean[])[], weights: readonly number[]): number {
  let best = 0;
  for (let mask = 0; mask < 1 << n; mask += 1) {
    let ok = true;
    let sum = 0;
    for (let u = 0; u < n && ok; u += 1) {
      if ((mask & (1 << u)) === 0) continue;
      sum += weights[u]!;
      for (let v = 0; v < n; v += 1) if ((mask & (1 << v)) !== 0 && r[u]![v]) ok = false;
    }
    if (ok) best = Math.max(best, sum);
  }
  return best;
}

/** A random DAG: each edge goes from a lower node to a higher node, and the node order is shuffled. */
function randomDag(rand: Random, n: number): { order: number[]; out: number[][] } {
  const label = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i -= 1) {
    const j = rand.int(0, i);
    [label[i], label[j]] = [label[j]!, label[i]!];
  }
  const density = rand.int(0, 10) / 10;
  const out: number[][] = Array.from({ length: n }, () => []);
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) if (rand.chance(density)) out[label[i]!]!.push(label[j]!);
  }
  return { order: Array.from({ length: n }, (_, i) => i), out };
}

describe("maxWeightAntichain", () => {
  it("gives the empty antichain for no node", () => {
    expect(maxWeightAntichain([], () => [])).toEqual({ nodes: [], weight: 0 });
  });

  it("gives the heaviest node of a chain", () => {
    const [nodes, successors] = graph({ a: ["b"], b: ["c"], c: ["d"], d: [] });
    const weights: Record<string, number> = { a: 2, b: 7, c: 3, d: 5 };
    expect(maxWeightAntichain(nodes, successors, (v) => weights[v]!)).toEqual({ nodes: ["b"], weight: 7 });
  });

  it("gives each node when no edge joins them", () => {
    const weights: Record<string, number> = { a: 2, b: 7, c: 3 };
    expect(maxWeightAntichain(["a", "b", "c"], () => [], (v) => weights[v]!)).toEqual({ nodes: ["a", "b", "c"], weight: 12 });
  });

  it("gives the two sides of a diamond, or its heaviest end", () => {
    const [nodes, successors] = graph({ a: ["b", "c"], b: ["d"], c: ["d"], d: [] });
    expect(maxWeightAntichain(nodes, successors)).toEqual({ nodes: ["b", "c"], weight: 2 });
    const heavyTop: Record<string, number> = { a: 5, b: 2, c: 2, d: 1 };
    expect(maxWeightAntichain(nodes, successors, (v) => heavyTop[v]!)).toEqual({ nodes: ["a"], weight: 5 });
  });

  it("uses the paths, not only the edges", () => {
    // a -> b -> c, and d is free. a and c are not an antichain, though no edge joins them.
    const [nodes, successors] = graph({ a: ["b"], b: ["c"], c: [], d: [] });
    const weights: Record<string, number> = { a: 4, b: 1, c: 3, d: 1 };
    expect(maxWeightAntichain(nodes, successors, (v) => weights[v]!)).toEqual({ nodes: ["a", "d"], weight: 5 });
  });

  it("gives the weight 0 when each weight is 0", () => {
    const [nodes, successors] = graph({ a: ["b"], b: [], c: [] });
    const result = maxWeightAntichain(nodes, successors, () => 0);
    expect(result.weight).toBe(0);
  });

  it("gives the peak of the runners of a workflow", () => {
    // build -> (test x4, lint) -> deploy: the peak is the 4 test runners and the lint runner.
    const needs: Record<string, readonly string[]> = { build: [], test: ["build"], lint: ["build"], deploy: ["test", "lint"] };
    const runners: Record<string, number> = { build: 1, test: 4, lint: 1, deploy: 1 };
    const dependents = (job: string): string[] => Object.keys(needs).filter((other) => needs[other]!.includes(job));
    expect(maxWeightAntichain(Object.keys(needs), dependents, (job) => runners[job]!)).toEqual({ nodes: ["test", "lint"], weight: 5 });
  });

  it("counts a repeated node and a repeated edge one time, and skips a successor outside the nodes", () => {
    const result = maxWeightAntichain(["a", "b", "a"], (v) => (v === "a" ? ["b", "b", "x"] : []));
    expect(result.weight).toBe(1);
    expect(result.nodes).toHaveLength(1);
  });

  it("throws a RangeError for a cycle", () => {
    const [nodes, successors] = graph({ a: ["b"], b: ["c"], c: ["a"], d: [] });
    expect(() => maxWeightAntichain(nodes, successors)).toThrow(/cycle through the nodes a, b, c/);
    expect(() => maxWeightAntichain(["a"], () => ["a"])).toThrow(RangeError);
    expect(() => maxWeightAntichain(["a"], () => ["a"])).toThrow(/from the node a to itself/);
  });

  it("throws a RangeError for a bad weight", () => {
    for (const bad of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => maxWeightAntichain(["a"], () => [], () => bad)).toThrow(RangeError);
    }
    expect(() => maxWeightAntichain(["a", "b"], () => [], () => Number.MAX_SAFE_INTEGER)).toThrow(/MAX_SAFE_INTEGER/);
  });

  it("solves a chain of 20000 nodes with no overflow of the stack", () => {
    const n = 20_000;
    const nodes = Array.from({ length: n }, (_, i) => i);
    expect(maxWeightAntichain(nodes, (v) => (v + 1 < n ? [v + 1] : []), (v) => (v === 12_345 ? 9 : 1))).toEqual({
      nodes: [12_345],
      weight: 9,
    });
  });

  it.each(SEEDS)("agrees with a brute force over random DAGs, and gives an antichain (seed %i)", (seed) => {
    const rand = random(seed);
    for (let round = 0; round < 60; round += 1) {
      const n = rand.int(0, 9);
      const { order, out } = randomDag(rand, n);
      const weights = Array.from({ length: n }, () => (rand.chance(0.2) ? 0 : rand.int(1, 6)));
      const result = maxWeightAntichain(order, (v) => out[v]!, (v) => weights[v]!);
      const r = reach(n, out);
      expect(result.weight).toBe(bruteForce(n, r, weights));
      expect(result.weight).toBe(result.nodes.reduce((sum, v) => sum + weights[v]!, 0));
      for (const u of result.nodes) for (const v of result.nodes) expect(r[u]![v]).toBe(false);
      expect(new Set(result.nodes).size).toBe(result.nodes.length);
      expect([...result.nodes]).toEqual([...result.nodes].sort((a, b) => a - b));
    }
  });
});
