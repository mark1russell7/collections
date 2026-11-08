/**
 * Bounded behavior: this module enforces capacity limits on collections.
 *
 * This module wraps collections to prevent them from exceeding a maximum size.
 * This module gives various overflow policies to handle full collections.
 *
 * @example
 * const list = compose(
 *   boundedList<number>({ capacity: 100, policy: 'drop-oldest' })
 * )(arrayList<number>())
 *
 * // Add 101 elements - first element will be dropped
 * for (let i = 0; i < 101; i++) {
 *   list.add(i)
 * }
 */

import { checkCapacity } from "../core/capacity.js";
import type { Middleware } from "../core/middleware.js";
import type { List } from "../interfaces/list.js";
import type { Queue, Deque } from "../interfaces/queue.js";
import type { MapLike } from "../interfaces/map.js";
import { removals, removalSource, type ElementRemoval, type MapRemoval } from "../core/removals.js";
import type { Collection } from "../interfaces/collection.js";
import type {
  OverflowPolicy,
  OverflowHandler,
  OverflowContext,
} from "../core/policies.js";

/**
 * Options for bounded behavior.
 */
export interface BoundedOptions<T> {
  /**
   * Maximum number of elements the collection can hold.
   */
  capacity: number;

  /**
   * Policy for handling overflow when collection is full.
   * @default 'throw'
   */
  policy?: OverflowPolicy;

  /**
   * Optional callback invoked when overflow occurs.
   * The behavior calls this function before it applies the policy.
   */
  onOverflow?: OverflowHandler<T>;
}

/**
 * Marker interface for bounded collections.
 */
export interface BoundedCollection {
  readonly capacity: number;
  readonly isFull: boolean;
  readonly remainingCapacity: number;
}

/**
 * This function makes a bounded List middleware.
 *
 * Intercepts add operations to enforce capacity limits.
 * This function supports multiple overflow policies.
 */
export function boundedList<T>(
  options: BoundedOptions<T>
): Middleware<List<T>, List<T> & BoundedCollection> {
  const { policy = "throw", onOverflow } = options;
  const capacity = checkCapacity(options.capacity, "boundedList");

  return (next: List<T>): List<T> & BoundedCollection => {
    const source = removalSource<ElementRemoval<T>>(next);
    // An unshift puts the element at the front, so drop-oldest drops the last element for it
    const handleOverflow = (element: T, dropFrom: "first" | "last" = "first"): void => {
      // Call overflow handler if provided
      if (onOverflow) {
        const context: OverflowContext<T> = {
          newElement: element,
          currentSize: next.size,
          capacity,
          timestamp: Date.now(),
        };
        onOverflow(context);
      }

      // Apply policy
      switch (policy) {
        case "throw":
          throw new Error(`List is full (capacity: ${capacity})`);

        case "drop-oldest":
          // Remove one element: the first, or the last for an unshift
          if (!next.isEmpty) {
            const value = dropFrom === "last" ? next.pop() : next.shift();
            source.emit({ value, end: dropFrom, reason: "drop" });
          }
          break;

        case "drop-newest":
          // Don't add the new element (do nothing)
          return;

        case "reject":
          // Silently reject (return false for add operations)
          return;

        case "grow":
          // Allow growth (do nothing, element will be added)
          return;

        case "block":
          throw new Error("Block policy not supported for sync collections");

        default:
          throw new Error(`Unknown overflow policy: ${policy}`);
      }
    };

    // After drop-oldest removed the first element, an index of the caller is one place lower
    const shifted = (index: number): number => (policy === "drop-oldest" ? Math.max(0, index - 1) : index);
    // A front insert drops the last element, as unshift does. Each other insert drops the first element, as push does.
    const dropEnd = (index: number): "first" | "last" => (index === 0 ? "last" : "first");
    // An index that the base refuses goes to the base before a drop, so the base throws and no element goes
    const inRange = (index: unknown): boolean =>
      Number.isInteger(index) && (index as number) >= 0 && (index as number) <= next.size;

    return new Proxy(next, {
      get(target, prop, receiver) {
        // Capacity property
        if (prop === removals) return source.channel;
        if (prop === "capacity") {
          return capacity;
        }

        // isFull property
        if (prop === "isFull") {
          return target.size >= capacity;
        }

        // remainingCapacity property
        if (prop === "remainingCapacity") {
          return Math.max(0, capacity - target.size);
        }

        const value = Reflect.get(target, prop, receiver);

        // Intercept methods that add elements
        if (typeof value === "function") {
          switch (prop) {
            case "add":
              return function (element: T): boolean {
                if (target.size >= capacity && policy !== "grow") {
                  handleOverflow(element);
                  if (policy === "reject" || policy === "drop-newest") {
                    return false;
                  }
                }
                return (value as Function).call(target, element);
              };

            case "push":
              return function (element: T): void {
                if (target.size >= capacity && policy !== "grow") {
                  handleOverflow(element);
                  if (policy === "reject" || policy === "drop-newest") {
                    return;
                  }
                }
                (value as Function).call(target, element);
              };

            case "unshift":
              return function (element: T): void {
                if (target.size >= capacity && policy !== "grow") {
                  // One element goes: the last one (before, the first and the last went: audit pass 2)
                  handleOverflow(element, "last");
                  if (policy === "reject" || policy === "drop-newest") {
                    return;
                  }
                }
                (value as Function).call(target, element);
              };

            case "insert":
              return function (index: number, element: T): void {
                let at = index;
                if (inRange(index) && target.size >= capacity && policy !== "grow") {
                  const end = dropEnd(index);
                  handleOverflow(element, end);
                  if (policy === "reject" || policy === "drop-newest") {
                    return;
                  }
                  if (end === "first") at = shifted(at);
                }
                (value as Function).call(target, at, element);
              };

            case "addAll":
            case "insertAll":
              return function (...args: any[]): boolean {
                const elements = args[args.length - 1] as Iterable<T>;
                const elementsArray = Array.from(elements);

                // Check if adding all elements would exceed capacity
                const inserting = prop === "insertAll";
                if ((!inserting || inRange(args[0])) && target.size + elementsArray.length > capacity && policy !== "grow") {
                  // Add elements one by one with overflow handling. An insert keeps the order of
                  // the elements, at an index that follows each drop. The index of the call gives
                  // the drop end of each element: an insertAll at 0 is a front insert.
                  let added = false;
                  let at = args[0] as number;
                  const end = inserting ? dropEnd(at) : "first";
                  for (const element of elementsArray) {
                    if (target.size >= capacity) {
                      handleOverflow(element, end);
                      if (policy === "reject" || policy === "drop-newest") {
                        break;
                      }
                      // A drop from the last end can take an element of this call: then the index is the size
                      at = end === "first" ? shifted(at) : Math.min(at, target.size);
                    }
                    if (prop === "addAll") {
                      target.add(element);
                    } else {
                      target.insert(at, element);
                      at++;
                    }
                    added = true;
                  }
                  return added;
                }

                return (value as Function).apply(target, args);
              };
          }
        }

        return value;
      },
    }) as List<T> & BoundedCollection;
  };
}

/**
 * This function adds each element with `add`, one after the other, until `add` refuses one.
 * It gives true when one element goes in. A throw of `add` stops it, and the earlier elements stay.
 */
function addEach<T>(elements: Iterable<T>, add: (element: T) => boolean): boolean {
  let added = false;
  for (const element of Array.from(elements)) {
    if (!add(element)) break;
    added = true;
  }
  return added;
}

/**
 * This function makes a bounded Queue middleware.
 */
export function boundedQueue<T>(
  options: BoundedOptions<T>
): Middleware<Queue<T>, Queue<T> & BoundedCollection> {
  const { policy = "throw", onOverflow } = options;
  const capacity = checkCapacity(options.capacity, "boundedQueue");

  return (next: Queue<T>): Queue<T> & BoundedCollection => {
    const source = removalSource<ElementRemoval<T>>(next);
    const handleOverflow = (element: T): void => {
      if (onOverflow) {
        const context: OverflowContext<T> = {
          newElement: element,
          currentSize: next.size,
          capacity,
          timestamp: Date.now(),
        };
        onOverflow(context);
      }

      switch (policy) {
        case "throw":
          throw new Error(`Queue is full (capacity: ${capacity})`);
        case "drop-oldest":
          if (!next.isEmpty) {
            source.emit({ value: next.poll() as T, end: "first", reason: "drop" });
          }
          break;
        case "drop-newest":
        case "reject":
          return;
        case "grow":
          return;
        case "block":
          throw new Error("Block policy not supported for sync collections");
        default:
          throw new Error(`Unknown overflow policy: ${policy}`);
      }
    };

    return new Proxy(next, {
      get(target, prop, receiver) {
        if (prop === removals) return source.channel;
        if (prop === "capacity") return capacity;
        if (prop === "isFull") return target.size >= capacity;
        if (prop === "remainingCapacity") return Math.max(0, capacity - target.size);

        const value = Reflect.get(target, prop, receiver);

        if (typeof value === "function") {
          switch (prop) {
            case "offer":
            case "enqueue":
            case "add":
              return function (element: T): boolean {
                if (target.size >= capacity && policy !== "grow") {
                  handleOverflow(element);
                  if (policy === "reject" || policy === "drop-newest") {
                    return false;
                  }
                }
                return (value as Function).call(target, element);
              };

            // The base addAll goes past the bound, so each element goes through add of this proxy (C10)
            case "addAll":
              return function (elements: Iterable<T>): boolean {
                return addEach(elements, (element) => (receiver as Queue<T>).add(element));
              };
          }
        }

        return value;
      },
    }) as Queue<T> & BoundedCollection;
  };
}

/**
 * This function makes a bounded Deque middleware.
 */
export function boundedDeque<T>(
  options: BoundedOptions<T>
): Middleware<Deque<T>, Deque<T> & BoundedCollection> {
  const { policy = "throw", onOverflow } = options;
  const capacity = checkCapacity(options.capacity, "boundedDeque");

  return (next: Deque<T>): Deque<T> & BoundedCollection => {
    const source = removalSource<ElementRemoval<T>>(next);
    // An insert at the front drops the last element, as unshift of boundedList does (C10)
    const handleOverflow = (element: T, dropFrom: "first" | "last"): void => {
      if (onOverflow) {
        const context: OverflowContext<T> = {
          newElement: element,
          currentSize: next.size,
          capacity,
          timestamp: Date.now(),
        };
        onOverflow(context);
      }

      switch (policy) {
        case "throw":
          throw new Error(`Deque is full (capacity: ${capacity})`);
        case "drop-oldest":
          if (!next.isEmpty) {
            const value = dropFrom === "last" ? next.removeLast() : next.removeFirst();
            source.emit({ value, end: dropFrom, reason: "drop" });
          }
          break;
        case "drop-newest":
        case "reject":
          return;
        case "grow":
          return;
        case "block":
          throw new Error("Block policy not supported for sync collections");
        default:
          throw new Error(`Unknown overflow policy: ${policy}`);
      }
    };

    return new Proxy(next, {
      get(target, prop, receiver) {
        if (prop === removals) return source.channel;
        if (prop === "capacity") return capacity;
        if (prop === "isFull") return target.size >= capacity;
        if (prop === "remainingCapacity") return Math.max(0, capacity - target.size);

        const value = Reflect.get(target, prop, receiver);

        if (typeof value === "function") {
          switch (prop) {
            case "addFirst":
            case "addLast":
            case "offerFirst":
            case "offerLast":
            case "push":
            case "offer":
            case "add":
              return function (element: T): any {
                if (target.size >= capacity && policy !== "grow") {
                  handleOverflow(element, prop === "addFirst" || prop === "offerFirst" ? "last" : "first");
                  if (policy === "reject" || policy === "drop-newest") {
                    return prop.startsWith("offer") || prop === "add" ? false : undefined;
                  }
                }
                return (value as Function).call(target, element);
              };

            // The base addAll goes past the bound, so each element goes through add of this proxy (C10)
            case "addAll":
              return function (elements: Iterable<T>): boolean {
                return addEach(elements, (element) => (receiver as Deque<T>).add(element));
              };
          }
        }

        return value;
      },
    }) as Deque<T> & BoundedCollection;
  };
}

/**
 * This function makes a bounded Map middleware.
 */
export function boundedMap<K, V>(
  options: Omit<BoundedOptions<V>, "onOverflow"> & {
    onOverflow?: (context: Omit<OverflowContext<V>, "newElement"> & { key: K; value: V }) => void;
  }
): Middleware<MapLike<K, V>, MapLike<K, V> & BoundedCollection> {
  const { policy = "throw", onOverflow } = options;
  const capacity = checkCapacity(options.capacity, "boundedMap");

  return (next: MapLike<K, V>): MapLike<K, V> & BoundedCollection => {
    let insertionOrder: K[] = []; // Track insertion order for drop-oldest
    // A removal below (for example an eviction of lruMap) takes its key out of the order
    const source = removalSource<MapRemoval<K, V>>(next, ({ key }) => {
      insertionOrder = insertionOrder.filter((k) => !next.keyEq(k, key));
    });

    const handleOverflow = (key: K, value: V): void => {
      if (onOverflow) {
        onOverflow({
          key,
          value,
          currentSize: next.size,
          capacity,
          timestamp: Date.now(),
        });
      }

      switch (policy) {
        case "throw":
          throw new Error(`Map is full (capacity: ${capacity})`);
        case "drop-oldest":
          // Remove oldest key
          // The removal channel below keeps the order exact. A layer below with no channel can remove a key
          // without this layer seeing it, so a drop skips each key that is gone.
          while (insertionOrder.length > 0) {
            const oldestKey = insertionOrder.shift()!;
            if (!next.has(oldestKey)) continue;
            const value = next.get(oldestKey);
            next.delete(oldestKey);
            source.emit({ key: oldestKey, value, reason: "drop" });
            break;
          }
          break;
        case "drop-newest":
        case "reject":
          return;
        case "grow":
          return;
        case "block":
          throw new Error("Block policy not supported for sync collections");
        default:
          throw new Error(`Unknown overflow policy: ${policy}`);
      }
    };

    return new Proxy(next, {
      get(target, prop, receiver) {
        if (prop === removals) return source.channel;
        if (prop === "capacity") return capacity;
        if (prop === "isFull") return target.size >= capacity;
        if (prop === "remainingCapacity") return Math.max(0, capacity - target.size);

        const value = Reflect.get(target, prop, receiver);

        if (typeof value === "function") {
          switch (prop) {
            case "set":
              return function (key: K, val: V): V | undefined {
                const hadKey = target.has(key);

                if (!hadKey && target.size >= capacity && policy !== "grow") {
                  handleOverflow(key, val);
                  if (policy === "reject" || policy === "drop-newest") {
                    return undefined;
                  }
                }

                const result = (value as Function).call(target, key, val);

                // Track insertion order
                if (!hadKey) {
                  insertionOrder.push(key);
                }

                return result;
              };

            case "delete":
              return function (key: K): V | undefined {
                const result = (value as Function).call(target, key);
                // Remove from insertion order tracking
                insertionOrder = insertionOrder.filter((k) => !target.keyEq(k, key));
                return result;
              };

            case "clear":
              return function (): void {
                (value as Function).call(target);
                insertionOrder = [];
              };
          }
        }

        return value;
      },
    }) as MapLike<K, V> & BoundedCollection;
  };
}

/**
 * Generic bounded collection middleware.
 * Works with any collection type.
 */
export function bounded<C extends Collection<any>>(
  options: BoundedOptions<any>
): Middleware<C, C & BoundedCollection> {
  return boundedList(options) as any;
}
