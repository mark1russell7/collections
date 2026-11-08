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
import { hasMembers } from "./members.js";

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
 * The layer bounds each add method of the base, also the deque and queue methods of a linked list (C42).
 * This function supports multiple overflow policies.
 */
export function boundedList<T>(
  options: BoundedOptions<T>
): Middleware<List<T>, List<T> & BoundedCollection> {
  return boundedElements<List<T>, T>("List", checkCapacity(options.capacity, "boundedList"), options);
}

/**
 * This function makes a bounded Queue middleware.
 *
 * The layer bounds each add method of the base, also `push`, `addFirst` and `addLast` of a deque (C42).
 */
export function boundedQueue<T>(
  options: BoundedOptions<T>
): Middleware<Queue<T>, Queue<T> & BoundedCollection> {
  return boundedElements<Queue<T>, T>("Queue", checkCapacity(options.capacity, "boundedQueue"), options);
}

/**
 * This function makes a bounded Deque middleware.
 *
 * The layer bounds each add method of the base, also `insert` and `insertAll` of a linked list (C42).
 */
export function boundedDeque<T>(
  options: BoundedOptions<T>
): Middleware<Deque<T>, Deque<T> & BoundedCollection> {
  return boundedElements<Deque<T>, T>("Deque", checkCapacity(options.capacity, "boundedDeque"), options);
}

/** An end of a sequence. The policy `drop-oldest` removes the element at this end. */
type End = "first" | "last";

/**
 * This table gives each add method of one element, and the end that `drop-oldest` takes for it.
 * A front add drops the last element. Each other add drops the first element (C21).
 */
const addEnds: Readonly<Record<string, End>> = {
  add: "first",
  push: "first",
  addLast: "first",
  offer: "first",
  offerLast: "first",
  enqueue: "first",
  unshift: "last",
  addFirst: "last",
  offerFirst: "last",
};

/** These add methods give a boolean, so they give false for an element that the layer refuses. */
const givesBoolean: ReadonlySet<string> = new Set(["add", "offer", "offerLast", "offerFirst", "enqueue"]);

/** The remove methods of a sequence that `dropAt` uses. Each base has some of them. */
interface Ends<T> {
  removeFirst?(): T;
  removeLast?(): T;
  shift?(): T | undefined;
  pop?(): T | undefined;
  poll?(): T | undefined;
}

/**
 * This function removes the element at one end of a base and gives it.
 * A deque has `removeFirst` and `removeLast`, a list has `shift` and `pop`, and a queue has `poll`.
 */
function dropAt<T>(base: Ends<T>, end: End): T {
  if (end === "last") return (base.removeLast ? base.removeLast() : base.pop?.()) as T;
  if (base.removeFirst) return base.removeFirst();
  return (base.shift ? base.shift() : base.poll?.()) as T;
}

/**
 * This function adds each element with `add`, one after the other, until `add` refuses one.
 * It gives true when one element goes in. A throw of `add` stops it, and the earlier elements stay.
 */
function addEach<T>(elements: Iterable<T>, add: (element: T) => boolean): boolean {
  let added = false;
  for (const element of elements) {
    if (!add(element)) break;
    added = true;
  }
  return added;
}

/**
 * This function makes the bounded layer of a list, a queue or a deque.
 * The layer bounds each method of `addEnds`, and `insert`, `insertAll` and `addAll`, that the base has.
 */
function boundedElements<C extends Collection<T>, T>(
  kind: "List" | "Queue" | "Deque",
  capacity: number,
  options: BoundedOptions<T>
): Middleware<C, C & BoundedCollection> {
  const { policy = "throw", onOverflow } = options;

  return (next: C): C & BoundedCollection => {
    const source = removalSource<ElementRemoval<T>>(next);
    const handleOverflow = (element: T, dropFrom: End): void => {
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
          throw new Error(`${kind} is full (capacity: ${capacity})`);
        case "drop-oldest":
          if (!next.isEmpty) {
            const value = dropAt(next as unknown as Ends<T>, dropFrom);
            source.emit({ value, end: dropFrom, reason: "drop" });
          }
          break;
        case "drop-newest":
        case "reject":
        case "grow":
          return;
        case "block":
          throw new Error("Block policy not supported for sync collections");
        default:
          throw new Error(`Unknown overflow policy: ${policy}`);
      }
    };
    // These policies keep the new element out of a full collection
    const refuses = policy === "reject" || policy === "drop-newest";
    const full = (): boolean => next.size >= capacity && policy !== "grow";

    // After drop-oldest removed the first element, an index of the caller is one place lower
    const shifted = (index: number): number => (policy === "drop-oldest" ? Math.max(0, index - 1) : index);
    // A front insert drops the last element, as unshift does. Each other insert drops the first element, as push does.
    const dropEnd = (index: number): End => (index === 0 ? "last" : "first");
    // An index that the base refuses goes to the base before a drop, so the base throws and no element goes
    const inRange = (index: unknown): boolean =>
      Number.isInteger(index) && (index as number) >= 0 && (index as number) <= next.size;

    return new Proxy(next, {
      has: hasMembers(removals, "capacity", "isFull", "remainingCapacity"),
      get(target, prop, receiver) {
        if (prop === removals) return source.channel;
        if (prop === "capacity") return capacity;
        if (prop === "isFull") return target.size >= capacity;
        if (prop === "remainingCapacity") return Math.max(0, capacity - target.size);

        const value = Reflect.get(target, prop, receiver);
        if (typeof value !== "function" || typeof prop !== "string") return value;

        const end = Object.hasOwn(addEnds, prop) ? addEnds[prop] : undefined;
        if (end !== undefined) {
          return function (element: T): unknown {
            if (full()) {
              handleOverflow(element, end);
              if (refuses) return givesBoolean.has(prop) ? false : undefined;
            }
            return (value as Function).call(target, element);
          };
        }

        switch (prop) {
          case "insert":
            return function (index: number, element: T): void {
              let at = index;
              if (inRange(index) && full()) {
                const dropFrom = dropEnd(index);
                handleOverflow(element, dropFrom);
                if (refuses) return;
                if (dropFrom === "first") at = shifted(at);
              }
              (value as Function).call(target, at, element);
            };

          case "addAll":
          case "insertAll":
            return function (...args: any[]): boolean {
              const elementsArray = Array.from(args[args.length - 1] as Iterable<T>);
              const inserting = prop === "insertAll";
              // Each element of addAll goes through add of the top proxy, so a layer above sees each add (C10)
              if (!inserting) return addEach(elementsArray, (element) => (receiver as { add(element: T): unknown }).add(element) !== false);
              if (!inRange(args[0]) || next.size + elementsArray.length <= capacity || policy === "grow") {
                return (value as Function).call(target, ...args.slice(0, -1), elementsArray);
              }
              // Insert elements one by one with overflow handling. An insert keeps the order of
              // the elements, at an index that follows each drop. The index of the call gives
              // the drop end of each element: an insertAll at 0 is a front insert.
              const base = target as unknown as { insert(index: number, element: T): void };
              let added = false;
              let at = args[0] as number;
              const dropFrom = dropEnd(at);
              for (const element of elementsArray) {
                if (target.size >= capacity) {
                  handleOverflow(element, dropFrom);
                  if (refuses) break;
                  // A drop from the last end can take an element of this call: then the index is the size
                  at = dropFrom === "first" ? shifted(at) : Math.min(at, target.size);
                }
                base.insert(at, element);
                at++;
                added = true;
              }
              return added;
            };
        }

        return value;
      },
    }) as C & BoundedCollection;
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
      has: hasMembers(removals, "capacity", "isFull", "remainingCapacity"),
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
