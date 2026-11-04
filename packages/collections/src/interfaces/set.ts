/**
 * Set interfaces that mirror Java's Set interface hierarchy.
 *
 * Sets are collections that contain no duplicate elements.
 * They give efficient membership testing.
 */

import type { Collection, ReadonlyCollection } from "./collection.js";
import type { Compare } from "../core/traits.js";

/**
 * ReadonlySet<T> - Readonly set with no duplicates.
 */
export interface ReadonlySet<T> extends ReadonlyCollection<T> {
  /**
   * This method gives true if this set contains the specified element.
   */
  contains(element: T): boolean;

  /**
   * This method gives true if this set contains all elements in the specified collection.
   */
  containsAll(other: Iterable<T>): boolean;
}

/**
 * Set<T> - Mutable set with no duplicates.
 *
 * Mirrors java.util.Set.
 * Elements are unique based on the set's equality function.
 */
export interface Set<T> extends ReadonlySet<T>, Collection<T> {
  /**
   * This method adds the specified element to this set if it is not already present.
   *
   * @returns true if this set did not already contain the element
   */
  add(element: T): boolean;

  /**
   * This method removes the specified element from this set if it is present.
   *
   * @returns true if this set contained the element
   */
  remove(element: T): boolean;

  /**
   * This method adds all elements in the specified collection to this set.
   * This is a union operation.
   *
   * @returns true if this set changed
   */
  addAll(other: Iterable<T>): boolean;

  /**
   * This method removes from this set all of its elements that are contained in the specified collection.
   * This is a difference operation.
   *
   * @returns true if this set changed
   */
  removeAll(other: Iterable<T>): boolean;

  /**
   * This method retains only the elements in this set that are contained in the specified collection.
   * This is an intersection operation.
   *
   * @returns true if this set changed
   */
  retainAll(other: Iterable<T>): boolean;
}

/**
 * SortedSet<T> - Set that maintains elements in sorted order.
 *
 * Mirrors java.util.SortedSet.
 */
export interface SortedSet<T> extends Set<T> {
  /**
   * This value is the comparator used to order elements in this set.
   */
  readonly comparator: Compare<T>;

  /**
   * This method gives the first (lowest) element in this set.
   *
   * @throws Error if set is empty
   */
  first(): T;

  /**
   * This method gives the last (highest) element in this set.
   *
   * @throws Error if set is empty
   */
  last(): T;

  /**
   * This method gives a view of the portion of this set whose elements are strictly less than toElement.
   */
  headSet(toElement: T): SortedSet<T>;

  /**
   * This method gives a view of the portion of this set whose elements are greater than or equal to fromElement.
   */
  tailSet(fromElement: T): SortedSet<T>;

  /**
   * This method gives a view of the portion of this set whose elements range from fromElement to toElement.
   */
  subSet(fromElement: T, toElement: T): SortedSet<T>;
}

/**
 * NavigableSet<T> - Extended sorted set with navigation methods.
 *
 * Mirrors java.util.NavigableSet.
 */
export interface NavigableSet<T> extends SortedSet<T> {
  /**
   * This method gives the greatest element less than or equal to the given element, or undefined if none.
   */
  floor(element: T): T | undefined;

  /**
   * This method gives the least element greater than or equal to the given element, or undefined if none.
   */
  ceiling(element: T): T | undefined;

  /**
   * This method gives the greatest element strictly less than the given element, or undefined if none.
   */
  lower(element: T): T | undefined;

  /**
   * This method gives the least element strictly greater than the given element, or undefined if none.
   */
  higher(element: T): T | undefined;

  /**
   * Retrieves and removes the first (lowest) element, or gives undefined if empty.
   */
  pollFirst(): T | undefined;

  /**
   * Retrieves and removes the last (highest) element, or gives undefined if empty.
   */
  pollLast(): T | undefined;

  /**
   * This method gives a reverse order view of this set.
   */
  descendingSet(): NavigableSet<T>;

  /**
   * This method gives a reverse order iterator over the elements in this set.
   */
  descendingIterator(): Iterator<T>;
}
