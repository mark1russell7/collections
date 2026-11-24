import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { alternativePaths, shortestPath, type PathEdge, type ShortestPath } from "./index.js";

type Edge = PathEdge<string>;

/** This function adds an edge in each direction for each pair. */
function both(list: readonly (readonly [string, string, number])[]): Edge[] {
  return list.flatMap(([a, b, weight]) => [
    { from: a, to: b, weight },
    { from: b, to: a, weight },
  ]);
}

function found<Node>(result: ShortestPath<Node>): Extract<ShortestPath<Node>, { kind: "path" }> {
  if (result.kind !== "path") throw new Error("The search found no path.");
  return result;
}

// A small grid of roads: the cheap road goes a - b - d, and the dear road goes a - c - d.
const diamond: Edge[] = [
  { from: "a", to: "b", weight: 1 },
  { from: "b", to: "d", weight: 1 },
  { from: "a", to: "c", weight: 2 },
  { from: "c", to: "d", weight: 2 },
];

describe("shortestPath", () => {
  it("finds the path with the smallest cost", () => {
    const path = found(shortestPath(diamond, "a", "d"));
    expect(path.nodes).toEqual(["a", "b", "d"]);
    expect(path.edges).toEqual([0, 1]);
    expect(path.cost).toBe(2);
  });

  it("follows the direction of each edge", () => {
    expect(shortestPath(diamond, "d", "a").kind).toBe("none");
    const roads = [...diamond, { from: "d", to: "a", weight: 10 }];
    expect(found(shortestPath(roads, "d", "a")).edges).toEqual([4]);
  });

  it("takes a longer path with fewer costs over a direct edge", () => {
    const edges: Edge[] = [
      { from: "s", to: "t", weight: 10 },
      { from: "s", to: "m", weight: 3 },
      { from: "m", to: "t", weight: 3 },
    ];
    expect(found(shortestPath(edges, "s", "t")).nodes).toEqual(["s", "m", "t"]);
  });

  it("gives none when no path goes to the target", () => {
    expect(shortestPath(diamond, "a", "z")).toEqual({ kind: "none", steps: 0 });
    expect(shortestPath(diamond, "z", "a")).toEqual({ kind: "none", steps: 0 });
    const result = shortestPath([...diamond, { from: "x", to: "y", weight: 1 }], "a", "y");
    expect(result.kind).toBe("none");
  });

  it("gives a path of one node from a node to the same node", () => {
    expect(shortestPath(diamond, "b", "b")).toEqual({ kind: "path", nodes: ["b"], edges: [], cost: 0, steps: 0 });
    expect(shortestPath([], "q", "q")).toEqual({ kind: "path", nodes: ["q"], edges: [], cost: 0, steps: 0 });
    expect(shortestPath([], Number.NaN, Number.NaN).kind).toBe("path");
  });

  it("gives the same path for a tie each time: the first edge in the list wins", () => {
    const edges: Edge[] = [
      { from: "a", to: "b", weight: 1 },
      { from: "a", to: "c", weight: 1 },
      { from: "b", to: "d", weight: 1 },
      { from: "c", to: "d", weight: 1 },
    ];
    expect(found(shortestPath(edges, "a", "d")).nodes).toEqual(["a", "b", "d"]);
    const swapped = [edges[1]!, edges[0]!, edges[3]!, edges[2]!];
    expect(found(shortestPath(swapped, "a", "d")).nodes).toEqual(["a", "c", "d"]);
    for (let i = 0; i < 5; i += 1) expect(shortestPath(edges, "a", "d")).toEqual(shortestPath(edges, "a", "d"));
  });

  it("chooses the first of two parallel edges with the same weight", () => {
    const edges: Edge[] = [
      { from: "a", to: "b", weight: 2 },
      { from: "a", to: "b", weight: 2 },
      { from: "a", to: "b", weight: 1 },
    ];
    expect(found(shortestPath(edges, "a", "b")).edges).toEqual([2]);
    expect(found(shortestPath(edges.slice(0, 2), "a", "b")).edges).toEqual([0]);
  });

  it("accepts the weight 0 and ignores a loop", () => {
    const edges: Edge[] = [
      { from: "a", to: "a", weight: 0 },
      { from: "a", to: "b", weight: 0 },
      { from: "b", to: "c", weight: 0 },
    ];
    expect(found(shortestPath(edges, "a", "c"))).toMatchObject({ edges: [1, 2], cost: 0 });
  });

  it("refuses a weight that is negative, NaN or not finite", () => {
    for (const weight of [-1, Number.NaN, Number.POSITIVE_INFINITY, "1" as unknown as number]) {
      expect(() => shortestPath([{ from: "a", to: "b", weight: 1 }, { from: "b", to: "c", weight }], "a", "c")).toThrow(
        /the edge 1 is a finite number from 0/u,
      );
    }
  });

  it("refuses a heuristic value that is negative or NaN", () => {
    expect(() => shortestPath(diamond, "a", "d", { heuristic: () => -1 })).toThrow(RangeError);
    expect(() => shortestPath(diamond, "a", "d", { heuristic: () => Number.NaN })).toThrow(RangeError);
  });

  it("gives the same cost with A* and expands fewer nodes with a good heuristic", () => {
    // A line of nodes 0 to 20 with a long branch at each node. The heuristic is the true distance to 20.
    const edges: PathEdge<number>[] = [];
    for (let i = 0; i < 20; i += 1) {
      edges.push({ from: i, to: i + 1, weight: 1 });
      edges.push({ from: i, to: 100 + i, weight: 1 });
      edges.push({ from: 100 + i, to: 200 + i, weight: 1 });
    }
    const plain = found(shortestPath(edges, 0, 20));
    const guided = found(shortestPath(edges, 0, 20, { heuristic: (node) => (node <= 20 ? 20 - node : 100) }));
    expect(guided.cost).toBe(plain.cost);
    expect(guided.nodes).toEqual(plain.nodes);
    expect(guided.steps).toBeLessThan(plain.steps);
  });

  it("does not change its arguments", () => {
    const edges = Object.freeze(diamond.map((edge) => Object.freeze({ ...edge })));
    expect(found(shortestPath(edges, "a", "d")).cost).toBe(2);
  });
});

describe("alternativePaths", () => {
  // Three roads from s to t: the middle one is the shortest, the north one is next, and the south one is the longest.
  const roads = both([
    ["s", "m", 1],
    ["m", "t", 1],
    ["s", "n", 2],
    ["n", "t", 2],
    ["s", "q", 3],
    ["q", "t", 3],
  ]);

  it("gives the shortest path first, then different paths with their true costs", () => {
    const { paths, rounds } = alternativePaths(roads, "s", "t", { count: 3, penalty: 4 });
    expect(paths.map((path) => path.nodes.join(""))).toEqual(["smt", "snt", "sqt"]);
    expect(paths.map((path) => path.cost)).toEqual([2, 4, 6]);
    expect(paths.map((path) => path.overlap)).toEqual([1, 0, 0]);
    expect(rounds).toBe(3);
    const { nodes, edges, cost } = found(shortestPath(roads, "s", "t"));
    expect(paths[0]).toEqual({ nodes, edges, cost, overlap: 1 });
  });

  it("drops a path that it found before", () => {
    // With the penalty 2, the middle road costs 4 after one search: the same as the north road, so the tie keeps it.
    const { paths, rounds } = alternativePaths(roads, "s", "t", { count: 3, penalty: 2 });
    expect(paths.map((path) => path.nodes.join(""))).toEqual(["smt", "snt", "sqt"]);
    expect(rounds).toBeGreaterThan(3);
    expect(new Set(paths.map((path) => path.edges.join())).size).toBe(paths.length);
  });

  it("reports the overlap with the first path as a share of the cost", () => {
    // The second path shares the edge s - m (cost 1) with the first path, and it has the cost 4.
    const edges: Edge[] = [
      { from: "s", to: "m", weight: 1 },
      { from: "m", to: "t", weight: 1 },
      { from: "m", to: "x", weight: 1 },
      { from: "x", to: "t", weight: 2 },
    ];
    const { paths } = alternativePaths(edges, "s", "t", { count: 2, penalty: 4 });
    expect(paths.map((path) => path.edges)).toEqual([
      [0, 1],
      [0, 2, 3],
    ]);
    expect(paths[1]!.cost).toBe(4);
    expect(paths[1]!.overlap).toBe(0.25);
  });

  it("keeps out a path with more overlap than maxOverlap", () => {
    const edges: Edge[] = [
      { from: "s", to: "m", weight: 1 },
      { from: "m", to: "t", weight: 1 },
      { from: "m", to: "x", weight: 1 },
      { from: "x", to: "t", weight: 2 },
      { from: "s", to: "t", weight: 9 },
    ];
    const { paths } = alternativePaths(edges, "s", "t", { count: 2, penalty: 4, maxOverlap: 0.2 });
    expect(paths.map((path) => path.edges)).toEqual([[0, 1], [4]]);
  });

  it("gives paths with no shared edge in the mode disjoint", () => {
    const { paths } = alternativePaths(roads, "s", "t", { count: 5, mode: "disjoint" });
    expect(paths.map((path) => path.nodes.join(""))).toEqual(["smt", "snt", "sqt"]);
    const used = paths.flatMap((path) => path.edges);
    expect(new Set(used).size).toBe(used.length);
  });

  it("stops when no path is left, and gives no path when the target is out of reach", () => {
    expect(alternativePaths(diamond, "a", "d", { count: 5, mode: "disjoint" }).paths).toHaveLength(2);
    expect(alternativePaths(diamond, "d", "a")).toEqual({ paths: [], rounds: 1 });
  });

  it("gives one path from a node to the same node", () => {
    expect(alternativePaths(roads, "s", "s", { count: 3 })).toEqual({
      paths: [{ nodes: ["s"], edges: [], cost: 0, overlap: 1 }],
      rounds: 1,
    });
  });

  it("stops at maxRounds searches", () => {
    expect(alternativePaths(roads, "s", "t", { count: 3, maxRounds: 1 })).toMatchObject({ rounds: 1, paths: [{ cost: 2 }] });
  });

  it("refuses bad options", () => {
    expect(() => alternativePaths(roads, "s", "t", { count: 0 })).toThrow(RangeError);
    expect(() => alternativePaths(roads, "s", "t", { penalty: 1 })).toThrow(RangeError);
    expect(() => alternativePaths(roads, "s", "t", { penalty: Number.POSITIVE_INFINITY })).toThrow(RangeError);
    expect(() => alternativePaths(roads, "s", "t", { maxOverlap: 1.5 })).toThrow(RangeError);
    expect(() => alternativePaths(roads, "s", "t", { maxRounds: 0 })).toThrow(RangeError);
    expect(() => alternativePaths(roads, "s", "t", { mode: "other" as "penalty" })).toThrow(RangeError);
  });

  it("does not change its arguments", () => {
    const edges = Object.freeze(roads.map((edge) => Object.freeze({ ...edge })));
    expect(alternativePaths(edges, "s", "t").paths).toHaveLength(3);
    expect(edges.map((edge) => edge.weight)).toEqual(roads.map((edge) => edge.weight));
  });
});

/** Random directed graphs on the nodes 0 to n - 1, with whole weights, so each sum is exact. */
const graphs = fc.integer({ min: 1, max: 7 }).chain((n) =>
  fc.record({
    n: fc.constant(n),
    edges: fc.array(fc.record({ from: fc.nat(n - 1), to: fc.nat(n - 1), weight: fc.integer({ min: 0, max: 9 }) }), { maxLength: 20 }),
    target: fc.nat(n - 1),
    factors: fc.array(fc.double({ min: 0, max: 1, noNaN: true }), { minLength: n, maxLength: n }),
    walks: fc.array(fc.array(fc.nat(), { maxLength: 12 }), { maxLength: 5 }),
  }),
);

/** The cost from each node to `target`, by the algorithm of Bellman and Ford on the reversed edges. */
function costsTo(n: number, edges: readonly PathEdge<number>[], target: number): number[] {
  const cost = Array.from({ length: n }, (_, v) => (v === target ? 0 : Number.POSITIVE_INFINITY));
  for (let round = 0; round < n; round += 1) {
    for (const edge of edges) cost[edge.from] = Math.min(cost[edge.from]!, edge.weight + cost[edge.to]!);
  }
  return cost;
}

describe("the properties of shortestPath", () => {
  it("gives the cost of Bellman and Ford, a valid path, and a cost that no random walk beats", () => {
    fc.assert(
      fc.property(graphs, ({ n, edges, target, walks }) => {
        const exact = costsTo(n, edges, target);
        const result = shortestPath(edges, 0, target);
        if (exact[0] === Number.POSITIVE_INFINITY) {
          expect(result.kind).toBe("none");
          return;
        }
        const path = found(result);
        expect(path.cost).toBe(exact[0]);
        expect(path.nodes[0]).toBe(0);
        expect(path.nodes.at(-1)).toBe(target);
        expect(path.edges.reduce((sum, e) => sum + edges[e]!.weight, 0)).toBe(path.cost);
        for (const [k, e] of path.edges.entries()) {
          expect(edges[e]!.from).toBe(path.nodes[k]);
          expect(edges[e]!.to).toBe(path.nodes[k + 1]);
        }
        // A random walk from 0 that reaches the target costs the shortest cost or more.
        for (const walk of walks) {
          let node = 0;
          let cost = 0;
          for (const pick of walk) {
            const out = edges.filter((edge) => edge.from === node);
            if (out.length === 0 || node === target) break;
            const edge = out[pick % out.length]!;
            cost += edge.weight;
            node = edge.to;
          }
          if (node === target) expect(path.cost).toBeLessThanOrEqual(cost);
        }
      }),
    );
  });

  it("gives the same cost with A* and a lower bound that is not consistent", () => {
    fc.assert(
      fc.property(graphs, ({ n, edges, target, factors }) => {
        const exact = costsTo(n, edges, target);
        // A random share of the true cost of each node is a lower bound, but it is often not consistent.
        const heuristic = (node: number): number => (exact[node] === Number.POSITIVE_INFINITY ? 0 : factors[node]! * exact[node]!);
        const plain = shortestPath(edges, 0, target);
        const guided = shortestPath(edges, 0, target, { heuristic });
        expect(guided.kind).toBe(plain.kind);
        if (plain.kind === "path" && guided.kind === "path") expect(guided.cost).toBe(plain.cost);
      }),
    );
  });

  it("gives alternatives with distinct edges, true costs, and no cost below the shortest", () => {
    fc.assert(
      fc.property(graphs, fc.constantFrom<"penalty" | "disjoint">("penalty", "disjoint"), ({ edges, target }, mode) => {
        const { paths } = alternativePaths(edges, 0, target, { count: 4, mode });
        const best = shortestPath(edges, 0, target);
        if (best.kind === "none") {
          expect(paths).toEqual([]);
          return;
        }
        expect(paths[0]!.edges).toEqual(best.edges);
        expect(new Set(paths.map((path) => path.edges.join())).size).toBe(paths.length);
        for (const path of paths) {
          expect(path.cost).toBe(path.edges.reduce((sum, e) => sum + edges[e]!.weight, 0));
          expect(path.cost).toBeGreaterThanOrEqual(best.cost);
          expect(path.overlap).toBeGreaterThanOrEqual(0);
          expect(path.overlap).toBeLessThanOrEqual(1);
        }
        if (mode === "disjoint") {
          const used = paths.flatMap((path) => path.edges);
          expect(new Set(used).size).toBe(used.length);
        }
      }),
    );
  });
});
