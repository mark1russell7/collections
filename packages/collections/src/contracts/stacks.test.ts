/**
 * The laws of stacks of layers (C10): each stack against one model that has the rules of each of its layers.
 *
 * `lruMap` over `ttlMap` (the stack of a cache):
 * - An entry expires `ttl` after its last `set`. An expired entry is not an eviction, and it frees a place.
 * - A `set` of a new key into a full map evicts the least recent live key. `get` and `set` are a use. `has` is not a use (C37).
 * - `onExpire` and `onEvict` occur one time for each removal, in their order.
 *
 * `eventedMap` at the bottom of a stack (next to the base):
 * - A replay of its events on an empty map gives the entries of the stack. Each drop, eviction and expiry of a
 *   layer above it goes through it as a `delete`. Above a layer that removes entries, it does not see them (C23).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fc from "fast-check";
import { compose } from "../core/middleware.js";
import { hashMap } from "../impl/hash-map.js";
import { linkedHashMap } from "../impl/linked-hash-map.js";
import { treeMap } from "../impl/tree-map.js";
import { lruMap } from "../behaviors/lru.js";
import { ttlMap } from "../behaviors/ttl.js";
import { boundedMap } from "../behaviors/bounded.js";
import { eventedMap } from "../behaviors/evented.js";
import type { MapLike } from "../interfaces/map.js";
import { runModel, step, type Step } from "@mark1russell7/rigor-testkit/model";

const TTL = 10;

type Removal = [key: number, value: string];
type Cache = MapLike<number, string> & { readonly isFull: boolean };
type S = { sut: Cache; dispose: () => void; expired: Removal[]; evicted: Removal[] };
interface Live {
  readonly value: string;
  readonly createdAt: number;
  /** The number of the `set`: entries with one time expire in the order of their `set`. */
  readonly seq: number;
}
/** The model: the live entries with the most recent key last, and the removals in their order. */
interface M {
  readonly map: Map<number, Live>;
  readonly capacity: number;
  readonly expired: Removal[];
  readonly evicted: Removal[];
  seq: number;
}

function expire(m: M): void {
  const now = Date.now();
  const gone = [...m.map]
    .filter(([, e]) => now >= e.createdAt + TTL)
    .sort(([, a], [, b]) => a.createdAt - b.createdAt || a.seq - b.seq);
  for (const [k, e] of gone) {
    m.map.delete(k);
    m.expired.push([k, e.value]);
  }
}

/** This function makes `k` the most recent key of the model. */
function use(m: M, k: number): void {
  const e = m.map.get(k);
  if (e === undefined) return;
  m.map.delete(k);
  m.map.set(k, e);
}

function op(label: string, run: (s: S, m: M) => void): Step<S, M> {
  return step<S, M>(label, (s, m) => {
    expire(m);
    run(s, m);
  });
}

const letter = fc.constantFrom("a", "b", "c");
const key = fc.integer({ min: -4, max: 4 });

const steps: fc.Arbitrary<Step<S, M>> = fc.oneof(
  { arbitrary: fc.integer({ min: 0, max: TTL + 2 }).map((ms) => step<S, M>(`advance(${ms})`, () => void vi.advanceTimersByTime(ms))), weight: 3 },
  {
    arbitrary: fc.tuple(key, letter).map(([k, v]) =>
      op(`set(${k}, ${v})`, ({ sut }, m) => {
        const old = m.map.get(k);
        expect(sut.set(k, v)).toBe(old?.value);
        if (old === undefined && m.map.size >= m.capacity) {
          const [lk, le] = m.map.entries().next().value as [number, Live];
          m.map.delete(lk);
          m.evicted.push([lk, le.value]);
        }
        // A set is a use, and it starts the time of the key again
        m.map.delete(k);
        m.map.set(k, { value: v, createdAt: Date.now(), seq: m.seq++ });
      }),
    ),
    weight: 3,
  },
  key.map((k) =>
    op(`get(${k})`, ({ sut }, m) => {
      const live = m.map.get(k);
      if (live === undefined) return expect(() => sut.get(k)).toThrow();
      expect(sut.get(k)).toBe(live.value);
      use(m, k);
    }),
  ),
  // has is not a use (C37)
  key.map((k) => op(`has(${k})`, ({ sut }, m) => expect(sut.has(k)).toBe(m.map.has(k)))),
  key.map((k) => op(`getOrUndefined(${k})`, ({ sut }, m) => expect(sut.getOrUndefined(k)).toBe(m.map.get(k)?.value))),
  key.map((k) =>
    op(`delete(${k})`, ({ sut }, m) => {
      expect(sut.delete(k)).toBe(m.map.get(k)?.value);
      m.map.delete(k);
    }),
  ),
  fc.constant(op("clear()", ({ sut }, m) => (sut.clear(), m.map.clear()))),
);

function check({ sut, expired, evicted }: S, m: M): void {
  const actual = [...sut].map((e) => [e.key, e.value] as [number, string]).sort(([a], [b]) => a - b);
  expire(m);
  expect(actual).toEqual([...m.map].map(([k, e]) => [k, e.value]).sort(([a], [b]) => (a as number) - (b as number)));
  expect(sut.size).toBe(m.map.size);
  expect(sut.isFull).toBe(m.map.size >= m.capacity);
  expect(expired).toEqual(m.expired);
  expect(evicted).toEqual(m.evicted);
}

beforeEach(() => void vi.useFakeTimers());
afterEach(() => void vi.useRealTimers());

for (const [name, base] of [
  ["HashMap", () => hashMap<number, string>()],
  ["LinkedHashMap", () => linkedHashMap<number, string>()],
  ["TreeMap", () => treeMap<number, string>()],
] as const) {
  describe(`lruMap over ttlMap over ${name}`, () => {
    it.each([1, 4, 1000])("follows the laws of recency and expiry with a check interval of %i", (checkInterval) => {
      fc.assert(
        fc.property(fc.integer({ min: 1, max: 4 }), (capacity) => {
          runModel<S, M>({
            create: () => {
              const expired: Removal[] = [];
              const evicted: Removal[] = [];
              const ttl = ttlMap<number, string>({ ttl: TTL, checkInterval, onExpire: ({ key: k, value: v }) => void expired.push([k, v]) });
              const sut = compose(
                lruMap<number, string>({ capacity, onEvict: ({ key: k, value: v }) => void evicted.push([k, v]) }),
                ttl,
              )(base() as MapLike<number, string>) as unknown as Cache & { dispose: () => void };
              return {
                sut: { sut, dispose: () => sut.dispose(), expired, evicted },
                model: { map: new Map(), capacity, expired: [], evicted: [], seq: 0 },
              };
            },
            steps,
            check,
            dispose: (s) => s.dispose(),
            maxSteps: 60,
            numRuns: 30,
          });
        }),
        { numRuns: 4 },
      );
    });
  });
}

type Evented = MapLike<number, string> & {
  on(event: "set" | "delete" | "clear", listener: (payload: { key: number; value: string }) => void): () => void;
};
type R = { sut: MapLike<number, string>; replay: Map<number, string>; dispose: () => void };

/** This function calls `run`. A throw (the policy "throw" of a full map) is a refusal: the events must show no change. */
function refusable(run: () => unknown): void {
  try {
    run();
  } catch {
    // refused
  }
}

const replaySteps: fc.Arbitrary<Step<R, null>> = fc.oneof(
  fc.integer({ min: 0, max: TTL + 2 }).map((ms) => step<R, null>(`advance(${ms})`, () => void vi.advanceTimersByTime(ms))),
  { arbitrary: fc.tuple(key, letter).map(([k, v]) => step<R, null>(`set(${k}, ${v})`, ({ sut }) => refusable(() => sut.set(k, v)))), weight: 4 },
  fc.tuple(key, letter).map(([k, v]) => step<R, null>(`setIfAbsent(${k}, ${v})`, ({ sut }) => refusable(() => sut.setIfAbsent(k, v)))),
  key.map((k) => step<R, null>(`get(${k})`, ({ sut }) => void sut.getOrUndefined(k))),
  key.map((k) => step<R, null>(`has(${k})`, ({ sut }) => void sut.has(k))),
  key.map((k) => step<R, null>(`delete(${k})`, ({ sut }) => void sut.delete(k))),
  fc.constant(step<R, null>("clear()", ({ sut }) => sut.clear())),
);

describe("eventedMap at the bottom of a stack", () => {
  const stacks: [string, (evented: Evented) => { sut: MapLike<number, string>; dispose: () => void }][] = [
    ["alone", (e) => ({ sut: e, dispose: () => {} })],
    ["under boundedMap (drop-oldest)", (e) => ({ sut: boundedMap<number, string>({ capacity: 3, policy: "drop-oldest" })(e), dispose: () => {} })],
    ["under lruMap", (e) => ({ sut: lruMap<number, string>({ capacity: 3 })(e), dispose: () => {} })],
    [
      "under lruMap over ttlMap",
      (e) => {
        const ttl = ttlMap<number, string>({ ttl: TTL, checkInterval: 4 })(e);
        return { sut: lruMap<number, string>({ capacity: 3 })(ttl), dispose: () => ttl.dispose() };
      },
    ],
  ];
  it.each(stacks)("gives events whose replay is the entries of the stack (%s)", (_, make) => {
    runModel<R, null>({
      create: () => {
        const evented = eventedMap<number, string>()(hashMap<number, string>()) as unknown as Evented;
        const replay = new Map<number, string>();
        evented.on("set", ({ key: k, value: v }) => void replay.set(k, v));
        evented.on("delete", ({ key: k }) => void replay.delete(k));
        evented.on("clear", () => replay.clear());
        return { sut: { ...make(evented), replay }, model: null };
      },
      steps: replaySteps,
      check: ({ sut, replay }) => {
        const entries = [...sut].map((e) => [e.key, e.value]).sort(([a], [b]) => (a as number) - (b as number));
        expect([...replay].sort(([a], [b]) => a - b)).toEqual(entries);
      },
      dispose: (s) => s.dispose(),
      maxSteps: 60,
      numRuns: 100,
    });
  });
});

describe("eventedMap above a removing layer", () => {
  // Before 0.9.0 an evented layer above these layers did not see their removals (C23)
  const disposable = <M extends MapLike<number, string>>(m: M, dispose: () => void = () => {}): { map: M; dispose: () => void } => ({ map: m, dispose });
  const stacks: [string, () => { map: MapLike<number, string>; dispose: () => void }][] = [
    ...(["drop-oldest", "drop-newest", "reject", "throw"] as const).map(
      (policy) => [`boundedMap (${policy})`, () => disposable(boundedMap<number, string>({ capacity: 3, policy })(hashMap<number, string>()))] as [string, () => { map: MapLike<number, string>; dispose: () => void }],
    ),
    ["lruMap", () => disposable(lruMap<number, string>({ capacity: 3 })(hashMap<number, string>()))],
    [
      "ttlMap",
      () => {
        const ttl = ttlMap<number, string>({ ttl: TTL, checkInterval: 4 })(hashMap<number, string>());
        return disposable(ttl, () => ttl.dispose());
      },
    ],
    [
      "lruMap over ttlMap",
      () => {
        const ttl = ttlMap<number, string>({ ttl: TTL, checkInterval: 4 })(hashMap<number, string>());
        return disposable(lruMap<number, string>({ capacity: 3 })(ttl), () => ttl.dispose());
      },
    ],
    [
      "boundedMap (drop-oldest) over ttlMap",
      () => {
        const ttl = ttlMap<number, string>({ ttl: TTL, checkInterval: 1000 })(hashMap<number, string>());
        return disposable(boundedMap<number, string>({ capacity: 3, policy: "drop-oldest" })(ttl), () => ttl.dispose());
      },
    ],
    [
      "ttlMap over lruMap",
      () => {
        const ttl = ttlMap<number, string>({ ttl: TTL, checkInterval: 4 })(lruMap<number, string>({ capacity: 3 })(hashMap<number, string>()));
        return disposable(ttl, () => ttl.dispose());
      },
    ],
  ];
  it.each(stacks)("gives events whose replay is the entries of the stack (%s)", (name, make) => {
    runModel<R, null>({
      create: () => {
        const { map, dispose } = make();
        const evented = eventedMap<number, string>()(map) as unknown as Evented;
        const replay = new Map<number, string>();
        evented.on("set", ({ key: k, value: v }) => void replay.set(k, v));
        evented.on("delete", ({ key: k }) => void replay.delete(k));
        evented.on("clear", () => replay.clear());
        return { sut: { sut: evented, replay, dispose }, model: null };
      },
      steps: replaySteps,
      check: ({ sut, replay }) => {
        const entries = [...sut].map((e) => [e.key, e.value]).sort(([a], [b]) => (a as number) - (b as number));
        expect([...replay].sort(([a], [b]) => a - b)).toEqual(entries);
        // Each stack but ttlMap alone has the capacity 3
        if (name !== "ttlMap") expect(sut.size).toBeLessThanOrEqual(3);
      },
      dispose: (s) => s.dispose(),
      maxSteps: 60,
      numRuns: 100,
    });
  });
});
