/**
 * The laws of the layers over a base with its own key equality (C20): `lruMap`, `ttlMap` and `ttlCollection`
 * find a key as the base does.
 *
 * The bases:
 * - a `hashMap` with an `eq` and a `hash` by `id`: two objects with the same `id` are one key;
 * - a `treeMap` with a comparator that ignores case: "a" and "A" are one key.
 *
 * The model keeps each key by its class (the `id`, or the lower case), so it agrees with the base.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fc from "fast-check";
import { hashMap } from "../impl/hash-map.js";
import { treeMap } from "../impl/tree-map.js";
import { hashSet } from "../impl/hash-set.js";
import { treeSet } from "../impl/tree-set.js";
import { lruMap } from "../behaviors/lru.js";
import { ttlMap, ttlCollection } from "../behaviors/ttl.js";
import type { MapLike } from "../interfaces/map.js";
import type { Collection } from "../interfaces/collection.js";
import { keyIndex } from "../core/key-index.js";
import { runModel, step, type Step } from "./model.js";

interface Id {
  readonly id: number;
  readonly tag: number;
}

/** A family of keys: the arbitrary, the class of a key, and a base map with the equality of the classes. */
interface Family<K> {
  readonly name: string;
  readonly key: fc.Arbitrary<K>;
  readonly canon: (key: K) => string;
  readonly base: () => MapLike<K, number>;
}

const lower = (s: string): string => s.toLowerCase();
const byCase = (a: string, b: string): number => (lower(a) < lower(b) ? -1 : lower(a) > lower(b) ? 1 : 0);

const ids: Family<Id> = {
  name: "hashMap with eq and hash by id",
  key: fc.record({ id: fc.integer({ min: 0, max: 5 }), tag: fc.integer({ min: 0, max: 2 }) }),
  canon: (key) => String(key.id),
  base: () => hashMap<Id, number>({ eq: (a, b) => a.id === b.id, hash: (key) => key.id }),
};

const letters: Family<string> = {
  name: "treeMap with a comparator that ignores case",
  key: fc.constantFrom("a", "A", "b", "B", "c", "C", "d", "D", "e", "E"),
  canon: lower,
  base: () => treeMap<string, number>({ compare: byCase }),
};

const value = fc.integer({ min: 0, max: 99 });
const sortedEntries = (entries: Iterable<[string, number]>): [string, number][] =>
  [...entries].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

// ---------------------------------------------------------------------------------------------------------------------
// lruMap

/** The model of an LRU map: the values by class, the order of use (the most recent first) and the evictions. */
interface LruModel {
  readonly values: Map<string, number>;
  readonly order: string[];
  readonly evicted: string[];
  readonly capacity: number;
}

interface LruSut<K> {
  readonly map: MapLike<K, number>;
  readonly evicted: string[];
}

function use(m: LruModel, c: string): void {
  m.order.splice(m.order.indexOf(c), 1);
  m.order.unshift(c);
}

function lruSteps<K>(f: Family<K>): fc.Arbitrary<Step<LruSut<K>, LruModel>> {
  return fc.oneof(
    fc.tuple(f.key, value).map(([k, v]) =>
      step<LruSut<K>, LruModel>(`set(${JSON.stringify(k)}, ${v})`, ({ map }, m) => {
        const c = f.canon(k);
        const old = m.values.get(c);
        if (old !== undefined) use(m, c);
        else {
          if (m.values.size >= m.capacity) {
            const last = m.order.pop()!;
            m.values.delete(last);
            m.evicted.push(last);
          }
          m.order.unshift(c);
        }
        m.values.set(c, v);
        expect(map.set(k, v)).toBe(old);
      }),
    ),
    f.key.map((k) =>
      step<LruSut<K>, LruModel>(`get(${JSON.stringify(k)})`, ({ map }, m) => {
        const c = f.canon(k);
        if (!m.values.has(c)) return void expect(() => map.get(k)).toThrow();
        use(m, c);
        expect(map.get(k)).toBe(m.values.get(c));
      }),
    ),
    f.key.map((k) =>
      step<LruSut<K>, LruModel>(`has(${JSON.stringify(k)})`, ({ map }, m) => {
        // A has is not a use (C37), so the order does not change
        expect(map.has(k)).toBe(m.values.has(f.canon(k)));
      }),
    ),
    f.key.map((k) =>
      step<LruSut<K>, LruModel>(`delete(${JSON.stringify(k)})`, ({ map }, m) => {
        const c = f.canon(k);
        const old = m.values.get(c);
        if (m.values.delete(c)) m.order.splice(m.order.indexOf(c), 1);
        expect(map.delete(k)).toBe(old);
      }),
    ),
  );
}

function checkLru<K>(f: Family<K>): (sut: LruSut<K>, m: LruModel) => void {
  return ({ map, evicted }, m) => {
    expect(sortedEntries([...map.entries()].map((e) => [f.canon(e.key), e.value]))).toEqual(sortedEntries(m.values));
    expect(map.size).toBe(m.values.size);
    expect(evicted).toEqual(m.evicted);
  };
}

describe.each([ids, letters] as unknown as Family<unknown>[])("lruMap over a $name", (f: Family<unknown>) => {
  it("follows an LRU model by the classes of the keys", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 4 }), (capacity) => {
        runModel<LruSut<unknown>, LruModel>({
          create: () => {
            const evicted: string[] = [];
            const map = lruMap<unknown, number>({ capacity, onEvict: ({ key }) => void evicted.push(f.canon(key)) })(f.base());
            return { sut: { map, evicted }, model: { values: new Map(), order: [], evicted: [], capacity } };
          },
          steps: lruSteps(f),
          check: checkLru(f),
          maxSteps: 40,
          numRuns: 40,
        });
      }),
      { numRuns: 4 },
    );
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// ttlMap

const TTL = 10;

/** The model of a TTL map: the values and the expiry times by class, in the order of the last set. */
interface TtlModel {
  readonly entries: Map<string, { value: number; expiresAt: number }>;
  readonly expired: string[];
}

interface TtlSut<K> {
  readonly map: MapLike<K, number> & { readonly dispose: () => void };
  readonly expired: string[];
}

/** This function removes the expired entries of the model, in the order of expiry. */
function expire(m: TtlModel): void {
  const now = Date.now();
  for (const [c, entry] of m.entries) {
    if (now < entry.expiresAt) break;
    m.entries.delete(c);
    m.expired.push(c);
  }
}

function ttlSteps<K>(f: Family<K>): fc.Arbitrary<Step<TtlSut<K>, TtlModel>> {
  return fc.oneof(
    fc.tuple(f.key, value).map(([k, v]) =>
      step<TtlSut<K>, TtlModel>(`set(${JSON.stringify(k)}, ${v})`, ({ map }, m) => {
        expire(m);
        const c = f.canon(k);
        const old = m.entries.get(c)?.value;
        // A set starts the time again and puts the key at the end of the order of expiry
        m.entries.delete(c);
        m.entries.set(c, { value: v, expiresAt: Date.now() + TTL });
        expect(map.set(k, v)).toBe(old);
      }),
    ),
    f.key.map((k) =>
      step<TtlSut<K>, TtlModel>(`delete(${JSON.stringify(k)})`, ({ map }, m) => {
        expire(m);
        const old = m.entries.get(f.canon(k))?.value;
        m.entries.delete(f.canon(k));
        expect(map.delete(k)).toBe(old);
      }),
    ),
    fc.integer({ min: 0, max: TTL + 2 }).map((ms) => step<TtlSut<K>, TtlModel>(`advance(${ms})`, () => void vi.advanceTimersByTime(ms))),
  );
}

function checkTtl<K>(f: Family<K>): (sut: TtlSut<K>, m: TtlModel) => void {
  return ({ map, expired }, m) => {
    const actual = [...map.entries()].map((e): [string, number] => [f.canon(e.key), e.value]);
    expire(m);
    expect(sortedEntries(actual)).toEqual(sortedEntries([...m.entries].map(([c, e]) => [c, e.value])));
    expect(map.size).toBe(m.entries.size);
    expect(expired).toEqual(m.expired);
  };
}

beforeEach(() => void vi.useFakeTimers());
afterEach(() => void vi.useRealTimers());

describe.each([ids, letters] as unknown as Family<unknown>[])("ttlMap over a $name", (f: Family<unknown>) => {
  it("follows a TTL model by the classes of the keys, with one expiry for each class", () => {
    runModel<TtlSut<unknown>, TtlModel>({
      create: () => {
        const expired: string[] = [];
        const map = ttlMap<unknown, number>({ ttl: TTL, checkInterval: 100_000, onExpire: ({ key }) => void expired.push(f.canon(key)) })(f.base());
        return { sut: { map, expired }, model: { entries: new Map(), expired: [] } };
      },
      steps: ttlSteps(f),
      check: checkTtl(f),
      dispose: ({ map }) => map.dispose(),
      maxSteps: 40,
      numRuns: 100,
    });
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// ttlCollection

describe("ttlCollection over a set with its own equality", () => {
  it.each([
    ["hashSet by id", () => hashSet<Id>({ eq: (a, b) => a.id === b.id, hash: (key) => key.id })],
    ["treeSet by id", () => treeSet<Id>({ compare: (a, b) => a.id - b.id })],
  ] as const)("%s: a remove with an equal element ends the time, so the next add has a new time", (_, make) => {
    const expired: number[] = [];
    const set = ttlCollection<Id>({ ttl: TTL, checkInterval: 1, onExpire: ({ element }) => void expired.push(element.id) })(
      make() as unknown as Collection<Id>,
    );
    set.add({ id: 1, tag: 0 });
    vi.advanceTimersByTime(TTL / 2);
    expect(set.remove({ id: 1, tag: 1 })).toBe(true);
    set.add({ id: 1, tag: 2 });
    // The first time ends here. It must not remove the element of the second add.
    vi.advanceTimersByTime(TTL / 2 + 1);
    expect(set.size).toBe(1);
    expect(expired).toEqual([]);
    vi.advanceTimersByTime(TTL);
    expect(set.size).toBe(0);
    expect(expired).toEqual([1]);
    set.dispose();
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// The key index

describe("keyIndex", () => {
  it("gives a JavaScript Map for the default equality", () => {
    expect(keyIndex<number, number>({})).toBeInstanceOf(Map);
  });

  // As in a JavaScript Map, a set of a key that is in the index keeps its place. ttlMap deletes a key before a new time.
  it.each([
    ["a comparator", { comparator: byCase }],
    ["an equality with no hash", { eq: (a: string, b: string) => lower(a) === lower(b) }],
  ] as const)("with %s keeps the place of a key that is set again", (_, equality) => {
    const index = keyIndex<string, number>(equality);
    for (const [i, k] of ["d", "b", "a", "c"].entries()) index.set(k, i);
    index.set("B", 9);
    expect([...index]).toEqual([["d", 0], ["b", 9], ["a", 2], ["c", 3]]);
    expect([...index.values()]).toEqual([0, 9, 2, 3]);
    expect(index.get("D")).toBe(0);
  });

  // The iteration of ttlMap deletes each expired key while it operates, as with a JavaScript Map
  it.each([
    ["a comparator", { comparator: byCase }],
    ["an equality with no hash", { eq: (a: string, b: string) => lower(a) === lower(b) }],
  ] as const)("with %s keeps the order of the first set through deletes in an iteration", (_, equality) => {
    const index = keyIndex<string, number>(equality);
    for (const [i, k] of ["d", "b", "a", "c"].entries()) index.set(k, i);
    index.set("B", 9);
    const seen: string[] = [];
    for (const [k] of index) {
      seen.push(k);
      index.delete(k);
      // The cell of "d" is out and keeps its next, "b". Then "b" goes too, so the iteration skips two cells.
      if (k === "d") index.delete("B");
    }
    expect(seen).toEqual(["d", "a", "c"]);
    expect(index.size).toBe(0);
  });
});
