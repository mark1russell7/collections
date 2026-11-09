/**
 * Synchronized behavior: this module gives thread-safe access with mutex locking.
 *
 * This module wraps collections to serialize all operations using a mutex, making sure that
 * thread-safe access in concurrent environments. Mirrors Java's
 * Collections.synchronizedList() and related methods.
 *
 * Note: JavaScript is single-threaded, but async operations can interleave.
 * This middleware makes sure that atomic operations across async boundaries.
 *
 * @example
 * const list = compose(
 *   synchronized()
 * )(arrayList<number>())
 *
 * // All operations are now serialized
 * await Promise.all([
 *   list.add(1),
 *   list.add(2),
 *   list.add(3)
 * ])
 */

import type { Middleware } from "../core/middleware.js";

/**
 * Simple mutex implementation for JavaScript async operations.
 *
 * This middleware makes sure that only one operation starts at a time, even if
 * multiple async operations are started concurrently.
 */
/** True for an `async` function or method. */
function isAsyncFunction(value: unknown): boolean {
  return typeof value === "function" && (value as { [Symbol.toStringTag]?: string })[Symbol.toStringTag] === "AsyncFunction";
}

class Mutex {
  private queue: Promise<void> = Promise.resolve();

  /**
   * This method acquires the lock and starts the function.
   * Other operations wait until this completes.
   */
  async lock<T>(fn: () => T | Promise<T>): Promise<T> {
    const run = this.queue.then(() => fn());
    this.queue = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }

  /**
   * Synchronous version that starts immediately.
   * Still queues to prevent interleaving with async operations.
   */

}

/**
 * This function makes a synchronized middleware that locks all method calls.
 *
 * Every method call on the collection is wrapped with a mutex,
 * making sure that atomic execution even in concurrent async scenarios.
 *
 * @example
 * const syncList = compose(
 *   synchronized()
 * )(arrayList<number>())
 *
 * // These additions are guaranteed to execute in order
 * await Promise.all([
 *   syncList.add(1),
 *   syncList.add(2),
 *   syncList.add(3)
 * ])
 */
export function synchronized<C extends object>(): Middleware<C> {
  return (next: C): C => {
    const mutex = new Mutex();

    return new Proxy(next, {
      get(target, prop, receiver) {
        const value = Reflect.get(target, prop, receiver);

        // Don't wrap non-functions
        if (typeof value !== "function") {
          return value;
        }

        // An async method runs inside the lock: it starts after the earlier async calls end.
        // (Before, every method ran first and took the lock after, so nothing was excluded:
        // BUGS-2026-07 L11.) A plain method runs at once: JavaScript does not interrupt it.
        // When a plain method returns a promise anyway, the lock waits for that promise.
        if (isAsyncFunction(value)) {
          return function (this: unknown, ...args: unknown[]) {
            return mutex.lock(() => (value as Function).apply(target, args));
          };
        }
        return function (this: unknown, ...args: unknown[]) {
          const result = (value as Function).apply(target, args);
          if (result instanceof Promise) {
            return mutex.lock(() => result);
          }
          return result;
        };
      },
    }) as C;
  };
}

/**
 * Alias for Java compatibility: synchronizedList
 */
export const synchronizedList : typeof synchronized = synchronized;

/**
 * Alias for Java compatibility: synchronizedMap
 */
export const synchronizedMap : typeof synchronized = synchronized;

/**
 * Alias for Java compatibility: synchronizedCollection
 */
export const synchronizedCollection : typeof synchronized = synchronized;

/**
 * Alias for Java compatibility: synchronizedSet
 */
export const synchronizedSet : typeof synchronized = synchronized;

/**
 * Read-write lock implementation for collections.
 *
 * With this function, multiple concurrent readers can read, but a writer is exclusive.
 * More efficient than full synchronization for read-heavy workloads.
 *
 * @example
 * const list = compose(
 *   readWriteLock()
 * )(arrayList<number>())
 *
 * // Multiple reads can happen concurrently
 * await Promise.all([
 *   list.get(0),
 *   list.get(1),
 *   list.get(2)
 * ])
 */
export function readWriteLock<C extends object>(): Middleware<C> {
  return (next: C): C => {
    let readers = 0;
    let writer = false;
    let waitingReaders: (() => void)[] = [];
    let waitingWriters: (() => void)[] = [];

    // Hand-off rule: the releaser counts the waiters it wakes (readers += n, or writer = true),
    // so a woken waiter does not count itself again. (Before, releaseWrite set readers = n and
    // each woken reader added 1, so the count never came back to 0 and writers waited forever:
    // BUGS-2026-07 L11.)
    const acquireRead = async (): Promise<void> => {
      if (writer || waitingWriters.length > 0) {
        await new Promise<void>((resolve) => waitingReaders.push(resolve));
        return;
      }
      readers++;
    };

    const releaseRead = (): void => {
      readers--;
      if (readers === 0 && waitingWriters.length > 0) {
        writer = true;
        const next = waitingWriters.shift()!;
        next();
      }
    };

    const acquireWrite = async (): Promise<void> => {
      if (writer || readers > 0) {
        await new Promise<void>((resolve) => waitingWriters.push(resolve));
        return;
      }
      writer = true;
    };

    const releaseWrite = (): void => {
      writer = false;
      if (waitingWriters.length > 0) {
        writer = true;
        const next = waitingWriters.shift()!;
        next();
      } else if (waitingReaders.length > 0) {
        const allReaders = waitingReaders.splice(0);
        readers += allReaders.length;
        allReaders.forEach((resolve) => resolve());
      }
    };

    // Methods that only read (don't mutate)
    const READ_METHODS = new Set([
      "get",
      "has",
      "contains",
      "containsAll",
      "containsValue",
      "indexOf",
      "lastIndexOf",
      "peek",
      "peekFirst",
      "peekLast",
      "first",
      "last",
      "isEmpty",
      "size",
      "toArray",
      "keys",
      "values",
      "entries",
      "forEach",
      "getOrDefault",
      "getOrUndefined",
      "descendingIterator",
    ]);

    // The reads that give an iterator. The lock copies the elements before it releases the read (C32).
    const ITERATOR_READS = new Set(["keys", "values", "entries", "descendingIterator"]);

    return new Proxy(next, {
      get(target, prop, receiver) {
        const value = Reflect.get(target, prop, receiver);

        if (typeof value !== "function") {
          return value;
        }

        // A method with a symbol key, for example Symbol.iterator, stays synchronous, so `for of` works (C32).
        // The loop reads at once with no lock, as a plain method of synchronized().
        if (typeof prop === "symbol") {
          return function (this: unknown, ...args: unknown[]) {
            return (value as Function).apply(target, args);
          };
        }

        const isReadMethod = READ_METHODS.has(prop);
        const isIteratorRead = ITERATOR_READS.has(prop);

        return async function (this: any, ...args: any[]) {
          if (isReadMethod) {
            // Acquire read lock
            await acquireRead();
            try {
              const raw = (value as Function).apply(target, args);
              const result = raw instanceof Promise ? await raw : raw;
              // Before C32, the iteration started after the release of the read, so a write could change the elements.
              return isIteratorRead && result != null && typeof result[Symbol.iterator] === "function"
                ? Array.from(result as Iterable<unknown>)[Symbol.iterator]()
                : result;
            } finally {
              releaseRead();
            }
          } else {
            // Acquire write lock
            await acquireWrite();
            try {
              const result = (value as Function).apply(target, args);
              return result instanceof Promise ? await result : result;
            } finally {
              releaseWrite();
            }
          }
        };
      },
    }) as C;
  };
}
