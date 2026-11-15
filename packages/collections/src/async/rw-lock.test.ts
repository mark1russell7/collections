import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { rwLock, type LockMode } from "./rw-lock.js";

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

/** A request of the lock, with a flag that is true when the request has its hold. */
function request(lock: ReturnType<typeof rwLock>, mode: LockMode, signal?: AbortSignal) {
  const state = { held: false, release: undefined as (() => void) | undefined };
  const promise = lock.acquire(mode, { signal }).then((release) => {
    state.held = true;
    state.release = release;
    return release;
  });
  return { state, promise };
}

describe("rwLock", () => {
  it("gives shared holds at the same time", async () => {
    const lock = rwLock();
    const first = await lock.acquire("shared");
    const second = await lock.acquire("shared");
    expect(lock.shared).toBe(2);
    expect(lock.exclusive).toBe(false);
    expect(lock.waiting).toBe(0);
    first();
    second();
    expect(lock.shared).toBe(0);
  });

  it("gives an exclusive hold alone", async () => {
    const lock = rwLock();
    const reader = await lock.acquire("shared");
    const writer = request(lock, "exclusive");
    await tick();
    expect(writer.state.held).toBe(false);
    reader();
    await writer.promise;
    expect(lock.exclusive).toBe(true);
    expect(lock.shared).toBe(0);

    const reader2 = request(lock, "shared");
    const writer2 = request(lock, "exclusive");
    await tick();
    expect(reader2.state.held).toBe(false);
    expect(writer2.state.held).toBe(false);
    expect(lock.waiting).toBe(2);
    writer.state.release!();
    await reader2.promise;
    expect(lock.shared).toBe(1);
    expect(writer2.state.held).toBe(false);
    reader2.state.release!();
    await writer2.promise;
    expect(lock.exclusive).toBe(true);
    writer2.state.release!();
    expect(lock.exclusive).toBe(false);
  });

  it("makes a shared request wait behind an exclusive request that came first", async () => {
    const lock = rwLock();
    const reader = await lock.acquire("shared");
    const order: string[] = [];
    const writer = lock.run("exclusive", () => order.push("writer"));
    const lateReader = lock.run("shared", () => order.push("late reader"));
    await tick();
    // The lock has a shared hold, but the late reader waits behind the writer
    expect(lock.shared).toBe(1);
    expect(lock.waiting).toBe(2);
    expect(order).toEqual([]);
    reader();
    await Promise.all([writer, lateReader]);
    expect(order).toEqual(["writer", "late reader"]);
  });

  it("gives the lock to an exclusive request in a stream of shared requests", async () => {
    const lock = rwLock();
    const order: string[] = [];
    const readers: Promise<unknown>[] = [];
    const read = (n: number) => lock.run("shared", async () => {
      order.push(`read ${n}`);
      await tick();
    });
    for (let n = 0; n < 3; n += 1) readers.push(read(n));
    const writer = lock.run("exclusive", () => order.push("write"));
    for (let n = 3; n < 6; n += 1) readers.push(read(n));
    await Promise.all([...readers, writer]);
    expect(order).toEqual(["read 0", "read 1", "read 2", "write", "read 3", "read 4", "read 5"]);
  });

  it("gives the first shared request and each shared request after it, up to the first exclusive request", async () => {
    const lock = rwLock();
    const writer = await lock.acquire("exclusive");
    const a = request(lock, "shared");
    const b = request(lock, "shared");
    const c = request(lock, "exclusive");
    const d = request(lock, "shared");
    writer();
    expect(lock.shared).toBe(2);
    expect(lock.waiting).toBe(2);
    await Promise.all([a.promise, b.promise]);
    await tick();
    expect(c.state.held).toBe(false);
    expect(d.state.held).toBe(false);
    a.state.release!();
    expect(lock.exclusive).toBe(false);
    b.state.release!();
    expect(lock.exclusive).toBe(true);
    expect(lock.waiting).toBe(1);
    await c.promise;
    c.state.release!();
    await d.promise;
    expect(lock.shared).toBe(1);
    expect(lock.waiting).toBe(0);
  });

  it("hands the lock to the next request at the release, so a new request cannot go first", async () => {
    const lock = rwLock();
    const writer = await lock.acquire("exclusive");
    const next = request(lock, "exclusive");
    writer();
    // The waiting request got the hold before the end of the release
    expect(lock.exclusive).toBe(true);
    expect(lock.waiting).toBe(0);
    const late = request(lock, "exclusive");
    const lateReader = request(lock, "shared");
    expect(lock.waiting).toBe(2);
    await next.promise;
    await tick();
    expect(late.state.held).toBe(false);
    expect(lateReader.state.held).toBe(false);
    next.state.release!();
    await late.promise;
    expect(lateReader.state.held).toBe(false);
    late.state.release!();
    await lateReader.promise;
    expect(lock.shared).toBe(1);
  });

  it("removes a request from the queue when its signal aborts, and rejects with the reason", async () => {
    const lock = rwLock();
    const writer = await lock.acquire("exclusive");
    const controller = new AbortController();
    const first = request(lock, "shared");
    const aborted = lock.acquire("exclusive", { signal: controller.signal });
    const last = request(lock, "shared");
    expect(lock.waiting).toBe(3);
    const reason = new Error("stop");
    controller.abort(reason);
    expect(lock.waiting).toBe(2);
    await expect(aborted).rejects.toBe(reason);
    writer();
    // The two shared requests were not adjacent before the abort. After the abort, they get the lock together
    await Promise.all([first.promise, last.promise]);
    expect(lock.shared).toBe(2);
    expect(lock.waiting).toBe(0);
  });

  it("lets the shared requests behind an aborted exclusive request start", async () => {
    const lock = rwLock();
    const reader = await lock.acquire("shared");
    const controller = new AbortController();
    const writer = lock.acquire("exclusive", { signal: controller.signal });
    const a = request(lock, "shared");
    const b = request(lock, "shared");
    const c = request(lock, "exclusive");
    expect(lock.waiting).toBe(4);
    controller.abort();
    // The abort examines the queue again at once
    expect(lock.shared).toBe(3);
    expect(lock.waiting).toBe(1);
    await expect(writer).rejects.toBe(controller.signal.reason);
    await Promise.all([a.promise, b.promise]);
    expect(c.state.held).toBe(false);
    reader();
    a.state.release!();
    b.state.release!();
    await c.promise;
    expect(lock.exclusive).toBe(true);
  });

  it("rejects at once, with no hold, when the signal is already aborted", async () => {
    const lock = rwLock();
    const reason = new Error("too late");
    const signal = AbortSignal.abort(reason);
    await expect(lock.acquire("shared", { signal })).rejects.toBe(reason);
    await expect(lock.acquire("exclusive", { signal })).rejects.toBe(reason);
    let started = false;
    await expect(lock.run("shared", () => (started = true), { signal })).rejects.toBe(reason);
    expect(started).toBe(false);
    expect(lock.shared).toBe(0);
    expect(lock.exclusive).toBe(false);
    expect(lock.waiting).toBe(0);
  });

  it("keeps a hold when its signal aborts after the hold started", async () => {
    const lock = rwLock();
    const controller = new AbortController();
    const writer = await lock.acquire("exclusive");
    const next = request(lock, "exclusive", controller.signal);
    writer();
    const release = await next.promise;
    controller.abort();
    expect(lock.exclusive).toBe(true);
    release();
    expect(lock.exclusive).toBe(false);
  });

  it("does nothing at a second call of a release", async () => {
    const lock = rwLock();
    const first = await lock.acquire("shared");
    await lock.acquire("shared");
    first();
    first();
    expect(lock.shared).toBe(1);

    const other = rwLock();
    const writer = await other.acquire("exclusive");
    const next = request(other, "exclusive");
    const after = request(other, "exclusive");
    writer();
    writer();
    await next.promise;
    await tick();
    // The second call did not end the hold of the next request
    expect(after.state.held).toBe(false);
    expect(other.exclusive).toBe(true);
    expect(other.waiting).toBe(1);
  });

  it("releases the hold when a task throws, and gives the error to the caller", async () => {
    const lock = rwLock();
    await expect(lock.run("exclusive", () => Promise.reject(new Error("no")))).rejects.toThrow("no");
    await expect(lock.run("shared", () => {
      throw new Error("sync");
    })).rejects.toThrow("sync");
    expect(lock.exclusive).toBe(false);
    expect(lock.shared).toBe(0);
    expect(await lock.run("exclusive", () => 7)).toBe(7);
  });

  it("rejects a mode that is not shared or exclusive", async () => {
    const lock = rwLock();
    await expect(lock.acquire("read" as unknown as LockMode)).rejects.toThrow(TypeError);
    expect(lock.shared).toBe(0);
    expect(lock.waiting).toBe(0);
  });

  it("does not put an exclusive hold beside another hold, and starts the tasks in the order that they came", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.record({ exclusive: fc.boolean(), delay: fc.integer({ min: 0, max: 3 }) }), { minLength: 1, maxLength: 40 }),
        async (tasks) => {
          const lock = rwLock();
          let readers = 0;
          let writers = 0;
          let overlap = false;
          const started: number[] = [];
          await Promise.all(
            tasks.map((task, index) =>
              lock.run(task.exclusive ? "exclusive" : "shared", async () => {
                started.push(index);
                if (task.exclusive) writers += 1;
                else readers += 1;
                if (writers > 1 || (writers === 1 && readers > 0)) overlap = true;
                for (let step = 0; step < task.delay; step += 1) await tick();
                if (task.exclusive) writers -= 1;
                else readers -= 1;
              })
            )
          );
          expect(overlap).toBe(false);
          expect(started).toEqual(tasks.map((_, index) => index));
          expect(lock.shared).toBe(0);
          expect(lock.exclusive).toBe(false);
          expect(lock.waiting).toBe(0);
        }
      ),
      // A fixed seed, so a failure repeats
      { seed: 53, numRuns: 100 }
    );
  });

  it("starts the shared tasks that are adjacent in the queue at the same time", async () => {
    const lock = rwLock();
    const gate = deferred();
    const writer = lock.run("exclusive", () => gate.promise);
    let most = 0;
    let active = 0;
    const readers = Array.from({ length: 5 }, () =>
      lock.run("shared", async () => {
        active += 1;
        most = Math.max(most, active);
        await tick();
        active -= 1;
      })
    );
    gate.resolve();
    await Promise.all([writer, ...readers]);
    expect(most).toBe(5);
  });

  it("keeps the order of the waiting requests past a compaction of its queue", async () => {
    const lock = rwLock();
    const gate = deferred();
    const first = lock.run("exclusive", () => gate.promise);
    const order: number[] = [];
    const all = Array.from({ length: 300 }, (_, n) => lock.run(n % 3 === 0 ? "exclusive" : "shared", () => order.push(n)));
    gate.resolve();
    await Promise.all([first, ...all]);
    expect(order).toEqual(Array.from({ length: 300 }, (_, n) => n));
  });

  it("removes an aborted request after a compaction of its queue", async () => {
    const lock = rwLock();
    const gate = deferred();
    const first = lock.run("exclusive", () => gate.promise);
    const order: number[] = [];
    const controller = new AbortController();
    const all = Array.from({ length: 200 }, (_, n) => lock.run("exclusive", () => order.push(n)));
    const aborted = lock.run("exclusive", () => order.push(-1), { signal: controller.signal });
    const last = lock.run("exclusive", () => order.push(200));
    gate.resolve();
    await Promise.all([first, ...all.slice(0, 150)]);
    controller.abort();
    await expect(aborted).rejects.toBe(controller.signal.reason);
    await Promise.all([...all, last]);
    expect(order).toEqual(Array.from({ length: 201 }, (_, n) => n));
  });
});
