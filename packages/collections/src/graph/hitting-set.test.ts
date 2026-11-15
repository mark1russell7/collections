import { random, seedsFrom, type Random } from "@mark1russell7/rigor-generators";
import { describe, expect, it } from "vitest";
import { minimumHittingSet, type HittingSet } from "./index.js";

const SEEDS = seedsFrom(process.env["SEED"], [1, 2, 3, 4, 5, 6, 7, 8]);

/** This function gives the smallest weight of a hitting set, by a test of each subset of the elements. */
function bruteForce(m: number, family: readonly (readonly number[])[], weight: (e: number) => number): number {
  let best = Number.POSITIVE_INFINITY;
  for (let mask = 0; mask < 1 << m; mask += 1) {
    if (!family.every((set) => set.some((e) => (mask & (1 << e)) !== 0))) continue;
    let sum = 0;
    for (let e = 0; e < m; e += 1) if ((mask & (1 << e)) !== 0) sum += weight(e);
    best = Math.min(best, sum);
  }
  return best;
}

function randomFamily(r: Random, m: number): number[][] {
  return Array.from({ length: r.int(0, 9) }, () => Array.from({ length: r.int(1, 4) }, () => r.int(0, m - 1)));
}

function exact<T>(result: HittingSet<T>): { elements: readonly T[]; weight: number } {
  if (result.kind !== "exact") throw new Error(`The result is ${result.kind}, not exact.`);
  return result;
}

describe("minimumHittingSet", () => {
  it("gives the empty set for an empty family", () => {
    expect(minimumHittingSet([])).toEqual({ kind: "exact", elements: [], weight: 0, steps: 0 });
  });

  it("gives the lightest element of a single set", () => {
    expect(exact(minimumHittingSet([["a", "b", "c"]]))).toMatchObject({ elements: ["a"], weight: 1 });
    const weights: Record<string, number> = { a: 3, b: 1, c: 2 };
    expect(exact(minimumHittingSet([["a", "b", "c"]], { weight: (e) => weights[e]! }))).toMatchObject({ elements: ["b"], weight: 1 });
  });

  it("gives none for a family with an empty set", () => {
    expect(minimumHittingSet([["a"], [], ["b"]])).toEqual({ kind: "none", empty: 1 });
  });

  it("finds one element that hits each set when it exists", () => {
    // Each source of a kind depends on the CDN, so one fault stops each of them.
    const family = [
      ["provider:a", "cdn:x"],
      ["provider:b", "cdn:x"],
      ["provider:c", "cdn:x"],
    ];
    expect(exact(minimumHittingSet(family))).toMatchObject({ elements: ["cdn:x"], weight: 1 });
  });

  it("needs two elements for a triangle, and proves it", () => {
    const result = exact(minimumHittingSet([["a", "b"], ["b", "c"], ["a", "c"]]));
    expect(result.weight).toBe(2);
    expect(result.elements).toHaveLength(2);
  });

  it("gives budget with a hitting set when the search passes maxSteps", () => {
    const result = minimumHittingSet([["a", "b"], ["b", "c"], ["a", "c"]], { maxSteps: 0 });
    expect(result.kind).toBe("budget");
    if (result.kind !== "budget") return;
    expect(result.steps).toBe(0);
    expect(result.best.weight).toBe(2);
  });

  it("counts a repeated element one time, and keeps the order of the first occurrence", () => {
    const result = exact(minimumHittingSet([["z", "z"], ["y", "z"], ["x"]]));
    expect(result).toMatchObject({ elements: ["z", "x"], weight: 2 });
  });

  it("throws a RangeError for a bad weight or a bad maxSteps", () => {
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => minimumHittingSet([["a"]], { weight: () => bad })).toThrow(RangeError);
    }
    for (const bad of [-1, 1.5, Number.NaN]) {
      expect(() => minimumHittingSet([["a"]], { maxSteps: bad })).toThrow(RangeError);
    }
    expect(minimumHittingSet([["a"]], { maxSteps: Number.POSITIVE_INFINITY }).kind).toBe("exact");
  });

  it("does not change its arguments", () => {
    const family = Object.freeze([Object.freeze(["a", "b"]), Object.freeze(["b"])]);
    expect(exact(minimumHittingSet(family)).elements).toEqual(["b"]);
  });

  it.each(SEEDS)("agrees with a brute force over random families (seed %i)", (seed) => {
    const r = random(seed);
    for (let round = 0; round < 300; round += 1) {
      const m = r.int(1, 10);
      const family = randomFamily(r, m);
      const weights = Array.from({ length: m }, () => (r.chance(0.5) ? 1 : r.int(1, 6)));
      const result = exact(minimumHittingSet(family, { weight: (e) => weights[e]! }));
      const label = `seed ${seed} round ${round}: ${JSON.stringify({ family, weights })}`;
      expect(result.weight, label).toBe(bruteForce(m, family, (e) => weights[e]!));
      // The result hits each set, has no repeated element, and its weight is the sum of its elements.
      expect(family.every((set) => set.some((e) => result.elements.includes(e))), label).toBe(true);
      expect(new Set(result.elements).size).toBe(result.elements.length);
      expect(result.elements.reduce((sum, e) => sum + weights[e]!, 0)).toBe(result.weight);
      // The same family gives the same result.
      expect(minimumHittingSet(family, { weight: (e) => weights[e]! })).toEqual(result);
    }
  });

  it.each(SEEDS)("gives a hitting set no lighter than the exact one under a small budget (seed %i)", (seed) => {
    const r = random(seed);
    for (let round = 0; round < 100; round += 1) {
      const family = randomFamily(r, 8);
      const full = exact(minimumHittingSet(family));
      const small = minimumHittingSet(family, { maxSteps: r.int(0, 3) });
      const found = small.kind === "budget" ? small.best : exact(small);
      expect(family.every((set) => set.some((e) => found.elements.includes(e)))).toBe(true);
      expect(found.weight).toBeGreaterThanOrEqual(full.weight);
    }
  });

  it("solves a family of 30 elements and 60 sets in the default budget", () => {
    const r = random(30);
    const family = Array.from({ length: 60 }, () => Array.from({ length: r.int(2, 4) }, () => `d${r.int(0, 29)}`));
    expect(minimumHittingSet(family).kind).toBe("exact");
  });
});
