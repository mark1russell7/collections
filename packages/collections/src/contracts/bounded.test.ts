/**
 * The laws of the bounded layers (C10): boundedList, boundedQueue, boundedDeque and boundedMap over
 * each base, against a JavaScript model, for each overflow policy.
 *
 * The laws:
 * - The size is never over the capacity, except with the policy `grow`.
 * - An insert into a full collection calls `onOverflow` one time, before the policy (not with `grow`).
 * - `throw` changes nothing and throws. `reject` and `drop-newest` change nothing and give `false`.
 * - `drop-oldest` removes one element at the end opposite to the insert, and then inserts.
 *   A front insert (unshift, addFirst, offerFirst) drops the last element. Each other insert drops the first.
 * - An insert of many elements (addAll, insertAll) is the inserts of its elements one after the other.
 *   A throw stops it, and the elements before the throw stay.
 */

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { arrayList } from "../impl/array-list.js";
import { linkedList } from "../impl/linked-list.js";
import { arrayDeque } from "../impl/array-deque.js";
import { hashMap } from "../impl/hash-map.js";
import { linkedHashMap } from "../impl/linked-hash-map.js";
import { treeMap } from "../impl/tree-map.js";
import { boundedDeque, boundedList, boundedMap, boundedQueue, type BoundedCollection } from "../behaviors/bounded.js";
import type { OverflowPolicy } from "../core/policies.js";
import type { List } from "../interfaces/list.js";
import type { Deque, Queue } from "../interfaces/queue.js";
import type { MapLike } from "../interfaces/map.js";
import { runModel, smallInt, step, type Step } from "./model.js";

const POLICIES = ["throw", "drop-oldest", "drop-newest", "reject", "grow"] as const satisfies readonly OverflowPolicy[];
type Policy = (typeof POLICIES)[number];

/** The model of a bounded sequence: the elements, the capacity, the policy and the count of overflows. */
interface Seq {
  readonly items: number[];
  readonly capacity: number;
  readonly policy: Policy;
  overflows: number;
}

/** The model error of the policy `throw`. */
class Full extends Error {}

/**
 * This function inserts one element into the model, with the policy. `at` is "front", "back" or an index.
 * It gives true when the element goes in, and it throws `Full` for the policy `throw`.
 */
function insert(m: Seq, x: number, at: "front" | "back" | number): boolean {
  let index = at;
  if (m.items.length >= m.capacity && m.policy !== "grow") {
    m.overflows++;
    if (m.policy === "throw") throw new Full();
    if (m.policy === "reject" || m.policy === "drop-newest") return false;
    if (at === "front") m.items.pop();
    else m.items.shift();
    if (typeof index === "number") index = Math.max(0, index - 1);
  }
  if (index === "front") m.items.unshift(x);
  else if (index === "back") m.items.push(x);
  else m.items.splice(index, 0, x);
  return true;
}

/** This function inserts many elements into the model, one after the other. It gives true when one goes in. */
function insertMany(m: Seq, xs: readonly number[], at: "back" | number): boolean {
  let added = false;
  let index = at;
  for (const x of xs) {
    const before = m.items.length;
    const full = before >= m.capacity && m.policy !== "grow";
    if (!insert(m, x, index)) break;
    added = true;
    if (typeof index === "number") index = (full && m.policy === "drop-oldest" ? Math.max(0, index - 1) : index) + 1;
  }
  return added;
}

/**
 * This function runs one insert on the implementation and on the model. A model throw needs a throw of the
 * implementation. `result` is the expected result for a refused insert (false for an offer, undefined for a push).
 */
function both<S>(s: S, m: Seq, onModel: () => boolean, onSut: (s: S) => unknown, refused: unknown, accepted: unknown): void {
  let outcome: boolean;
  try {
    outcome = onModel();
  } catch (error) {
    if (!(error instanceof Full)) throw error;
    expect(() => onSut(s)).toThrow(/full/);
    return;
  }
  const result = onSut(s);
  expect(result).toBe(outcome ? accepted : refused);
}

/** The checks of the bound itself, for each kind. */
function checkBound(s: BoundedCollection & { size: number }, m: Seq, overflows: number): void {
  expect(s.capacity).toBe(m.capacity);
  expect(s.isFull).toBe(m.items.length >= m.capacity);
  expect(s.remainingCapacity).toBe(Math.max(0, m.capacity - m.items.length));
  if (m.policy !== "grow") expect(s.size).toBeLessThanOrEqual(m.capacity);
  expect(overflows).toBe(m.overflows);
}

const capacity = fc.integer({ min: 1, max: 6 });
const few = fc.array(smallInt, { maxLength: 8 });

// ---------------------------------------------------------------------------------------------------------------------
// boundedList

type L = List<number> & BoundedCollection;
interface LS {
  sut: L;
  calls: { overflows: number };
}

const listSteps: fc.Arbitrary<Step<LS, Seq>> = fc.oneof(
  smallInt.map((x) => step<LS, Seq>(`add(${x})`, ({ sut }, m) => both(sut, m, () => insert(m, x, "back"), (s) => s.add(x), false, true))),
  smallInt.map((x) => step<LS, Seq>(`push(${x})`, ({ sut }, m) => both(sut, m, () => insert(m, x, "back"), (s) => s.push(x), undefined, undefined))),
  smallInt.map((x) =>
    step<LS, Seq>(`unshift(${x})`, ({ sut }, m) => both(sut, m, () => insert(m, x, "front"), (s) => s.unshift(x), undefined, undefined)),
  ),
  fc.tuple(fc.nat(), smallInt).map(([i, x]) =>
    step<LS, Seq>(`insert(${i}, ${x})`, ({ sut }, m) => {
      const index = i % (m.items.length + 1);
      both(sut, m, () => insert(m, x, index), (s) => s.insert(index, x), undefined, undefined);
    }),
  ),
  few.map((xs) => step<LS, Seq>(`addAll(${xs})`, ({ sut }, m) => both(sut, m, () => insertMany(m, xs, "back"), (s) => s.addAll(xs), false, true))),
  fc.tuple(fc.nat(), few).map(([i, xs]) =>
    step<LS, Seq>(`insertAll(${i}, ${xs})`, ({ sut }, m) => {
      const index = i % (m.items.length + 1);
      both(sut, m, () => insertMany(m, xs, index), (s) => s.insertAll(index, xs), false, true);
    }),
  ),
  fc.nat().map((i) =>
    step<LS, Seq>(`removeAt(${i})`, ({ sut }, m) => {
      if (m.items.length === 0) return;
      const index = i % m.items.length;
      expect(sut.removeAt(index)).toBe(m.items.splice(index, 1)[0]);
    }),
  ),
  fc.constant(step<LS, Seq>("pop()", ({ sut }, m) => void (m.items.length > 0 && expect(sut.pop()).toBe(m.items.pop())))),
  fc.constant(step<LS, Seq>("shift()", ({ sut }, m) => void (m.items.length > 0 && expect(sut.shift()).toBe(m.items.shift())))),
  fc.constant(step<LS, Seq>("clear()", ({ sut }, m) => (sut.clear(), m.items.splice(0)))),
);

function checkList({ sut, calls }: LS, m: Seq): void {
  expect(sut.toArray()).toEqual(m.items);
  expect(sut.size).toBe(m.items.length);
  checkBound(sut, m, calls.overflows);
}

for (const [name, base] of [
  ["ArrayList", () => arrayList<number>()],
  ["LinkedList", () => linkedList<number>()],
] as const) {
  describe(`boundedList over ${name}`, () => {
    for (const policy of POLICIES) {
      it(`follows the laws of the bound with the policy ${policy}`, () => {
        fc.assert(
          fc.property(capacity, (cap) => {
            runModel<LS, Seq>({
              create: () => {
                const calls = { overflows: 0 };
                const sut = boundedList<number>({ capacity: cap, policy, onOverflow: () => void calls.overflows++ })(base());
                return { sut: { sut, calls }, model: { items: [], capacity: cap, policy, overflows: 0 } };
              },
              steps: listSteps,
              check: checkList,
              maxSteps: 40,
              numRuns: 30,
            });
          }),
          { numRuns: 6 },
        );
      });
    }
  });
}

// ---------------------------------------------------------------------------------------------------------------------
// boundedQueue and boundedDeque

type Q = Queue<number> & BoundedCollection;
type D = Deque<number> & BoundedCollection;
interface QS<T> {
  sut: T;
  calls: { overflows: number };
}

function takeSteps<T extends Queue<number>>(): fc.Arbitrary<Step<QS<T>, Seq>>[] {
  return [
    fc.constant(step<QS<T>, Seq>("pollOrUndefined()", ({ sut }, m) => expect(sut.pollOrUndefined()).toBe(m.items.shift()))),
    fc.constant(step<QS<T>, Seq>("clear()", ({ sut }, m) => (sut.clear(), m.items.splice(0)))),
  ];
}

const queueSteps: fc.Arbitrary<Step<QS<Q>, Seq>> = fc.oneof(
  smallInt.map((x) => step<QS<Q>, Seq>(`offer(${x})`, ({ sut }, m) => both(sut, m, () => insert(m, x, "back"), (s) => s.offer(x), false, true))),
  smallInt.map((x) => step<QS<Q>, Seq>(`enqueue(${x})`, ({ sut }, m) => both(sut, m, () => insert(m, x, "back"), (s) => s.enqueue(x), false, true))),
  smallInt.map((x) => step<QS<Q>, Seq>(`add(${x})`, ({ sut }, m) => both(sut, m, () => insert(m, x, "back"), (s) => s.add(x), false, true))),
  few.map((xs) => step<QS<Q>, Seq>(`addAll(${xs})`, ({ sut }, m) => both(sut, m, () => insertMany(m, xs, "back"), (s) => s.addAll(xs), false, true))),
  ...takeSteps<Q>(),
);

const dequeSteps: fc.Arbitrary<Step<QS<D>, Seq>> = fc.oneof(
  ...(["addFirst", "offerFirst"] as const).map((op) =>
    smallInt.map((x) =>
      step<QS<D>, Seq>(`${op}(${x})`, ({ sut }, m) =>
        both(sut, m, () => insert(m, x, "front"), (s) => s[op](x), op === "offerFirst" ? false : undefined, op === "offerFirst" ? true : undefined),
      ),
    ),
  ),
  ...(["addLast", "offerLast", "push", "offer", "add"] as const).map((op) =>
    smallInt.map((x) =>
      step<QS<D>, Seq>(`${op}(${x})`, ({ sut }, m) => {
        const offer = op === "offerLast" || op === "offer" || op === "add";
        both(sut, m, () => insert(m, x, "back"), (s) => s[op](x), offer ? false : undefined, offer ? true : undefined);
      }),
    ),
  ),
  few.map((xs) => step<QS<D>, Seq>(`addAll(${xs})`, ({ sut }, m) => both(sut, m, () => insertMany(m, xs, "back"), (s) => s.addAll(xs), false, true))),
  fc.constant(step<QS<D>, Seq>("pollLast()", ({ sut }, m) => expect(sut.pollLast()).toBe(m.items.pop()))),
  ...takeSteps<D>(),
);

function checkQueue<T extends Queue<number> & BoundedCollection>({ sut, calls }: QS<T>, m: Seq): void {
  expect(sut.toArray()).toEqual(m.items);
  expect(sut.size).toBe(m.items.length);
  checkBound(sut, m, calls.overflows);
}

describe("boundedQueue over ArrayDeque", () => {
  for (const policy of POLICIES) {
    it(`follows the laws of the bound with the policy ${policy}`, () => {
      fc.assert(
        fc.property(capacity, (cap) => {
          runModel<QS<Q>, Seq>({
            create: () => {
              const calls = { overflows: 0 };
              const sut = boundedQueue<number>({ capacity: cap, policy, onOverflow: () => void calls.overflows++ })(arrayDeque<number>());
              return { sut: { sut, calls }, model: { items: [], capacity: cap, policy, overflows: 0 } };
            },
            steps: queueSteps,
            check: checkQueue,
            maxSteps: 40,
            numRuns: 30,
          });
        }),
        { numRuns: 6 },
      );
    });
  }
});

for (const [name, base] of [
  ["ArrayDeque", () => arrayDeque<number>({ initialCapacity: 2 })],
  ["LinkedList", () => linkedList<number>()],
] as const) {
  describe(`boundedDeque over ${name}`, () => {
    for (const policy of POLICIES) {
      it(`follows the laws of the bound with the policy ${policy}`, () => {
        fc.assert(
          fc.property(capacity, (cap) => {
            runModel<QS<D>, Seq>({
              create: () => {
                const calls = { overflows: 0 };
                const sut = boundedDeque<number>({ capacity: cap, policy, onOverflow: () => void calls.overflows++ })(base() as Deque<number>);
                return { sut: { sut, calls }, model: { items: [], capacity: cap, policy, overflows: 0 } };
              },
              steps: dequeSteps,
              check: checkQueue,
              maxSteps: 40,
              numRuns: 30,
            });
          }),
          { numRuns: 6 },
        );
      });
    }
  });
}

// ---------------------------------------------------------------------------------------------------------------------
// boundedMap: the model is a JavaScript Map, whose first key is the oldest insert

type BM = MapLike<number, string> & BoundedCollection;
interface MS {
  sut: BM;
  calls: { overflows: number };
}
interface MM {
  readonly map: Map<number, string>;
  readonly capacity: number;
  readonly policy: Policy;
  overflows: number;
}

/** This function sets one key in the model, with the policy. It gives false when the policy refuses the key. */
function setModel(m: MM, k: number, v: string): boolean {
  if (!m.map.has(k) && m.map.size >= m.capacity && m.policy !== "grow") {
    m.overflows++;
    if (m.policy === "throw") throw new Full();
    if (m.policy === "reject" || m.policy === "drop-newest") return false;
    const oldest = m.map.keys().next();
    if (!oldest.done) m.map.delete(oldest.value);
  }
  m.map.set(k, v);
  return true;
}

const letter = fc.constantFrom("a", "b", "c");

const mapSteps: fc.Arbitrary<Step<MS, MM>> = fc.oneof(
  fc.tuple(smallInt, letter).map(([k, v]) =>
    step<MS, MM>(`set(${k}, ${v})`, ({ sut }, m) => {
      const old = m.map.get(k);
      let ok: boolean;
      try {
        ok = setModel(m, k, v);
      } catch (error) {
        if (!(error instanceof Full)) throw error;
        expect(() => sut.set(k, v)).toThrow(/full/);
        return;
      }
      expect(sut.set(k, v)).toBe(ok ? old : undefined);
    }),
  ),
  fc.tuple(smallInt, letter).map(([k, v]) =>
    step<MS, MM>(`setIfAbsent(${k}, ${v})`, ({ sut }, m) => {
      if (m.map.has(k)) return expect(sut.setIfAbsent(k, v)).toBe(m.map.get(k));
      try {
        setModel(m, k, v);
      } catch (error) {
        if (!(error instanceof Full)) throw error;
        expect(() => sut.setIfAbsent(k, v)).toThrow(/full/);
        return;
      }
      sut.setIfAbsent(k, v);
    }),
  ),
  smallInt.map((k) =>
    step<MS, MM>(`delete(${k})`, ({ sut }, m) => {
      expect(sut.delete(k)).toBe(m.map.get(k));
      m.map.delete(k);
    }),
  ),
  fc.constant(step<MS, MM>("clear()", ({ sut }, m) => (sut.clear(), m.map.clear()))),
);

function checkMap({ sut, calls }: MS, m: MM, ordered: boolean): void {
  const actual = [...sut.entries()].map((e) => [e.key, e.value] as const);
  const expected = [...m.map.entries()];
  if (ordered) expect(actual).toEqual(expected);
  else expect([...actual].sort(([a], [b]) => a - b)).toEqual([...expected].sort(([a], [b]) => a - b));
  expect(sut.size).toBe(m.map.size);
  expect(sut.isFull).toBe(m.map.size >= m.capacity);
  expect(sut.remainingCapacity).toBe(Math.max(0, m.capacity - m.map.size));
  if (m.policy !== "grow") expect(sut.size).toBeLessThanOrEqual(m.capacity);
  expect(calls.overflows).toBe(m.overflows);
}

// Every key in one of two buckets: the delete of the oldest key goes through keyEq on a chain
const colliding = { hash: (k: number) => Math.abs(k) % 2, eq: (a: number, b: number) => a === b };

for (const [name, base, ordered] of [
  ["HashMap", () => hashMap<number, string>(), false],
  ["HashMap (colliding hash)", () => hashMap<number, string>({ keyHash: colliding.hash, keyEq: colliding.eq, initialCapacity: 2 }), false],
  ["LinkedHashMap", () => linkedHashMap<number, string>(), true],
  ["TreeMap", () => treeMap<number, string>(), false],
] as const) {
  describe(`boundedMap over ${name}`, () => {
    for (const policy of POLICIES) {
      it(`follows the laws of the bound with the policy ${policy}`, () => {
        fc.assert(
          fc.property(capacity, (cap) => {
            runModel<MS, MM>({
              create: () => {
                const calls = { overflows: 0 };
                const sut = boundedMap<number, string>({ capacity: cap, policy, onOverflow: () => void calls.overflows++ })(base() as MapLike<number, string>);
                return { sut: { sut, calls }, model: { map: new Map(), capacity: cap, policy, overflows: 0 } };
              },
              steps: mapSteps,
              check: (s, m) => checkMap(s, m, ordered),
              maxSteps: 40,
              numRuns: 30,
            });
          }),
          { numRuns: 6 },
        );
      });
    }
  });
}
