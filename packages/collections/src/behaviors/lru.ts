/**
 * LRU (Least Recently Used) eviction behavior.
 *
 * This module tracks access times and automatically evicts the least recently used
 * elements when capacity is reached. Perfect for caching.
 *
 * @example
 * const cache = compose(
 *   lruMap<string, Data>({ capacity: 100 })
 * )(hashMap<string, Data>())
 *
 * cache.set('key1', data1) // Accessed
 * cache.get('key1')        // Accessed again (moves to front)
 * // When full, least recently accessed keys are evicted
 */

import { checkCapacity } from "../core/capacity.js";
import type { Middleware } from "../core/middleware.js";
import type { MapLike } from "../interfaces/map.js";
import { compositeMapMethod } from "./composite.js";
import { removals, removalSource, type MapRemoval } from "../core/removals.js";

/**
 * Options for LRU behavior.
 */
export interface LRUOptions {
  /**
   * The maximum number of entries, a positive whole number. When the map is full, a new key
   * evicts the least recently used entry.
   */
  capacity: number;

  /**
   * Optional callback invoked when an item is evicted.
   */
  onEvict?: (info: { key: any; value: any; timestamp: number }) => void;
}

/**
 * Metadata for tracking LRU access.
 */
interface LRUNode<K, V> {
  key: K;
  value: V;
  lastAccessed: number;
  prev: LRUNode<K, V> | null;
  next: LRUNode<K, V> | null;
}

/**
 * This function makes an LRU Map middleware.
 *
 * This function maintains a doubly-linked list to track access order.
 * Most recently accessed items are at the head.
 * When capacity is exceeded, items at the tail are evicted.
 *
 * @throws RangeError when `options.capacity` is not a positive whole number.
 */
export function lruMap<K, V>(
  options: LRUOptions
): Middleware<MapLike<K, V>, MapLike<K, V> & { readonly isFull: boolean }> {
  const { onEvict } = options;
  const capacity = checkCapacity(options.capacity, "lruMap");

  return (next: MapLike<K, V>): MapLike<K, V> & { readonly isFull: boolean } => {
    // Doubly-linked list for LRU tracking
    let head: LRUNode<K, V> | null = null;
    let tail: LRUNode<K, V> | null = null;
    const nodeMap = new Map<K, LRUNode<K, V>>();

    const moveToHead = (node: LRUNode<K, V>): void => {
      // Remove from current position
      if (node.prev) {
        node.prev.next = node.next;
      } else {
        head = node.next;
      }

      if (node.next) {
        node.next.prev = node.prev;
      } else {
        tail = node.prev;
      }

      // Add to head
      node.prev = null;
      node.next = head;
      if (head) {
        head.prev = node;
      }
      head = node;

      if (!tail) {
        tail = node;
      }

      node.lastAccessed = Date.now();
    };

    const addNode = (key: K, value: V): void => {
      const node: LRUNode<K, V> = {
        key,
        value,
        lastAccessed: Date.now(),
        prev: null,
        next: head,
      };

      if (head) {
        head.prev = node;
      }
      head = node;

      if (!tail) {
        tail = node;
      }

      nodeMap.set(key, node);
    };

    const removeNode = (node: LRUNode<K, V>): void => {
      if (node.prev) {
        node.prev.next = node.next;
      } else {
        head = node.next;
      }

      if (node.next) {
        node.next.prev = node.prev;
      } else {
        tail = node.prev;
      }

      nodeMap.delete(node.key);
    };

    // A removal below (for example an expiry of ttlMap, in compose(lruMap, ttlMap)) removes the node of its key
    const source = removalSource<MapRemoval<K, V>>(next, ({ key }) => {
      const node = nodeMap.get(key);
      if (node) removeNode(node);
    });

    // A layer below with no removal channel can remove an entry without this layer seeing it. Its node is
    // then stale: the list must not keep it (it holds the value, and it would grow without bound) and evicting
    // it is not an eviction. With the channel, no node is stale and these checks find nothing.
    const dropStaleNodes = (): void => {
      for (const node of [...nodeMap.values()]) {
        if (!next.has(node.key)) {
          removeNode(node);
        }
      }
    };

    const evictLRU = (): void => {
      while (tail) {
        const candidate = tail;
        removeNode(candidate);
        if (!next.has(candidate.key)) {
          // Already removed below: skip it and evict the next least recently used entry
          continue;
        }
        next.delete(candidate.key);

        if (onEvict) {
          onEvict({
            key: candidate.key,
            value: candidate.value,
            timestamp: candidate.lastAccessed,
          });
        }
        source.emit({ key: candidate.key, value: candidate.value, reason: "evict" });
        return;
      }
    };

    return new Proxy(next, {
      get(target, prop, receiver) {
        if (prop === removals) {
          return source.channel;
        }
        // Add isFull property
        if (prop === "isFull") {
          return target.size >= capacity;
        }

        // Composite methods (setIfAbsent, compute, merge, putAll and others) go through this
        // proxy's own primitives, so they keep this behavior's rules (BUGS-2026-07 L13)
        const composite = compositeMapMethod(receiver as MapLike<K, V>, prop);
        if (composite) {
          return composite;
        }

        const value = Reflect.get(target, prop, receiver);

        if (typeof value === "function") {
          switch (prop) {
            case "get":
              return function (key: K): V {
                const result: V = (value as Function).call(target, key);
                // Update access time
                const node = nodeMap.get(key);
                if (node) {
                  moveToHead(node);
                }
                return result;
              };

            case "has":
              return function (key: K): boolean {
                const result = (value as Function).call(target, key);
                const node = nodeMap.get(key);
                if (node && result) {
                  // Update access time
                  moveToHead(node);
                }
                return result;
              };

            case "set":
              return function (key: K, val: V): V | undefined {
                const hadKey = target.has(key);

                if (hadKey) {
                  // Update existing
                  const oldValue = (value as Function).call(target, key, val);
                  const node = nodeMap.get(key);
                  if (node) {
                    node.value = val;
                    moveToHead(node);
                  }
                  return oldValue;
                } else {
                  // Add new. A stale node for this key (its entry was removed below) must not
                  // stay in the list: evicting it later would delete the new node's map entry.
                  const stale = nodeMap.get(key);
                  if (stale) {
                    removeNode(stale);
                  }
                  // Keep the node list bounded. At most `capacity` nodes are live, so at twice the capacity a scan
                  // removes at least `capacity` stale nodes: the cost of a set is amortized O(1). A scan at the
                  // capacity read each node at each set into a full map (C10). evictLRU skips the other stale nodes.
                  if (nodeMap.size >= 2 * capacity) {
                    dropStaleNodes();
                  }
                  if (target.size >= capacity) {
                    evictLRU();
                  }
                  const result = (value as Function).call(target, key, val);
                  addNode(key, val);
                  return result;
                }
              };

            case "delete":
              return function (key: K): V | undefined {
                const result = (value as Function).call(target, key);
                const node = nodeMap.get(key);
                if (node) {
                  removeNode(node);
                }
                return result;
              };

            case "clear":
              return function (): void {
                (value as Function).call(target);
                head = null;
                tail = null;
                nodeMap.clear();
              };
          }
        }

        return value;
      },
    }) as MapLike<K, V> & { readonly isFull: boolean };
  };
}

/**
 * This class makes an LRU cache with a simpler API.
 * This is a standalone LRU cache implementation.
 *
 * @example
 * const cache = lruCache<string, Data>(100)
 * cache.set('key', value)
 * cache.get('key') // Moves to front
 */
export class LRUCache<K, V> {
  private readonly capacity: number;
  private readonly onEvict: ((key: K, value: V) => void) | undefined;
  private map: Map<K, { value: V; node: LRUNode<K, V> }> = new Map();
  private head: LRUNode<K, V> | null = null;
  private tail: LRUNode<K, V> | null = null;

  /**
   * @param capacity - The maximum number of entries, a positive whole number.
   * @param onEvict - The function that this cache starts for each entry that it evicts.
   * @throws RangeError when `capacity` is not a positive whole number.
   */
  constructor(capacity: number, onEvict?: ((key: K, value: V) => void) | undefined) {
    this.capacity = checkCapacity(capacity, "LRUCache");
    this.onEvict = onEvict;
  }

  get size(): number {
    return this.map.size;
  }

  get isFull(): boolean {
    return this.map.size >= this.capacity;
  }

  get(key: K): V | undefined {
    const entry = this.map.get(key);
    if (!entry) return undefined;

    this.moveToHead(entry.node);
    return entry.value;
  }

  set(key: K, value: V): void {
    const entry = this.map.get(key);

    if (entry) {
      // Update existing
      entry.value = value;
      entry.node.value = value;
      this.moveToHead(entry.node);
    } else {
      // Add new
      if (this.map.size >= this.capacity) {
        this.evictLRU();
      }

      const node: LRUNode<K, V> = {
        key,
        value,
        lastAccessed: Date.now(),
        prev: null,
        next: this.head,
      };

      if (this.head) {
        this.head.prev = node;
      }
      this.head = node;

      if (!this.tail) {
        this.tail = node;
      }

      this.map.set(key, { value, node });
    }
  }

  has(key: K): boolean {
    return this.map.has(key);
  }

  delete(key: K): boolean {
    const entry = this.map.get(key);
    if (!entry) return false;

    this.removeNode(entry.node);
    this.map.delete(key);
    return true;
  }

  /**
   * This method deletes each entry for which `matches` gives true, and it gives the number of
   * deleted entries. It is not a use: the order of the other entries does not change, and it
   * does not start `onEvict`. It starts `matches` once for each entry, the most recent first. If
   * `matches` throws, the entries that it matched before stay deleted.
   *
   * @param matches - The test of an entry.
   * @returns The number of deleted entries.
   */
  deleteWhere(matches: (value: V, key: K) => boolean): number {
    const nodes: LRUNode<K, V>[] = [];
    for (let node = this.head; node; node = node.next) nodes.push(node);
    let deleted = 0;
    for (const node of nodes) {
      // The function `matches` can change the cache. Skip each node that is not in it now.
      if (this.map.get(node.key)?.node !== node) continue;
      if (!matches(node.value, node.key)) continue;
      // The function `matches` can delete this node itself, so check again.
      if (this.map.get(node.key)?.node !== node) continue;
      this.removeNode(node);
      this.map.delete(node.key);
      deleted++;
    }
    return deleted;
  }

  clear(): void {
    this.map.clear();
    this.head = null;
    this.tail = null;
  }

  private moveToHead(node: LRUNode<K, V>): void {
    if (node === this.head) return;

    // Remove from current position
    if (node.prev) {
      node.prev.next = node.next;
    }
    if (node.next) {
      node.next.prev = node.prev;
    } else {
      this.tail = node.prev;
    }

    // Add to head
    node.prev = null;
    node.next = this.head;
    if (this.head) {
      this.head.prev = node;
    }
    this.head = node;

    node.lastAccessed = Date.now();
  }

  private removeNode(node: LRUNode<K, V>): void {
    if (node.prev) {
      node.prev.next = node.next;
    } else {
      this.head = node.next;
    }

    if (node.next) {
      node.next.prev = node.prev;
    } else {
      this.tail = node.prev;
    }
  }

  private evictLRU(): void {
    if (!this.tail) return;

    const evicted = this.tail;
    this.removeNode(evicted);
    this.map.delete(evicted.key);

    if (this.onEvict) {
      this.onEvict(evicted.key, evicted.value);
    }
  }

  /**
   * This method gives keys in LRU order (most recent first).
   */
  *keys(): IterableIterator<K> {
    let node = this.head;
    while (node) {
      yield node.key;
      node = node.next;
    }
  }

  /**
   * This method gives entries in LRU order (most recent first).
   */
  *entries(): IterableIterator<[K, V]> {
    let node = this.head;
    while (node) {
      yield [node.key, node.value];
      node = node.next;
    }
  }
}

/**
 * This function makes an LRU cache.
 *
 * @throws RangeError when `capacity` is not a positive whole number.
 */
export function lruCache<K, V>(
  capacity: number,
  onEvict?: (key: K, value: V) => void
): LRUCache<K, V> {
  return new LRUCache(capacity, onEvict);
}
