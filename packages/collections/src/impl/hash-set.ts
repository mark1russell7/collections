/**
 * HashSet implementation - A set backed by a HashMap.
 *
 * This module gives O(1) average case for add, remove, and contains operations.
 * Elements are unique based on custom equality and hash functions.
 * Mirrors java.util.HashSet.
 *
 * @example
 * const set = hashSet<number>()
 * set.add(1)
 * set.add(2)
 * set.add(1) // Returns false, already present
 * set.size // 2
 */

import type { Set } from "../interfaces/set.js";
import type { Eq, Hash } from "../core/traits.js";
import { HashMap } from "./hash-map.js";
import { defaultEq, defaultHash } from "../utils/defaults.js";

/**
 * Dummy value used for the HashMap backing the set.
 */
const PRESENT = Symbol("PRESENT");

/**
 * Options for making a HashSet.
 */
export interface HashSetOptions<T> {
  /**
   * Initial capacity.
   * @default 16
   */
  initialCapacity?: number;

  /**
   * This option is the load factor threshold for a resize.
   * @default 0.75
   */
  loadFactor?: number;

  /**
   * Equality function for elements.
   * @default defaultEq (===)
   */
  eq?: Eq<T>;

  /**
   * Hash function for elements.
   * @default defaultHash
   */
  hash?: Hash<T>;
}

/**
 * HashSet<T> - Hash table implementation of the Set interface.
 *
 * A HashMap holds the elements. Its values are a dummy constant.
 * This class gives constant-time performance for basic operations.
 *
 * Not thread-safe. Use synchronized() behavior for concurrent access.
 */
export class HashSet<T> implements Set<T> {
  private readonly _map: HashMap<T, symbol>;
  private readonly _eq: Eq<T>;
  private readonly _hash: Hash<T>;

  constructor(options: HashSetOptions<T> = {}) {
    const {
      initialCapacity = 16,
      loadFactor = 0.75,
      eq = defaultEq,
      hash = defaultHash,
    } = options;

    this._eq = eq;
    this._hash = hash;
    this._map = new HashMap<T, symbol>({
      initialCapacity,
      loadFactor,
      eq,
      hash,
    });
  }

  // ========================================================================
  // Size
  // ========================================================================

  get size(): number {
    return this._map.size;
  }

  get isEmpty(): boolean {
    return this._map.isEmpty;
  }

  get eq(): Eq<T> {
    return this._eq;
  }

  // ========================================================================
  // Core set operations
  // ========================================================================

  add(element: T): boolean {
    const hadElement = this._map.has(element);
    this._map.set(element, PRESENT);
    return !hadElement;
  }

  remove(element: T): boolean {
    return this._map.delete(element) !== undefined;
  }

  contains(element: T): boolean {
    return this._map.has(element);
  }

  // ========================================================================
  // Bulk operations
  // ========================================================================

  addAll(other: Iterable<T>): boolean {
    let modified = false;
    for (const element of other) {
      if (this.add(element)) {
        modified = true;
      }
    }
    return modified;
  }

  removeAll(other: Iterable<T>): boolean {
    let modified = false;
    for (const element of other) {
      if (this.remove(element)) {
        modified = true;
      }
    }
    return modified;
  }

  retainAll(other: Iterable<T>): boolean {
    const toRetain = this.setOf(other);
    const toRemove: T[] = [];

    for (const element of this) {
      if (!toRetain.contains(element)) {
        toRemove.push(element);
      }
    }

    let modified = false;
    for (const element of toRemove) {
      this.remove(element);
      modified = true;
    }

    return modified;
  }

  containsAll(other: Iterable<T>): boolean {
    for (const element of other) {
      if (!this.contains(element)) {
        return false;
      }
    }
    return true;
  }

  clear(): void {
    this._map.clear();
  }

  // ========================================================================
  // Set operations (mathematical)
  // ========================================================================

  /**
   * This method gives a new set that is the union of this set and the other set.
   * The new set contains all elements from both sets.
   */
  union(other: Iterable<T>): HashSet<T> {
    const result = this.clone();
    result.addAll(other);
    return result;
  }

  /**
   * This method gives a new set that is the intersection of this set and the other set.
   * The new set contains only elements present in both sets.
   */
  intersection(other: Iterable<T>): HashSet<T> {
    // The loop reads `other` one time, so a generator gives all of its elements
    const others = this.setOf(other);
    const result = this.empty();
    for (const element of this) {
      if (others.contains(element)) {
        result.add(element);
      }
    }
    return result;
  }

  /**
   * This method gives a new set that is the difference of this set and the other set.
   * The new set contains elements in this set but not in the other set.
   */
  difference(other: Iterable<T>): HashSet<T> {
    const result = this.clone();
    result.removeAll(other);
    return result;
  }

  /**
   * This method gives a new set that is the symmetric difference of this set and the other set.
   * The new set contains elements in either set but not in both.
   */
  symmetricDifference(other: Iterable<T>): HashSet<T> {
    // The union and the intersection each read `other`, so read it one time first
    const others = this.setOf(other);
    const result = this.union(others);
    const inter = this.intersection(others);
    result.removeAll(inter);
    return result;
  }

  /**
   * This method gives true if this set is a subset of the other set.
   * All elements in this set are also in the other set.
   */
  isSubsetOf(other: Iterable<T>): boolean {
    const otherSet = this.setOf(other);

    for (const element of this) {
      if (!otherSet.contains(element)) {
        return false;
      }
    }
    return true;
  }

  /**
   * This method gives true if this set is a superset of the other set.
   * All elements in the other set are also in this set.
   */
  isSupersetOf(other: Iterable<T>): boolean {
    for (const element of other) {
      if (!this.contains(element)) {
        return false;
      }
    }
    return true;
  }

  /**
   * This method gives true if this set and the other set have no elements in common.
   */
  isDisjointFrom(other: Iterable<T>): boolean {
    for (const element of other) {
      if (this.contains(element)) {
        return false;
      }
    }
    return true;
  }

  // ========================================================================
  // Iteration
  // ========================================================================

  *[Symbol.iterator](): Iterator<T> {
    for (const entry of this._map) {
      yield entry.key;
    }
  }

  forEach(action: (element: T, index: number) => void): void {
    let index = 0;
    for (const element of this) {
      action(element, index++);
    }
  }

  toArray(): T[] {
    return Array.from(this);
  }

  // ========================================================================
  // Utility methods
  // ========================================================================

  /**
   * This method makes a shallow copy of this set.
   */
  clone(): HashSet<T> {
    return this.setOf(this);
  }

  /**
   * This method makes an empty set with the equality and the hash function of this set.
   * Before, the inner sets kept only the equality, so they did not find an element with a custom hash.
   */
  private empty(): HashSet<T> {
    return new HashSet<T>({ eq: this._eq, hash: this._hash });
  }

  /** This method makes a set of the elements, with the equality and the hash function of this set. */
  private setOf(elements: Iterable<T>): HashSet<T> {
    const set = this.empty();
    set.addAll(elements);
    return set;
  }

  /**
   * This method gives statistics about the underlying hash table.
   */
  getStats(): ReturnType<HashMap<T, symbol>["getStats"]> {
    return this._map.getStats();
  }

  /**
   * This method gives a string representation for debugging.
   */
  toString(): string {
    return `HashSet{${this.toArray().join(", ")}}`;
  }
}

/**
 * Factory function to make a HashSet.
 *
 * @example
 * const set = hashSet<number>()
 * const setFromArray = hashSet([1, 2, 3, 2, 1]) // {1, 2, 3}
 * const setWithOptions = hashSet<string>({ initialCapacity: 32 })
 */
export function hashSet<T>(
  optionsOrElements?: HashSetOptions<T> | Iterable<T>
): HashSet<T> {
  // Check if it's an iterable (not options)
  if (optionsOrElements && Symbol.iterator in optionsOrElements) {
    const set = new HashSet<T>();
    set.addAll(optionsOrElements as Iterable<T>);
    return set;
  }

  return new HashSet<T>(optionsOrElements as HashSetOptions<T>);
}
