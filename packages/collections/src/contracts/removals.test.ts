/**
 * The laws of the removal channel (C23).
 *
 * - Each removing layer sends each removal that it makes by itself, with its value and its reason. It does not
 *   send a removal that a caller makes.
 * - Each layer that does not remove forwards the channel below it.
 * - A removing layer corrects its own state on a removal below it.
 * - An evented layer above a removing layer gives events whose replay is the contents, with each overflow policy.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fc from "fast-check";
import { compose } from "../core/middleware.js";
import { removalsOf, type ElementRemoval, type MapRemoval } from "../core/removals.js";
import type { OverflowPolicy } from "../core/policies.js";
import { arrayList } from "../impl/array-list.js";
import { arrayDeque } from "../impl/array-deque.js";
import { hashSet } from "../impl/hash-set.js";
import { hashMap } from "../impl/hash-map.js";
import { boundedList, boundedQueue, boundedDeque, boundedMap } from "../behaviors/bounded.js";
import { lruMap } from "../behaviors/lru.js";
import { ttlMap, ttlCollection } from "../behaviors/ttl.js";
import { eventedList, eventedQueue, eventedDeque, eventedMap } from "../behaviors/evented.js";
import { safeMap } from "../behaviors/safe.js";
import { readonlyMap } from "../behaviors/readonly.js";
import { synchronized, reentrantSynchronized, readWriteLock } from "../behaviors/synchronized.js";
import type { List } from "../interfaces/list.js";
import type { Queue, Deque } from "../interfaces/queue.js";
import type { MapLike } from "../interfaces/map.js";
import { runModel, step, type Step } from "./model.js";

const TTL = 10;

beforeEach(() => void vi.useFakeTimers());
afterEach(() => void vi.useRealTimers());

/** This function records each removal of the channel of a layer. */
function record<R>(layer: object): R[] {
  const heard: R[] = [];
  const channel = removalsOf<R>(layer);
  expect(channel).toBeDefined();
  channel!.on((removal) => void heard.push(removal));
  return heard;
}

describe("the removal channel of each removing layer", () => {
  it("boundedList sends each drop, with the end of the drop", () => {
    const list = boundedList<number>({ capacity: 2, policy: "drop-oldest" })(arrayList<number>());
    const heard = record<ElementRemoval<number>>(list);
    list.push(1);
    list.push(2);
    list.push(3);
    list.unshift(0);
    list.shift();
    expect(heard).toEqual([
      { value: 1, end: "first", reason: "drop" },
      { value: 3, end: "last", reason: "drop" },
    ]);
  });

  it("boundedQueue sends each drop", () => {
    const queue = boundedQueue<number>({ capacity: 2, policy: "drop-oldest" })(arrayDeque<number>());
    const heard = record<ElementRemoval<number>>(queue);
    queue.offer(1);
    queue.offer(2);
    queue.enqueue(3);
    queue.poll();
    expect(heard).toEqual([{ value: 1, end: "first", reason: "drop" }]);
  });

  it("boundedDeque sends each drop, with the end of the drop", () => {
    const deque = boundedDeque<number>({ capacity: 2, policy: "drop-oldest" })(arrayDeque<number>());
    const heard = record<ElementRemoval<number>>(deque);
    deque.addLast(1);
    deque.addLast(2);
    deque.enqueue(3);
    deque.addFirst(0);
    deque.removeLast();
    expect(heard).toEqual([
      { value: 1, end: "first", reason: "drop" },
      { value: 3, end: "last", reason: "drop" },
    ]);
    expect(deque.size).toBe(1);
  });

  it("boundedMap sends each drop", () => {
    const map = boundedMap<string, number>({ capacity: 2, policy: "drop-oldest" })(hashMap<string, number>());
    const heard = record<MapRemoval<string, number>>(map);
    map.set("a", 1);
    map.set("b", 2);
    map.set("a", 3);
    map.set("c", 4);
    map.delete("b");
    expect(heard).toEqual([{ key: "a", value: 3, reason: "drop" }]);
  });

  it("lruMap sends each eviction", () => {
    const map = lruMap<string, number>({ capacity: 2 })(hashMap<string, number>());
    const heard = record<MapRemoval<string, number>>(map);
    map.set("a", 1);
    map.set("b", 2);
    map.get("a");
    map.set("c", 3);
    map.delete("a");
    expect(heard).toEqual([{ key: "b", value: 2, reason: "evict" }]);
  });

  it("ttlMap sends each expiry, also a lazy one", () => {
    const map = ttlMap<string, number>({ ttl: TTL, checkInterval: 1000 })(hashMap<string, number>());
    const heard = record<MapRemoval<string, number>>(map);
    map.set("a", 1);
    map.set("b", 2);
    map.delete("b");
    vi.advanceTimersByTime(TTL);
    expect(map.has("a")).toBe(false);
    expect(heard).toEqual([{ key: "a", value: 1, reason: "expire" }]);
    map.dispose();
  });

  it("ttlCollection sends each expiry, with no end", () => {
    const set = ttlCollection<number>({ ttl: TTL, checkInterval: 1 })(hashSet<number>());
    const heard = record<ElementRemoval<number>>(set);
    set.add(1);
    vi.advanceTimersByTime(TTL);
    expect(heard).toEqual([{ value: 1, reason: "expire" }]);
    set.dispose();
  });

  it("a collection with no removing layer has no channel", () => {
    expect(removalsOf(hashMap())).toBeUndefined();
    expect(removalsOf(eventedMap()(hashMap()))).toBeUndefined();
  });
});

describe("a layer that does not remove forwards the channel below it", () => {
  const layers: [string, (map: MapLike<string, number>) => object][] = [
    ["safeMap", (m) => safeMap<string, number>()(m)],
    ["readonlyMap", (m) => readonlyMap<string, number>()(m)],
    ["synchronized", (m) => synchronized<MapLike<string, number>>()(m)],
    ["reentrantSynchronized", (m) => reentrantSynchronized<MapLike<string, number>>()(m)],
    ["readWriteLock", (m) => readWriteLock<MapLike<string, number>>()(m)],
    ["eventedMap", (m) => eventedMap<string, number>()(m)],
  ];
  it.each(layers)("%s", (_, layer) => {
    const lru = lruMap<string, number>({ capacity: 1 })(hashMap<string, number>());
    const heard = record<MapRemoval<string, number>>(layer(lru));
    lru.set("a", 1);
    lru.set("b", 2);
    expect(heard).toEqual([{ key: "a", value: 1, reason: "evict" }]);
  });
});

describe("a removing layer corrects its state on a removal below it", () => {
  // Before 0.9.0 the oldest key of the order was gone, so the drop removed nothing and the size passed the capacity
  it("boundedMap over ttlMap drops a live key and keeps its capacity", () => {
    const ttl = ttlMap<string, number>({ ttl: TTL, checkInterval: 1000 })(hashMap<string, number>());
    const map = boundedMap<string, number>({ capacity: 2, policy: "drop-oldest" })(ttl);
    const heard = record<MapRemoval<string, number>>(map);
    map.set("a", 1);
    vi.advanceTimersByTime(5);
    map.set("b", 2);
    vi.advanceTimersByTime(5);
    map.set("c", 3);
    map.set("d", 4);
    expect(map.size).toBe(2);
    expect([...map.keys()].sort()).toEqual(["c", "d"]);
    expect(heard).toEqual([
      { key: "a", value: 1, reason: "expire" },
      { key: "b", value: 2, reason: "drop" },
    ]);
    ttl.dispose();
  });

  // A removal that no channel tells (here a delete on the base itself) leaves a gone key in the order
  it("boundedMap skips a gone key at a drop", () => {
    const base = hashMap<string, number>();
    const map = boundedMap<string, number>({ capacity: 2, policy: "drop-oldest" })(base);
    map.set("a", 1);
    map.set("b", 2);
    base.delete("a");
    map.set("c", 3);
    map.set("d", 4);
    expect(map.size).toBe(2);
    expect([...map.keys()].sort()).toEqual(["c", "d"]);
  });

  // Without the channel, the order of boundedMap kept each expired key: it grew without bound, and each delete read it
  it("boundedMap over ttlMap keeps no expired key in its order", () => {
    const base = hashMap<number, number>();
    let calls = 0;
    const keyEq = base.keyEq;
    Object.defineProperty(base, "keyEq", { value: (a: number, b: number) => (calls++, keyEq(a, b)), configurable: true, writable: true });
    const ttl = ttlMap<number, number>({ ttl: 5, checkInterval: 100_000 })(base);
    const map = boundedMap<number, number>({ capacity: 10, policy: "drop-oldest" })(ttl);
    for (let i = 0; i < 3000; i++) {
      map.set(i, i);
      vi.advanceTimersByTime(1);
    }
    calls = 0;
    map.delete(2999);
    // An order with the 3000 expired keys costs thousands of calls. Since 0.11.0 the key index of ttlMap also uses keyEq.
    expect(calls).toBeLessThanOrEqual(20);
    ttl.dispose();
  });

  // Before 0.9.0 ttlMap kept the time of an evicted key, and gave it to onExpire later
  it("ttlMap over lruMap gives no expiry for an evicted entry", () => {
    const expired: string[] = [];
    const map = compose(
      ttlMap<string, number>({ ttl: TTL, checkInterval: 1, onExpire: ({ key }) => void expired.push(key) }),
      lruMap<string, number>({ capacity: 1 }),
    )(hashMap<string, number>());
    const heard = record<MapRemoval<string, number>>(map);
    map.set("a", 1);
    map.set("b", 2);
    vi.advanceTimersByTime(TTL);
    expect(expired).toEqual(["b"]);
    expect(heard).toEqual([
      { key: "a", value: 1, reason: "evict" },
      { key: "b", value: 2, reason: "expire" },
    ]);
    map.dispose();
  });

  it("ttlCollection over boundedList gives no expiry for a dropped element", () => {
    const expired: number[] = [];
    const list = boundedList<number>({ capacity: 1, policy: "drop-oldest" })(arrayList<number>());
    const set = ttlCollection<number>({ ttl: TTL, checkInterval: 1, onExpire: ({ element }) => void expired.push(element) })(list);
    set.add(1);
    set.add(2);
    vi.advanceTimersByTime(TTL);
    expect(expired).toEqual([2]);
    set.dispose();
  });
});

describe("lruMap over a removal that no channel tells", () => {
  // Here a delete on the base itself: a user's own layer with no channel does the same
  it("skips a gone node at an eviction, so it keeps its capacity", () => {
    const base = hashMap<string, number>();
    const lru = lruMap<string, number>({ capacity: 2 })(base);
    const heard = record<MapRemoval<string, number>>(lru);
    lru.set("a", 1);
    lru.set("b", 2);
    base.delete("a");
    lru.set("c", 3);
    lru.set("d", 4);
    expect(lru.size).toBe(2);
    expect([...lru.keys()].sort()).toEqual(["c", "d"]);
    expect(heard).toEqual([{ key: "b", value: 2, reason: "evict" }]);
  });

  // Without the removal of the gone node at the set, the old node of "a" stays at the tail, and the eviction takes the new "a"
  it("forgets the gone node of a key that comes back", () => {
    const base = hashMap<string, number>();
    const lru = lruMap<string, number>({ capacity: 2 })(base);
    const heard = record<MapRemoval<string, number>>(lru);
    lru.set("a", 1);
    lru.set("b", 2);
    base.delete("a");
    lru.set("a", 3);
    lru.set("c", 4);
    expect([...lru.keys()].sort()).toEqual(["a", "c"]);
    expect(heard).toEqual([{ key: "b", value: 2, reason: "evict" }]);
  });

  // Without the scan at twice the capacity, the 3000 gone nodes stay, and the next eviction reads each of them
  it.each([10, 100])("keeps at most twice the capacity of nodes (capacity %i)", (capacity) => {
    const base = hashMap<number, number>();
    let calls = 0;
    const has = base.has.bind(base);
    (base as { has: (k: number) => boolean }).has = (k) => (calls++, has(k));
    const lru = lruMap<number, number>({ capacity })(base);
    for (let i = 0; i < 3000; i++) {
      lru.set(i, i);
      base.delete(i);
    }
    for (let i = 0; i < capacity; i++) lru.set(-1 - i, i);
    calls = 0;
    lru.set(-1 - capacity, 0);
    expect(calls).toBeLessThanOrEqual(4 * capacity + 3);
    expect(lru.size).toBe(capacity);
  });
});

describe("the cost of lruMap over ttlMap", () => {
  /** This function counts the calls of `has` of the base. */
  function counted(): { base: MapLike<number, number>; calls: () => number; reset: () => void } {
    const base = hashMap<number, number>();
    let calls = 0;
    const has = base.has.bind(base);
    (base as { has: (k: number) => boolean }).has = (k) => (calls++, has(k));
    return { base, calls: () => calls, reset: () => void (calls = 0) };
  }

  // Without the channel, lruMap kept the node of each expired entry, and read each node at each 2 x capacity nodes
  it.each([10, 100, 1000])("uses one call of the base for a set when entries expire as fast as they come (capacity %i)", (capacity) => {
    const { base, calls, reset } = counted();
    const ttl = ttlMap<number, number>({ ttl: 5, checkInterval: 100_000 })(base);
    const lru = lruMap<number, number>({ capacity })(ttl);
    reset();
    for (let i = 0; i < 3000; i++) {
      lru.set(i, i);
      vi.advanceTimersByTime(1);
    }
    expect(calls() / 3000).toBeLessThanOrEqual(1.2);
    ttl.dispose();
  });

  it.each([10, 100, 1000])("uses a constant number of calls of the base for a set into a full map (capacity %i)", (capacity) => {
    const { base, calls, reset } = counted();
    const ttl = ttlMap<number, number>({ ttl: 1_000_000, checkInterval: 100_000 })(base);
    const lru = lruMap<number, number>({ capacity })(ttl);
    for (let i = 0; i < capacity; i++) lru.set(i, i);
    reset();
    for (let i = capacity; i < capacity + 1000; i++) lru.set(i, i);
    expect(calls() / 1000).toBeLessThanOrEqual(3);
    expect(lru.size).toBe(capacity);
    ttl.dispose();
  });
});

const POLICIES: OverflowPolicy[] = ["drop-oldest", "drop-newest", "reject", "throw", "grow"];
const CAPACITY = 3;
const value = fc.integer({ min: 0, max: 5 });

/** This function makes a step that calls the layer. A throw (the policy "throw" or an empty collection) is a refusal. */
function attempt<S>(label: string, run: (sut: S) => void): Step<{ sut: S; replay: unknown[] }, null> {
  return step(label, ({ sut }) => {
    try {
      run(sut);
    } catch {
      // The layer refused the call: its events must show no change
    }
  });
}

type Replay<S> = { sut: S; replay: unknown[] };

/** This function runs random steps and checks after each step that the replay of the events is the contents. */
function replayLaw<S extends Iterable<unknown> & { readonly size: number }>(
  make: () => S,
  listen: (sut: S, replay: unknown[]) => void,
  steps: fc.Arbitrary<Step<Replay<S>, null>>,
  grow: boolean,
): void {
  runModel<Replay<S>, null>({
    create: () => {
      const sut = make();
      const replay: unknown[] = [];
      listen(sut, replay);
      return { sut: { sut, replay }, model: null };
    },
    steps,
    check: ({ sut, replay }) => {
      expect(replay).toEqual([...sut]);
      if (!grow) expect(sut.size).toBeLessThanOrEqual(CAPACITY);
    },
    maxSteps: 40,
    numRuns: 60,
  });
}

type EventedList = List<number> & { on(event: string, listener: (p: any) => void): () => void };
type EventedQueue = Queue<number> & { on(event: string, listener: (p: any) => void): () => void };
type EventedDeque = Deque<number> & { on(event: string, listener: (p: any) => void): () => void };

describe("an evented layer above a bounded layer gives events whose replay is the contents", () => {
  const at = (n: number, size: number): number => (size === 0 ? 0 : n % (size + 1));
  const listSteps: fc.Arbitrary<Step<Replay<EventedList>, null>> = fc.oneof(
    value.map((v) => attempt<EventedList>(`push(${v})`, (l) => l.push(v))),
    value.map((v) => attempt<EventedList>(`add(${v})`, (l) => void l.add(v))),
    value.map((v) => attempt<EventedList>(`unshift(${v})`, (l) => l.unshift(v))),
    fc.tuple(fc.nat(9), value).map(([i, v]) => attempt<EventedList>(`insert(${i}, ${v})`, (l) => l.insert(at(i, l.size), v))),
    fc.constant(attempt<EventedList>("shift()", (l) => void l.shift())),
    fc.constant(attempt<EventedList>("pop()", (l) => void l.pop())),
    fc.nat(9).map((i) => attempt<EventedList>(`removeAt(${i})`, (l) => void l.removeAt(i % Math.max(1, l.size)))),
    value.map((v) => attempt<EventedList>(`remove(${v})`, (l) => void l.remove(v))),
    fc.constant(attempt<EventedList>("clear()", (l) => l.clear())),
  );
  it.each(POLICIES)("eventedList over boundedList (%s)", (policy) => {
    replayLaw<EventedList>(
      () => compose(eventedList<number>(), boundedList<number>({ capacity: CAPACITY, policy }))(arrayList<number>()) as unknown as EventedList,
      (sut, replay) => {
        sut.on("add", ({ value: v, index }) => void (index === undefined ? replay.push(v) : replay.splice(index, 0, v)));
        sut.on("remove", ({ value: v, index }) => {
          const i = index ?? replay.indexOf(v);
          expect(replay[i]).toBe(v);
          replay.splice(i, 1);
        });
        sut.on("clear", () => void replay.splice(0));
      },
      listSteps,
      policy === "grow",
    );
  });

  const queueSteps: fc.Arbitrary<Step<Replay<EventedQueue>, null>> = fc.oneof(
    value.map((v) => attempt<EventedQueue>(`offer(${v})`, (q) => void q.offer(v))),
    value.map((v) => attempt<EventedQueue>(`enqueue(${v})`, (q) => void q.enqueue(v))),
    value.map((v) => attempt<EventedQueue>(`add(${v})`, (q) => void q.add(v))),
    fc.constant(attempt<EventedQueue>("poll()", (q) => void (q.size > 0 && q.poll()))),
    fc.constant(attempt<EventedQueue>("dequeue()", (q) => void (q.size > 0 && q.dequeue()))),
    fc.constant(attempt<EventedQueue>("clear()", (q) => q.clear())),
  );
  it.each(POLICIES)("eventedQueue over boundedQueue (%s)", (policy) => {
    replayLaw<EventedQueue>(
      () => compose(eventedQueue<number>(), boundedQueue<number>({ capacity: CAPACITY, policy }))(arrayDeque<number>()) as unknown as EventedQueue,
      (sut, replay) => {
        sut.on("enqueue", ({ value: v }) => void replay.push(v));
        sut.on("dequeue", ({ value: v }) => expect(replay.shift()).toBe(v));
        sut.on("clear", () => void replay.splice(0));
      },
      queueSteps,
      policy === "grow",
    );
  });

  const dequeSteps: fc.Arbitrary<Step<Replay<EventedDeque>, null>> = fc.oneof(
    ...(["addFirst", "addLast", "offerFirst", "offerLast", "offer", "enqueue", "add", "push"] as const).map((name) =>
      value.map((v) => attempt<EventedDeque>(`${name}(${v})`, (d) => void (d[name] as (e: number) => unknown)(v))),
    ),
    ...(["removeFirst", "removeLast", "pollFirst", "pollLast", "poll", "dequeue", "pop"] as const).map((name) =>
      fc.constant(attempt<EventedDeque>(`${name}()`, (d) => void (d.size > 0 && (d[name] as () => unknown)()))),
    ),
    fc.constant(attempt<EventedDeque>("clear()", (d) => d.clear())),
  );
  it.each(POLICIES)("eventedDeque over boundedDeque (%s)", (policy) => {
    replayLaw<EventedDeque>(
      () => compose(eventedDeque<number>(), boundedDeque<number>({ capacity: CAPACITY, policy }))(arrayDeque<number>()) as unknown as EventedDeque,
      (sut, replay) => {
        sut.on("addFirst", ({ value: v }) => void replay.unshift(v));
        sut.on("addLast", ({ value: v }) => void replay.push(v));
        sut.on("removeFirst", ({ value: v }) => expect(replay.shift()).toBe(v));
        sut.on("removeLast", ({ value: v }) => expect(replay.pop()).toBe(v));
        sut.on("clear", () => void replay.splice(0));
      },
      dequeSteps,
      policy === "grow",
    );
  });
});
