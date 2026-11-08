/**
 * semaphore - A bound on the tasks that run at the same time.
 *
 * @example
 * const writes = semaphore(4);
 * // At most 4 writes run at once. The others wait in the order that they came.
 * await Promise.all(items.map((item) => writes.run(() => store.set(item.id, item))));
 */

/** A semaphore: a count of permits, and a queue of the callers that wait for one. */
export interface Semaphore {
  /** The permits of the semaphore. */
  readonly permits: number;
  /** The permits that no caller holds. */
  readonly available: number;
  /** The callers that wait for a permit. */
  readonly waiting: number;
  /**
   * This method gives a permit. It waits while all permits are held. The waiting callers get the permits in the order
   * that they came. The result is the release of the permit. A second call of the release does nothing.
   */
  acquire(): Promise<() => void>;
  /** This method starts a task with a permit. The permit goes back when the task ends, also when it throws. */
  run<R>(task: () => R | PromiseLike<R>): Promise<R>;
}

/**
 * This function makes a semaphore with `permits` permits. The value is a whole number of 1 or more, or `Infinity`
 * for no bound. Another value throws a `RangeError`.
 */
export function semaphore(permits: number): Semaphore {
  if (!(permits === Infinity || (Number.isInteger(permits) && permits >= 1))) {
    throw new RangeError(`A semaphore needs a whole number of permits of 1 or more, or Infinity: ${permits}`);
  }
  let held = 0;
  // The waiting callers, in the order that they came. A release gives its permit to the first.
  const queue: Array<() => void> = [];
  let head = 0;

  const releaseOnce = (): (() => void) => {
    let done = false;
    return () => {
      if (done) return;
      done = true;
      if (head < queue.length) {
        const next = queue[head]!;
        head += 1;
        // The permit goes from the releaser to the next caller, so `held` does not change
        if (head > 64 && head * 2 > queue.length) {
          queue.splice(0, head);
          head = 0;
        }
        next();
      } else {
        held -= 1;
      }
    };
  };

  const acquire = (): Promise<() => void> => {
    if (held < permits) {
      held += 1;
      return Promise.resolve(releaseOnce());
    }
    return new Promise((resolve) => {
      queue.push(() => resolve(releaseOnce()));
    });
  };

  return {
    permits,
    get available() {
      return permits - held;
    },
    get waiting() {
      return queue.length - head;
    },
    acquire,
    async run<R>(task: () => R | PromiseLike<R>): Promise<R> {
      const release = await acquire();
      try {
        return await task();
      } finally {
        release();
      }
    },
  };
}
