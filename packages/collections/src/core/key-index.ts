/**
 * The key index of a layer: a map from the keys of a base to the data of the layer (C20).
 * It finds a key with the equality of the base.
 *
 * A layer, for example `lruMap` or `ttlMap`, keeps data for each key of its base. A JavaScript `Map` finds a key
 * with `SameValueZero`, so it does not agree with a base that has a custom `keyEq` or comparator. Then the
 * layer and the base count different keys. This index finds a key as the base does.
 *
 * @module core/key-index
 */

import type { Compare, Eq, Hash } from "./traits.js";
import { defaultEq } from "../utils/defaults.js";
import { hashMap } from "../impl/hash-map.js";
import { treeMap } from "../impl/tree-map.js";
import type { MapLike } from "../interfaces/map.js";

/** The operations of a key index. A JavaScript `Map` has each of them. */
export interface KeyIndex<K, X> {
  readonly size: number;
  get(key: K): X | undefined;
  set(key: K, data: X): unknown;
  delete(key: K): boolean;
  clear(): void;
  values(): IterableIterator<X>;
  /** The entries in the order of their first set. A delete while the iteration operates is permitted. */
  [Symbol.iterator](): IterableIterator<[K, X]>;
}

/** The equality of a base: its `keyEq` or `eq`, and its hash or comparator when it gives one. */
export interface BaseEquality<K> {
  readonly eq?: Eq<K> | undefined;
  readonly hash?: Hash<K> | undefined;
  readonly comparator?: Compare<K> | undefined;
}

/** This function reads the equality of a map: its `keyEq`, its `hash` and its `comparator`. */
export function mapEquality<K, V>(map: MapLike<K, V>): BaseEquality<K> {
  const fields = map as MapLike<K, V> & { comparator?: Compare<K> };
  return { eq: fields.keyEq, hash: fields.hash, comparator: fields.comparator };
}

/** This function reads the equality of a collection: `eq`, then `hash` and `comparator`. */
export function elementEquality<T>(collection: object): BaseEquality<T> {
  const fields = collection as { eq?: Eq<T>; hash?: Hash<T>; comparator?: Compare<T> };
  return { eq: fields.eq, hash: fields.hash, comparator: fields.comparator };
}

/**
 * This function makes a key index with the equality of a base.
 *
 * - The default equality (`===`, or no equality) gives a JavaScript `Map`. This is the fast path.
 * - A comparator gives a `treeMap` with that comparator, so equal keys compare as 0.
 * - A hash gives a `hashMap` with that hash and the equality.
 * - An equality with no hash gives a `hashMap` with one hash for each key. It is correct, but it costs O(n).
 *
 * @example
 * const index = keyIndex<string, number>({ comparator: (a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }) });
 * index.set("A", 1);
 * index.get("a"); // 1
 */
export function keyIndex<K, X>(base: BaseEquality<K>): KeyIndex<K, X> {
  const { eq, hash, comparator } = base;
  if (comparator !== undefined) return new LinkedIndex<K, X>(treeMap<K, Cell<K, X>>({ compare: comparator }));
  if (eq === undefined || eq === defaultEq) return new Map<K, X>();
  return new LinkedIndex<K, X>(hashMap<K, Cell<K, X>>({ eq, hash: hash ?? (() => 0) }));
}

/** One entry of a linked index. A delete keeps its `next`, so an iteration that holds it can go on. */
interface Cell<K, X> {
  key: K;
  data: X;
  prev: Cell<K, X> | null;
  next: Cell<K, X> | null;
  live: boolean;
}

/** A key index with a lookup map of the base equality and a linked list in the order of the first set. */
class LinkedIndex<K, X> implements KeyIndex<K, X> {
  private head: Cell<K, X> | null = null;
  private tail: Cell<K, X> | null = null;

  private readonly lookup: MapLike<K, Cell<K, X>>;

  constructor(lookup: MapLike<K, Cell<K, X>>) {
    this.lookup = lookup;
  }

  get size(): number {
    return this.lookup.size;
  }

  get(key: K): X | undefined {
    return this.lookup.getOrUndefined(key)?.data;
  }

  set(key: K, data: X): this {
    const cell = this.lookup.getOrUndefined(key);
    if (cell !== undefined) {
      // A set of a key that is in the index keeps its place, as in a JavaScript Map
      cell.data = data;
      return this;
    }
    const added: Cell<K, X> = { key, data, prev: this.tail, next: null, live: true };
    if (this.tail) this.tail.next = added;
    else this.head = added;
    this.tail = added;
    this.lookup.set(key, added);
    return this;
  }

  delete(key: K): boolean {
    const cell = this.lookup.getOrUndefined(key);
    if (cell === undefined) return false;
    this.lookup.delete(key);
    cell.live = false;
    if (cell.prev) cell.prev.next = cell.next;
    else this.head = cell.next;
    if (cell.next) cell.next.prev = cell.prev;
    else this.tail = cell.prev;
    return true;
  }

  clear(): void {
    for (let cell = this.head; cell; cell = cell.next) cell.live = false;
    this.lookup.clear();
    this.head = null;
    this.tail = null;
  }

  *values(): IterableIterator<X> {
    for (const [, data] of this) yield data;
  }

  *[Symbol.iterator](): IterableIterator<[K, X]> {
    let cell = this.head;
    while (cell) {
      if (cell.live) yield [cell.key, cell.data];
      // A deleted cell keeps its next, so the iteration goes on from a cell that a delete took out
      cell = cell.next;
    }
  }
}
