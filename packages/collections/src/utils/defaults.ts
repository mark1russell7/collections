/**
 * Default implementations of equality, hashing, and comparison functions.
 *
 * This module gives sensible defaults for primitive types and utilities for
 * making custom comparators.
 */

import type { Eq, Hash, Compare } from "../core/traits.js";

// ============================================================================
// Default Equality
// ============================================================================

/**
 * Default equality using strict equality (===).
 * Works for primitives and reference equality for objects.
 */
export const defaultEq: Eq<any> = (a, b) => a === b;

/**
 * Structural equality for objects (shallow comparison of properties).
 * This function compares own enumerable properties using ===.
 */
export const shallowEq: Eq<any> = (a, b) => {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object") return false;
  if (a === null || b === null) return false;

  const keysA = Object.keys(a);
  const keysB = Object.keys(b);

  if (keysA.length !== keysB.length) return false;

  for (const key of keysA) {
    if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
    if (a[key] !== b[key]) return false;
  }

  return true;
};

/** SameValueZero: the meaning of `===`, and NaN equals NaN. */
const sameValueZero = (a: unknown, b: unknown): boolean => a === b || (Number.isNaN(a) && Number.isNaN(b));

const isObject = (value: unknown): value is object => typeof value === "object" && value !== null;

/** The pairs that one comparison holds equal. The log lets a failed try remove its pairs. */
interface HeldPairs {
  readonly partners: Map<object, Set<object>>;
  readonly log: [object, object][];
}

function releasePairs(held: HeldPairs, mark: number): void {
  while (held.log.length > mark) {
    const [a, b] = held.log.pop()!;
    held.partners.get(a)?.delete(b);
  }
}

function equalElements(a: ArrayLike<unknown>, b: ArrayLike<unknown>): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (!sameValueZero(a[i], b[i])) return false;
  }
  return true;
}

function bytesOf(value: ArrayBufferLike | DataView): Uint8Array {
  return ArrayBuffer.isView(value) ? new Uint8Array(value.buffer, value.byteOffset, value.byteLength) : new Uint8Array(value);
}

function enumerableKeys(value: object): (string | symbol)[] {
  return Reflect.ownKeys(value).filter((key) => Object.prototype.propertyIsEnumerable.call(value, key));
}

function equalKeys(a: any, b: any, held: HeldPairs): boolean {
  const keys = enumerableKeys(a);
  if (keys.length !== enumerableKeys(b).length) return false;
  return keys.every((key) => Object.prototype.propertyIsEnumerable.call(b, key) && equalValues(a[key], b[key], held));
}

/**
 * The comparison of the entries of two maps, or of the members of two sets. A primitive key finds
 * its partner by `has`. An object key tries each object key of `b` that is not taken yet. The first
 * partner is correct, because the relation is an equivalence.
 */
function equalEntries(a: Map<unknown, unknown> | Set<unknown>, b: Map<unknown, unknown> | Set<unknown>, held: HeldPairs): boolean {
  if (a.size !== b.size) return false;
  const valueAt = (key: unknown): unknown => (b instanceof Map ? b.get(key) : key);
  const free = [...b.entries()].filter(([key]) => isObject(key));
  for (const [key, value] of a.entries()) {
    if (!isObject(key)) {
      if (!b.has(key) || !equalValues(value, valueAt(key), held)) return false;
      continue;
    }
    const at = free.findIndex(([otherKey, otherValue]) => {
      const mark = held.log.length;
      if (equalValues(key, otherKey, held) && equalValues(value, otherValue, held)) return true;
      releasePairs(held, mark);
      return false;
    });
    if (at < 0) return false;
    free.splice(at, 1);
  }
  return true;
}

/** The comparison of two objects with the same prototype. */
function equalObjects(a: any, b: any, held: HeldPairs): boolean {
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!equalValues(a[i], b[i], held)) return false;
    }
    return true;
  }
  if (a instanceof DataView || a instanceof ArrayBuffer || (typeof SharedArrayBuffer !== "undefined" && a instanceof SharedArrayBuffer)) {
    return equalElements(bytesOf(a), bytesOf(b));
  }
  if (ArrayBuffer.isView(a)) return equalElements(a as unknown as ArrayLike<unknown>, b);
  if (a instanceof Promise || a instanceof WeakMap || a instanceof WeakSet || a instanceof WeakRef) return false;
  if (a instanceof Date && !sameValueZero(a.getTime(), b.getTime())) return false;
  if (a instanceof RegExp && (a.source !== b.source || a.flags !== b.flags)) return false;
  if (a instanceof Error && !(a.name === b.name && a.message === b.message && equalValues(a.cause, b.cause, held))) return false;
  const boxed = a instanceof Number || a instanceof String || a instanceof Boolean || a instanceof BigInt || a instanceof Symbol;
  if (boxed && !sameValueZero(a.valueOf(), b.valueOf())) return false;
  if ((a instanceof Map || a instanceof Set) && !equalEntries(a, b, held)) return false;
  return equalKeys(a, b, held);
}

/**
 * The comparison of two values. A pair stays held after it passes, so a shared or cyclic part
 * costs one visit. A failure ends the whole comparison, or the try in `equalEntries`, which
 * releases its pairs.
 */
function equalValues(a: unknown, b: unknown, held: HeldPairs): boolean {
  if (sameValueZero(a, b)) return true;
  if (!isObject(a) || !isObject(b)) return false;
  if (Object.getPrototypeOf(a) !== Object.getPrototypeOf(b)) return false;
  let partners = held.partners.get(a);
  if (partners?.has(b)) return true;
  if (partners === undefined) {
    partners = new Set();
    held.partners.set(a, partners);
  }
  partners.add(b);
  held.log.push([a, b]);
  return equalObjects(a, b, held);
}

/**
 * Deep structural equality. This relation is an equivalence: it is reflexive, symmetric and
 * transitive, for each value.
 *
 * - Primitives compare by SameValueZero: NaN equals NaN, and 0 equals -0.
 * - Two objects must have the same prototype. So `{}` differs from `Object.create(null)`, from an
 *   instance of a class with the same keys, and from an object of another realm.
 * - Arrays compare by length and by index. A hole equals `undefined`.
 * - Typed arrays compare by element. `ArrayBuffer`, `SharedArrayBuffer` and `DataView` compare by byte.
 * - `Date` compares by time, `RegExp` by source and flags, and `Error` by name, message and cause.
 * - A boxed primitive compares by its value. `Map` and `Set` compare by entries, in any order. An object key
 *   matches a deep-equal key.
 * - Each other object compares by its own enumerable keys, strings and symbols, in any order. The objects above do too,
 *   except arrays and binary data.
 * - Functions, `Promise`, `WeakMap`, `WeakSet` and `WeakRef` compare by identity.
 * - Cycles are safe: two cyclic values are equal when they unfold to the same infinite tree.
 *
 * The recursion follows the depth of the data, so a very deep value can exhaust the stack.
 */
export const deepEq: Eq<any> = (a, b): boolean => equalValues(a, b, { partners: new Map(), log: [] });

/**
 * Equality by comparing a specific property.
 *
 * @example
 * const userEq = eqBy<User, 'id'>('id')
 * // or with accessor function:
 * const userEq = eqBy<User>((u) => u.id)
 */
export const eqBy = <T, K extends keyof T = keyof T>(
  keyOrFn: K | ((value: T) => any)
): Eq<T> => {
  const accessor = typeof keyOrFn === "function" ? keyOrFn : (v: T) => v[keyOrFn];
  return (a, b) => accessor(a) === accessor(b);
};

// ============================================================================
// Default Hashing
// ============================================================================

/**
 * Default hash function for primitives and objects.
 * For objects, hashes the JSON string representation.
 */
export const defaultHash: Hash<any> = (value: any): number => {
  if (value === null) return 0;
  if (value === undefined) return 1;

  const type = typeof value;

  switch (type) {
    case "boolean":
      return value ? 1 : 0;
    case "number":
      return hashNumber(value);
    case "string":
      return hashString(value);
    case "symbol":
      return hashString(value.toString());
    case "bigint":
      return hashString(value.toString());
    case "object":
      // For objects, hash their JSON representation
      // This is not ideal for all cases but provides a reasonable default
      try {
        return hashString(JSON.stringify(value));
      } catch {
        // If JSON.stringify fails, fall back to toString
        return hashString(value.toString());
      }
    default:
      return 2;
  }
};

/**
 * Hash function for strings using djb2 algorithm.
 */
export const hashString = (str: string): number => {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i); // hash * 33 + c
    hash = hash & hash; // Convert to 32-bit integer
  }
  return hash >>> 0; // Convert to unsigned
};

/**
 * Hash function for numbers.
 */
export const hashNumber = (num: number): number => {
  if (Number.isNaN(num)) return 0;
  if (!Number.isFinite(num)) return num > 0 ? 1 : -1;

  // For integers, use the number itself
  if (Number.isInteger(num)) {
    return num | 0; // Convert to 32-bit int
  }

  // For floats, hash the string representation
  return hashString(num.toString());
};

/**
 * Combine multiple hash values.
 * Useful for hashing objects with multiple fields.
 *
 * @example
 * const pointHash: Hash<Point> = (p) =>
 *   combineHashes(hashNumber(p.x), hashNumber(p.y))
 */
export const combineHashes = (...hashes: number[]): number => {
  let combined = 0;
  for (const hash of hashes) {
    combined = ((combined << 5) - combined) + hash;
    combined = combined & combined; // Convert to 32-bit int
  }
  return combined >>> 0; // Convert to unsigned
};

/**
 * Make a hash function that hashes by a specific property.
 *
 * @example
 * const userHash = hashBy<User>((u) => u.id)
 */
export const hashBy = <T>(accessor: (value: T) => any): Hash<T> => {
  return (value) => defaultHash(accessor(value));
};

// ============================================================================
// Default Comparison
// ============================================================================

/**
 * Natural ordering comparison for primitives.
 * Numbers, strings, booleans, dates are compared naturally.
 */
export const defaultCompare: Compare<any> = (a, b) => {
  if (a === b) return 0;
  if (a === null || a === undefined) return -1;
  if (b === null || b === undefined) return 1;

  // Handle dates
  if (a instanceof Date && b instanceof Date) {
    return a.getTime() - b.getTime();
  }

  // Handle numbers
  if (typeof a === "number" && typeof b === "number") {
    if (Number.isNaN(a)) return Number.isNaN(b) ? 0 : -1;
    if (Number.isNaN(b)) return 1;
    return a - b;
  }

  // Handle strings
  if (typeof a === "string" && typeof b === "string") {
    return a.localeCompare(b);
  }

  // Handle booleans
  if (typeof a === "boolean" && typeof b === "boolean") {
    return a === b ? 0 : a ? 1 : -1;
  }

  // Fallback: convert to string and compare
  return String(a).localeCompare(String(b));
};

/**
 * Numeric comparison (for numbers).
 */
export const numberCompare: Compare<number> = (a, b) => {
  if (Number.isNaN(a)) return Number.isNaN(b) ? 0 : -1;
  if (Number.isNaN(b)) return 1;
  return a - b;
};

/**
 * String comparison using locale-aware sorting.
 */
export const stringCompare: Compare<string> = (a, b) => a.localeCompare(b);

/**
 * Case-insensitive string comparison.
 */
export const stringCompareIgnoreCase: Compare<string> = (a, b) =>
  a.toLowerCase().localeCompare(b.toLowerCase());

/**
 * Date comparison.
 */
export const dateCompare: Compare<Date> = (a, b) =>
  a.getTime() - b.getTime();

/**
 * Boolean comparison (false < true).
 */
export const booleanCompare: Compare<boolean> = (a, b) =>
  a === b ? 0 : a ? 1 : -1;

// ============================================================================
// Comparator Combinators
// ============================================================================

/**
 * This function reverses a comparator.
 *
 * @example
 * const descending = reversed(numberCompare)
 */
export const reversed = <T>(compare: Compare<T>): Compare<T> =>
  (a, b) => compare(b, a);

/**
 * This function makes a comparator that compares by a specific property or function.
 *
 * @example
 * const byAge = comparing<Person>((p) => p.age)
 * const byName = comparing<Person, 'name'>('name')
 */
export const comparing = <T, K extends keyof T = keyof T>(
  keyOrFn: K | ((value: T) => any),
  compare: Compare<any> = defaultCompare
): Compare<T> => {
  const accessor = typeof keyOrFn === "function" ? keyOrFn : (v: T) => v[keyOrFn];
  return (a, b) => compare(accessor(a), accessor(b));
};

/**
 * Chains comparators. If the first comparator gives 0 (equal),
 * tries the next comparator, and so on.
 *
 * @example
 * const userCompare = thenComparing(
 *   comparing<User>('lastName'),
 *   comparing<User>('firstName'),
 *   comparing<User>('age')
 * )
 */
export const thenComparing = <T>(...comparators: Compare<T>[]): Compare<T> => {
  return (a, b) => {
    for (const compare of comparators) {
      const result = compare(a, b);
      if (result !== 0) return result;
    }
    return 0;
  };
};

/**
 * This function makes a comparator that treats null/undefined as less than all other values.
 *
 * @example
 * const compare = nullsFirst(numberCompare)
 */
export const nullsFirst = <T>(compare: Compare<T>): Compare<T | null | undefined> => {
  return (a, b) => {
    if (a == null && b == null) return 0;
    if (a == null) return -1;
    if (b == null) return 1;
    return compare(a, b);
  };
};

/**
 * This function makes a comparator that treats null/undefined as greater than all other values.
 *
 * @example
 * const compare = nullsLast(numberCompare)
 */
export const nullsLast = <T>(compare: Compare<T>): Compare<T | null | undefined> => {
  return (a, b) => {
    if (a == null && b == null) return 0;
    if (a == null) return 1;
    if (b == null) return -1;
    return compare(a, b);
  };
};

/**
 * This function makes a comparator from a key extraction function.
 * Elements are compared by their extracted keys.
 *
 * @example
 * const byLength = comparingKey<string>((s) => s.length)
 */
export const comparingKey = <T, K>(
  keyExtractor: (value: T) => K,
  keyCompare: Compare<K> = defaultCompare
): Compare<T> => {
  return (a, b) => keyCompare(keyExtractor(a), keyExtractor(b));
};
