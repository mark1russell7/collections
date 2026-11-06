/**
 * The laws of the LRU layer (C10): lruMap over each base map, against a model of the recency order.
 *
 * The laws:
 * - `get` of a present key, `has` of a present key and `set` are a use: the key becomes the most recent.
 * - `getOrUndefined`, `delete` and the iteration are not a use.
 * - A `set` of a new key into a full map evicts the least recent key first, and calls `onEvict` with it.
 * - The size is never over the capacity, and the entries are the entries of the model.
 */

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { hashMap } from "../impl/hash-map.js";
import { linkedHashMap } from "../impl/linked-hash-map.js";
import { treeMap } from "../impl/tree-map.js";
import { lruMap } from "../behaviors/lru.js";
import type { MapLike } from "../interfaces/map.js";
import { runModel, step, type Step } from "./model.js";

type S = { sut: MapLike<number, string> & { readonly isFull: boolean }; evicted: [number, string][] };
/** The model: the entries, with the most recent key last, and the evictions in their order. */
interface M {
  readonly map: Map<number, string>;
  readonly capacity: number;
  readonly evicted: [number, string][];
}

/** This function makes `k` the most recent key of the model. */
function use(m: M, k: number): void {
  const v = m.map.get(k);
  if (v === undefined) return;
  m.map.delete(k);
  m.map.set(k, v);
}

const letter = fc.constantFrom("a", "b", "c");
const key = fc.integer({ min: -6, max: 6 });

const steps: fc.Arbitrary<Step<S, M>> = fc.oneof(
  fc.tuple(key, letter).map(([k, v]) =>
    step<S, M>(`set(${k}, ${v})`, ({ sut }, m) => {
      const old = m.map.get(k);
      expect(sut.set(k, v)).toBe(old);
      if (old !== undefined) {
        m.map.set(k, v);
        use(m, k);
        return;
      }
      if (m.map.size >= m.capacity) {
        const [lk, lv] = m.map.entries().next().value as [number, string];
        m.map.delete(lk);
        m.evicted.push([lk, lv]);
      }
      m.map.set(k, v);
    }),
  ),
  key.map((k) =>
    step<S, M>(`get(${k})`, ({ sut }, m) => {
      if (!m.map.has(k)) return expect(() => sut.get(k)).toThrow();
      expect(sut.get(k)).toBe(m.map.get(k));
      use(m, k);
    }),
  ),
  key.map((k) =>
    step<S, M>(`has(${k})`, ({ sut }, m) => {
      expect(sut.has(k)).toBe(m.map.has(k));
      use(m, k);
    }),
  ),
  key.map((k) => step<S, M>(`getOrUndefined(${k})`, ({ sut }, m) => expect(sut.getOrUndefined(k)).toBe(m.map.get(k)))),
  key.map((k) =>
    step<S, M>(`delete(${k})`, ({ sut }, m) => {
      expect(sut.delete(k)).toBe(m.map.get(k));
      m.map.delete(k);
    }),
  ),
  fc.constant(step<S, M>("clear()", ({ sut }, m) => (sut.clear(), m.map.clear()))),
);

function check({ sut, evicted }: S, m: M): void {
  const actual = [...sut.entries()].map((e) => [e.key, e.value] as [number, string]).sort(([a], [b]) => a - b);
  expect(actual).toEqual([...m.map.entries()].sort(([a], [b]) => a - b));
  expect(sut.size).toBe(m.map.size);
  expect(sut.size).toBeLessThanOrEqual(m.capacity);
  expect(sut.isFull).toBe(m.map.size >= m.capacity);
  expect(evicted).toEqual(m.evicted);
}

// Every key in one of two buckets: each use and each eviction works on a chain
const colliding = { hash: (k: number) => Math.abs(k) % 2, eq: (a: number, b: number) => a === b };

for (const [name, base] of [
  ["HashMap", () => hashMap<number, string>()],
  ["HashMap (colliding hash)", () => hashMap<number, string>({ keyHash: colliding.hash, keyEq: colliding.eq, initialCapacity: 2 })],
  ["LinkedHashMap", () => linkedHashMap<number, string>()],
  ["TreeMap", () => treeMap<number, string>()],
] as const) {
  describe(`lruMap over ${name}`, () => {
    it("follows the laws of the recency order", () => {
      fc.assert(
        fc.property(fc.integer({ min: 1, max: 5 }), (capacity) => {
          runModel<S, M>({
            create: () => {
              const evicted: [number, string][] = [];
              const sut = lruMap<number, string>({ capacity, onEvict: ({ key: k, value: v }) => void evicted.push([k, v]) })(
                base() as MapLike<number, string>,
              );
              return { sut: { sut, evicted }, model: { map: new Map(), capacity, evicted: [] } };
            },
            steps,
            check,
            maxSteps: 60,
            numRuns: 40,
          });
        }),
        { numRuns: 5 },
      );
    });
  });
}

describe("the cost of lruMap", () => {
  // Before 0.7.0 a set into a full map read each node with `has` of the base: capacity + 2 calls (C10)
  it.each([10, 100, 1000])("uses a constant number of calls of the base for a set into a full map (capacity %i)", (capacity) => {
    const base = hashMap<number, number>();
    let calls = 0;
    const has = base.has.bind(base);
    (base as { has: (k: number) => boolean }).has = (k) => (calls++, has(k));
    const lru = lruMap<number, number>({ capacity })(base);
    for (let i = 0; i < capacity; i++) lru.set(i, i);
    calls = 0;
    for (let i = capacity; i < capacity + 1000; i++) lru.set(i, i);
    expect(calls / 1000).toBeLessThanOrEqual(3);
    expect(lru.size).toBe(capacity);
  });
});
