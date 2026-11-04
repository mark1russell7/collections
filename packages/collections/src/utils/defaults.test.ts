/**
 * The meaning of `deepEq`: an equivalence over each value, with the rules of its doc comment.
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { deepEq } from "./defaults.js";

/** Values of each kind that `deepEq` compares by value. Small domains, so that equal pairs occur. */
const valueOf = (leaf: fc.Arbitrary<unknown>): fc.Arbitrary<unknown> =>
  fc.letrec<{ value: unknown }>((tie) => ({
    value: fc.oneof(
      { maxDepth: 3, depthIdentifier: "value" },
      leaf,
      fc.integer({ min: 0, max: 3 }).map((time) => new Date(time)),
      fc.constantFrom(/a/, /a/g, /b/).map((pattern) => new RegExp(pattern)),
      fc.array(fc.integer({ min: 0, max: 2 }), { maxLength: 3 }).map((bytes) => Uint8Array.from(bytes)),
      fc.array(fc.constantFrom(0, 1, Number.NaN), { maxLength: 3 }).map((numbers) => Float64Array.from(numbers)),
      fc.array(tie("value"), { maxLength: 3 }),
      fc.dictionary(fc.constantFrom("a", "b", "c"), tie("value"), { maxKeys: 3, noNullPrototype: true }),
      fc.array(tie("value"), { maxLength: 3 }).map((items) => new Set(items)),
      fc.array(fc.tuple(tie("value"), tie("value")), { maxLength: 3 }).map((entries) => new Map(entries)),
    ),
  })).value;

const smallLeaf = fc.constantFrom<unknown>(0, -0, 1, Number.NaN, "a", null, undefined, true, 1n);
const anyLeaf = fc.oneof(smallLeaf, fc.double(), fc.string(), fc.bigInt());

describe("deepEq is an equivalence", () => {
  it("is reflexive, for the value and for a copy of it", () => {
    fc.assert(
      fc.property(valueOf(anyLeaf), (value) => {
        expect(deepEq(value, value)).toBe(true);
        expect(deepEq(value, structuredClone(value))).toBe(true);
      }),
    );
  });

  it("is symmetric", () => {
    fc.assert(
      fc.property(valueOf(smallLeaf), valueOf(smallLeaf), (a, b) => {
        expect(deepEq(a, b)).toBe(deepEq(b, a));
      }),
    );
  });

  it("is transitive", () => {
    fc.assert(
      fc.property(valueOf(smallLeaf), valueOf(smallLeaf), valueOf(smallLeaf), (a, b, c) => {
        if (deepEq(a, b) && deepEq(b, c)) expect(deepEq(a, c)).toBe(true);
      }),
      { numRuns: 500 },
    );
  });

  it("does not depend on the order of the entries of a map, a set or an object", () => {
    const entries = fc.uniqueArray(fc.tuple(fc.string(), valueOf(smallLeaf)), { selector: ([key]) => key, maxLength: 5 });
    fc.assert(
      fc.property(entries, (list) => {
        const backward = [...list].reverse();
        expect(deepEq(new Map(list), new Map(backward))).toBe(true);
        expect(deepEq(new Set(list), new Set(backward))).toBe(true);
        expect(deepEq(Object.fromEntries(list), Object.fromEntries(backward))).toBe(true);
      }),
    );
  });
});

describe("deepEq leaves", () => {
  it("uses SameValueZero", () => {
    expect(deepEq(Number.NaN, Number.NaN)).toBe(true);
    expect(deepEq(0, -0)).toBe(true);
    expect(deepEq([Number.NaN], [Number.NaN])).toBe(true);
    expect(deepEq(1, "1")).toBe(false);
    expect(deepEq(null, undefined)).toBe(false);
    expect(deepEq(null, {})).toBe(false);
    expect(deepEq({}, null)).toBe(false);
    expect(deepEq(1n, 1)).toBe(false);
  });

  it("compares functions by identity", () => {
    const f = (): number => 1;
    expect(deepEq(f, f)).toBe(true);
    expect(deepEq(f, (): number => 1)).toBe(false);
  });
});

describe("deepEq objects with internal state", () => {
  it("compares dates by time, and two invalid dates are equal", () => {
    expect(deepEq(new Date(1), new Date(1))).toBe(true);
    expect(deepEq(new Date(1), new Date(2))).toBe(false);
    expect(deepEq(new Date(Number.NaN), new Date(Number.NaN))).toBe(true);
  });

  it("compares regular expressions by source and flags, not by lastIndex", () => {
    expect(deepEq(/a/g, /a/g)).toBe(true);
    expect(deepEq(/a/g, /a/i)).toBe(false);
    expect(deepEq(/a/, /b/)).toBe(false);
    const moved = /a/g;
    moved.lastIndex = 3;
    expect(deepEq(moved, /a/g)).toBe(true);
  });

  it("compares maps and sets by content", () => {
    expect(deepEq(new Map([["a", 1]]), new Map([["a", 1]]))).toBe(true);
    expect(deepEq(new Map([["a", 1]]), new Map([["a", 2]]))).toBe(false);
    expect(deepEq(new Map([["a", 1]]), new Map([["b", 1]]))).toBe(false);
    expect(deepEq(new Map([["a", 1]]), new Map())).toBe(false);
    expect(deepEq(new Map([[{ k: 1 }, "x"]]), new Map([[{ k: 1 }, "x"]]))).toBe(true);
    expect(deepEq(new Map([[{ k: 1 }, "x"]]), new Map([[{ k: 1 }, "y"]]))).toBe(false);
    expect(deepEq(new Set([1, 2]), new Set([2, 1]))).toBe(true);
    expect(deepEq(new Set([1, 2]), new Set([1, 3]))).toBe(false);
    expect(deepEq(new Set([Number.NaN]), new Set([Number.NaN]))).toBe(true);
    expect(deepEq(new Set([{ k: 1 }, { k: 2 }]), new Set([{ k: 2 }, { k: 1 }]))).toBe(true);
    expect(deepEq(new Set([{ k: 1 }, { k: 2 }]), new Set([{ k: 2 }, { k: 3 }]))).toBe(false);
    expect(deepEq(new Set([{ k: 1 }, { k: 1 }]), new Set([{ k: 1 }, { k: 2 }]))).toBe(false);
  });

  it("compares binary data by element or byte", () => {
    expect(deepEq(new Uint8Array([1, 2]), new Uint8Array([1, 2]))).toBe(true);
    expect(deepEq(new Uint8Array([1, 2]), new Uint8Array([1, 3]))).toBe(false);
    expect(deepEq(new Uint8Array([1]), new Uint8Array([1, 0]))).toBe(false);
    expect(deepEq(new Uint8Array([1]), new Int8Array([1]))).toBe(false);
    expect(deepEq(new Float64Array([Number.NaN, 0]), new Float64Array([Number.NaN, -0]))).toBe(true);
    expect(deepEq(new BigInt64Array([1n]), new BigInt64Array([1n]))).toBe(true);
    expect(deepEq(new BigInt64Array([1n]), new BigInt64Array([2n]))).toBe(false);
    expect(deepEq(new Uint8Array([1]).buffer, new Uint8Array([1]).buffer)).toBe(true);
    expect(deepEq(new Uint8Array([1]).buffer, new Uint8Array([2]).buffer)).toBe(false);
    expect(deepEq(new SharedArrayBuffer(1), new SharedArrayBuffer(1))).toBe(true);
    expect(deepEq(new SharedArrayBuffer(1), new SharedArrayBuffer(2))).toBe(false);
    const view = (byte: number): DataView => new DataView(new Uint8Array([0, byte, 0]).buffer, 1, 1);
    expect(deepEq(view(1), view(1))).toBe(true);
    expect(deepEq(view(1), view(2))).toBe(false);
  });

  it("compares errors by name, message and cause, and boxed values by value", () => {
    expect(deepEq(new Error("a"), new Error("a"))).toBe(true);
    expect(deepEq(new Error("a"), new Error("b"))).toBe(false);
    expect(deepEq(new Error("a", { cause: 1 }), new Error("a", { cause: 2 }))).toBe(false);
    expect(deepEq(new Error("a"), new TypeError("a"))).toBe(false);
    expect(deepEq(Object(1), Object(1))).toBe(true);
    expect(deepEq(Object(1), Object(2))).toBe(false);
    expect(deepEq(Object("a"), Object("b"))).toBe(false);
    expect(deepEq(Object(true), Object(false))).toBe(false);
    expect(deepEq(Object(1n), Object(2n))).toBe(false);
    expect(deepEq(Object(Symbol.iterator), Object(Symbol.iterator))).toBe(true);
    expect(deepEq(Object(Symbol.iterator), Object(Symbol.asyncIterator))).toBe(false);
  });

  it("compares the extra keys of an object with internal state", () => {
    const tagged = (tag: string): Date => Object.assign(new Date(1), { tag });
    expect(deepEq(tagged("a"), tagged("a"))).toBe(true);
    expect(deepEq(tagged("a"), tagged("b"))).toBe(false);
  });

  it("compares objects whose state it cannot read by identity", () => {
    const made = [(): object => Promise.resolve(1), (): object => new WeakMap(), (): object => new WeakSet(), (): object => new WeakRef({})];
    for (const make of made) {
      const value = make();
      expect(deepEq(value, value)).toBe(true);
      expect(deepEq(value, make())).toBe(false);
    }
  });
});

describe("deepEq plain objects and arrays", () => {
  class Point {
    readonly x: number;

    constructor(x: number) {
      this.x = x;
    }
  }

  it("needs the same prototype on both sides", () => {
    expect(deepEq(new Point(1), new Point(1))).toBe(true);
    expect(deepEq(new Point(1), { x: 1 })).toBe(false);
    expect(deepEq({}, Object.create(null))).toBe(false);
    expect(deepEq([], {})).toBe(false);
    expect(deepEq([], Object.create(Array.prototype))).toBe(false);
    expect(deepEq(Object.create(Array.prototype), [])).toBe(false);
  });

  it("compares own enumerable keys, strings and symbols", () => {
    const key = Symbol("k");
    expect(deepEq({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);
    expect(deepEq({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    expect(deepEq({ a: 1 }, { b: 1 })).toBe(false);
    expect(deepEq({ [key]: 1 }, { [key]: 1 })).toBe(true);
    expect(deepEq({ [key]: 1 }, { [key]: 2 })).toBe(false);
    expect(deepEq({ a: undefined }, { b: undefined })).toBe(false);
  });

  it("is symmetric with a key that is not enumerable", () => {
    const hidden = Object.defineProperty({ y: 1 }, "x", { value: 1, enumerable: false });
    expect(deepEq({ x: 1 }, hidden)).toBe(false);
    expect(deepEq(hidden, { x: 1 })).toBe(false);
  });

  it("compares arrays by length and index, and a hole equals undefined", () => {
    expect(deepEq([1, [2]], [1, [2]])).toBe(true);
    expect(deepEq([1, 2], [1])).toBe(false);
    expect(deepEq([1, 2], [1, 3])).toBe(false);
    // eslint-disable-next-line no-sparse-arrays -- the hole is the case under test
    expect(deepEq([1, , 3], [1, undefined, 3])).toBe(true);
  });
});

describe("deepEq cycles", () => {
  const ring = (...labels: string[]): { label: string; next?: unknown } => {
    const nodes = labels.map((label) => ({ label, next: undefined as unknown }));
    nodes.forEach((node, index) => {
      node.next = nodes[(index + 1) % nodes.length];
    });
    return nodes[0]!;
  };

  it("ends, and compares cyclic values by what they unfold to", () => {
    expect(deepEq(ring("a"), ring("a"))).toBe(true);
    expect(deepEq(ring("a"), ring("b"))).toBe(false);
    expect(deepEq(ring("a", "b"), ring("a", "b"))).toBe(true);
    expect(deepEq(ring("a", "b"), ring("a", "c"))).toBe(false);
    expect(deepEq(ring("a"), ring("a", "a"))).toBe(true);
    expect(deepEq(ring("a", "a"), ring("a"))).toBe(true);
  });

  it("handles cycles through arrays, maps and sets", () => {
    const list = (): unknown[] => {
      const value: unknown[] = [1];
      value.push(value);
      return value;
    };
    expect(deepEq(list(), list())).toBe(true);
    const map = (value: number): Map<string, unknown> => {
      const made = new Map<string, unknown>([["value", value]]);
      made.set("self", made);
      return made;
    };
    expect(deepEq(map(1), map(1))).toBe(true);
    expect(deepEq(map(1), map(2))).toBe(false);
    const set = (value: number): Set<unknown> => {
      const made = new Set<unknown>();
      made.add({ value, owner: made });
      return made;
    };
    expect(deepEq(set(1), set(1))).toBe(true);
    expect(deepEq(set(1), set(2))).toBe(false);
  });

  it("releases the pairs of a failed attempt", () => {
    // The first candidate holds the pair of the shared part and then fails on its other key
    const shared = (): { n: number } => ({ n: 1 });
    const left = new Set([{ part: shared(), tag: "x" }, { part: shared(), tag: "y" }]);
    const right = new Set([{ part: shared(), tag: "y" }, { part: shared(), tag: "x" }]);
    expect(deepEq(left, right)).toBe(true);
    const wrong = new Set([{ part: { n: 2 }, tag: "y" }, { part: shared(), tag: "x" }]);
    expect(deepEq(left, wrong)).toBe(false);
  });

  it("visits a shared part one time, so a dense graph ends", () => {
    const graph = (size: number): object[] => {
      const nodes: { links: object[] }[] = Array.from({ length: size }, () => ({ links: [] }));
      for (const node of nodes) node.links.push(...nodes);
      return nodes;
    };
    expect(deepEq(graph(64), graph(64))).toBe(true);
    const doubled = (leaf: number): unknown => {
      let value: unknown = leaf;
      for (let depth = 0; depth < 64; depth++) value = [value, value];
      return value;
    };
    expect(deepEq(doubled(0), doubled(0))).toBe(true);
    expect(deepEq(doubled(0), doubled(1))).toBe(false);
  });
});
