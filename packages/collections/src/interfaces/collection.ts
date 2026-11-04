/**
 * Base collection interfaces that mirror Java Collections Framework.
 *
 * These form the root of the collection hierarchy and define the
 * fundamental operations common to all collections.
 */

import type { Eq } from "../core/traits.js";

/**
 * ReadonlyCollection<T> - The root interface for readonly collections.
 *
 * Mirrors java.util.Collection but without mutation operations.
 * All collections must extend this or a more specific readonly interface.
 */
export interface ReadonlyCollection<T> extends Iterable<T> {
  /**
   * This value is the number of elements in this collection.
   */
  readonly size: number;

  /**
   * This value is true if this collection contains no elements.
   */
  readonly isEmpty: boolean;

  /**
   * This method gives true if this collection contains the specified element.
   * This method uses the collection's equality function to compare elements.
   *
   * @param element The element to check for
   */
  contains(element: T): boolean;

  /**
   * This method gives true if this collection contains all elements in the specified collection.
   *
   * @param other The collection whose elements to check for
   */
  containsAll(other: Iterable<T>): boolean;

  /**
   * This method gives an array containing all elements in this collection.
   * The given array is safe to change (it's a copy).
   */
  toArray(): T[];

  /**
   * This method does the given action for each element.
   *
   * @param action The action to do for each element
   */
  forEach(action: (element: T, index: number) => void): void;

  /**
   * This value is the equality function used by this collection.
   */
  readonly eq: Eq<T>;
}

/**
 * Collection<T> - The root interface for mutable collections.
 *
 * Mirrors java.util.Collection with mutation operations.
 * All mutable collections must extend this or a more specific interface.
 */
export interface Collection<T> extends ReadonlyCollection<T> {
  /**
   * This method adds an element to this collection.
   *
   * This method gives true if the collection was changed as a result of this call.
   * Some collections (like Set) can give false if the element already exists.
   *
   * @param element The element to add
   * @returns true if the collection changed
   * @throws Error if collection is full (bounded) and policy is 'throw'
   */
  add(element: T): boolean;

  /**
   * This method adds all elements from the specified collection to this collection.
   *
   * @param other The collection whose elements to add
   * @returns true if the collection changed
   */
  addAll(other: Iterable<T>): boolean;

  /**
   * This method removes a single instance of the specified element from this collection.
   *
   * This method gives true if an element was removed as a result of this call.
   *
   * @param element The element to remove
   * @returns true if an element was removed
   */
  remove(element: T): boolean;

  /**
   * This method removes all elements from this collection that are also in the specified collection.
   *
   * @param other The collection whose elements to remove
   * @returns true if the collection changed
   */
  removeAll(other: Iterable<T>): boolean;

  /**
   * This method retains only the elements in this collection that are in the specified collection.
   * In other words, removes all elements not in the specified collection.
   *
   * @param other The collection of elements to retain
   * @returns true if the collection changed
   */
  retainAll(other: Iterable<T>): boolean;

  /**
   * This method removes all elements from this collection.
   * The collection will be empty after this call gives.
   */
  clear(): void;
}

/**
 * Utility type to check if a collection is readonly.
 */
export type IsReadonly<C> = C extends ReadonlyCollection<any>
  ? C extends Collection<any>
    ? false
    : true
  : false;

/**
 * Extract element type from a collection.
 */
export type ElementOf<C> = C extends ReadonlyCollection<infer T> ? T : never;

/**
 * Make a collection readonly by removing mutation methods.
 */
export type Readonly<C extends Collection<any>> = C extends Collection<infer T>
  ? ReadonlyCollection<T>
  : never;
