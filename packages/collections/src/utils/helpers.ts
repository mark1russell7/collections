/**
 * Common helper utilities for collections.
 *
 * This module gives shared functionality to reduce code duplication across implementations.
 */

// ============================================================================
// Iterator utilities
// ============================================================================

/**
 * This function converts an iterable to an array.
 *
 * @param iterable The iterable to convert
 * @returns Array containing all elements
 */
export function toArray<T>(iterable: Iterable<T>): T[] {
  return Array.from(iterable);
}
