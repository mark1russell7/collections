/**
 * The members that a layer adds (regression: C41). A layer proxy that adds a member in its `get` trap also
 * gives it in its `has` trap, so the operator `in` and `hasCapability` agree with a read of the member.
 * An evented map gives its `set` event before a removal of the same key that the set caused.
 */

import { describe, it, expect } from "vitest";
import { compose, hasCapability, type Middleware } from "../core/middleware.js";
import { removals, removalSource, type MapRemoval } from "../core/removals.js";
import { arrayList } from "../impl/array-list.js";
import { arrayDeque } from "../impl/array-deque.js";
import { hashSet } from "../impl/hash-set.js";
import { hashMap } from "../impl/hash-map.js";
import { boundedList, boundedQueue, boundedDeque, boundedMap } from "../behaviors/bounded.js";
import { lruMap } from "../behaviors/lru.js";
import { ttlMap, ttlCollection } from "../behaviors/ttl.js";
import { evented, eventedList, eventedQueue, eventedDeque, eventedMap } from "../behaviors/evented.js";
import type { MapLike } from "../interfaces/map.js";

/** The members that the layers of the root add in their proxies. */
const members: readonly PropertyKey[] = ["on", "capacity", "isFull", "remainingCapacity", "dispose", removals];

/** Each layer of the root that adds members, over a base, with the members that it adds. */
const layers: readonly [string, () => object, readonly PropertyKey[]][] = [
  ["boundedList", () => boundedList<number>({ capacity: 2 })(arrayList<number>()), ["capacity", "isFull", "remainingCapacity", removals]],
  ["boundedQueue", () => boundedQueue<number>({ capacity: 2 })(arrayDeque<number>()), ["capacity", "isFull", "remainingCapacity", removals]],
  ["boundedDeque", () => boundedDeque<number>({ capacity: 2 })(arrayDeque<number>()), ["capacity", "isFull", "remainingCapacity", removals]],
  ["boundedMap", () => boundedMap<string, number>({ capacity: 2 })(hashMap<string, number>()), ["capacity", "isFull", "remainingCapacity", removals]],
  ["lruMap", () => lruMap<string, number>({ capacity: 2 })(hashMap<string, number>()), ["isFull", removals]],
  ["ttlMap", () => ttlMap<string, number>({ ttl: 1_000_000, checkInterval: 100_000 })(hashMap<string, number>()), ["dispose", removals]],
  ["ttlCollection", () => ttlCollection<number>({ ttl: 1_000_000, checkInterval: 100_000 })(hashSet<number>()), ["dispose", removals]],
  ["eventedList", () => eventedList<number>()(arrayList<number>()), ["on"]],
  ["eventedQueue", () => eventedQueue<number>()(arrayDeque<number>()), ["on"]],
  ["eventedDeque", () => eventedDeque<number>()(arrayDeque<number>()), ["on"]],
  ["eventedMap", () => eventedMap<string, number>()(hashMap<string, number>()), ["on"]],
  ["evented", () => evented<number>()(hashSet<number>()), ["on"]],
];

const dispose = (collection: object): void => {
  const close = Reflect.get(collection, "dispose");
  if (typeof close === "function") close.call(collection);
};

describe("the members that a layer adds (C41)", () => {
  for (const [name, make, added] of layers) {
    it(`${name}: in, hasCapability and a read agree on each member`, () => {
      const collection = make();
      try {
        for (const member of members) {
          const present = Reflect.get(collection, member) !== undefined;
          expect(member in collection, String(member)).toBe(present);
          expect(hasCapability(collection as never, member), String(member)).toBe(present);
        }
        for (const member of added) expect(member in collection, String(member)).toBe(true);
      } finally {
        dispose(collection);
      }
    });
  }

  it("sees each member of a stack of layers", () => {
    const list = compose(boundedList<number>({ capacity: 2 }), eventedList<number>())(arrayList<number>());
    for (const member of ["on", "capacity", "isFull", "remainingCapacity", removals]) {
      expect(member in list, String(member)).toBe(true);
      expect(hasCapability(list, member)).toBe(true);
    }
    expect(hasCapability(list, "dispose")).toBe(false);
  });

  it("gives true for the example of its doc comment", () => {
    const list = eventedList<number>()(arrayList<number>());
    const heard: number[] = [];
    if (hasCapability(list, "on")) list.on("add", ({ value }) => heard.push(value));
    list.add(1);
    expect(heard).toEqual([1]);
  });

  it("sees a member with the value undefined", () => {
    expect(hasCapability(arrayList<number>(), "first" as never)).toBe("first" in arrayList<number>());
    const base = Object.assign(arrayList<number>(), { note: undefined });
    expect(hasCapability(base, "note")).toBe(true);
  });
});

/** A layer below an evented map that keeps no key: each set adds the key, then removes it. */
const keepsNothing =
  <K, V>(): Middleware<MapLike<K, V>, MapLike<K, V>> =>
  (next) => {
    const source = removalSource<MapRemoval<K, V>>(next);
    return new Proxy(next, {
      has: (target, prop) => prop === removals || Reflect.has(target, prop),
      get(target, prop, receiver) {
        if (prop === removals) return source.channel;
        if (prop === "set") {
          return (key: K, value: V): V | undefined => {
            const old = target.set(key, value);
            target.delete(key);
            source.emit({ key, value, reason: "drop" });
            return old;
          };
        }
        return Reflect.get(target, prop, receiver);
      },
    });
  };

describe("eventedMap: the order of the set event and the removals of the set (C41)", () => {
  /** This function replays the events of a map into a plain Map. */
  const replay = (map: ReturnType<ReturnType<typeof eventedMap<string, number>>>): Map<string, number> => {
    const copy = new Map<string, number>();
    map.on("set", ({ key, value }) => void copy.set(key, value));
    map.on("delete", ({ key }) => void copy.delete(key));
    map.on("clear", () => copy.clear());
    return copy;
  };

  it("gives set, then the removal, when a layer below removes the key of the set", () => {
    const map = eventedMap<string, number>()(keepsNothing<string, number>()(hashMap<string, number>()));
    const log: string[] = [];
    map.on("set", ({ key }) => log.push(`set ${key}`));
    map.on("delete", ({ key, reason }) => log.push(`delete ${key} (${reason})`));
    const copy = replay(map);
    map.set("a", 1);
    map.set("b", 2);
    expect(log).toEqual(["set a", "delete a (drop)", "set b", "delete b (drop)"]);
    expect(map.size).toBe(0);
    expect([...copy]).toEqual([]);
  });

  it("keeps the removal of another key first: an eviction comes before the set", () => {
    const map = eventedMap<string, number>()(boundedMap<string, number>({ capacity: 1, policy: "drop-oldest" })(hashMap<string, number>()));
    const log: string[] = [];
    map.on("set", ({ key }) => log.push(`set ${key}`));
    map.on("delete", ({ key }) => log.push(`delete ${key}`));
    const copy = replay(map);
    map.set("a", 1);
    map.set("b", 2);
    expect(log).toEqual(["set a", "delete a", "set b"]);
    expect([...copy]).toEqual([...map].map(({ key, value }) => [key, value]));
  });
});
