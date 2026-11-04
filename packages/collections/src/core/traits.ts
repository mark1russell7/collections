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
 * Capability: Has a size property.
 */
export interface Sized {
  /** The number of elements in the collection. */
  readonly size: number;
}

/**
 * Capability: Can be cleared (all elements removed).
 */
export interface Clearable {
  /** This method removes all elements from the collection. */
  clear(): void;
}

/**
 * Capability: Can check if empty.
 */
export interface Emptiable {
  /** This value gives true if the collection contains no elements. */
  readonly isEmpty: boolean;
}

/**
 * Capability: Can be cloned.
 */
export interface Cloneable<T> {
  /** This method makes a shallow copy of the collection. */
  clone(): T;
}

/**
 * Capability: Can be converted to an array.
 */
export interface ArrayConvertible<T> {
  /** This method gives an array containing all elements in the collection. */
  toArray(): T[];
}

/**
 * Base read-only collection capabilities.
 * This type combines common traits that most collections share.
 */
export interface ReadonlyCollectionBase<T>
  extends Sized,
    Emptiable,
    Iterable<T>,
    ArrayConvertible<T> {}

/**
 * Base mutable collection capabilities.
 * This type adds mutation operations to readonly base.
 */
export interface MutableCollectionBase<T>
  extends ReadonlyCollectionBase<T>,
    Clearable {}

/**
 * Equality provider - with it, collections can specify custom equality.
 */
export interface EqualityProvider<T> {
  /** The equality function used by this collection. */
  readonly eq: Eq<T>;
}

/**
 * Hash provider - with it, collections can specify custom hashing.
 */
export interface HashProvider<T> {
  /** The hash function used by this collection. */
  readonly hash: Hash<T>;
}

/**
 * Comparison provider - with it, collections can specify custom ordering.
 */
export interface ComparisonProvider<T> {
  /** The comparison function used by this collection. */
  readonly compare: Compare<T>;
}

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

/**
 * Disposable resource - can be explicitly cleaned up.
 */
export interface Disposable {
  /** This method releases any resources held by this collection. */
  dispose(): void;
}

/**
 * Freezable collection - can be made immutable.
 */
export interface Freezable<T> {
  /** This method makes this collection immutable. This method gives self for chaining. */
  freeze(): T;

  /** This value gives true if this collection is frozen. */
  readonly isFrozen: boolean;
}
