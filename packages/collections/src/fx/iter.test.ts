import { describe, expect, it } from "vitest";
import { take, toArray } from "./iter.js";

/** This function gives the values of `values` and records each read in `reads`. */
function* counted<T>(values: readonly T[], reads: T[]): Generator<T> {
  for (const value of values) {
    reads.push(value);
    yield value;
  }
}

describe("take", () => {
  it.each([
    { n: 0, taken: [], read: [] },
    { n: 1, taken: [1], read: [1] },
    { n: 2, taken: [1, 2], read: [1, 2] },
    { n: 3, taken: [1, 2, 3], read: [1, 2, 3] },
    { n: 5, taken: [1, 2, 3], read: [1, 2, 3] },
  ])("take n=$n reads no value after the last one it gives", ({ n, taken, read }) => {
    const reads: number[] = [];
    expect(toArray(take(counted([1, 2, 3], reads), n))).toEqual(taken);
    expect(reads).toEqual(read);
  });

  it("take of a negative count gives nothing and reads nothing", () => {
    const reads: number[] = [];
    expect(toArray(take(counted([1, 2], reads), -1))).toEqual([]);
    expect(reads).toEqual([]);
  });

  it("take closes the source after the last value", () => {
    let closed = false;
    function* source(): Generator<number> {
      try {
        yield 1;
        yield 2;
        yield 3;
      } finally {
        closed = true;
      }
    }
    expect(toArray(take(source(), 2))).toEqual([1, 2]);
    expect(closed).toBe(true);
  });
});
