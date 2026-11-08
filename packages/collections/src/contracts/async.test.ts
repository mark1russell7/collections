/**
 * AsyncQueue (regression: BUGS-2026-07 C11, the queue dropped the elements of waiting puts and
 * left takers waiting). The tests of the channels moved to `@mark1russell7/service` with the channels (C26).
 */

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { asyncQueue } from "../async/async-queue.js";

const tick = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

/** The value of a promise, or a failure when it does not settle in time: a lost value makes a receive wait forever. */
async function within<T>(promise: Promise<T>, what: string, ms = 1000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${what} did not settle: a value was lost`)), ms);
  });
  try {
    return await Promise.race([promise, late]);
  } finally {
    clearTimeout(timer);
  }
}

describe("AsyncQueue", () => {
  it("keeps every element and their order, with any capacity and any interleaving", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 4 }),
        fc.array(fc.boolean(), { minLength: 1, maxLength: 60 }),
        async (capacity, script) => {
          const queue = asyncQueue<number>({ capacity });
          const puts: Promise<void>[] = [];
          const takes: Promise<number>[] = [];
          let next = 0;
          // true: put the next number, false: take. Takes never outnumber puts at the end.
          for (const isPut of script) {
            if (isPut) puts.push(queue.put(next++));
            else if (takes.length < next) takes.push(queue.take());
            await tick();
          }
          while (takes.length < next) takes.push(queue.take());
          await Promise.all(puts);
          expect(await Promise.all(takes)).toEqual([...Array(next).keys()]);
          expect(queue.size).toBe(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("makes put wait when the buffer is full (back-pressure)", async () => {
    const queue = asyncQueue<string>({ capacity: 1 });
    await queue.put("a");
    let done = false;
    const second = queue.put("b").then(() => (done = true));
    await tick();
    expect(done).toBe(false);
    expect(await queue.take()).toBe("a");
    await second;
    expect(await queue.take()).toBe("b");
  });

  it("with capacity 0, hands each element from put to take directly", async () => {
    const queue = asyncQueue<number>({ capacity: 0 });
    expect(queue.tryPut(1)).toBe(false);
    const taken = queue.take();
    expect(queue.tryPut(2)).toBe(true);
    expect(await taken).toBe(2);
    const put = queue.put(3);
    expect(await queue.tryPeek()).toBe(3);
    expect(queue.tryTake()).toBe(3);
    await put;
  });

  it("drain gives the buffer and the waiting puts, in order", async () => {
    const queue = asyncQueue<number>({ capacity: 2 });
    const puts = [1, 2, 3, 4].map((n) => queue.put(n));
    await tick();
    expect(queue.drain()).toEqual([1, 2, 3, 4]);
    await Promise.all(puts);
  });

  it("close lets the reader finish the elements, then the iterator ends", async () => {
    const queue = asyncQueue<number>();
    await queue.put(1);
    await queue.put(2);
    queue.close();
    await expect(queue.put(3)).rejects.toThrow("closed");
    const seen: number[] = [];
    for await (const n of queue) seen.push(n);
    expect(seen).toEqual([1, 2]);
    await expect(queue.take()).rejects.toThrow("closed");
  });

  it("close ends a reader that waits", async () => {
    const queue = asyncQueue<number>();
    const seen: number[] = [];
    const reader = (async () => {
      for await (const n of queue) seen.push(n);
    })();
    await queue.put(1);
    await tick();
    queue.close();
    await reader;
    expect(seen).toEqual([1]);
  });

  it("take and put time out", async () => {
    const queue = asyncQueue<number>({ capacity: 0 });
    await expect(queue.take(10)).rejects.toThrow("timeout");
    await expect(queue.put(1, 10)).rejects.toThrow("timeout");
    expect(queue.getStats()).toMatchObject({ waitingPutters: 0, waitingTakers: 0 });
  });
});

describe("AsyncQueue: the capacity and the error texts (C36)", () => {
  it("accepts a whole number of 0 or more, and Infinity", () => {
    for (const capacity of [0, 1, 7, Infinity]) {
      expect(asyncQueue<number>({ capacity }).remainingCapacity).toBe(capacity);
    }
    expect(asyncQueue<number>().remainingCapacity).toBe(Infinity);
  });

  it("throws a RangeError for any other capacity", () => {
    for (const capacity of [-1, -Infinity, 1.5, Number.NaN]) {
      expect(() => asyncQueue<number>({ capacity })).toThrow(RangeError);
    }
  });

  it("gives one text to a put on a closed queue, new or waiting", async () => {
    const queue = asyncQueue<string>({ capacity: 1 });
    await queue.put("a");
    const waiting = queue.put("b");
    queue.close();
    await expect(waiting).rejects.toThrow(/^Queue is closed$/);
    await expect(queue.put("c")).rejects.toThrow(/^Queue is closed$/);
  });

  it("gives one text to a take, a peek and a wait on a closed, empty queue, new or waiting", async () => {
    const queue = asyncQueue<string>();
    const take = queue.take();
    const peek = queue.peek();
    const waits: Error[] = [];
    queue.waitTake(() => undefined, (error) => waits.push(error));
    queue.close();
    const text = /^Queue is closed and empty$/;
    await expect(take).rejects.toThrow(text);
    await expect(peek).rejects.toThrow(text);
    await expect(queue.take()).rejects.toThrow(text);
    await expect(queue.peek()).rejects.toThrow(text);
    queue.waitTake(() => undefined, (error) => waits.push(error));
    expect(waits.map((error) => error.message)).toEqual(["Queue is closed and empty", "Queue is closed and empty"]);
  });
});

describe("peek on an empty queue (audit pass 2)", () => {
  it("takes nothing: a take that waits after it gets the element, and the order stays", async () => {
    const queue = asyncQueue<number>();
    const peeked = queue.peek();
    const taken = queue.take();
    await queue.put(1);
    await queue.put(2);
    expect(await within(peeked, "peek")).toBe(1);
    expect(await within(taken, "take")).toBe(1);
    expect(queue.tryTake()).toBe(2);
    expect(queue.tryTake()).toBeUndefined();
  });

  it("sees an element that stays in the queue", async () => {
    const queue = asyncQueue<number>({ capacity: 1 });
    const peeked = queue.peek();
    await queue.put(7);
    expect(await within(peeked, "peek")).toBe(7);
    expect(queue.tryTake()).toBe(7);
  });

  it("rejects when the queue closes empty", async () => {
    const queue = asyncQueue<number>();
    const peeked = queue.peek();
    queue.close();
    await expect(peeked).rejects.toThrow(/closed/);
  });
});
