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
      // Clean up empty sets
      if (listeners!.size === 0) {
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

/**
 * Event batching utility for reducing event noise.
 * This class collects events and emits them in batches.
 *
 * @example
 * const batcher = new EventBatcher(emitter, 'add', 100)
 * batcher.queue({ value: 1, index: 0 })
 * batcher.queue({ value: 2, index: 1 })
 * // After 100ms or flush(), emits single 'batch-add' event with both items
 */
export class EventBatcher<E extends EventMap, K extends keyof E> {
  private emitter: Emitter<E & { [P in `batch-${K & string}`]: E[K][] }>;
  private event: K;
  private delayMs: number;
  private batch: E[K][] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    emitter: Emitter<E & { [P in `batch-${K & string}`]: E[K][] }>,
    event: K,
    delayMs: number
  ) {
    this.emitter = emitter;
    this.event = event;
    this.delayMs = delayMs;
  }

  /**
   * This method adds an event to the current batch.
   */
  queue(payload: E[K]): void {
    this.batch.push(payload);

    if (this.timer === null) {
      this.timer = setTimeout(() => this.flush(), this.delayMs);
    }
  }

  /**
   * This method emits all batched events at once.
   */
  flush(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    if (this.batch.length > 0) {
      const batchEvent = `batch-${String(this.event)}` as keyof (E & { [P in `batch-${K & string}`]: E[K][] });
      this.emitter.emit(batchEvent, this.batch as any);
      this.batch = [];
    }
  }

  /**
   * This method sends the events of the batch and releases the resources.
   */
  dispose(): void {
    this.flush();
  }
}

/**
 * Async event emitter that gives promises.
 * This class waits for all async listeners to complete.
 *
 * @example
 * const emitter = new AsyncEmitter<{ save: { data: string } }>()
 *
 * emitter.on('save', async ({ data }) => {
 *   await database.save(data)
 * })
 *
 * await emitter.emit('save', { data: 'test' }) // Waits for save
 */
export class AsyncEmitter<E extends EventMap> {
  private listeners = new Map<keyof E, Set<Listener<any>>>();

  on<K extends keyof E>(event: K, listener: Listener<E[K]>): Unsubscribe {
    let listeners = this.listeners.get(event);
    if (!listeners) {
      listeners = new Set();
      this.listeners.set(event, listeners);
    }
    listeners.add(listener);

    return () => {
      listeners!.delete(listener);
      if (listeners!.size === 0) {
        this.listeners.delete(event);
      }
    };
  }

  /**
   * This method emits an event and waits until all async listeners complete.
   *
   * @param event The event name
   * @param payload The event payload
   * @returns Promise that resolves when all listeners complete
   */
  async emit<K extends keyof E>(event: K, payload: E[K]): Promise<void> {
    const listeners = this.listeners.get(event);
    if (listeners) {
      const promises = Array.from(listeners).map((listener) =>
        Promise.resolve().then(() => listener(payload))
      );
      await Promise.all(promises);
    }
  }

  off<K extends keyof E>(event?: K): void {
    if (event !== undefined) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
  }

  listenerCount<K extends keyof E>(event: K): number {
    return this.listeners.get(event)?.size ?? 0;
  }

  eventNames(): (keyof E)[] {
    return Array.from(this.listeners.keys());
  }

  dispose(): void {
    this.listeners.clear();
  }
}

/**
 * Utility to forward events from one emitter to another.
 * Useful for composing event sources.
 *
 * @example
 * const child = new Emitter<ChildEvents>()
 * const parent = new Emitter<ParentEvents>()
 *
 * forwardEvent(child, parent, 'childEvent', 'parentEvent')
 */
export const forwardEvent = <
  E1 extends EventMap,
  E2 extends EventMap,
  K1 extends keyof E1,
  K2 extends keyof E2
>(
  source: Emitter<E1>,
  target: Emitter<E2>,
  sourceEvent: K1,
  targetEvent: K2,
  transform?: (payload: E1[K1]) => E2[K2]
): Unsubscribe => {
  return source.on(sourceEvent, (payload) => {
    const transformedPayload = transform
      ? transform(payload)
      : (payload as any);
    target.emit(targetEvent, transformedPayload);
  });
};

/**
 * This function makes a filtered event subscription that fires only when the predicate is true.
 *
 * @example
 * const emitter = new Emitter<{ change: { value: number } }>()
 *
 * onWhen(emitter, 'change', ({ value }) => value > 10, ({ value }) => {
 *   console.log('Value exceeded 10:', value)
 * })
 */
export const onWhen = <E extends EventMap, K extends keyof E>(
  emitter: Emitter<E>,
  event: K,
  predicate: (payload: E[K]) => boolean,
  listener: Listener<E[K]>
): Unsubscribe => {
  return emitter.on(event, (payload) => {
    if (predicate(payload)) {
      listener(payload);
    }
  });
};
