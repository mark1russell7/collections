/**
 * Regression tests: lruMap over ttlMap (the cache middleware's composition), and the TTL timers.
 *
 * compose() applies right to left, so compose(lruMap, ttlMap)(base) is lru(ttl(base)).
 * When ttlMap expires an entry it deletes it from the layer below, and lruMap never sees it.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { fakeClock } from "@mark1russell7/algebra/clock";
import { arrayList, boundedList, boundedMap, compose, hashMap, lruMap, ttlCache, ttlMap, ttlCollection, TTLCache } from "./index.js";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("lruMap over ttlMap", () => {
  it("keeps the size within capacity after entries expire below it", () => {
    vi.useFakeTimers();
    const evicted: string[] = [];
    const ttl = ttlMap<string, number>({ ttl: 100, checkInterval: 50 });
    const map = compose(
      lruMap<string, number>({ capacity: 2, onEvict: ({ key }) => evicted.push(key) }),
      ttl
    )(hashMap<string, number>());

    map.set("a", 1);
    map.set("b", 2);
    vi.advanceTimersByTime(150); // the background check expires "a" and "b"

    map.set("c", 3);
    map.set("d", 4);
    map.set("e", 5); // full: must evict a live entry ("c"), not the expired "a"

    expect(map.size).toBe(2);
    expect(map.has("c")).toBe(false);
    expect(map.has("d")).toBe(true);
    expect(map.has("e")).toBe(true);
    // Expired entries are not evictions
    expect(evicted).toEqual(["c"]);
    (map as unknown as { dispose: () => void }).dispose();
  });

  it("does not keep nodes for expired entries (bounded memory under churn)", () => {
    vi.useFakeTimers();
    const evicted: string[] = [];
    const map = compose(
      lruMap<string, number>({ capacity: 3, onEvict: ({ key }) => evicted.push(key) }),
      ttlMap<string, number>({ ttl: 10, checkInterval: 5 })
    )(hashMap<string, number>());

    // Many short-lived keys: each expires before the next one arrives
    for (let i = 0; i < 1000; i++) {
      map.set(`k${i}`, i);
      vi.advanceTimersByTime(20);
    }
    map.set("x", 1);
    map.set("y", 2);
    map.set("z", 3);
    map.set("w", 4); // full: evicts "x", the least recently used live entry

    expect(map.size).toBe(3);
    expect(evicted).toEqual(["x"]);
    (map as unknown as { dispose: () => void }).dispose();
  });

  it("forgets a node when has() finds the entry expired", () => {
    vi.useFakeTimers();
    const evicted: string[] = [];
    const map = compose(
      lruMap<string, number>({ capacity: 2, onEvict: ({ key }) => evicted.push(key) }),
      ttlMap<string, number>({ ttl: 100, checkInterval: 10_000 })
    )(hashMap<string, number>());

    map.set("a", 1);
    vi.advanceTimersByTime(150);
    expect(map.has("a")).toBe(false);

    map.set("b", 2);
    map.set("c", 3);
    map.set("d", 4); // evicts "b", not the long-gone "a"

    expect(evicted).toEqual(["b"]);
    expect(map.size).toBe(2);
    (map as unknown as { dispose: () => void }).dispose();
  });
});

describe("TTL timers", () => {
  // The default clock starts each check with setTimeout, and unrefs it
  function captureInterval(): { unref: ReturnType<typeof vi.fn> } {
    const timer = { unref: vi.fn() };
    vi.spyOn(globalThis, "setTimeout").mockReturnValue(timer as unknown as ReturnType<typeof setTimeout>);
    vi.spyOn(globalThis, "clearTimeout").mockImplementation(() => undefined);
    return timer;
  }

  it("ttlMap does not keep the process alive", () => {
    const timer = captureInterval();
    ttlMap<string, number>({ ttl: 1000 })(hashMap<string, number>());
    expect(timer.unref).toHaveBeenCalled();
  });

  it("ttlCollection does not keep the process alive", () => {
    const timer = captureInterval();
    const base = { add: () => true, remove: () => true } as never;
    ttlCollection<string>({ ttl: 1000 })(base);
    expect(timer.unref).toHaveBeenCalled();
  });

  it("TTLCache does not keep the process alive", () => {
    const timer = captureInterval();
    new TTLCache<string, number>(1000);
    expect(timer.unref).toHaveBeenCalled();
  });
});

describe("the clock of the TTL behaviors (D5)", () => {
  it("ttlMap expires an entry at the time of the clock, with no access", async () => {
    const clock = fakeClock(1000);
    const expired: Array<{ key: string; createdAt: number; expiredAt: number }> = [];
    const base = hashMap<string, number>();
    const map = ttlMap<string, number>({
      ttl: 50,
      checkInterval: 10,
      clock,
      onExpire: ({ key, createdAt, expiredAt }) => expired.push({ key, createdAt, expiredAt }),
    })(base);

    map.set("a", 1);
    await clock.advance(49);
    expect(base.has("a")).toBe(true);
    expect(expired).toEqual([]);

    // The check at 1050 finds the end of the time of "a"
    await clock.advance(1);
    expect(base.has("a")).toBe(false);
    expect(expired).toEqual([{ key: "a", createdAt: 1000, expiredAt: 1050 }]);

    map.dispose();
    expect(clock.pending).toBe(0);
  });

  it("ttlMap checks again after an onExpire that throws", async () => {
    const clock = fakeClock();
    let first = true;
    const base = hashMap<string, number>();
    const map = ttlMap<string, number>({
      ttl: 10,
      checkInterval: 10,
      clock,
      onExpire: () => {
        if (first) {
          first = false;
          throw new Error("the listener broke");
        }
      },
    })(base);

    map.set("a", 1);
    map.set("b", 2);
    await expect(clock.advance(10)).rejects.toThrow("the listener broke");
    expect(base.has("a")).toBe(false);
    expect(base.has("b")).toBe(true);
    expect(clock.pending).toBe(1);

    await clock.advance(10);
    expect(base.has("b")).toBe(false);
    map.dispose();
  });

  it("an interval less than 1 ms checks each millisecond", async () => {
    const clock = fakeClock();
    const base = hashMap<string, number>();
    const map = ttlMap<string, number>({ ttl: 5, checkInterval: 0, clock })(base);

    map.set("a", 1);
    await clock.advance(5);
    expect(base.has("a")).toBe(false);
    map.dispose();
    expect(clock.pending).toBe(0);
  });

  it("ttlCollection expires an element at the time of the clock", async () => {
    const clock = fakeClock(200);
    const expired: Array<{ element: string; createdAt: number; expiredAt: number }> = [];
    const base = arrayList<string>();
    const list = ttlCollection<string>({ ttl: 30, checkInterval: 10, clock, onExpire: (info) => expired.push(info) })(base);

    list.add("x");
    await clock.advance(29);
    expect(base.contains("x")).toBe(true);
    await clock.advance(1);
    expect(base.contains("x")).toBe(false);
    expect(expired).toEqual([{ element: "x", createdAt: 200, expiredAt: 230 }]);

    list.dispose();
    expect(clock.pending).toBe(0);
  });

  it("TTLCache and ttlCache read the time of the clock", async () => {
    const clock = fakeClock();
    const cache = ttlCache<string, number>(100, { checkInterval: 1000, clock });

    cache.set("a", 1);
    await clock.advance(60);
    expect(cache.getTTL("a")).toBe(40);
    expect(cache.touch("a")).toBe(true);
    expect(cache.getTTL("a")).toBe(100);
    await clock.advance(99);
    expect(cache.get("a")).toBe(1);
    await clock.advance(1);
    expect(cache.get("a")).toBeUndefined();

    const expired: string[] = [];
    const direct = new TTLCache<string, number>(10, 5, (key) => expired.push(key), clock);
    direct.set("b", 2);
    await clock.advance(10);
    expect(expired).toEqual(["b"]);

    cache.dispose();
    direct.dispose();
    expect(clock.pending).toBe(0);
  });
});

describe("the clock of the LRU and bounded behaviors (D5)", () => {
  it("lruMap gives the last access time of the clock to onEvict", async () => {
    const clock = fakeClock(100);
    const evicted: Array<{ key: string; timestamp: number }> = [];
    const map = lruMap<string, number>({ capacity: 2, clock, onEvict: ({ key, timestamp }) => evicted.push({ key, timestamp }) })(
      hashMap<string, number>(),
    );
    map.set("a", 1);
    await clock.advance(10);
    map.set("b", 2);
    await clock.advance(10);
    map.get("a");
    await clock.advance(10);
    map.set("c", 3);
    // "b" is the least recent entry, and the clock read 110 at its last access.
    expect(evicted).toEqual([{ key: "b", timestamp: 110 }]);
  });

  it("boundedList and boundedMap give the time of the clock to onOverflow", async () => {
    const clock = fakeClock(500);
    const times: number[] = [];
    const list = boundedList<number>({ capacity: 1, policy: "drop-newest", clock, onOverflow: ({ timestamp }) => void times.push(timestamp) })(
      arrayList<number>(),
    );
    const map = boundedMap<string, number>({ capacity: 1, policy: "drop-newest", clock, onOverflow: ({ timestamp }) => void times.push(timestamp) })(
      hashMap<string, number>(),
    );
    list.add(1);
    map.set("a", 1);
    await clock.advance(25);
    list.add(2);
    map.set("b", 2);
    expect(times).toEqual([525, 525]);
  });
});
