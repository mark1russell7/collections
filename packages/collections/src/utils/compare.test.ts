/**
 * The laws of the comparators (roadmap row C38). Each comparator gives a number for each pair, 0 for a value and
 * itself, the opposite sign for a swap, and a transitive order. A sorted collection takes a result of 0 as one key.
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { Compare } from "../core/traits.js";
import { treeMap } from "../impl/tree-map.js";
import { treeSet } from "../impl/tree-set.js";
import {
  booleanCompare,
  comparing,
  dateCompare,
  defaultCompare,
  nullsFirst,
  nullsLast,
  numberCompare,
  reversed,
  stringCompare,
  stringCompareIgnoreCase,
  thenComparing,
} from "./defaults.js";

/** Numbers with the edge values at a high rate, so that equal pairs and infinities occur. */
const numbers = fc.oneof(fc.constantFrom(Number.NaN, Infinity, -Infinity, 0, -0, 1, -1, Number.MAX_VALUE, -Number.MAX_VALUE), fc.double());
/** Dates with invalid dates at a high rate. */
const dates = fc.oneof(fc.constant(Number.NaN), fc.integer({ min: -2, max: 2 }), fc.constantFrom(8.64e15, -8.64e15)).map((time) => new Date(time));
/** Strings with the two Unicode forms of `é` and two cases of one letter. */
const strings = fc.oneof(fc.constantFrom("é", "é", "A", "a", ""), fc.string({ maxLength: 3 }));
const nullish = fc.constantFrom(null, undefined);

/** Two symbols with one text, a registered symbol with the same text, and a well-known symbol. */
const symbols = fc.constantFrom(Symbol("s"), Symbol("s"), Symbol.for("s"), Symbol.iterator);

/** The values of each type: primitives, dates, symbols, functions, boxed values, and objects with and with no prototype. */
const allTypes: fc.Arbitrary<unknown> = fc.oneof(
  fc.anything({ withBigInt: true, withDate: true, withMap: true, withSet: true, withBoxedValues: true, withNullPrototype: true, withTypedArray: true }),
  numbers,
  dates,
  strings,
  symbols,
  fc.func(fc.integer()),
  fc.constantFrom(1, "1", 9, 10, "10z", 1n, true, [1], { a: 1 }, { a: 1 }),
);

/** The values of one type, and `null` and `undefined`. */
const oneTypeAndNullish = <T>(values: fc.Arbitrary<T>): fc.Arbitrary<T | null | undefined> => fc.oneof(values, nullish);

const cases: readonly { readonly name: string; readonly compare: Compare<any>; readonly values: fc.Arbitrary<unknown> }[] = [
  { name: "numberCompare", compare: numberCompare, values: numbers },
  { name: "dateCompare", compare: dateCompare, values: dates },
  { name: "stringCompare", compare: stringCompare, values: strings },
  { name: "stringCompareIgnoreCase", compare: stringCompareIgnoreCase, values: strings },
  { name: "booleanCompare", compare: booleanCompare, values: fc.boolean() },
  { name: "defaultCompare on numbers", compare: defaultCompare, values: oneTypeAndNullish(numbers) },
  { name: "defaultCompare on dates", compare: defaultCompare, values: oneTypeAndNullish(dates) },
  { name: "defaultCompare on strings", compare: defaultCompare, values: oneTypeAndNullish(strings) },
  { name: "defaultCompare on booleans", compare: defaultCompare, values: oneTypeAndNullish(fc.boolean()) },
  { name: "defaultCompare on values of all types (C39)", compare: defaultCompare, values: allTypes },
  { name: "reversed(numberCompare)", compare: reversed(numberCompare), values: numbers },
  { name: "nullsFirst(numberCompare)", compare: nullsFirst(numberCompare), values: oneTypeAndNullish(numbers) },
  { name: "nullsLast(dateCompare)", compare: nullsLast(dateCompare), values: oneTypeAndNullish(dates) },
  {
    name: "thenComparing(comparing(x), comparing(y))",
    compare: thenComparing(comparing<{ x: number; y: string }>("x", numberCompare), comparing<{ x: number; y: string }>("y")),
    values: fc.record({ x: numbers, y: strings }),
  },
];

/** This function tells if two results have opposite signs. Two results of 0, or of 0 and -0, have opposite signs. */
const opposite = (ab: number, ba: number): boolean => Math.sign(ab) === -Math.sign(ba);

describe.each(cases)("$name is an order", ({ compare, values }) => {
  it("gives a number for each pair, and 0 for a value and itself", () => {
    fc.assert(
      fc.property(values, values, (a, b) => {
        expect(Number.isNaN(compare(a, b))).toBe(false);
        expect(typeof compare(a, b)).toBe("number");
        expect(compare(a, a) === 0).toBe(true);
      }),
    );
  });

  it("changes the sign for a swap", () => {
    fc.assert(
      fc.property(values, values, (a, b) => {
        expect(opposite(compare(a, b), compare(b, a))).toBe(true);
      }),
    );
  });

  it("is transitive", () => {
    fc.assert(
      fc.property(values, values, values, (a, b, c) => {
        if (compare(a, b) <= 0 && compare(b, c) <= 0) expect(compare(a, c) <= 0).toBe(true);
      }),
    );
  });
});

describe("defaultCompare across types (C39)", () => {
  it("orders by type first: null, undefined, booleans, numbers, bigints, strings, dates, symbols, objects", () => {
    const date = new Date(0);
    const symbol = Symbol("s");
    const object = { a: 1 };
    // Array.prototype.sort puts undefined last and does not give it to the comparator.
    const values = [object, symbol, date, "a", 2n, 1, true, null];
    expect([...values].sort(defaultCompare)).toEqual([null, true, 1, 2n, "a", date, symbol, object]);
    expect(defaultCompare(null, undefined)).toBe(-1);
    expect(defaultCompare(undefined, false)).toBe(-1);
  });

  it("gives a transitive order for the values of the old defect", () => {
    expect([9, "10z", 10].sort(defaultCompare)).toEqual([9, 10, "10z"]);
    expect(defaultCompare(1, "1")).toBe(-1);
  });

  it("holds two different objects with one text as two keys", () => {
    const set = treeSet<object>();
    set.add({ a: 1 });
    set.add({ a: 1 });
    set.add(Object.create(null));
    expect(set.size).toBe(3);
  });
});

describe("the comparators in a sorted collection (C38)", () => {
  it("holds one key for two equal infinities with numberCompare", () => {
    const map = treeMap<number, string>({ compare: numberCompare });
    map.set(Infinity, "a");
    map.set(Infinity, "b");
    map.set(-Infinity, "c");
    expect(map.size).toBe(2);
    expect(map.has(Infinity)).toBe(true);
    expect(map.get(Infinity)).toBe("b");
  });

  it("holds one key for two invalid dates with dateCompare and with defaultCompare", () => {
    for (const compare of [dateCompare, defaultCompare]) {
      const set = treeSet<Date>({ compare });
      set.add(new Date(Number.NaN));
      set.add(new Date(Number.NaN));
      set.add(new Date(0));
      expect(set.size).toBe(2);
      expect(set.contains(new Date(Number.NaN))).toBe(true);
    }
  });

  it("holds null and undefined as two keys, null first", () => {
    expect(defaultCompare(null, undefined)).toBeLessThan(0);
    expect(defaultCompare(undefined, null)).toBeGreaterThan(0);
    const set = treeSet<number | null | undefined>([undefined, 1, null, undefined, null]);
    expect([...set]).toEqual([null, undefined, 1]);
  });

  it("gives -1, 0 or 1 with numberCompare", () => {
    expect([numberCompare(1, 1e9), numberCompare(5, 5), numberCompare(Number.MAX_VALUE, -Number.MAX_VALUE)]).toEqual([-1, 0, 1]);
  });
});
