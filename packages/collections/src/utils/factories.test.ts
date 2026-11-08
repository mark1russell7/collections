/**
 * The laws of `range` and `nCopies` (C40): exact steps, and a check of each argument.
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { nCopies, range, rangeTo } from "./factories.js";

/** This value is a finite number of a small size, for the start and the end of a range. */
const bound = fc.double({ min: -1000, max: 1000, noNaN: true, noDefaultInfinity: true });

/** This value is a step of a range, positive or negative, with at most 20 000 numbers between two bounds. */
const step = fc
  .double({ min: 0.1, max: 100, noNaN: true, noDefaultInfinity: true })
  .chain((size) => fc.constantFrom(size, -size));

/** This function tells if a value comes before `end` in the direction of `step`. */
const before = (value: number, end: number, by: number): boolean => (by > 0 ? value < end : value > end);

describe("range (C40)", () => {
  it("gives start + i * step at each index i, so the error of a fraction does not grow", () => {
    fc.assert(
      fc.property(bound, bound, step, (start, end, by) => {
        const values = range(start, end, by).toArray();
        values.forEach((value, i) => expect(value).toBe(start + i * by));
      }),
    );
  });

  it("gives each number before end, and stops at the first number that is not", () => {
    fc.assert(
      fc.property(bound, bound, step, (start, end, by) => {
        const values = range(start, end, by).toArray();
        for (const value of values) expect(before(value, end, by)).toBe(true);
        expect(before(start + values.length * by, end, by)).toBe(false);
      }),
    );
  });

  it("gives ten numbers from 0 to 1 by 0.1", () => {
    const values = range(0, 1, 0.1).toArray();
    expect(values).toHaveLength(10);
    expect(values[3]).toBe(3 * 0.1);
    expect(values[9]).toBe(9 * 0.1);
  });

  it("counts down with a negative step", () => {
    expect(range(10, 0, -3).toArray()).toEqual([10, 7, 4, 1]);
    expect(range(0, 10, -1).toArray()).toEqual([]);
  });

  it("throws a RangeError for a start, an end or a step that is not finite, and for a step of 0", () => {
    const bad = fc.constantFrom(Number.NaN, Infinity, -Infinity);
    fc.assert(
      fc.property(bad, fc.integer({ min: 0, max: 2 }), (value, place) => {
        const args: [number, number, number] = [0, 5, 1];
        args[place] = value;
        expect(() => range(...args)).toThrow(RangeError);
      }),
    );
    expect(() => range(0, 5, 0)).toThrow(RangeError);
    expect(() => rangeTo(Infinity)).toThrow(RangeError);
  });

  it("throws a RangeError for a list that is longer than an array, before it adds a number", () => {
    expect(() => range(0, 2 ** 32)).toThrow(RangeError);
    expect(() => range(-1e308, 1e308)).toThrow(RangeError);
    expect(() => range(0, 1, Number.MIN_VALUE)).toThrow(RangeError);
  });
});

describe("nCopies (C40)", () => {
  it("gives n copies for each safe integer n of 0 or more", () => {
    fc.assert(
      fc.property(fc.nat({ max: 100 }), (n) => {
        expect(nCopies(n, "x").toArray()).toEqual(Array.from({ length: n }, () => "x"));
      }),
    );
  });

  it("throws a RangeError for a count that is not a safe integer of 0 or more", () => {
    const bad = fc.oneof(
      fc.constantFrom(Number.NaN, Infinity, -Infinity, -1, 2.5, 2 ** 53),
      fc.double({ noNaN: true }).filter((n) => !Number.isSafeInteger(n) || n < 0),
    );
    fc.assert(
      fc.property(bad, (n) => {
        expect(() => nCopies(n, "x")).toThrow(RangeError);
      }),
    );
  });
});
