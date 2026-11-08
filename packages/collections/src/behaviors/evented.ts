/**
 * Evented behavior: this module emits typed events on collection mutations.
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
import type { Entry, MapLike } from "../interfaces/map.js";
import type { Collection } from "../interfaces/collection.js";
import { Emitter, type Unsubscribe } from "../core/events.js";
import { removalsOf, type ElementRemoval, type MapRemoval, type RemovalReason } from "../core/removals.js";
import { compositeMapMethod } from "./composite.js";

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

/**
 * This function gives the removals that change `before` to `after`, in the order of a replay.
 * Each index is the place of the value at the time of its removal. It gives undefined when `after` is not in the order of `before`.
 */
function removalsInOrder<T>(before: readonly T[], after: readonly T[]): { value: T; index: number }[] | undefined {
  const removed: { value: T; index: number }[] = [];
  let kept = 0;
  for (const value of before) {
    if (kept < after.length && Object.is(value, after[kept])) kept++;
    else removed.push({ value, index: kept });
  }
  return kept === after.length ? removed : undefined;
}

/** This function gives the values of `before` that are not in `after`, with each copy counted. The order does not matter. */
function removedValues<T>(before: readonly T[], after: readonly T[]): T[] {
  const left = new Map<T, number>();
  for (const value of after) left.set(value, (left.get(value) ?? 0) + 1);
  const removed: T[] = [];
  for (const value of before) {
    const count = left.get(value) ?? 0;
    if (count > 0) left.set(value, count - 1);
    else removed.push(value);
  }
  return removed;
}

/**
 * This function wraps a bulk removal (removeAll, retainAll, removeRange) of the collection below.
 * The base does the removal with its own equality, and `report` gets the contents before and after it.
 */
function bulkRemoval<T>(
  target: { readonly size: number; toArray(): T[] },
  method: Function,
  report: (before: T[], after: T[]) => void,
): (...args: unknown[]) => unknown {
  return function (...args: unknown[]): unknown {
    const before = target.toArray();
    const result = method.apply(target, args);
    if (target.size !== before.length) report(before, target.toArray());
    return result;
  };
}

/**
 * This function adds each element with `add` of the layer, one after the other.
 * Thus each element gives its own event, with the rules of a single add. It gives true when one element goes in.
 */
function addEach<T>(elements: Iterable<T>, add: (element: T) => boolean): boolean {
  let changed = false;
  for (const element of Array.from(elements)) {
    if (add(element)) changed = true;
  }
  return changed;
}

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
  /** An element left from a place that is not the head: `remove`, `removeAll` or `retainAll`. */
  remove: { value: T };
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
  /** An element left from `index`, not with a method of an end: `remove`, `removeAll` or `retainAll`. */
  remove: { value: T; index: number };
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
      // The key that this layer adds is in the collection, so hasCapability and the operator in find it
      has: (target, prop) => prop === "on" || Reflect.has(target, prop),
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

            // The base writes a bulk change into its storage, and does not call its own add or remove (C24)
            case "addAll":
              return function (elements: Iterable<T>): boolean {
                return addEach(elements, (element) => {
                  const size = target.size;
                  const all = heard.all;
                  (receiver as List<T>).add(element);
                  return added(target.size, size, heard, all);
                });
              };

            case "insertAll":
              return function (index: number, elements: Iterable<T>): boolean {
                let at = index;
                return addEach(elements, (element) => {
                  const size = target.size;
                  const all = heard.all;
                  const first = heard.first;
                  (receiver as List<T>).insert(at, element);
                  const wentIn = added(target.size, size, heard, all);
                  // A drop of the first element below moved the place one lower. The next element goes after a new one.
                  at = Math.min(target.size, Math.max(0, at - (heard.first - first)) + (wentIn ? 1 : 0));
                  return wentIn;
                });
              };

            case "removeAll":
            case "retainAll":
            case "removeRange":
              return bulkRemoval<T>(target, value as Function, (before, after) => {
                const removed = removalsInOrder(before, after);
                if (removed) {
                  for (const removal of removed) emitter.emit("remove", removal);
                  return;
                }
                // A base that changed the order of the rest: a clear and the adds give the same contents
                emitter.emit("clear", {});
                after.forEach((element, at) => emitter.emit("add", { value: element, index: at }));
              });

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
      // The key that this layer adds is in the collection, so hasCapability and the operator in find it
      has: (target, prop) => prop === "on" || Reflect.has(target, prop),
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

            case "pollOrUndefined":
              return function (): T | undefined {
                const size = target.size;
                const removed = (value as Function).call(target);
                if (target.size < size) emitter.emit("dequeue", { value: removed });
                return removed;
              };

            case "clear":
              return function (): void {
                (value as Function).call(target);
                emitter.emit("clear", {});
              };

            // The base writes a bulk change into its storage, and does not call its own add or remove (C24)
            case "addAll":
              return function (elements: Iterable<T>): boolean {
                return addEach(elements, (element) => (receiver as Queue<T>).add(element) !== false);
              };

            case "remove":
            case "removeAll":
            case "retainAll":
              return bulkRemoval<T>(target, value as Function, (before, after) => {
                for (const removed of removedValues(before, after)) emitter.emit("remove", { value: removed });
              });
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
      // The key that this layer adds is in the collection, so hasCapability and the operator in find it
      has: (target, prop) => prop === "on" || Reflect.has(target, prop),
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

            case "pollOrUndefined":
              return function (): T | undefined {
                const size = target.size;
                const removed = (value as Function).call(target);
                if (target.size < size) emitter.emit("removeFirst", { value: removed });
                return removed;
              };

            case "clear":
              return function (): void {
                (value as Function).call(target);
                emitter.emit("clear", {});
              };

            // The base writes a bulk change into its storage, and does not call its own add or remove (C24)
            case "addAll":
              return function (elements: Iterable<T>): boolean {
                return addEach(elements, (element) => {
                  const size = target.size;
                  const all = heard.all;
                  (receiver as Deque<T>).addLast(element);
                  return added(target.size, size, heard, all);
                });
              };

            case "remove":
            case "removeAll":
            case "retainAll":
              return bulkRemoval<T>(target, value as Function, (before, after) => {
                const removed = removalsInOrder(before, after);
                if (removed) {
                  for (const removal of removed) emitter.emit("remove", removal);
                  return;
                }
                // A base that changed the order of the rest: a clear and the adds give the same contents
                emitter.emit("clear", {});
                for (const element of after) emitter.emit("addLast", { value: element });
              });
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
      // The key that this layer adds is in the collection, so hasCapability and the operator in find it
      has: (target, prop) => prop === "on" || Reflect.has(target, prop),
      get(target, prop, receiver) {
        if (prop === "on") {
          return emitter.on.bind(emitter);
        }

        // Composite methods (computeIfAbsent, compute, merge, putAll and others) go through this
        // proxy's own set and delete, so each change gives its event (C24). The base calls its own set.
        const composite = compositeMapMethod(receiver as MapLike<K, V>, prop);
        if (composite) {
          return composite;
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

            // The first or last entry of a navigable map (treeMap)
            case "pollFirstEntry":
            case "pollLastEntry":
              return function (): Entry<K, V> | undefined {
                const entry: Entry<K, V> | undefined = (value as Function).call(target);
                if (entry !== undefined) emitter.emit("delete", { key: entry.key, value: entry.value });
                return entry;
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
      // The key that this layer adds is in the collection, so hasCapability and the operator in find it
      has: (target, prop) => prop === "on" || Reflect.has(target, prop),
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

            // The base writes a bulk change into its storage, and does not call its own add or remove (C24)
            case "addAll":
              return function (elements: Iterable<T>): boolean {
                let changed = false;
                for (const element of Array.from(elements)) {
                  if ((receiver as Collection<T>).add(element)) changed = true;
                }
                return changed;
              };

            case "removeAll":
            case "retainAll":
              return bulkRemoval<T>(target, value as Function, (before, after) => {
                for (const removed of removedValues(before, after)) emitter.emit("remove", { value: removed });
              });

            // The first or last element of a sorted set (treeSet)
            case "pollFirst":
            case "pollLast":
              return function (): T | undefined {
                const size = target.size;
                const removed = (value as Function).call(target);
                if (target.size < size) emitter.emit("remove", { value: removed });
                return removed;
              };
          }
        }

        return value;
      },
    }) as any;
  };
}
