/**
 * The safe middleware. Each operation that throws on a missing element has a safe form in the property `safe`. The safe
 * form gives an `Optional` or a `Result` of `@mark1russell7/optional`, and does not throw.
 *
 * @example
 * import { isSome } from "@mark1russell7/optional";
 *
 * const list = compose(safeList<number>())(arrayList<number>());
 * const value = list.safe.get(10); // an Optional<number>, not an exception
 * if (isSome(value)) console.log(value.value);
 */

import type { Middleware } from "../core/middleware.js";
import type { List } from "../interfaces/list.js";
import type { Queue, Deque } from "../interfaces/queue.js";
import type { MapLike } from "../interfaces/map.js";
import { none, some, toOptional, tryCatch, type Optional, type Result } from "@mark1russell7/optional";

/**
 * Safe operations for List.
 */
export interface SafeListOperations<T> {
  /**
   * This method gives the element at an index, as an optional.
   */
  get(index: number): Optional<T>;

  /**
   * This method sets the element at an index. It gives a Result with the old value or an error.
   */
  set(index: number, element: T): Result<T, string>;

  /**
   * This method removes the element at an index. It gives a Result with the removed value or an error.
   */
  removeAt(index: number): Result<T, string>;

  /**
   * This method gives the first element, as an optional.
   */
  first(): Optional<T>;

  /**
   * This method gives the last element, as an optional.
   */
  last(): Optional<T>;

  /**
   * Pop element, as an optional.
   */
  pop(): Optional<T>;

  /**
   * Shift element, as an optional.
   */
  shift(): Optional<T>;
}

/**
 * Safe operations for Queue.
 */
export interface SafeQueueOperations<T> {
  /**
   * This method gives the head element as an optional, and does not remove it.
   */
  peek(): Optional<T>;

  /**
   * This method removes the head element and gives it as an optional.
   */
  poll(): Optional<T>;

  /**
   * This method dequeues the head element and gives it as an optional.
   */
  dequeue(): Optional<T>;
}

/**
 * Safe operations for Deque.
 */
export interface SafeDequeOperations<T> extends SafeQueueOperations<T> {
  /**
   * This method gives the first element as an optional, and does not remove it.
   */
  peekFirst(): Optional<T>;

  /**
   * This method gives the last element as an optional, and does not remove it.
   */
  peekLast(): Optional<T>;

  /**
   * This method removes the first element and gives it as an optional.
   */
  pollFirst(): Optional<T>;

  /**
   * This method removes the last element and gives it as an optional.
   */
  pollLast(): Optional<T>;

  /**
   * This method pops the top element and gives it as an optional.
   */
  pop(): Optional<T>;
}

/**
 * Safe operations for Map.
 */
export interface SafeMapOperations<K, V> {
  /**
   * This method gives the value of a key, as an optional.
   */
  get(key: K): Optional<V>;

  /**
   * This method sets the value of a key. It gives a Result with the old value or a success.
   */
  set(key: K, value: V): Result<V | undefined, string>;

  /**
   * This method deletes a key. It gives a Result with the deleted value or an error.
   */
  delete(key: K): Result<V | undefined, string>;
}

/**
 * This function makes a safe List middleware.
 *
 * This function exposes a `safe` property with Optional/Result-based operations.
 */
export function safeList<T>(): Middleware<
  List<T>,
  List<T> & { safe: SafeListOperations<T> }
> {
  return (next: List<T>): List<T> & { safe: SafeListOperations<T> } => {
    const safe: SafeListOperations<T> = {
      get(index: number): Optional<T> {
        return toOptional(tryCatch(() => next.get(index)));
      },

      set(index: number, element: T): Result<T, string> {
        return tryCatch(
          () => next.set(index, element),
          (error) => String(error)
        );
      },

      removeAt(index: number): Result<T, string> {
        return tryCatch(
          () => next.removeAt(index),
          (error) => String(error)
        );
      },

      first(): Optional<T> {
        return next.isEmpty ? none : some(next.first());
      },

      last(): Optional<T> {
        return next.isEmpty ? none : some(next.last());
      },

      pop(): Optional<T> {
        if (next.isEmpty) return none;
        return toOptional(tryCatch(() => next.pop()));
      },

      shift(): Optional<T> {
        if (next.isEmpty) return none;
        return toOptional(tryCatch(() => next.shift()));
      },
    };

    // Extend next with safe property
    return Object.assign(next, { safe });
  };
}

/**
 * This function makes a safe Queue middleware.
 */
export function safeQueue<T>(): Middleware<
  Queue<T>,
  Queue<T> & { safe: SafeQueueOperations<T> }
> {
  return (next: Queue<T>): Queue<T> & { safe: SafeQueueOperations<T> } => {
    const safe: SafeQueueOperations<T> = {
      peek(): Optional<T> {
        if (next.isEmpty) return none;
        return toOptional(tryCatch(() => next.peek()));
      },

      poll(): Optional<T> {
        if (next.isEmpty) return none;
        return toOptional(tryCatch(() => next.poll()));
      },

      dequeue(): Optional<T> {
        if (next.isEmpty) return none;
        return toOptional(tryCatch(() => next.dequeue()));
      },
    };

    return Object.assign(next, { safe });
  };
}

/**
 * This function makes a safe Deque middleware.
 */
export function safeDeque<T>(): Middleware<
  Deque<T>,
  Deque<T> & { safe: SafeDequeOperations<T> }
> {
  return (next: Deque<T>): Deque<T> & { safe: SafeDequeOperations<T> } => {
    const safe: SafeDequeOperations<T> = {
      peek(): Optional<T> {
        return next.isEmpty ? none : some(next.peekFirst());
      },

      poll(): Optional<T> {
        // One poll: before, the test and the result each called pollFirst(), so poll() removed
        // two elements and returned the second (BUGS-2026-07 L12)
        if (next.isEmpty) return none;
        return some(next.pollFirst() as T);
      },

      dequeue(): Optional<T> {
        if (next.isEmpty) return none;
        return toOptional(tryCatch(() => next.dequeue()));
      },

      peekFirst(): Optional<T> {
        return next.isEmpty ? none : some(next.peekFirst());
      },

      peekLast(): Optional<T> {
        return next.isEmpty ? none : some(next.peekLast());
      },

      pollFirst(): Optional<T> {
        const result = next.pollFirst();
        return result !== undefined ? some(result) : none;
      },

      pollLast(): Optional<T> {
        const result = next.pollLast();
        return result !== undefined ? some(result) : none;
      },

      pop(): Optional<T> {
        if (next.isEmpty) return none;
        return toOptional(tryCatch(() => next.pop()));
      },
    };

    return Object.assign(next, { safe });
  };
}

/**
 * This function makes a safe Map middleware.
 */
export function safeMap<K, V>(): Middleware<
  MapLike<K, V>,
  MapLike<K, V> & { safe: SafeMapOperations<K, V> }
> {
  return (
    next: MapLike<K, V>
  ): MapLike<K, V> & { safe: SafeMapOperations<K, V> } => {
    const safe: SafeMapOperations<K, V> = {
      get(key: K): Optional<V> {
        return next.has(key) ? some(next.get(key)) : none;
      },

      set(key: K, value: V): Result<V | undefined, string> {
        return tryCatch(
          () => next.set(key, value),
          (error) => String(error)
        );
      },

      delete(key: K): Result<V | undefined, string> {
        return tryCatch(
          () => next.delete(key),
          (error) => String(error)
        );
      },
    };

    return Object.assign(next, { safe });
  };
}
