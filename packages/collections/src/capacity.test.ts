/**
 * Tests of the capacity check, of the duration check and of `LRUCache.deleteWhere`.
 */

import fc from "fast-check";
import { afterEach, describe, expect, it } from "vitest";
import {
  arrayDeque,
  arrayList,
  boundedDeque,
  boundedList,
  boundedMap,
  boundedQueue,
  hashMap,
  LRUCache,
  lruCache,
  lruMap,
  TTLCache,
  ttlCache,
  ttlCollection,
  ttlMap,
} from "./index.js";

const BAD = [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1];

describe("the capacity check", () => {
  const makers: ReadonlyArray<readonly [string, (capacity: number) => unknown]> = [
    ["LRUCache", (capacity) => new LRUCache<string, number>(capacity)],
    ["lruCache", (capacity) => lruCache<string, number>(capacity)],
    ["lruMap", (capacity) => lruMap<string, number>({ capacity })],
    ["boundedList", (capacity) => boundedList<number>({ capacity })],
    ["boundedQueue", (capacity) => boundedQueue<number>({ capacity })],
    ["boundedDeque", (capacity) => boundedDeque<number>({ capacity })],
    ["boundedMap", (capacity) => boundedMap<string, number>({ capacity })],
  ];

  for (const [name, make] of makers) {
    it(`${name} throws RangeError for a capacity that is not a positive whole number`, () => {
      for (const capacity of BAD) {
        expect(() => make(capacity), String(capacity)).toThrow(RangeError);
      }
    });

    it(`${name} accepts each positive whole number`, () => {
      for (const capacity of [1, 2, 1000]) {
        expect(() => make(capacity)).not.toThrow();
      }
    });
  }

  it("a layer with a correct capacity still works", () => {
    const list = boundedList<number>({ capacity: 1 })(arrayList<number>());
    list.add(1);
    expect(list.isFull).toBe(true);
    const queue = boundedQueue<number>({ capacity: 1 })(arrayDeque<number>());
    queue.enqueue(1);
    expect(queue.isFull).toBe(true);
    const deque = boundedDeque<number>({ capacity: 1 })(arrayDeque<number>());
    deque.addLast(1);
    expect(deque.isFull).toBe(true);
    const map = lruMap<string, number>({ capacity: 1 })(hashMap<string, number>());
    map.set("a", 1);
    map.set("b", 2);
    expect([...map.keys()]).toEqual(["b"]);
  });

  it("an LRUCache of capacity 1 keeps the last key", () => {
    const cache = lruCache<string, number>(1);
    cache.set("a", 1);
    cache.set("b", 2);
    expect([...cache.keys()]).toEqual(["b"]);
  });
});

/** The durations that are not a number greater than 0 (C37). A `checkInterval` of 0 or `NaN` started the check each millisecond. */
const BAD_DURATIONS = [0, -1, -0.5, Number.NaN, Number.NEGATIVE_INFINITY, "10" as unknown as number];

describe("the duration check (C37)", () => {
  const disposers: Array<() => void> = [];
  const keep = <T extends { dispose: () => void }>(value: T): T => (disposers.push(() => value.dispose()), value);
  afterEach(() => {
    for (const dispose of disposers.splice(0)) dispose();
  });
  const makers: ReadonlyArray<readonly [string, (duration: number) => unknown]> = [
    ["ttlMap: ttl", (ttl) => keep(ttlMap<string, number>({ ttl })(hashMap<string, number>()))],
    ["ttlMap: checkInterval", (checkInterval) => keep(ttlMap<string, number>({ ttl: 10, checkInterval })(hashMap<string, number>()))],
    ["ttlCollection: ttl", (ttl) => keep(ttlCollection<number>({ ttl })(arrayList<number>()))],
    ["ttlCollection: checkInterval", (checkInterval) => keep(ttlCollection<number>({ ttl: 10, checkInterval })(arrayList<number>()))],
    ["TTLCache: ttl", (ttl) => keep(new TTLCache<string, number>(ttl))],
    ["TTLCache: checkInterval", (checkInterval) => keep(new TTLCache<string, number>(10, checkInterval))],
    ["ttlCache: ttl", (ttl) => keep(ttlCache<string, number>(ttl))],
    ["ttlCache: checkInterval", (checkInterval) => keep(ttlCache<string, number>(10, { checkInterval }))],
    ["TTLCache.set: customTTL", (customTTL) => keep(ttlCache<string, number>(10)).set("a", 1, customTTL)],
    ["TTLCache.touch: customTTL", (customTTL) => {
      const cache = keep(ttlCache<string, number>(10));
      cache.set("a", 1);
      return cache.touch("a", customTTL);
    }],
  ];

  for (const [name, make] of makers) {
    it(`${name} throws RangeError for a duration that is not a number greater than 0`, () => {
      for (const duration of BAD_DURATIONS) {
        expect(() => make(duration), String(duration)).toThrow(RangeError);
      }
      expect(() => make(0)).toThrow(/: the duration must be a number of milliseconds greater than 0, not 0$/);
    });

    it(`${name} accepts a fraction, a whole number and Infinity`, () => {
      for (const duration of [0.5, 1, 1000, Number.POSITIVE_INFINITY]) {
        expect(() => make(duration), String(duration)).not.toThrow();
      }
    });
  }

  it("a bad set or touch does not change the cache", () => {
    const cache = keep(ttlCache<string, number>(10));
    cache.set("a", 1);
    expect(() => cache.set("a", 2, 0)).toThrow(RangeError);
    expect(() => cache.touch("a", Number.NaN)).toThrow(RangeError);
    expect(cache.get("a")).toBe(1);
    expect(cache.getTTL("a")).toBeLessThanOrEqual(10);
  });

});

describe("LRUCache.deleteWhere", () => {
  it("deletes the matched entries and gives their number", () => {
    const cache = lruCache<string, number>(10);
    for (const [key, value] of [["a", 1], ["b", 2], ["c", 3], ["d", 4]] as const) cache.set(key, value);
    expect(cache.deleteWhere((value) => value % 2 === 0)).toBe(2);
    expect([...cache.entries()]).toEqual([["c", 3], ["a", 1]]);
    expect(cache.size).toBe(2);
    expect(cache.has("b")).toBe(false);
  });

  it("is not a use, and it does not call onEvict", () => {
    const evicted: string[] = [];
    const cache = lruCache<string, number>(3, (key) => evicted.push(key));
    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("c", 3);
    cache.deleteWhere((_, key) => key === "b");
    expect(evicted).toEqual([]);
    cache.set("d", 4);
    cache.set("e", 5);
    // The least recently used entry was "a", and it is still "a" after deleteWhere
    expect(evicted).toEqual(["a"]);
    expect([...cache.keys()]).toEqual(["e", "d", "c"]);
  });

  it("gives the key and the value, the most recent entry first", () => {
    const cache = lruCache<string, number>(5);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.get("a");
    const seen: Array<[string, number]> = [];
    expect(cache.deleteWhere((value, key) => (seen.push([key, value]), false))).toBe(0);
    expect(seen).toEqual([["a", 1], ["b", 2]]);
  });

  it("stays correct when matches changes the cache", () => {
    const cache = lruCache<string, number>(5);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("c", 3);
    // The visit order is c, b, a. At c, the function deletes b and sets b again with a new node.
    const count = cache.deleteWhere((_, key) => {
      if (key === "c") {
        cache.delete("b");
        cache.set("b", 20);
      }
      return key !== "a";
    });
    // The old node of b is gone, so the visit skips it. The new b came after the snapshot.
    expect(count).toBe(1);
    expect([...cache.entries()]).toEqual([["b", 20], ["a", 1]]);
  });

  it("counts an entry once when matches deletes that entry itself", () => {
    const cache = lruCache<string, number>(5);
    cache.set("a", 1);
    const count = cache.deleteWhere((_, key) => cache.delete(key));
    expect(count).toBe(0);
    expect(cache.size).toBe(0);
  });

  it("keeps the earlier deletes when matches throws", () => {
    const cache = lruCache<string, number>(5);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("c", 3);
    expect(() =>
      cache.deleteWhere((_, key) => {
        if (key === "a") throw new Error("stop");
        return true;
      })
    ).toThrow("stop");
    expect([...cache.keys()]).toEqual(["a"]);
  });

  it("equals a filter of the entries, and keeps their order (property)", () => {
    const op = fc.oneof(
      fc.record({ kind: fc.constant("set" as const), key: fc.integer({ min: 0, max: 9 }), value: fc.integer() }),
      fc.record({ kind: fc.constant("get" as const), key: fc.integer({ min: 0, max: 9 }) })
    );
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 6 }), fc.array(op, { maxLength: 40 }), fc.integer({ min: 2, max: 4 }), (capacity, ops, mod) => {
        const cache = lruCache<number, number>(capacity);
        for (const o of ops) {
          if (o.kind === "set") cache.set(o.key, o.value);
          else cache.get(o.key);
        }
        const before = [...cache.entries()];
        const matches = (value: number, key: number): boolean => (key + Math.abs(value)) % mod === 0;
        const kept = before.filter(([key, value]) => !matches(value, key));
        expect(cache.deleteWhere(matches)).toBe(before.length - kept.length);
        expect([...cache.entries()]).toEqual(kept);
        expect(cache.size).toBe(kept.length);
      })
    );
  });
});
