import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { strongComponentsCompact, stronglyConnectedComponents } from "./index.js";

/** A directed graph of the nodes `0` to `n - 1`, with its edges as pairs. */
const graphs = fc.integer({ min: 0, max: 12 }).chain((n) =>
  fc.record({
    n: fc.constant(n),
    edges: n === 0 ? fc.constant([] as [number, number][]) : fc.array(fc.tuple(fc.nat(n - 1), fc.nat(n - 1)), { maxLength: 40 }),
  }),
);

/** This function gives the compact form of a graph: the edges of each node, in the order of the pairs. */
function compact(n: number, edges: readonly (readonly [number, number])[]): { start: Int32Array; targets: number[] } {
  const start = new Int32Array(n + 1);
  const targets: number[] = [];
  for (let v = 0; v < n; v += 1) {
    start[v] = targets.length;
    for (const [a, b] of edges) if (a === v) targets.push(b);
  }
  start[n] = targets.length;
  return { start, targets };
}

/** This function gives, for each node, the set of the nodes that it reaches, itself included. */
function reach(n: number, edges: readonly (readonly [number, number])[]): Set<number>[] {
  return Array.from({ length: n }, (_, from) => {
    const seen = new Set([from]);
    const todo = [from];
    while (todo.length > 0) {
      const v = todo.pop()!;
      for (const [a, b] of edges) {
        if (a === v && !seen.has(b)) {
          seen.add(b);
          todo.push(b);
        }
      }
    }
    return seen;
  });
}

describe("strongComponentsCompact", () => {
  it("puts two nodes in one component exactly when each reaches the other", () => {
    fc.assert(
      fc.property(graphs, ({ n, edges }) => {
        const { start, targets } = compact(n, edges);
        const { of, list } = strongComponentsCompact(n, start, targets);
        const reaches = reach(n, edges);
        for (let a = 0; a < n; a += 1) {
          for (let b = 0; b < n; b += 1) {
            expect(of[a] === of[b]).toBe(reaches[a]!.has(b) && reaches[b]!.has(a));
          }
        }
        expect(list.flat().sort((a, b) => a - b)).toEqual(Array.from({ length: n }, (_, i) => i));
        list.forEach((members, c) => {
          expect(members).toEqual([...members].sort((a, b) => a - b));
          for (const v of members) expect(of[v]).toBe(c);
        });
      }),
    );
  });

  it("puts each component after each component that it reaches: the deepest first", () => {
    fc.assert(
      fc.property(graphs, ({ n, edges }) => {
        const { start, targets } = compact(n, edges);
        const { of } = strongComponentsCompact(n, start, targets);
        for (const [a, b] of edges) expect(of[b]!).toBeLessThanOrEqual(of[a]!);
      }),
    );
  });

  it("gives one component of one node for a node with an edge to itself", () => {
    expect(strongComponentsCompact(1, [0, 1], [0]).list).toEqual([[0]]);
  });

  it("does not overflow the stack on a chain or a cycle of 100000 nodes", () => {
    const n = 100_000;
    const start = Int32Array.from({ length: n + 1 }, (_, v) => Math.min(v, n - 1));
    const chain = Int32Array.from({ length: n - 1 }, (_, v) => v + 1);
    const path = strongComponentsCompact(n, start, chain);
    expect(path.list.length).toBe(n);
    expect(path.list[0]).toEqual([n - 1]);
    const ring = Int32Array.from({ length: n }, (_, v) => (v + 1) % n);
    const ringStart = Int32Array.from({ length: n + 1 }, (_, v) => v);
    expect(strongComponentsCompact(n, ringStart, ring).list.map((c) => c.length)).toEqual([n]);
  });

  it("throws a RangeError for a bad count, a bad start or a target outside the nodes", () => {
    expect(() => strongComponentsCompact(-1, [0], [])).toThrow(RangeError);
    expect(() => strongComponentsCompact(1.5, [0, 0, 0], [])).toThrow(RangeError);
    expect(() => strongComponentsCompact(2, [0, 0], [])).toThrow(RangeError);
    expect(() => strongComponentsCompact(2, [0, 2, 1], [1, 0])).toThrow(RangeError);
    expect(() => strongComponentsCompact(2, [0, 1, 3], [1, 0])).toThrow(RangeError);
    expect(() => strongComponentsCompact(2, [0, 1, 1], [2])).toThrow(RangeError);
  });
});

describe("stronglyConnectedComponents", () => {
  it("gives the components of the compact form, with the names of the nodes", () => {
    fc.assert(
      fc.property(graphs, ({ n, edges }) => {
        const { start, targets } = compact(n, edges);
        const names = Array.from({ length: n }, (_, i) => `n${i}`);
        const keyed = stronglyConnectedComponents(names, (id) => edges.filter(([a]) => names[a] === id).map(([, b]) => names[b]!));
        expect(keyed).toEqual(strongComponentsCompact(n, start, targets).list.map((c) => c.map((v) => names[v])));
      }),
    );
  });

  it("ignores a successor that is not a node, and counts a node that comes two times one time", () => {
    const next: Record<string, string[]> = { a: ["b", "x"], b: ["a"], c: ["a"] };
    expect(stronglyConnectedComponents(["c", "a", "b", "a"], (id) => next[id] ?? [])).toEqual([["a", "b"], ["c"]]);
  });
});
