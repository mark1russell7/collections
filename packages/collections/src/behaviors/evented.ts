/**
 * Evented behavior - Emits typed events on collection mutations.
 *
 * This module wraps collections to emit events whenever elements are added, removed,
 * or the collection is cleared. This module enables reactive programming patterns.
 *
 * @example
 * const list = compose(
 *   eventedList<number>()
 * )(arrayList<number>())
 *
 * list.on('add', ({ value, index }) => {
 *   console.log(`Added ${value} at index ${index}`)
 * })
 *
 * list.add(42) // Triggers 'add' event
 */

import type { Middleware } from "../core/middleware.js";
import type { List } from "../interfaces/list.js";
import type { Queue, Deque } from "../interfaces/queue.js";
import type { MapLike } from "../interfaces/map.js";
import type { Collection } from "../interfaces/collection.js";
import { Emitter, type Unsubscribe } from "../core/events.js";
import { removalsOf, type ElementRemoval, type MapRemoval, type RemovalReason } from "../core/removals.js";

/** The number of removals that a layer heard from the layers below it, and the number from the first end. */
interface Heard {
  all: number;
  first: number;
}

/**
 * This function gives each removal below `next` to `listener` and counts the removals.
 * With the counts, a layer tells a refused add (the size did not grow) from an add that caused a drop.
 */
function hear<R extends ElementRemoval<unknown> | MapRemoval<unknown, unknown>>(next: object, listener: (removal: R) => void): Heard {
  const heard: Heard = { all: 0, first: 0 };
  removalsOf<R>(next)?.on((removal) => {
    heard.all++;
    if ("end" in removal && removal.end === "first") heard.first++;
    listener(removal);
  });
  return heard;
}

/** This function tells if a call added an element: the size grew, after the removals of the layers below. */
const added = (size: number, sizeBefore: number, heard: Heard, heardBefore: number): boolean =>
  size - sizeBefore + heard.all - heardBefore > 0;

// ============================================================================
// Event type definitions
// ============================================================================

/**
 * Events emitted by List collections.
 */
export interface ListEvents<T> {
  /** Element was added */
  add: { value: T; index?: number };
  /** Element was removed. A removal by a layer below (a drop) has a `reason`. */
  remove: { value: T; index?: number; reason?: RemovalReason };
  /** Element was replaced */
  set: { oldValue: T; newValue: T; index: number };
  /** Collection was cleared */
  clear: {};
  /** Collection was sorted */
  sort: {};
  /** Collection was reversed */
  reverse: {};
}

/**
 * Events emitted by Queue collections.
 */
export interface QueueEvents<T> {
  /** Element was added to queue */
  enqueue: { value: T };
  /** Element was removed from queue. A removal by a layer below (a drop) has a `reason`. */
  dequeue: { value: T; reason?: RemovalReason };
  /** Collection was cleared */
  clear: {};
}

/**
 * Events emitted by Deque collections.
 */
export interface DequeEvents<T> {
  /** Element was added to front */
  addFirst: { value: T };
  /** Element was added to back */
  addLast: { value: T };
  /** Element was removed from front. A removal by a layer below (a drop) has a `reason`. */
  removeFirst: { value: T; reason?: RemovalReason };
  /** Element was removed from back. A removal by a layer below (a drop) has a `reason`. */
  removeLast: { value: T; reason?: RemovalReason };
  /** Collection was cleared */
  clear: {};
}

/**
 * Events emitted by Map collections.
 */
export interface MapEvents<K, V> {
  /** Key-value pair was set */
  set: { key: K; value: V; oldValue?: V };
  /** Key was deleted. A removal by a layer below (a drop, an eviction or an expiry) has a `reason`. */
  delete: { key: K; value: V; reason?: RemovalReason };
  /** Collection was cleared */
  clear: {};
}

/**
 * Generic collection events.
 */
export interface CollectionEvents<T> {
  /** Element was added */
  add: { value: T };
  /** Element was removed. A removal by a layer below has a `reason`. */
  remove: { value: T; reason?: RemovalReason };
  /** Collection was cleared */
  clear: {};
}

// ============================================================================
// Evented middleware implementations
// ============================================================================

/**
 * This function makes an evented List middleware.
 *
 * This function emits events for add, remove, set, clear, sort, and reverse operations.
 */
export function eventedList<T>(): Middleware<
  List<T>,
  List<T> & {
    on<E extends keyof ListEvents<T>>(
      event: E,
      listener: (payload: ListEvents<T>[E]) => void
    ): Unsubscribe;
  }
> {
  return (next: List<T>) => {
    const emitter = new Emitter<ListEvents<T>>();
    // A removal from the last end left the index that is now the size
    const heard = hear<ElementRemoval<T>>(next, ({ value, end, reason }) =>
      emitter.emit("remove", end === undefined ? { value, reason } : { value, index: end === "first" ? 0 : next.size, reason }),
    );

    return new Proxy(next, {
      get(target, prop, receiver) {
        // Expose event subscription
        if (prop === "on") {
          return emitter.on.bind(emitter);
        }

        const value = Reflect.get(target, prop, receiver);

        if (typeof value === "function") {
          switch (prop) {
            // A layer below can refuse the element (reject, drop-newest): then no event
            case "add":
            case "push":
              return function (element: T): any {
                const size = target.size;
                const all = heard.all;
                const result = (value as Function).call(target, element);
                if (added(target.size, size, heard, all)) emitter.emit("add", { value: element });
                return result;
              };

            case "unshift":
              return function (element: T): void {
                const size = target.size;
                const all = heard.all;
                (value as Function).call(target, element);
                if (added(target.size, size, heard, all)) emitter.emit("add", { value: element, index: 0 });
              };

            case "insert":
              return function (index: number, element: T): void {
                const size = target.size;
                const all = heard.all;
                const first = heard.first;
                (value as Function).call(target, index, element);
                if (!added(target.size, size, heard, all)) return;
                // A drop of the first element below moved each later index one place lower
                emitter.emit("add", { value: element, index: heard.first > first ? Math.max(0, index - 1) : index });
              };

            case "set":
              return function (index: number, element: T): T {
                const oldValue = (value as Function).call(target, index, element);
                emitter.emit("set", { oldValue, newValue: element, index });
                return oldValue;
              };

            case "remove":
              return function (element: T): boolean {
                const result = (value as Function).call(target, element);
                if (result) {
                  emitter.emit("remove", { value: element });
                }
                return result;
              };

            case "removeAt":
              return function (index: number): T {
                const removed = (value as Function).call(target, index);
                emitter.emit("remove", { value: removed, index });
                return removed;
              };

            case "pop":
              return function (): T {
                const removed = (value as Function).call(target);
                // The last element had the index that is now the size
                emitter.emit("remove", { value: removed, index: target.size });
                return removed;
              };

            case "shift":
              return function (): T {
                const removed = (value as Function).call(target);
                emitter.emit("remove", { value: removed, index: 0 });
                return removed;
              };

            case "clear":
              return function (): void {
                (value as Function).call(target);
                emitter.emit("clear", {});
              };

            case "sort":
              return function (...args: any[]): void {
                (value as Function).apply(target, args);
                emitter.emit("sort", {});
              };

            case "reverse":
              return function (): void {
                (value as Function).call(target);
                emitter.emit("reverse", {});
              };
          }
        }

        return value;
      },
    }) as any;
  };
}

/**
 * This function makes an evented Queue middleware.
 */
export function eventedQueue<T>(): Middleware<
  Queue<T>,
  Queue<T> & {
    on<E extends keyof QueueEvents<T>>(
      event: E,
      listener: (payload: QueueEvents<T>[E]) => void
    ): Unsubscribe;
  }
> {
  return (next: Queue<T>) => {
    const emitter = new Emitter<QueueEvents<T>>();
    hear<ElementRemoval<T>>(next, ({ value, reason }) => emitter.emit("dequeue", { value, reason }));

    return new Proxy(next, {
      get(target, prop, receiver) {
        if (prop === "on") {
          return emitter.on.bind(emitter);
        }

        const value = Reflect.get(target, prop, receiver);

        if (typeof value === "function") {
          switch (prop) {
            case "offer":
            case "enqueue":
            case "add":
              return function (element: T): any {
                const result = (value as Function).call(target, element);
                if (result !== false) {
                  emitter.emit("enqueue", { value: element });
                }
                return result;
              };

            case "poll":
            case "dequeue":
              return function (): T {
                const removed = (value as Function).call(target);
                emitter.emit("dequeue", { value: removed });
                return removed;
              };

            case "clear":
              return function (): void {
                (value as Function).call(target);
                emitter.emit("clear", {});
              };
          }
        }

        return value;
      },
    }) as any;
  };
}

/**
 * This function makes an evented Deque middleware.
 */
export function eventedDeque<T>(): Middleware<
  Deque<T>,
  Deque<T> & {
    on<E extends keyof DequeEvents<T>>(
      event: E,
      listener: (payload: DequeEvents<T>[E]) => void
    ): Unsubscribe;
  }
> {
  return (next: Deque<T>) => {
    const emitter = new Emitter<DequeEvents<T>>();
    const heard = hear<ElementRemoval<T>>(next, ({ value, end, reason }) =>
      emitter.emit(end === "last" ? "removeLast" : "removeFirst", { value, reason }),
    );

    return new Proxy(next, {
      get(target, prop, receiver) {
        if (prop === "on") {
          return emitter.on.bind(emitter);
        }

        const value = Reflect.get(target, prop, receiver);

        if (typeof value === "function") {
          switch (prop) {
            // push of a deque adds at the end (see Deque.push). A layer below can refuse the element.
            case "addFirst":
            case "offerFirst":
            case "addLast":
            case "offerLast":
            case "offer":
            case "add":
            case "push":
              return function (element: T): any {
                const size = target.size;
                const all = heard.all;
                const result = (value as Function).call(target, element);
                if (added(target.size, size, heard, all)) {
                  emitter.emit(prop === "addFirst" || prop === "offerFirst" ? "addFirst" : "addLast", { value: element });
                }
                return result;
              };

            case "removeFirst":
            case "pollFirst":
            case "poll":
            case "dequeue":
              return function (): T {
                const removed = (value as Function).call(target);
                if (removed !== undefined) {
                  emitter.emit("removeFirst", { value: removed });
                }
                return removed;
              };

            case "removeLast":
            case "pollLast":
            case "pop":
              return function (): T {
                const removed = (value as Function).call(target);
                if (removed !== undefined) {
                  emitter.emit("removeLast", { value: removed });
                }
                return removed;
              };

            case "clear":
              return function (): void {
                (value as Function).call(target);
                emitter.emit("clear", {});
              };
          }
        }

        return value;
      },
    }) as any;
  };
}

/**
 * This function makes an evented Map middleware.
 */
export function eventedMap<K, V>(): Middleware<
  MapLike<K, V>,
  MapLike<K, V> & {
    on<E extends keyof MapEvents<K, V>>(
      event: E,
      listener: (payload: MapEvents<K, V>[E]) => void
    ): Unsubscribe;
  }
> {
  return (next: MapLike<K, V>) => {
    const emitter = new Emitter<MapEvents<K, V>>();
    const heard = hear<MapRemoval<K, V>>(next, ({ key, value, reason }) => emitter.emit("delete", { key, value, reason }));

    return new Proxy(next, {
      get(target, prop, receiver) {
        if (prop === "on") {
          return emitter.on.bind(emitter);
        }

        const value = Reflect.get(target, prop, receiver);

        if (typeof value === "function") {
          switch (prop) {
            case "set":
              return function (key: K, val: V): V | undefined {
                const size = target.size;
                const all = heard.all;
                const oldValue = (value as Function).call(target, key, val);
                // A new key that a layer below refused (reject, drop-newest) gives no event
                if (oldValue !== undefined || added(target.size, size, heard, all)) {
                  emitter.emit("set", { key, value: val, oldValue });
                }
                return oldValue;
              };

            case "delete":
              return function (key: K): V | undefined {
                const deletedValue = (value as Function).call(target, key);
                if (deletedValue !== undefined) {
                  emitter.emit("delete", { key, value: deletedValue });
                }
                return deletedValue;
              };

            case "clear":
              return function (): void {
                (value as Function).call(target);
                emitter.emit("clear", {});
              };
          }
        }

        return value;
      },
    }) as any;
  };
}

/**
 * Generic evented collection middleware.
 */
export function evented<T>(): Middleware<
  Collection<T>,
  Collection<T> & {
    on<E extends keyof CollectionEvents<T>>(
      event: E,
      listener: (payload: CollectionEvents<T>[E]) => void
    ): Unsubscribe;
  }
> {
  return (next: Collection<T>) => {
    const emitter = new Emitter<CollectionEvents<T>>();
    hear<ElementRemoval<T>>(next, ({ value, reason }) => emitter.emit("remove", { value, reason }));

    return new Proxy(next, {
      get(target, prop, receiver) {
        if (prop === "on") {
          return emitter.on.bind(emitter);
        }

        const value = Reflect.get(target, prop, receiver);

        if (typeof value === "function") {
          switch (prop) {
            case "add":
              return function (element: T): boolean {
                const result = (value as Function).call(target, element);
                if (result) {
                  emitter.emit("add", { value: element });
                }
                return result;
              };

            case "remove":
              return function (element: T): boolean {
                const result = (value as Function).call(target, element);
                if (result) {
                  emitter.emit("remove", { value: element });
                }
                return result;
              };

            case "clear":
              return function (): void {
                (value as Function).call(target);
                emitter.emit("clear", {});
              };
          }
        }

        return value;
      },
    }) as any;
  };
}
