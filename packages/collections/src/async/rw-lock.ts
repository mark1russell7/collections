/**
 * rw-lock - A readers-writer lock: shared holds go together, and an exclusive hold goes alone.
 *
 * @example
 * const lock = rwLock();
 * // The two reads start at the same time. The write waits until the two reads end.
 * const [a, b] = await Promise.all([lock.run("shared", () => store.get("a")), lock.run("shared", () => store.get("b"))]);
 * await lock.run("exclusive", () => store.set("sum", a + b));
 */

/** The mode of a hold. More than one `shared` hold can be in progress at the same time. An `exclusive` hold is alone. */
export type LockMode = "shared" | "exclusive";

/** The options of a request for the lock. */
export interface LockOptions {
  /** This signal cancels the request while it waits. The signal has no effect on a hold that started. */
  readonly signal?: AbortSignal | undefined;
}

/** A readers-writer lock: a count of the shared holds, a flag for the exclusive hold, and one queue of requests. */
export interface RwLock {
  /** The count of the shared holds that are in progress. */
  readonly shared: number;
  /** This value is `true` while an exclusive hold is in progress. */
  readonly exclusive: boolean;
  /** The count of the requests that wait. */
  readonly waiting: number;
  /**
   * This method gives a hold in the mode `mode`. The requests get the lock in the order that they came. Thus a shared
   * request waits behind an exclusive request that came first. The result is the release of the hold. A second call of
   * the release does nothing.
   *
   * When `options.signal` aborts while the request waits, the request leaves the queue. Then the promise rejects with
   * `signal.reason`. A signal that is already aborted rejects at once, and the lock gives no hold.
   */
  acquire(mode: LockMode, options?: LockOptions): Promise<() => void>;
  /** This method starts a task with a hold in the mode `mode`. The hold ends when the task ends, also when it throws. */
  run<R>(mode: LockMode, task: () => R | PromiseLike<R>, options?: LockOptions): Promise<R>;
}

/** A request that waits: its mode, and the function that gives it the lock. */
interface Waiter {
  readonly mode: LockMode;
  readonly grant: () => void;
}

/**
 * This function makes a readers-writer lock. More than one shared hold can be in progress at the same time. An
 * exclusive hold is alone. The requests get the lock in the order that they came, so shared requests cannot block an
 * exclusive request forever. A mode that is not `shared` or `exclusive` rejects with a `TypeError`.
 */
export function rwLock(): RwLock {
  let shared = 0;
  let exclusive = false;
  // The requests that wait, in the order that they came. The first request is at `head`.
  const queue: Waiter[] = [];
  let head = 0;

  // The lock goes to the first requests of the queue, in their order. It stops at the first request that cannot have it.
  // A release and an abort use it at once, so a new request cannot go before a request of the queue.
  const grantNext = (): void => {
    while (head < queue.length && !exclusive) {
      const next = queue[head]!;
      if (next.mode === "exclusive") {
        if (shared > 0) break;
        exclusive = true;
      } else {
        shared += 1;
      }
      head += 1;
      next.grant();
    }
    if (head > 64 && head * 2 > queue.length) {
      queue.splice(0, head);
      head = 0;
    }
  };

  const releaseOnce = (mode: LockMode): (() => void) => {
    let done = false;
    return () => {
      if (done) return;
      done = true;
      if (mode === "exclusive") exclusive = false;
      else shared -= 1;
      grantNext();
    };
  };

  const acquire = (mode: LockMode, options?: LockOptions): Promise<() => void> => {
    if (mode !== "shared" && mode !== "exclusive") {
      return Promise.reject(new TypeError(`A lock mode is "shared" or "exclusive": ${String(mode)}`));
    }
    const signal = options?.signal;
    if (signal?.aborted === true) return Promise.reject(signal.reason);
    // A request goes before no other request: it gets the lock at once only when the queue is empty
    if (head === queue.length && !exclusive && (mode === "shared" || shared === 0)) {
      if (mode === "exclusive") exclusive = true;
      else shared += 1;
      return Promise.resolve(releaseOnce(mode));
    }
    return new Promise((resolve, reject) => {
      const onAbort = (): void => {
        const at = queue.indexOf(waiter, head);
        // The request has the lock, so the abort has no effect
        if (at < 0) return;
        queue.splice(at, 1);
        reject(signal!.reason);
        // The request can be the exclusive request that blocked the shared requests behind it
        grantNext();
      };
      const waiter: Waiter = {
        mode,
        grant: () => {
          signal?.removeEventListener("abort", onAbort);
          resolve(releaseOnce(mode));
        },
      };
      queue.push(waiter);
      signal?.addEventListener("abort", onAbort, { once: true });
    });
  };

  return {
    get shared() {
      return shared;
    },
    get exclusive() {
      return exclusive;
    },
    get waiting() {
      return queue.length - head;
    },
    acquire,
    async run<R>(mode: LockMode, task: () => R | PromiseLike<R>, options?: LockOptions): Promise<R> {
      const release = await acquire(mode, options);
      try {
        return await task();
      } finally {
        release();
      }
    },
  };
}
