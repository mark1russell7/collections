/**
 * The checks of the contract suite. The suite does not import a test framework, so a runtime
 * entry of this package does not load one. A failed check throws `ContractViolation`.
 */

/**
 * The error of a failed check of the contract suite.
 *
 * @deprecated Version 0.12.0 removes the entry `./testing` (C25). Use `AssertionError` of `node:assert`.
 */
export class ContractViolation extends Error {
  override readonly name = "ContractViolation";
}

/**
 * This function gives the text of a value for a message: JSON, with a `Map` as its entries.
 *
 * @deprecated Version 0.12.0 removes the entry `./testing` (C25). Use `inspect` of `node:util`.
 */
export function show(value: unknown): string {
  if (value === undefined) return "undefined";
  try {
    return JSON.stringify(value, (_key, item: unknown) => (item instanceof Map ? { Map: [...item.entries()] } : item === undefined ? "<undefined>" : item));
  } catch {
    return String(value);
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) return false;
  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === Object.prototype || prototype === null;
}

/**
 * This function compares two values deeply: JSON values, arrays, plain objects and maps. Two maps
 * are equal when they have the same keys with equal values, in any order.
 *
 * This function is for JSON values in tests. It is not `deepEq`, the equality of the collections,
 * and it differs in these cases:
 *
 * - A `Date`, a `Set` or an instance of a class equals only itself here. So `new Date(0)` does not
 *   equal `new Date(0)` here, and it does under `deepEq`.
 * - 0 does not equal -0 here, and it does under `deepEq`.
 * - `{}` equals `Object.create(null)` here, and it does not under `deepEq`.
 * - A cyclic value exhausts the stack here, and it ends under `deepEq`.
 *
 * @deprecated Version 0.12.0 removes the entry `./testing` (C25). Use `isDeepStrictEqual` of `node:util`. It also compares the prototypes.
 */
export function deepEqual(actual: unknown, expected: unknown): boolean {
  if (Object.is(actual, expected)) return true;
  if (actual instanceof Map && expected instanceof Map) {
    if (actual.size !== expected.size) return false;
    for (const [key, value] of actual) {
      if (!expected.has(key) || !deepEqual(value, expected.get(key))) return false;
    }
    return true;
  }
  if (Array.isArray(actual) && Array.isArray(expected)) {
    return actual.length === expected.length && actual.every((item, index) => deepEqual(item, expected[index]));
  }
  if (isPlainObject(actual) && isPlainObject(expected)) {
    const keys = Object.keys(actual);
    if (keys.length !== Object.keys(expected).length) return false;
    return keys.every((key) => Object.prototype.hasOwnProperty.call(expected, key) && deepEqual(actual[key], expected[key]));
  }
  return false;
}

/**
 * This function throws `ContractViolation` when the two values are not deeply equal.
 *
 * @deprecated Version 0.12.0 removes the entry `./testing` (C25). Use `assert.deepStrictEqual` of `node:assert`. It also compares the prototypes.
 */
export function same(actual: unknown, expected: unknown, what: string): void {
  if (!deepEqual(actual, expected)) {
    throw new ContractViolation(`${what}: expected ${show(expected)}, got ${show(actual)}`);
  }
}

/**
 * This function throws `ContractViolation` when the condition is false.
 *
 * @deprecated Version 0.12.0 removes the entry `./testing` (C25). Use `assert.ok` of `node:assert`.
 */
export function holds(condition: boolean, what: string): void {
  if (!condition) throw new ContractViolation(what);
}

/**
 * This function starts an operation that must fail with a rejected promise, and gives the error.
 * A synchronous throw breaks the contract too: each method of a storage gives a promise.
 *
 * @deprecated Version 0.12.0 removes the entry `./testing` (C25). Use `rejects` of `@mark1russell7/rigor-testkit` 0.1.4.
 */
export async function rejects(start: () => Promise<unknown>, what: string): Promise<unknown> {
  let promise: Promise<unknown>;
  try {
    promise = start();
  } catch (error) {
    throw new ContractViolation(`${what}: the method threw at once (${show(error instanceof Error ? error.message : error)}), and did not give a rejected promise`);
  }
  holds(typeof promise?.then === "function", `${what}: the method did not give a promise`);
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new ContractViolation(`${what}: the promise did not reject`);
}
