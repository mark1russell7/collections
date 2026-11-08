/**
 * Policy types for configurable collection behaviors.
 *
 * Policies define how collections handle edge cases like overflow,
 * underflow, and eviction. These are used by behavior decorators
 * to give flexible, composable behavior.
 */

// ============================================================================
// Overflow Policies - what to do when a bounded collection is full
// ============================================================================

/**
 * Policy for handling overflow when adding to a full bounded collection.
 *
 * - 'throw': Throw an error when trying to add to a full collection
 * - 'drop-oldest': Remove the oldest element and add the new one
 * - 'drop-newest': Ignore the new element (don't add it)
 * - 'reject': Return false/None but don't throw (graceful failure)
 * - 'grow': Automatically increase capacity (becomes unbounded)
 * - 'block': For async collections, wait until space is available
 */
export type OverflowPolicy =
  | "throw"
  | "drop-oldest"
  | "drop-newest"
  | "reject"
  | "grow"
  | "block";

/**
 * Context information given when overflow occurs.
 */
export interface OverflowContext<T> {
  /** The element that triggered the overflow. */
  readonly newElement: T;
  /** Current size of the collection. */
  readonly currentSize: number;
  /** Maximum capacity of the collection. */
  readonly capacity: number;
  /** Timestamp when overflow occurred. */
  readonly timestamp: number;
}

/**
 * Callback invoked when overflow occurs.
 * This function can log, record metrics or do custom handling.
 */
export type OverflowHandler<T> = (context: OverflowContext<T>) => void;
