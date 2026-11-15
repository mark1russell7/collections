import { random, seedsFrom, type Random } from "@mark1russell7/rigor-generators";
import { describe, expect, it } from "vitest";
import {
  NUMBER_RING,
  pathSetReliability,
  twoTerminalReliability,
  type OrderedRing,
  type PathSetReliability,
  type ReliabilityEdge,
  type TwoTerminalReliability,
} from "./index.js";

const SEEDS = seedsFrom(process.env["SEED"], [1, 2, 3, 4, 5, 6, 7, 8]);

type Edge = ReliabilityEdge<number, number>;

/** This function tells if the target is `hopCap` edges or fewer from the source, over the working edges of `mask`. */
function reaches(edges: readonly Edge[], mask: number, source: number, target: number, hopCap: number): boolean {
  if (source === target) return true;
  const distance = new Map<number, number>([[source, 0]]);
  let frontier = [source];
  for (let depth = 1; depth <= Math.min(hopCap, edges.length) && frontier.length > 0; depth += 1) {
    const next: number[] = [];
    for (const node of frontier) {
      for (const [index, edge] of edges.entries()) {
        if ((mask & (1 << index)) === 0 || edge.from !== node || distance.has(edge.to)) continue;
        if (edge.to === target) return true;
        distance.set(edge.to, depth);
        next.push(edge.to);
      }
    }
    frontier = next;
  }
  return false;
}

/** This function gives the reliability by a sum over each state of the edges. With chances in sixteenths, each sum is exact. */
function bruteForce(edges: readonly Edge[], source: number, target: number, hopCap: number): number {
  let total = 0;
  for (let mask = 0; mask < 1 << edges.length; mask += 1) {
    if (!reaches(edges, mask, source, target, hopCap)) continue;
    let chance = 1;
    for (const [index, edge] of edges.entries()) chance *= (mask & (1 << index)) !== 0 ? edge.chance : 1 - edge.chance;
    total += chance;
  }
  return total;
}

function randomGraph(r: Random): { edges: Edge[]; source: number; target: number; hopCap: number } {
  const n = r.int(1, 6);
  const edges = Array.from({ length: r.int(0, 10) }, () => ({ from: r.int(0, n - 1), to: r.int(0, n - 1), chance: r.int(0, 16) / 16 }));
  return { edges, source: 0, target: r.chance(0.1) ? 0 : n - 1, hopCap: r.chance(0.3) ? Number.POSITIVE_INFINITY : r.int(0, 5) };
}

/** This function gives the chance that each edge of one path or more works, by a sum over each state of the edges. */
function bruteForcePaths(paths: readonly (readonly number[])[], chances: readonly number[]): number {
  let total = 0;
  for (let mask = 0; mask < 1 << chances.length; mask += 1) {
    if (!paths.some((list) => list.every((index) => (mask & (1 << index)) !== 0))) continue;
    let chance = 1;
    for (const [index, p] of chances.entries()) chance *= (mask & (1 << index)) !== 0 ? p : 1 - p;
    total += chance;
  }
  return total;
}

function exactSet<N>(result: PathSetReliability<N>): Extract<PathSetReliability<N>, { kind: "exact" }> {
  if (result.kind !== "exact") throw new Error(`The result is ${result.kind}, not exact.`);
  return result;
}

function exact<N>(result: TwoTerminalReliability<N>): Extract<TwoTerminalReliability<N>, { kind: "exact" }> {
  if (result.kind !== "exact") throw new Error(`The result is ${result.kind}, not exact.`);
  return result;
}

// Two services depend on one DNS provider, and the person uses each service.
const SHARED: readonly ReliabilityEdge<string, number>[] = [
  { from: "event", to: "dns", chance: 0.5 },
  { from: "dns", to: "service:a", chance: 0.5 },
  { from: "dns", to: "service:b", chance: 0.5 },
  { from: "service:a", to: "person", chance: 1 },
  { from: "service:b", to: "person", chance: 1 },
];

describe("twoTerminalReliability", () => {
  it("gives the product of a series of edges", () => {
    const series = [
      { from: "s", to: "a", chance: 0.5 },
      { from: "a", to: "t", chance: 0.25 },
    ];
    expect(twoTerminalReliability(series, "s", "t", NUMBER_RING)).toEqual({
      kind: "exact",
      value: 0.125,
      best: 0.125,
      noisyOr: 0.125,
      importance: [0.25, 0.5],
      paths: [{ edges: [0, 1], chance: 0.125 }],
      steps: 4,
    });
  });

  it("gives noisy-OR for parallel edges, with the paths in the order of their edges", () => {
    const parallel = [
      { from: "s", to: "t", chance: 0.5 },
      { from: "s", to: "t", chance: 0.5 },
    ];
    expect(exact(twoTerminalReliability(parallel, "s", "t", NUMBER_RING))).toMatchObject({
      value: 0.75,
      best: 0.5,
      noisyOr: 0.75,
      importance: [0.5, 0.5],
      paths: [
        { edges: [0], chance: 0.5 },
        { edges: [1], chance: 0.5 },
      ],
    });
  });

  it("is below noisy-OR when two paths share an edge", () => {
    const result = exact(twoTerminalReliability(SHARED, "event", "person", NUMBER_RING));
    expect(result.value).toBe(0.375);
    expect(result.best).toBe(0.25);
    expect(result.noisyOr).toBe(0.4375);
    expect(result.importance).toEqual([0.75, 0.25, 0.25, 0.125, 0.125]);
  });

  it("counts no path longer than hopCap", () => {
    const chain = Array.from({ length: 5 }, (_, i) => ({ from: i, to: i + 1, chance: 0.5 }));
    expect(exact(twoTerminalReliability(chain, 0, 5, NUMBER_RING, { hopCap: 4 }))).toMatchObject({ value: 0, best: 0, noisyOr: 0, paths: [] });
    expect(exact(twoTerminalReliability(chain, 0, 5, NUMBER_RING, { hopCap: 5 })).value).toBe(1 / 32);
  });

  it("gives 1 when the source is the target", () => {
    expect(exact(twoTerminalReliability([{ from: "a", to: "b", chance: 0.5 }], "a", "a", NUMBER_RING))).toMatchObject({
      value: 1,
      best: 1,
      noisyOr: 1,
      importance: [0],
      paths: [{ edges: [], chance: 1 }],
    });
  });

  it("gives 0 with no path, and no path goes through a node twice", () => {
    const loop = [
      { from: "s", to: "s", chance: 1 },
      { from: "s", to: "a", chance: 1 },
      { from: "a", to: "s", chance: 1 },
    ];
    expect(exact(twoTerminalReliability(loop, "s", "t", NUMBER_RING))).toMatchObject({ value: 0, best: 0, noisyOr: 0, importance: [0, 0, 0], paths: [] });
  });

  it("gives the bounds when the expansion passes maxSteps", () => {
    const result = twoTerminalReliability(SHARED, "event", "person", NUMBER_RING, { maxSteps: 7 });
    expect(result).toMatchObject({ kind: "bounds", best: 0.25, noisyOr: 0.4375, steps: 7 });
  });

  it("gives the paths that it found when the search passes maxSteps", () => {
    expect(twoTerminalReliability(SHARED, "event", "person", NUMBER_RING, { maxSteps: 3 })).toEqual({
      kind: "partial",
      best: 0.25,
      paths: [{ edges: [0, 1, 3], chance: 0.25 }],
      steps: 3,
    });
    expect(twoTerminalReliability(SHARED, "event", "person", NUMBER_RING, { maxSteps: 0 })).toEqual({ kind: "partial", best: 0, paths: [], steps: 0 });
  });

  it("refuses a bad count or a chance out of range", () => {
    const edge = [{ from: 0, to: 1, chance: 0.5 }];
    for (const hopCap of [-1, 1.5, Number.NaN]) expect(() => twoTerminalReliability(edge, 0, 1, NUMBER_RING, { hopCap }), String(hopCap)).toThrow(RangeError);
    for (const maxSteps of [-1, 0.5]) expect(() => twoTerminalReliability(edge, 0, 1, NUMBER_RING, { maxSteps }), String(maxSteps)).toThrow(RangeError);
    for (const chance of [-0.25, 1.25, Number.NaN]) {
      expect(() => twoTerminalReliability([{ from: 0, to: 1, chance }], 0, 1, NUMBER_RING), String(chance)).toThrow(RangeError);
    }
  });

  it("holds the work of a complete graph of 10 nodes to maxSteps", () => {
    // 109601 simple paths share each edge. Each comparison of two paths in a state is a step, so the budget ends the run.
    const edges: Edge[] = [];
    for (let from = 0; from < 10; from += 1) for (let to = 0; to < 10; to += 1) if (from !== to) edges.push({ from, to, chance: 0.5 });
    const result = twoTerminalReliability(edges, 0, 9, NUMBER_RING);
    expect(result.kind).not.toBe("exact");
    expect(result.steps).toBe(1_000_000);
    expect(result.best).toBe(0.5);
  });

  it("does not change its arguments, and gives the same result two times", () => {
    const edges = SHARED.map((edge) => ({ ...edge }));
    const before = structuredClone(edges);
    const first = twoTerminalReliability(edges, "event", "person", NUMBER_RING);
    expect(twoTerminalReliability(edges, "event", "person", NUMBER_RING)).toEqual(first);
    expect(edges).toEqual(before);
  });

  it.each(SEEDS)("agrees with a brute force over random graphs (seed %i)", (seed) => {
    const r = random(seed);
    for (let round = 0; round < 60; round += 1) {
      const { edges, source, target, hopCap } = randomGraph(r);
      const label = `seed ${seed} round ${round}: ${JSON.stringify({ edges, source, target, hopCap })}`;
      const result = exact(twoTerminalReliability(edges, source, target, NUMBER_RING, { hopCap }));
      expect(result.value, label).toBe(bruteForce(edges, source, target, hopCap));
      expect(result.best, label).toBeLessThanOrEqual(result.value);
      expect(result.value, label).toBeLessThanOrEqual(result.noisyOr);
      for (const index of edges.keys()) {
        const on = bruteForce(edges.map((e, i) => (i === index ? { ...e, chance: 1 } : e)), source, target, hopCap);
        const off = bruteForce(edges.map((e, i) => (i === index ? { ...e, chance: 0 } : e)), source, target, hopCap);
        expect(result.importance[index], `${label} edge ${index}`).toBe(on - off);
        expect(result.importance[index], `${label} edge ${index}`).toBeGreaterThanOrEqual(0);
      }
      for (const path of result.paths) {
        expect(path.edges.length, label).toBeLessThanOrEqual(hopCap);
        const nodes = [source, ...path.edges.map((index) => edges[index]!.to)];
        expect(new Set(nodes).size, label).toBe(nodes.length);
        expect(nodes.at(-1), label).toBe(target);
        path.edges.forEach((index, at) => expect(edges[index]!.from, label).toBe(nodes[at]));
      }
    }
  });

  it.each(SEEDS)("gives the importance as the derivative in a ring of dual numbers (seed %i)", (seed) => {
    interface Dual {
      readonly a: number;
      readonly b: number;
    }
    const dual: OrderedRing<Dual> = {
      zero: { a: 0, b: 0 },
      one: { a: 1, b: 0 },
      add: (x, y) => ({ a: x.a + y.a, b: x.b + y.b }),
      sub: (x, y) => ({ a: x.a - y.a, b: x.b - y.b }),
      mul: (x, y) => ({ a: x.a * y.a, b: x.a * y.b + x.b * y.a }),
      compare: (x, y) => NUMBER_RING.compare(x.a, y.a),
    };
    const r = random(seed);
    for (let round = 0; round < 20; round += 1) {
      const { edges, source, target, hopCap } = randomGraph(r);
      const plain = exact(twoTerminalReliability(edges, source, target, NUMBER_RING, { hopCap }));
      for (const index of edges.keys()) {
        const lifted = edges.map((edge, i) => ({ ...edge, chance: { a: edge.chance, b: i === index ? 1 : 0 } }));
        const result = exact(twoTerminalReliability(lifted, source, target, dual, { hopCap }));
        expect(result.value.a).toBe(plain.value);
        expect(result.value.b).toBe(plain.importance[index]);
      }
    }
  });
});

describe("pathSetReliability", () => {
  it("counts a shared edge one time", () => {
    // The paths of SHARED: the edge 0 is in both.
    expect(pathSetReliability([[0, 1, 3], [0, 2, 4]], [0.5, 0.5, 0.5, 1, 1], NUMBER_RING)).toEqual({
      kind: "exact",
      value: 0.375,
      importance: [0.75, 0.25, 0.25, 0.125, 0.125],
      // 7 states, and 2 comparisons in each of the 4 states with two paths
      steps: 15,
    });
  });

  it("gives 0 with no paths and 1 with an empty path", () => {
    expect(exactSet(pathSetReliability([], [0.5], NUMBER_RING))).toMatchObject({ value: 0, importance: [0] });
    expect(exactSet(pathSetReliability([[0], []], [0.5], NUMBER_RING))).toMatchObject({ value: 1, importance: [0] });
  });

  it("ignores the order of the paths and of their edges, and an edge two times in a path", () => {
    const chances = [0.5, 0.25, 0.75, 0.5];
    const first = pathSetReliability([[0, 1], [2, 3], [1, 3]], chances, NUMBER_RING);
    expect(pathSetReliability([[3, 1], [1, 0, 1], [3, 2]], chances, NUMBER_RING)).toEqual(first);
  });

  it("gives the budget result when the expansion passes maxSteps, with each comparison as a step", () => {
    // The root has 1 state and 2 comparisons, so 3 steps are enough for the root and 2 are not.
    const paths = [
      [0, 1],
      [2, 3],
    ];
    expect(pathSetReliability(paths, [0.5, 0.5, 0.5, 0.5], NUMBER_RING, { maxSteps: 2 })).toEqual({ kind: "budget", steps: 2 });
    expect(pathSetReliability(paths, [0.5, 0.5, 0.5, 0.5], NUMBER_RING, { maxSteps: 3 }).kind).toBe("budget");
    expect(exactSet(pathSetReliability(paths, [0.5, 0.5, 0.5, 0.5], NUMBER_RING)).value).toBe(0.4375);
  });

  it("drops a path that holds another path", () => {
    expect(exactSet(pathSetReliability([[0, 1], [0]], [0.5, 0.5], NUMBER_RING))).toMatchObject({ value: 0.5, importance: [1, 0] });
  });

  it("refuses a bad index, a bad count or a chance out of range", () => {
    for (const index of [-1, 2, 0.5, Number.NaN]) {
      expect(() => pathSetReliability([[index]], [0.5, 0.5], NUMBER_RING), String(index)).toThrow(RangeError);
    }
    expect(() => pathSetReliability([[0]], [0.5], NUMBER_RING, { maxSteps: -1 })).toThrow(RangeError);
    expect(() => pathSetReliability([[0]], [1.5], NUMBER_RING)).toThrow(RangeError);
  });

  it.each(SEEDS)("agrees with a brute force over random path sets (seed %i)", (seed) => {
    const r = random(seed);
    for (let round = 0; round < 60; round += 1) {
      const chances = Array.from({ length: r.int(1, 10) }, () => r.int(0, 16) / 16);
      const paths = Array.from({ length: r.int(0, 6) }, () => Array.from({ length: r.int(0, 4) }, () => r.int(0, chances.length - 1)));
      const label = `seed ${seed} round ${round}: ${JSON.stringify({ paths, chances })}`;
      const result = exactSet(pathSetReliability(paths, chances, NUMBER_RING));
      expect(result.value, label).toBe(bruteForcePaths(paths, chances));
      for (const index of chances.keys()) {
        const on = bruteForcePaths(paths, chances.map((p, i) => (i === index ? 1 : p)));
        const off = bruteForcePaths(paths, chances.map((p, i) => (i === index ? 0 : p)));
        expect(result.importance[index], `${label} edge ${index}`).toBe(on - off);
      }
    }
  });

  it.each(SEEDS)("gives the value of twoTerminalReliability for the paths that it found (seed %i)", (seed) => {
    const r = random(seed);
    for (let round = 0; round < 60; round += 1) {
      const { edges, source, target, hopCap } = randomGraph(r);
      const full = exact(twoTerminalReliability(edges, source, target, NUMBER_RING, { hopCap }));
      const set = exactSet(
        pathSetReliability(
          full.paths.map((path) => path.edges),
          edges.map((edge) => edge.chance),
          NUMBER_RING,
        ),
      );
      expect(set.value).toBe(full.value);
      expect(set.importance).toEqual(full.importance);
    }
  });
});
