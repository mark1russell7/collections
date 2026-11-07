/**
 * The safe forms give the values of `@mark1russell7/optional` (C8). The functions of that package operate on them.
 */

import { err, getOkOr, getOr, isErr, map, none, ok, some } from "@mark1russell7/optional";
import { describe, expect, it } from "vitest";
import { arrayDeque } from "../impl/array-deque.js";
import { arrayList } from "../impl/array-list.js";
import { hashMap } from "../impl/hash-map.js";
import { safeDeque, safeList, safeMap, safeQueue } from "./safe.js";

describe("safeList", () => {
  it("gives some for an element and none for a missing element", () => {
    const list = safeList<number>()(arrayList([1, 2]));
    expect(list.safe.get(1)).toEqual(some(2));
    expect(list.safe.get(5)).toEqual(none);
    expect(list.safe.first()).toEqual(some(1));
    expect(list.safe.last()).toEqual(some(2));
    expect(getOr(map(list.safe.get(0), (n) => n * 10), 0)).toBe(10);
  });

  it("gives ok with the old element, or err with the message of the error", () => {
    const list = safeList<string>()(arrayList(["a"]));
    expect(list.safe.set(0, "b")).toEqual(ok("a"));
    const failed = list.safe.removeAt(3);
    expect(isErr(failed)).toBe(true);
    expect(failed).toEqual(err(expect.stringContaining("RangeError")));
    expect(getOkOr(failed, "none")).toBe("none");
  });

  it("gives none for pop and shift of an empty list, and the list does not change", () => {
    const list = safeList<number>()(arrayList<number>());
    expect(list.safe.pop()).toEqual(none);
    expect(list.safe.shift()).toEqual(none);
    list.push(7);
    expect(list.safe.shift()).toEqual(some(7));
    expect(list.size).toBe(0);
  });
});

describe("safeQueue and safeDeque", () => {
  it("give none on an empty queue, and some of the head otherwise", () => {
    const queue = safeQueue<number>()(arrayDeque<number>());
    expect(queue.safe.peek()).toEqual(none);
    expect(queue.safe.poll()).toEqual(none);
    expect(queue.safe.dequeue()).toEqual(none);
    queue.enqueue(1);
    queue.enqueue(2);
    expect(queue.safe.peek()).toEqual(some(1));
    expect(queue.safe.dequeue()).toEqual(some(1));
    expect(queue.size).toBe(1);
  });

  it("read and remove at the two ends of a deque", () => {
    const deque = safeDeque<number>()(arrayDeque([1, 2, 3]));
    expect(deque.safe.peekFirst()).toEqual(some(1));
    expect(deque.safe.peekLast()).toEqual(some(3));
    expect(deque.safe.pollLast()).toEqual(some(3));
    expect(deque.safe.pop()).toEqual(some(2));
    expect(deque.safe.pollFirst()).toEqual(some(1));
    expect(deque.safe.pollFirst()).toEqual(none);
    expect(deque.safe.pop()).toEqual(none);
  });
});

describe("safeMap", () => {
  it("gives some for a key and none for a missing key, also when the value is undefined", () => {
    const map = safeMap<string, number | undefined>()(hashMap<string, number | undefined>([["a", 1], ["u", undefined]]));
    expect(map.safe.get("a")).toEqual(some(1));
    expect(map.safe.get("u")).toEqual(some(undefined));
    expect(map.safe.get("b")).toEqual(none);
    expect(map.safe.set("a", 2)).toEqual(ok(1));
    expect(map.safe.delete("a")).toEqual(ok(2));
    expect(map.safe.delete("a")).toEqual(ok(undefined));
  });
});
