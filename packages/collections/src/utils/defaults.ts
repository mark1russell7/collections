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

/** The kinds of `equalObjects` and `hashFields`, so that the relation and its hash stay in step. */
const isBinary = (value: object): value is ArrayBufferLike | DataView =>
  value instanceof DataView || value instanceof ArrayBuffer || (typeof SharedArrayBuffer !== "undefined" && value instanceof SharedArrayBuffer);

const isOpaque = (value: object): boolean => value instanceof Promise || value instanceof WeakMap || value instanceof WeakSet || value instanceof WeakRef;

const isBoxed = (value: object): boolean =>
  value instanceof Number || value instanceof String || value instanceof Boolean || value instanceof BigInt || value instanceof Symbol;

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
  if (isBinary(a)) return equalElements(bytesOf(a), bytesOf(b));
  if (ArrayBuffer.isView(a)) return equalElements(a as unknown as ArrayLike<unknown>, b);
  if (isOpaque(a)) return false;
  if (a instanceof Date && !sameValueZero(a.getTime(), b.getTime())) return false;
  if (a instanceof RegExp && (a.source !== b.source || a.flags !== b.flags)) return false;
  if (a instanceof Error && !(a.name === b.name && a.message === b.message && equalValues(a.cause, b.cause, held))) return false;
  if (isBoxed(a) && !sameValueZero(a.valueOf(), b.valueOf())) return false;
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
 * `defaultHash` agrees with this relation: two equal values have one hash.
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

/** The hash of one primitive or function. */
function hashPrimitive(value: unknown): number {
  if (value === null) return 0;
  if (value === undefined) return 1;
  switch (typeof value) {
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
    default:
      return 2;
  }
}

/** The levels of an object that `defaultHash` reads. A cyclic value unfolds to this depth and stops. */
const HASH_DEPTH = 16;

/** The hashes of one call, by object and by remaining depth. A shared part costs one visit per depth. */
type HashMemo = Map<object, number[]>;

/** This function adds one hash to a running hash. The result depends on the order. */
const mix = (hash: number, part: number): number => (Math.imul(hash, 31) + part) | 0;

/** The finalizer of MurmurHash3. It makes a sum of entries depend on each pair, not on each half. */
function scramble(hash: number): number {
  let mixed = hash ^ (hash >>> 16);
  mixed = Math.imul(mixed, 0x85ebca6b);
  mixed ^= mixed >>> 13;
  mixed = Math.imul(mixed, 0xc2b2ae35);
  return mixed ^ (mixed >>> 16);
}

/** The start values of the kinds. Two kinds do not compare equal, so their hashes can differ. */
const KIND = { array: 3, binary: 5, elements: 7, opaque: 11, record: 13 } as const;

const hashAt = (value: unknown, depth: number, memo: HashMemo): number =>
  isObject(value) ? hashObject(value, depth, memo) : hashPrimitive(value);

function hashElements(start: number, elements: ArrayLike<unknown>): number {
  let hash = start;
  for (let i = 0; i < elements.length; i++) hash = mix(hash, hashPrimitive(elements[i]));
  return hash;
}

/** The sum of the entries of a map or a set. A sum does not depend on the order of the entries. */
function hashEntries(value: Map<unknown, unknown> | Set<unknown>, depth: number, memo: HashMemo): number {
  let sum = 0;
  for (const [key, entry] of value.entries()) sum = (sum + scramble(mix(hashAt(key, depth, memo), hashAt(entry, depth, memo)))) | 0;
  return sum;
}

/** The sum of the own enumerable keys and their values, as `equalKeys` reads them. */
function hashKeys(value: any, depth: number, memo: HashMemo): number {
  let sum = 0;
  for (const key of enumerableKeys(value)) sum = (sum + scramble(mix(hashPrimitive(key), hashAt(value[key], depth, memo)))) | 0;
  return sum;
}

/** The hash of the fields of one object. This function reads only what `equalObjects` reads. */
function hashFields(value: any, depth: number, memo: HashMemo): number {
  if (Array.isArray(value)) {
    let hash: number = KIND.array;
    for (let i = 0; i < value.length; i++) hash = mix(hash, hashAt(value[i], depth, memo));
    return hash;
  }
  if (isBinary(value)) return hashElements(KIND.binary, bytesOf(value));
  if (ArrayBuffer.isView(value)) return hashElements(KIND.elements, value as unknown as ArrayLike<unknown>);
  if (isOpaque(value)) return KIND.opaque;
  let hash: number = KIND.record;
  if (value instanceof Date) hash = mix(hash, hashNumber(value.getTime()));
  if (value instanceof RegExp) hash = mix(mix(hash, hashString(value.source)), hashString(value.flags));
  if (value instanceof Error) {
    hash = mix(mix(mix(hash, hashAt(value.name, depth, memo)), hashAt(value.message, depth, memo)), hashAt(value.cause, depth, memo));
  }
  if (isBoxed(value)) hash = mix(hash, hashPrimitive(value.valueOf()));
  if (value instanceof Map || value instanceof Set) hash = mix(hash, hashEntries(value, depth, memo));
  return mix(hash, hashKeys(value, depth, memo));
}

/** The hash of one object at one depth. The depth falls with each level, so a cycle ends. */
function hashObject(value: object, depth: number, memo: HashMemo): number {
  if (depth === 0) return 0;
  let byDepth = memo.get(value);
  if (byDepth === undefined) {
    byDepth = [];
    memo.set(value, byDepth);
  }
  const known = byDepth[depth];
  if (known !== undefined) return known;
  const hash = hashFields(value, depth - 1, memo);
  byDepth[depth] = hash;
  return hash;
}

/**
 * This function is the default hash of a key. It agrees with `deepEq`: when `deepEq(a, b)` is true,
 * `defaultHash(a)` equals `defaultHash(b)`. So a hash map with `deepEq` finds an equal key.
 *
 * - The hash of an object reads the same fields as `deepEq`. The order of the keys of an object,
 *   and of the entries of a `Map` or a `Set`, has no effect.
 * - The hash reads 16 levels, so a cyclic or very deep value ends. Two values that differ only
 *   below that depth have one hash, and `deepEq` then tells them apart.
 * - A shared part costs one visit per level, so a dense graph ends.
 * - The hash of an object can change in a new version. Do not store it.
 */
export const defaultHash: Hash<any> = (value: any): number =>
  isObject(value) ? hashObject(value, HASH_DEPTH, new Map()) : hashPrimitive(value);

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
 * This function combines hash values into one hash.
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
 * This function makes a hash function that hashes by a property.
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

/** This function gives the place of `null` and `undefined` in the order of `defaultCompare`: `null`, then `undefined`, then each other value. */
const nullishRank = (value: unknown): number => (value === null ? 0 : value === undefined ? 1 : 2);

/**
 * This comparator gives the natural order of primitives.
 * - `null` comes first, then `undefined`, then each other value.
 * - Numbers and dates compare as `numberCompare` and `dateCompare` compare them.
 * - Strings compare by `localeCompare`, and `false` comes before `true`.
 * - Two values of different types compare by their text, with `String`.
 */
export const defaultCompare: Compare<any> = (a, b) => {
  if (a === b) return 0;
  const nullish = nullishRank(a) - nullishRank(b);
  if (nullish !== 0) return nullish;

  // Handle dates
  if (a instanceof Date && b instanceof Date) {
    return dateCompare(a, b);
  }

  // Handle numbers
  if (typeof a === "number" && typeof b === "number") {
    return numberCompare(a, b);
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
 * This comparator gives the order of numbers by value. It gives -1, 0 or 1.
 * - `NaN` comes first, and two `NaN` values give 0.
 * - Two equal infinities give 0, and 0 equals -0.
 */
export const numberCompare: Compare<number> = (a, b) => {
  if (Number.isNaN(a)) return Number.isNaN(b) ? 0 : -1;
  if (Number.isNaN(b)) return 1;
  return a < b ? -1 : a > b ? 1 : 0;
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
 * This comparator gives the order of dates by time, with `numberCompare`. An invalid date has the time `NaN`, so it comes
 * first, and two invalid dates give 0.
 */
export const dateCompare: Compare<Date> = (a, b) => numberCompare(a.getTime(), b.getTime());

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
