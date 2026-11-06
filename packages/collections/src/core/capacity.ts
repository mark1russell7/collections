/**
 * The check of a capacity, for each layer and class that has a maximum size.
 */

/**
 * This function gives the capacity when it is a positive whole number. Otherwise it throws a
 * `RangeError`. A capacity of `NaN` makes a comparison `size >= capacity` always false, so a
 * structure with that capacity grows without a limit. A capacity of 0 or less, or a fraction,
 * has no clear meaning.
 *
 * @param capacity - The capacity to check.
 * @param owner - The name of the layer or class, for the message of the error.
 * @returns The same capacity.
 * @throws RangeError when the capacity is not a positive whole number.
 */
export function checkCapacity(capacity: number, owner: string): number {
  if (!Number.isSafeInteger(capacity) || capacity < 1) {
    throw new RangeError(`${owner}: the capacity must be a positive whole number, not ${String(capacity)}`);
  }
  return capacity;
}
