/**
 * TTL (Time-To-Live) expiration behavior.
 *
 * The behavior removes each element when its time to live ends.
 * Perfect for temporary caches and time-limited data.
 *
 * @example
 * const cache = compose(
 *   ttlMap<string, Data>({ ttl: 60000 }) // 60 seconds
 * )(hashMap<string, Data>())
 *
 * cache.set('key', data)
 * // After 60 seconds, 'key' is automatically removed
 */

import type { Middleware } from "../core/middleware.js";
import type { Entry, MapLike } from "../interfaces/map.js";
import { compositeMapMethod } from "./composite.js";
import { removals, removalSource, type ElementRemoval, type MapRemoval } from "../core/removals.js";
import { elementEquality, keyIndex, mapEquality } from "../core/key-index.js";
import type { Collection } from "../interfaces/collection.js";
import { hasMembers } from "./members.js";
import type { Cancel, Clock } from "@mark1russell7/algebra/clock";
import { systemClock } from "../core/system-clock.js";

/**
 * This function starts the background expiration checker on a clock, and gives the function that stops it.
 * The checker starts again before each check, so a check that throws does not stop it. An interval
 * less than 1 ms is 1 ms, as with `setInterval`.
 */
function startExpirationTimer(clock: Clock, check: () => void, interval: number): Cancel {
  const every = Math.max(1, interval);
  let cancel: Cancel;
  const tick = (): void => {
    cancel = clock.after(every, tick);
    check();
  };
  cancel = clock.after(every, tick);
  return () => cancel();
}

/**
 * Options for TTL behavior.
 */
export interface TTLOptions {
  /**
   * Time-to-live in milliseconds.
   * Elements expire after this duration.
   */
  ttl: number;

  /**
   * Interval for checking expired elements (in milliseconds).
   * @default 1000 (check every second)
   */
  checkInterval?: number;

  /**
   * Optional callback invoked when an element expires.
   */
  onExpire?: (info: { key: any; value: any; createdAt: number; expiredAt: number }) => void;

  /**
   * The clock of the times and of the background check. A test gives `fakeClock()` of
   * `@mark1russell7/algebra/clock`, and the expiry times are then exact. The default clock reads `Date.now()`.
   * A monotonic clock (`realClock`) keeps the order of expiry also when the wall clock goes back.
   */
  clock?: Clock;
}

/**
 * Metadata for TTL tracking.
 */
interface TTLEntry<V> {
  value: V;
  expiresAt: number;
  createdAt: number;
}

/**
 * This function makes a TTL Map middleware.
 *
 * An entry is live while the time is less than the time of its last `set` plus `ttl`.
 * Each access to the map first removes the expired entries, so each read shows only live entries.
 * The layer gives each expired entry to `onExpire` one time, in the order of expiry.
 * A background interval also removes expired entries, so `onExpire` occurs with no access.
 *
 * The layer keeps the times in the order of expiry, so the removal before an access is amortized O(1).
 * This order needs a clock that does not go back. If the clock goes back, an entry can stay until the entries before it expire.
 */
export function ttlMap<K, V>(
  options: TTLOptions
): Middleware<MapLike<K, V>, MapLike<K, V> & { readonly dispose: () => void }> {
  const { ttl, checkInterval = 1000, onExpire, clock = systemClock } = options;

  return (
    next: MapLike<K, V>
  ): MapLike<K, V> & { readonly dispose: () => void } => {
    // The times of the live keys, in the order of expiry: a set deletes its key before it adds it again.
    // The index finds a key with the equality of the base (C20).
    const metadata = keyIndex<K, TTLEntry<V>>(mapEquality(next));
    // A removal below (for example an eviction of lruMap) ends the time of its key, so it never expires
    const source = removalSource<MapRemoval<K, V>>(next, ({ key }) => void metadata.delete(key));

    // This function removes the expired entries from the front of the order, and stops at the first live entry
    const sweep = (): void => {
      const now = clock.now();
      for (const [key, entry] of metadata) {
        if (now < entry.expiresAt) return;
        metadata.delete(key);
        next.delete(key);
        onExpire?.({ key, value: entry.value, createdAt: entry.createdAt, expiredAt: now });
        source.emit({ key, value: entry.value, reason: "expire" });
      }
    };

    let stop: Cancel | null = startExpirationTimer(clock, sweep, checkInterval);

    const dispose = (): void => {
      stop?.();
      stop = null;
    };

    return new Proxy(next, {
      has: hasMembers("dispose", removals),
      get(target, prop, receiver) {
        if (prop === "dispose") {
          return dispose;
        }
        if (prop === removals) {
          return source.channel;
        }

        // Composite methods (setIfAbsent, compute, merge, putAll and others) go through this
        // proxy's own primitives, so they keep the expiry rules (BUGS-2026-07 L13)
        const composite = compositeMapMethod(receiver as MapLike<K, V>, prop);
        if (composite) {
          return composite;
        }

        // A getter (size, isEmpty) reads only live entries
        sweep();
        const value = Reflect.get(target, prop, receiver);
        if (typeof value !== "function") {
          return value;
        }

        switch (prop) {
          case "set":
            return function (key: K, val: V): V | undefined {
              sweep();
              const result = (value as Function).call(target, key, val);
              const now = clock.now();
              metadata.delete(key);
              metadata.set(key, { value: val, expiresAt: now + ttl, createdAt: now });
              return result;
            };

          case "delete":
            return function (key: K): V | undefined {
              sweep();
              metadata.delete(key);
              return (value as Function).call(target, key);
            };

          case "clear":
            return function (): void {
              metadata.clear();
              (value as Function).call(target);
            };

          // The iteration gives the entries that are live when it starts. A removal while it runs (by a read in
          // the loop, or by the interval between the steps of an async loop) does not change it, so the base
          // iterator never sees a change and never throws.
          case Symbol.iterator:
          case "entries":
            return function (): IterableIterator<Entry<K, V>> {
              sweep();
              return Array.from(target as Iterable<Entry<K, V>>).values();
            };

          case "keys":
            return function (): IterableIterator<K> {
              sweep();
              return Array.from(target as Iterable<Entry<K, V>>, (e) => e.key).values();
            };

          case "values":
            return function (): IterableIterator<V> {
              sweep();
              return Array.from(target as Iterable<Entry<K, V>>, (e) => e.value).values();
            };

          case "forEach":
            return function (callback: (value: V, key: K, map: MapLike<K, V>) => void): void {
              sweep();
              for (const e of Array.from(target as Iterable<Entry<K, V>>)) callback(e.value, e.key, receiver as MapLike<K, V>);
            };

          default:
            // Each other method (get, has, getOrUndefined, the iteration) reads only live entries,
            // also when a caller keeps the method and calls it later
            return function (this: unknown, ...args: unknown[]): unknown {
              sweep();
              return (value as Function).apply(target, args);
            };
        }
      },
    }) as MapLike<K, V> & { readonly dispose: () => void };
  };
}

/**
 * This function makes a TTL Collection middleware.
 *
 * Note: This is less precise than TTL map because collections don't have keys.
 * Elements are tracked by reference, which can fail for primitive types.
 */
export function ttlCollection<T>(
  options: Omit<TTLOptions, "onExpire"> & {
    onExpire?: (info: { element: T; createdAt: number; expiredAt: number }) => void;
  }
): Middleware<Collection<T>, Collection<T> & { readonly dispose: () => void }> {
  const { ttl, checkInterval = 1000, onExpire, clock = systemClock } = options;

  return (
    next: Collection<T>
  ): Collection<T> & { readonly dispose: () => void } => {
    const metadata = keyIndex<T, { expiresAt: number; createdAt: number }>(elementEquality(next));
    const source = removalSource<ElementRemoval<T>>(next, ({ value }) => void metadata.delete(value));

    const checkExpired = (): void => {
      const now = clock.now();
      const expired: T[] = [];

      for (const [element, entry] of metadata) {
        if (now >= entry.expiresAt) {
          expired.push(element);
        }
      }

      for (const element of expired) {
        const entry = metadata.get(element);
        if (entry) {
          next.remove(element);
          metadata.delete(element);

          if (onExpire) {
            onExpire({
              element,
              createdAt: entry.createdAt,
              expiredAt: now,
            });
          }
          source.emit({ value: element, reason: "expire" });
        }
      }
    };

    let stop: Cancel | null = startExpirationTimer(clock, checkExpired, checkInterval);

    const dispose = (): void => {
      stop?.();
      stop = null;
    };

    return new Proxy(next, {
      has: hasMembers("dispose", removals),
      get(target, prop, receiver) {
        if (prop === "dispose") {
          return dispose;
        }
        if (prop === removals) {
          return source.channel;
        }

        const value = Reflect.get(target, prop, receiver);

        if (typeof value === "function") {
          switch (prop) {
            case "add":
              return function (element: T): boolean {
                const result = (value as Function).call(target, element);
                if (result) {
                  const now = clock.now();
                  metadata.set(element, {
                    expiresAt: now + ttl,
                    createdAt: now,
                  });
                }
                return result;
              };

            case "remove":
              return function (element: T): boolean {
                const result = (value as Function).call(target, element);
                if (result) {
                  metadata.delete(element);
                }
                return result;
              };

            case "clear":
              return function (): void {
                (value as Function).call(target);
                metadata.clear();
              };
          }
        }

        return value;
      },
    }) as Collection<T> & { readonly dispose: () => void };
  };
}

/**
 * Standalone TTL cache with Map-like API.
 *
 * @example
 * const cache = new TTLCache<string, number>(60000) // 60 second TTL
 * cache.set('key', 42)
 * setTimeout(() => {
 *   cache.get('key') // undefined (expired)
 * }, 61000)
 */
export class TTLCache<K, V> {
  private readonly ttl: number;
  private readonly checkInterval: number;
  private readonly onExpire: ((key: K, value: V) => void) | undefined;
  private readonly clock: Clock;
  private map = new Map<K, TTLEntry<V>>();
  private stop: Cancel | null = null;

  /**
   * @param ttl - The time to live of an entry, in milliseconds.
   * @param checkInterval - The time between two background checks, in milliseconds.
   * @param onExpire - The function that gets each expired entry.
   * @param clock - The clock of the times and of the background check. The default clock reads `Date.now()`.
   */
  constructor(
    ttl: number,
    checkInterval: number = 1000,
    onExpire?: ((key: K, value: V) => void) | undefined,
    clock: Clock = systemClock
  ) {
    this.ttl = ttl;
    this.checkInterval = checkInterval;
    this.onExpire = onExpire;
    this.clock = clock;
    this.startExpirationCheck();
  }

  get size(): number {
    this.cleanup();
    return this.map.size;
  }

  get(key: K): V | undefined {
    const entry = this.map.get(key);
    if (!entry) return undefined;

    if (this.clock.now() >= entry.expiresAt) {
      this.map.delete(key);
      if (this.onExpire) {
        this.onExpire(key, entry.value);
      }
      return undefined;
    }

    return entry.value;
  }

  set(key: K, value: V, customTTL?: number): void {
    const now = this.clock.now();
    const ttlToUse = customTTL !== undefined ? customTTL : this.ttl;

    this.map.set(key, {
      value,
      expiresAt: now + ttlToUse,
      createdAt: now,
    });
  }

  has(key: K): boolean {
    return this.get(key) !== undefined;
  }

  delete(key: K): boolean {
    return this.map.delete(key);
  }

  clear(): void {
    this.map.clear();
  }

  /**
   * This method removes the expired entries at once.
   */
  cleanup(): void {
    const now = this.clock.now();
    const expired: K[] = [];

    for (const [key, entry] of this.map) {
      if (now >= entry.expiresAt) {
        expired.push(key);
      }
    }

    for (const key of expired) {
      const entry = this.map.get(key);
      if (entry) {
        this.map.delete(key);
        if (this.onExpire) {
          this.onExpire(key, entry.value);
        }
      }
    }
  }

  /**
   * This method gives the remaining TTL of a key, in milliseconds.
   * This method gives undefined if key doesn't exist or is expired.
   */
  getTTL(key: K): number | undefined {
    const entry = this.map.get(key);
    if (!entry) return undefined;

    const remaining = entry.expiresAt - this.clock.now();
    return remaining > 0 ? remaining : undefined;
  }

  /**
   * This method updates the TTL of a key that is in the map.
   */
  touch(key: K, customTTL?: number): boolean {
    const entry = this.map.get(key);
    if (!entry) return false;

    if (this.clock.now() >= entry.expiresAt) {
      this.map.delete(key);
      return false;
    }

    const ttlToUse = customTTL !== undefined ? customTTL : this.ttl;
    entry.expiresAt = this.clock.now() + ttlToUse;
    return true;
  }

  private startExpirationCheck(): void {
    this.stop = startExpirationTimer(this.clock, () => this.cleanup(), this.checkInterval);
  }

  /**
   * This method stops the background expiration checker and cleans up.
   */
  dispose(): void {
    this.stop?.();
    this.stop = null;
  }

  *keys(): IterableIterator<K> {
    this.cleanup();
    yield* this.map.keys();
  }

  *values(): IterableIterator<V> {
    this.cleanup();
    for (const entry of this.map.values()) {
      yield entry.value;
    }
  }

  *entries(): IterableIterator<[K, V]> {
    this.cleanup();
    for (const [key, entry] of this.map) {
      yield [key, entry.value];
    }
  }
}

/**
 * Factory function to make a TTL cache.
 */
export function ttlCache<K, V>(
  ttl: number,
  options?: {
    checkInterval?: number;
    onExpire?: (key: K, value: V) => void;
    /** The clock of the times and of the background check. The default clock reads `Date.now()`. */
    clock?: Clock;
  }
): TTLCache<K, V> {
  return new TTLCache(
    ttl,
    options?.checkInterval,
    options?.onExpire,
    options?.clock
  );
}
