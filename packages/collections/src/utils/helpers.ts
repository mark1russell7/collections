/**
 * Common helper utilities for collections.
 *
 * This module gives shared functionality to reduce code duplication across implementations.
 */

import type { Eq } from "../core/traits.js";

// ============================================================================
// Bounds checking utilities
// ============================================================================

/**
 * This function gives true when an index is in the bounds [0, size).
 * This function throws RangeError if out of bounds.
 *
 * @param index The index to check
 * @param size The size of the collection
 * @param collectionName Optional name for error message
 * @throws RangeError if index is out of bounds
 */
export function checkBounds(index: number, size: number, collectionName: string = "Collection"): void {
  if (index < 0 || index >= size) {
    throw new RangeError(`${collectionName}: Index ${index} out of bounds [0, ${size})`);
  }
}

/**
 * This function gives true when an index is valid for an insertion, in [0, size].
 * In this function, index === size is correct for append operations.
 *
 * @param index The index to check
 * @param size The size of the collection
 * @param collectionName Optional name for error message
 * @throws RangeError if index is out of bounds
 */
export function checkInsertBounds(index: number, size: number, collectionName: string = "Collection"): void {
  if (index < 0 || index > size) {
    throw new RangeError(`${collectionName}: Index ${index} out of bounds [0, ${size}]`);
  }
}

/**
 * This function gives true when a range [start, end) is valid.
 *
 * @param start Start index (inclusive)
 * @param end End index (exclusive)
 * @param size The size of the collection
 * @param collectionName Optional name for error message
 * @throws RangeError if range is invalid
 */
export function checkRangeBounds(
  start: number,
  end: number,
  size: number,
  collectionName: string = "Collection"
): void {
  if (start < 0 || end > size || start > end) {
    throw new RangeError(
      `${collectionName}: Invalid range [${start}, ${end}) for size ${size}`
    );
  }
}

// ============================================================================
// Equality and search utilities
// ============================================================================

/**
 * This function finds the index of an element in an array using custom equality.
 *
 * @param array The array to search
 * @param element The element to find
 * @param eq Equality function
 * @returns Index of element, or -1 if not found
 */
export function findIndex<T>(array: T[], element: T, eq: Eq<T>): number {
  for (let i = 0; i < array.length; i++) {
    if (eq(array[i]!, element)) {
      return i;
    }
  }
  return -1;
}

/**
 * This function finds the last index of an element in an array using custom equality.
 *
 * @param array The array to search
 * @param element The element to find
 * @param eq Equality function
 * @returns Last index of element, or -1 if not found
 */
export function findLastIndex<T>(array: T[], element: T, eq: Eq<T>): number {
  for (let i = array.length - 1; i >= 0; i--) {
    if (eq(array[i]!, element)) {
      return i;
    }
  }
  return -1;
}

/**
 * This function gives true when an array has an element, with a custom equality.
 *
 * @param array The array to search
 * @param element The element to find
 * @param eq Equality function
 * @returns true if element is found
 */
export function arrayContains<T>(array: T[], element: T, eq: Eq<T>): boolean {
  return findIndex(array, element, eq) !== -1;
}

/**
 * This function removes the first occurrence of an element from an array.
 *
 * @param array The array to change
 * @param element The element to remove
 * @param eq Equality function
 * @returns true if element was found and removed
 */
export function arrayRemove<T>(array: T[], element: T, eq: Eq<T>): boolean {
  const index = findIndex(array, element, eq);
  if (index === -1) return false;
  array.splice(index, 1);
  return true;
}

/**
 * This function removes all occurrences of an element from an array.
 *
 * @param array The array to change
 * @param element The element to remove
 * @param eq Equality function
 * @returns Number of elements removed
 */
export function arrayRemoveAll<T>(array: T[], element: T, eq: Eq<T>): number {
  let count = 0;
  for (let i = array.length - 1; i >= 0; i--) {
    if (eq(array[i]!, element)) {
      array.splice(i, 1);
      count++;
    }
  }
  return count;
}

// ============================================================================
// Iterator utilities
// ============================================================================

/**
 * This function makes a simple iterator for an array.
 *
 * @param array The array to iterate
 * @returns Iterator over the array
 */
export function* arrayIterator<T>(array: T[]): Iterator<T> {
  yield* array;
}

/**
 * This function makes a reversed iterator for an array.
 *
 * @param array The array to iterate
 * @returns Reversed iterator over the array
 */
export function* reverseArrayIterator<T>(array: T[]): Iterator<T> {
  for (let i = array.length - 1; i >= 0; i--) {
    yield array[i]!;
  }
}

/**
 * This function converts an iterable to an array.
 *
 * @param iterable The iterable to convert
 * @returns Array containing all elements
 */
export function toArray<T>(iterable: Iterable<T>): T[] {
  return Array.from(iterable);
}

// ============================================================================
// Validation utilities
// ============================================================================

/**
 * This function makes sure that a value is not null or undefined.
 *
 * @param value The value to check
 * @param message Error message
 * @returns The non-null value
 * @throws Error if value is null or undefined
 */
export function requireNonNull<T>(value: T | null | undefined, message: string = "Value cannot be null or undefined"): T {
  if (value === null || value === undefined) {
    throw new Error(message);
  }
  return value;
}

/**
 * This function makes sure that a collection is not empty.
 *
 * @param size Current size
 * @param collectionName Optional name for error message
 * @throws Error if collection is empty
 */
export function requireNonEmpty(size: number, collectionName: string = "Collection"): void {
  if (size === 0) {
    throw new Error(`${collectionName} is empty`);
  }
}

// ============================================================================
// Math utilities
// ============================================================================

/**
 * This function clamps a value between min and max.
 *
 * @param value The value to clamp
 * @param min Minimum value
 * @param max Maximum value
 * @returns Clamped value
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * This function calculates hash code for a string.
 * This function uses Java's String.hashCode() algorithm.
 *
 * @param str The string to hash
 * @returns Hash code
 */
export function stringHashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return hash;
}
