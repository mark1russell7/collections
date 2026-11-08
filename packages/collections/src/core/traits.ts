/**
 * Core traits and capability interfaces for the collections framework.
 *
 * These traits define fundamental capabilities that collections can have,
 * following the Interface Segregation Principle (SOLID).
 */

/**
 * Equality comparison function.
 * This type gives true if two values are considered equal.
 *
 * @example
 * const primitiveEq: Eq<number> = (a, b) => a === b
 * const objectEq: Eq<Person> = (a, b) => a.id === b.id
 */
export type Eq<T> = (a: T, b: T) => boolean;

/**
 * Hash function for making hash codes.
 * This type gives a 32-bit integer hash of the value.
 *
 * The function must satisfy: if eq(a, b) === true, then hash(a) === hash(b)
 *
 * @example
 * const stringHash: Hash<string> = (s) => {
 *   let h = 0;
 *   for (let i = 0; i < s.length; i++) {
 *     h = ((h << 5) - h) + s.charCodeAt(i);
 *     h = h & h; // Convert to 32-bit integer
 *   }
 *   return h;
 * }
 */
export type Hash<T> = (value: T) => number;

/**
 * Comparison function for ordering values.
 * This type gives:
 * - negative number if a < b
 * - zero if a === b
 * - positive number if a > b
 *
 * The function must be transitive and consistent with equality.
 *
 * @example
 * const numberCompare: Compare<number> = (a, b) => a - b
 * const reverseCompare = <T>(cmp: Compare<T>): Compare<T> => (a, b) => cmp(b, a)
 */
export type Compare<T> = (a: T, b: T) => number;

/**
 * Bounded collection - has a maximum capacity.
 */
export interface Bounded {
  /** The maximum number of elements this collection can hold. */
  readonly capacity: number;

  /** This value gives true if the collection is at capacity. */
  readonly isFull: boolean;

  /** This value gives the number of elements that the collection can still take. */
  readonly remainingCapacity: number;
}
