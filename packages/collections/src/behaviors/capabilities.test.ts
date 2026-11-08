import { describe, expect, it } from "vitest";
import { hasCapability } from "../core/middleware.js";
import { arrayDeque } from "../impl/array-deque.js";
import { arrayList } from "../impl/array-list.js";
import { hashMap } from "../impl/hash-map.js";
import { bounded, boundedDeque, boundedList, boundedMap, boundedQueue } from "./bounded.js";
import { evented, eventedDeque, eventedList, eventedMap, eventedQueue } from "./evented.js";
import { lruMap } from "./lru.js";
import { ttlCollection, ttlMap } from "./ttl.js";

// C10: the layers added their keys in the get trap only, so `"on" in eventedList()(base)` was false.

const BOUNDED = ["capacity", "isFull", "remainingCapacity"] as const;
const EVERY = ["on", ...BOUNDED, "dispose"] as const;

/** A layer of the law: its name, a base collection, the layer, and the keys that the layer adds. */
interface Case {
  readonly name: string;
  readonly base: () => object;
  readonly layer: (base: never) => object;
  readonly keys: readonly string[];
}

const CASES: readonly Case[] = [
  { name: "eventedList", base: () => arrayList<number>(), layer: eventedList<number>(), keys: ["on"] },
  { name: "eventedQueue", base: () => arrayDeque<number>(), layer: eventedQueue<number>(), keys: ["on"] },
  { name: "eventedDeque", base: () => arrayDeque<number>(), layer: eventedDeque<number>(), keys: ["on"] },
  { name: "eventedMap", base: () => hashMap<string, number>(), layer: eventedMap<string, number>(), keys: ["on"] },
  { name: "evented", base: () => arrayList<number>(), layer: evented<number>(), keys: ["on"] },
  { name: "boundedList", base: () => arrayList<number>(), layer: boundedList<number>({ capacity: 2 }), keys: BOUNDED },
  { name: "boundedQueue", base: () => arrayDeque<number>(), layer: boundedQueue<number>({ capacity: 2 }), keys: BOUNDED },
  { name: "boundedDeque", base: () => arrayDeque<number>(), layer: boundedDeque<number>({ capacity: 2 }), keys: BOUNDED },
  { name: "boundedMap", base: () => hashMap<string, number>(), layer: boundedMap<string, number>({ capacity: 2 }), keys: BOUNDED },
  { name: "bounded", base: () => arrayList<number>(), layer: bounded({ capacity: 2 }), keys: BOUNDED },
  { name: "lruMap", base: () => hashMap<string, number>(), layer: lruMap<string, number>({ capacity: 2 }), keys: ["isFull"] },
  { name: "ttlMap", base: () => hashMap<string, number>(), layer: ttlMap<string, number>({ ttl: 1000 }), keys: ["dispose"] },
  { name: "ttlCollection", base: () => arrayList<number>(), layer: ttlCollection<number>({ ttl: 1000 }), keys: ["dispose"] },
];

/** This function stops the timer of a TTL layer, so the test leaves no interval. */
const close = (collection: object): void => {
  if ("dispose" in collection && typeof collection.dispose === "function") collection.dispose();
};

describe("the keys that a layer adds", () => {
  it.each(CASES)("$name: each added key is in the collection, and each other key is in it only if it is in the base", ({ base, layer, keys }) => {
    const below = base();
    const collection = layer(below as never);
    try {
      for (const key of keys) {
        expect(key in collection, key).toBe(true);
        expect(hasCapability(collection as never, key), key).toBe(true);
        expect(Reflect.get(collection, key), key).not.toBeUndefined();
      }
      for (const key of EVERY.filter((k) => !keys.includes(k))) expect(key in collection, key).toBe(key in below);
      expect("size" in collection).toBe(true);
    } finally {
      close(collection);
    }
  });

  it("keeps the keys of each layer of a stack", () => {
    const collection = eventedList<number>()(boundedList<number>({ capacity: 2 })(arrayList<number>()));
    for (const key of ["on", ...BOUNDED]) expect(key in collection, key).toBe(true);
  });
});
