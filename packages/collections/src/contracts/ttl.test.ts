/**
 * The laws of the TTL layer (C10): ttlMap over each base map, against a model with a clock.
 *
 * The laws:
 * - An entry that is set at the time `t` is live while the time is less than `t + ttl`. A `set` starts its time again.
 * - Each read (`get`, `has`, `getOrUndefined`, `size`, `isEmpty`, the iteration) shows only the live entries.
 * - The layer calls `onExpire` one time for each entry that expires, in the order of expiry. It does not call it for
 *   an entry that `delete`, `clear` or a new `set` removes before its expiry.
 * - These laws do not change with the interval of the background check.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fc from "fast-check";
import { hashMap } from "../impl/hash-map.js";
import { linkedHashMap } from "../impl/linked-hash-map.js";
import { treeMap } from "../impl/tree-map.js";
import { ttlMap } from "../behaviors/ttl.js";
import type { MapLike } from "../interfaces/map.js";
import { runModel, step, type Step } from "@mark1russell7/rigor-testkit/model";

const TTL = 10;

type Expiry = [key: number, value: string, createdAt: number];
type S = { sut: MapLike<number, string> & { readonly dispose: () => void }; expired: Expiry[] };
interface Live {
  readonly value: string;
  readonly createdAt: number;
}
/** The model: the entries with the time of their `set`, and the expiries in their order. */
interface M {
  readonly map: Map<number, Live>;
  readonly expired: Expiry[];
}

/**
 * This function removes each expired entry of the model and records it.
 * It sorts by the time of expiry. The sort is stable, so entries with one time keep the order of their `set`.
 */
function expire(m: M): void {
  const now = Date.now();
  const gone = [...m.map].filter(([, e]) => now >= e.createdAt + TTL).sort(([, a], [, b]) => a.createdAt - b.createdAt);
  for (const [k, e] of gone) {
    m.map.delete(k);
    m.expired.push([k, e.value, e.createdAt]);
  }
}

/** This function makes a step that first removes the expired entries of the model. */
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
  fc.tuple(key, letter).map(([k, v]) =>
    op(`set(${k}, ${v})`, ({ sut }, m) => {
      expect(sut.set(k, v)).toBe(m.map.get(k)?.value);
      // A new set starts the time of the key again, and the key goes to the end of the order of expiry
      m.map.delete(k);
      m.map.set(k, { value: v, createdAt: Date.now() });
    }),
  ),
  fc.tuple(key, letter).map(([k, v]) =>
    op(`setIfAbsent(${k}, ${v})`, ({ sut }, m) => {
      const old = m.map.get(k);
      expect(sut.setIfAbsent(k, v)).toBe(old?.value ?? v);
      if (old === undefined) m.map.set(k, { value: v, createdAt: Date.now() });
    }),
  ),
  key.map((k) =>
    op(`get(${k})`, ({ sut }, m) => {
      const live = m.map.get(k);
      if (live === undefined) return expect(() => sut.get(k)).toThrow();
      expect(sut.get(k)).toBe(live.value);
    }),
  ),
  key.map((k) => op(`has(${k})`, ({ sut }, m) => expect(sut.has(k)).toBe(m.map.has(k)))),
  key.map((k) => op(`getOrUndefined(${k})`, ({ sut }, m) => expect(sut.getOrUndefined(k)).toBe(m.map.get(k)?.value))),
  key.map((k) =>
    op(`delete(${k})`, ({ sut }, m) => {
      expect(sut.delete(k)).toBe(m.map.get(k)?.value);
      m.map.delete(k);
    }),
  ),
  fc.constant(op("size", ({ sut }, m) => expect(sut.size).toBe(m.map.size))),
  fc.constant(op("isEmpty", ({ sut }, m) => expect(sut.isEmpty).toBe(m.map.size === 0))),
  fc.constant(op("clear()", ({ sut }, m) => (sut.clear(), m.map.clear()))),
);

function check({ sut, expired }: S, m: M): void {
  // The iteration is a read: it removes the expired entries of the layer first
  const actual = [...sut].map((e) => [e.key, e.value] as [number, string]).sort(([a], [b]) => a - b);
  expire(m);
  expect(actual).toEqual([...m.map].map(([k, e]) => [k, e.value]).sort(([a], [b]) => (a as number) - (b as number)));
  expect(expired).toEqual(m.expired);
}

beforeEach(() => void vi.useFakeTimers());
afterEach(() => void vi.useRealTimers());

for (const [name, base] of [
  ["HashMap", () => hashMap<number, string>()],
  ["LinkedHashMap", () => linkedHashMap<number, string>()],
  ["TreeMap", () => treeMap<number, string>()],
] as const) {
  describe(`ttlMap over ${name}`, () => {
    // An interval of 1 sweeps at each time, 4 between the expiries, and 1000 never in a sequence
    it.each([1, 4, 1000])("follows the laws of expiry with a check interval of %i", (checkInterval) => {
      runModel<S, M>({
        create: () => {
          const expired: Expiry[] = [];
          const sut = ttlMap<number, string>({
            ttl: TTL,
            checkInterval,
            onExpire: ({ key: k, value: v, createdAt }) => void expired.push([k, v, createdAt]),
          })(base() as MapLike<number, string>);
          return { sut: { sut, expired }, model: { map: new Map(), expired: [] } };
        },
        steps,
        check,
        dispose: ({ sut }) => sut.dispose(),
        maxSteps: 60,
        numRuns: 60,
      });
    });
  });
}

describe("the iteration of ttlMap", () => {
  // HashMap throws when it changes while an iterator runs. A read in the loop removes the expired entries.
  it.each([
    ["for of", (m: MapLike<number, string>, body: () => void) => { for (const _ of m) body(); }],
    ["keys", (m: MapLike<number, string>, body: () => void) => { for (const _ of m.keys()) body(); }],
    ["forEach", (m: MapLike<number, string>, body: () => void) => m.forEach(() => body())],
  ])("gives the entries that are live at its start, also when an entry expires in the loop (%s)", (_, loop) => {
    const map = ttlMap<number, string>({ ttl: TTL, checkInterval: 1 })(hashMap<number, string>());
    map.set(1, "a");
    vi.advanceTimersByTime(5);
    map.set(2, "b");
    let seen = 0;
    loop(map, () => {
      seen++;
      if (seen === 1) vi.advanceTimersByTime(5); // 1 expires in the first pass: the interval and the read remove it
      map.getOrUndefined(2);
    });
    expect(seen).toBe(2);
    expect([...map.keys()]).toEqual([2]);
    map.dispose();
  });
});
