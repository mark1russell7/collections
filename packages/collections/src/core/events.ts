/**
 * Typed event emitter system for collections.
 *
 * This function gives a lightweight, type-safe event system for mutation events
 * and other observable behavior. Events are strongly typed using
 * TypeScript's mapped types.
 */

/**
 * A listener function that receives an event payload.
 */
export type Listener<P> = (payload: P) => void;

/**
 * A function to unsubscribe from an event.
 */
export type Unsubscribe = () => void;

/**
 * Event map defining event names and their payload types.
 *
 * @example
 * interface MyEvents {
 *   add: { value: number; index: number }
 *   remove: { value: number }
 *   clear: {}
 * }
 */
export type EventMap = Record<string, any>;

/**
 * Type-safe event emitter.
 *
 * This class supports subscribing to events, emitting events, and managing listeners.
 * All event names and payloads are type-checked at compile time.
 *
 * @example
 * interface ListEvents<T> {
 *   add: { value: T; index: number }
 *   remove: { value: T; index: number }
 *   clear: {}
 * }
 *
 * const emitter = new Emitter<ListEvents<number>>()
 *
 * const unsub = emitter.on('add', ({ value, index }) => {
 *   console.log(`Added ${value} at ${index}`)
 * })
 *
 * emitter.emit('add', { value: 42, index: 0 })
 * unsub() // Unsubscribe
 */
export class Emitter<E extends EventMap> {
  private listeners = new Map<keyof E, Set<Listener<any>>>();

  /**
   * This method subscribes a listener to an event.
   *
   * @param event The event name
   * @param listener The callback to invoke when event is emitted
   * @returns A function to unsubscribe
   */
  on<K extends keyof E>(event: K, listener: Listener<E[K]>): Unsubscribe {
    let listeners = this.listeners.get(event);
    if (!listeners) {
      listeners = new Set();
      this.listeners.set(event, listeners);
    }
    listeners.add(listener);

    // Return unsubscribe function
    return () => {
      listeners!.delete(listener);
      // An off() can replace the set of the event. Remove only the set of this subscription.
      if (listeners!.size === 0 && this.listeners.get(event) === listeners) {
        this.listeners.delete(event);
      }
    };
  }

  /**
   * This method subscribes a listener to an event, and unsubscribes it after the first emission.
   *
   * @param event The event name
   * @param listener The callback to invoke once
   * @returns A function to unsubscribe (in case you want to cancel before emission)
   */
  once<K extends keyof E>(event: K, listener: Listener<E[K]>): Unsubscribe {
    const wrappedListener: Listener<E[K]> = (payload) => {
      unsubscribe();
      listener(payload);
    };

    const unsubscribe = this.on(event, wrappedListener);
    return unsubscribe;
  }

  /**
   * This method emits an event to all registered listeners.
   *
   * @param event The event name
   * @param payload The event payload
   */
  emit<K extends keyof E>(event: K, payload: E[K]): void {
    const listeners = this.listeners.get(event);
    if (listeners) {
      // Create a snapshot to avoid issues if listeners modify the set
      const snapshot = Array.from(listeners);
      for (const listener of snapshot) {
        try {
          listener(payload);
        } catch (error) {
          // Log error but don't stop other listeners
          console.error(
            `Error in event listener for '${String(event)}':`,
            error
          );
        }
      }
    }
  }

  /**
   * This method removes all listeners of an event, or of all events when the call gives no event.
   *
   * @param event Optional event name to clear listeners for
   */
  off<K extends keyof E>(event?: K): void {
    if (event !== undefined) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
  }

  /**
   * This method gives the number of listeners of an event.
   *
   * @param event The event name
   * @returns Number of registered listeners
   */
  listenerCount<K extends keyof E>(event: K): number {
    return this.listeners.get(event)?.size ?? 0;
  }

  /**
   * This method gives the names of the events that have one or more listeners.
   */
  eventNames(): (keyof E)[] {
    return Array.from(this.listeners.keys());
  }

  /**
   * This method gives true when an event has one or more listeners.
   */
  hasListeners<K extends keyof E>(event: K): boolean {
    return this.listenerCount(event) > 0;
  }

  /**
   * This method removes all listeners and releases the resources.
   */
  dispose(): void {
    this.listeners.clear();
  }
}

/**
 * This function makes an event emitter for an event map.
 *
 * This is a convenience factory function.
 *
 * @example
 * const events = createEmitter<ListEvents<number>>()
 */
export const createEmitter = <E extends EventMap>(): Emitter<E> => {
  return new Emitter<E>();
};
