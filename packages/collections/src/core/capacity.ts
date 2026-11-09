/**
 * The checks of the options of the layers and classes: a capacity, and a duration of a time to live or an interval.
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

/**
 * This function gives the duration when it is a number greater than 0. Otherwise it throws a `RangeError`. A time to
 * live of 0 or less ends each entry at its start. An interval of 0, less than 0 or `NaN` starts the check each
 * millisecond. `Infinity` is a valid duration: the time does not end, or the check does not start.
 *
 * @param duration - The duration to check, in milliseconds.
 * @param owner - The name of the layer or class and of the option, for the message of the error.
 * @returns The same duration.
 * @throws RangeError when the duration is not a number greater than 0.
 */
export function checkDuration(duration: number, owner: string): number {
  if (typeof duration !== "number" || !(duration > 0)) {
    throw new RangeError(`${owner}: the duration must be a number of milliseconds greater than 0, not ${String(duration)}`);
  }
  return duration;
}
