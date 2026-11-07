import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { semaphore } from "./semaphore.js";

/** A promise and the functions that settle it. */
function deferred<T = void>(): { promise: Promise<T>; resolve: (value: T) => void; reject: (reason: unknown) => void } {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** One turn of the event loop, after the microtasks. */
const tick = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

describe("semaphore", () => {
  it("refuses a count that is not a whole number of 1 or more", () => {
    for (const bad of [0, -1, 1.5, Number.NaN]) expect(() => semaphore(bad)).toThrow(RangeError);
    expect(semaphore(Infinity).available).toBe(Infinity);
  });

  it("gives the permits at once, then makes the next caller wait", async () => {
    const lock = semaphore(2);
    const first = await lock.acquire();
    await lock.acquire();
    expect(lock.available).toBe(0);
    let third = false;
    const waiting = lock.acquire().then((release) => {
      third = true;
      return release;
    });
    await tick();
    expect(third).toBe(false);
    expect(lock.waiting).toBe(1);
    first();
    (await waiting)();
    expect(third).toBe(true);
    expect(lock.waiting).toBe(0);
    expect(lock.available).toBe(1);
  });

  it("gives the permits to the waiting callers in the order that they came", async () => {
    const lock = semaphore(1);
    const release = await lock.acquire();
    const order: number[] = [];
    const all = [1, 2, 3].map((n) => lock.run(() => order.push(n)));
    release();
    await Promise.all(all);
    expect(order).toEqual([1, 2, 3]);
  });

  it("does nothing at a second call of a release", async () => {
    const lock = semaphore(1);
    const release = await lock.acquire();
    release();
    release();
    expect(lock.available).toBe(1);
    await lock.acquire();
    expect(lock.available).toBe(0);
  });

  it("gives one waiting caller a permit for one release, also when the release is called two times", async () => {
    const lock = semaphore(1);
    const release = await lock.acquire();
    const got: number[] = [];
    void lock.acquire().then(() => got.push(1));
    void lock.acquire().then(() => got.push(2));
    release();
    release();
    await tick();
    expect(got).toEqual([1]);
    expect(lock.waiting).toBe(1);
    expect(lock.available).toBe(0);
  });

  it("gives the permit back when a task throws", async () => {
    const lock = semaphore(1);
    await expect(lock.run(() => Promise.reject(new Error("no")))).rejects.toThrow("no");
    await expect(lock.run(() => {
      throw new Error("sync");
    })).rejects.toThrow("sync");
    expect(lock.available).toBe(1);
  });

  it("never runs more tasks than its permits, and runs each task", async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 6 }), fc.array(fc.integer({ min: 1, max: 3 }), { minLength: 1, maxLength: 40 }), async (permits, delays) => {
        const lock = semaphore(permits);
        let running = 0;
        let most = 0;
        let done = 0;
        await Promise.all(
          delays.map((delay) =>
            lock.run(async () => {
              running += 1;
              most = Math.max(most, running);
              for (let step = 0; step < delay; step += 1) await tick();
              running -= 1;
              done += 1;
            })
          )
        );
        expect(most).toBeLessThanOrEqual(permits);
        expect(most).toBe(Math.min(permits, delays.length));
        expect(done).toBe(delays.length);
        expect(lock.available).toBe(permits);
        expect(lock.waiting).toBe(0);
      }),
      // A fixed seed, so a failure repeats
      { seed: 53, numRuns: 100 }
    );
  });

  it("keeps the order of the waiting callers past a compaction of its queue", async () => {
    const lock = semaphore(1);
    const gate = deferred();
    const first = lock.run(() => gate.promise);
    const order: number[] = [];
    const all = Array.from({ length: 300 }, (_, n) => lock.run(() => order.push(n)));
    gate.resolve();
    await Promise.all([first, ...all]);
    expect(order).toEqual(Array.from({ length: 300 }, (_, n) => n));
  });
});
