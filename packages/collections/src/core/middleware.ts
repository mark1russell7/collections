/**
 * Middleware composition system for collections.
 *
 * This module gives the core composition mechanism. With it, behaviors go in layers
 * on top of collections with the decorator pattern.
 *
 * The mechanism is for synchronous collection operations. The collection instance itself
 * is the context, so a behavior needs no explicit context object.
 *
 * @example
 * const list = compose(
 *   safeList<number>(),
 *   eventedList<number>(),
 *   boundedList<number>({ capacity: 100 })
 * )(arrayList<number>())
 */

import type { Collection } from "../interfaces/collection.js";
import { compose as fold, type Chain, type Layer, type Stacked } from "./layers.js";

/**
 * A middleware is a function that takes a collection and gives
 * an enhanced version of that collection.
 *
 * This maps to the unified middleware pattern where:
 * - The "context" is the collection itself (passed directly, not in a context object)
 * - Execution is synchronous (no Promises)
 * - Type transformation is tracked through In -> Out
 *
 * Middleware can:
 * - Intercept method calls
 * - Add new capabilities
 * - Transform inputs/outputs
 * - Delegate to the next layer
 *
 * @template In The input collection type
 * @template Out The output collection type (defaults to In if not specified)
 */
export type Middleware<In = any, Out extends In = In> = (next: In) => Out;

/**
 * Composes multiple middleware layers into a single enhancer function.
 *
 * This function uses reduceRight to make an "onion" pattern where the first middleware
 * is the outermost layer (runs first when calling into the collection).
 *
 * The type system properly tracks capability additions through composition.
 *
 * @example
 * // Layer order (outer to inner):
 * // 1. safe - converts throws to Option/Result
 * // 2. evented - emits events on mutations
 * // 3. bounded - enforces capacity limits
 * // 4. base - the underlying ArrayList
 * const enhancer = compose(
 *   safeList<number>(),
 *   eventedList<number>(),
 *   boundedList<number>({ capacity: 100 })
 * )
 * const list = enhancer(arrayList<number>())
 * // Type: List<number> & SafeCollection & EventedCollection & BoundedCollection
 *
 * @param layers The middleware layers to compose
 * @returns A function that applies all layers to a base collection
 */
export function compose<const L extends readonly Layer[]>(...layers: L & Chain<L>): Stacked<L> {
  return fold(...(layers as readonly Layer[])) as unknown as Stacked<L>;
}

/**
 * Utility to check if a collection has a specific capability.
 * Useful for middleware that wants to conditionally enhance behavior.
 *
 * @example
 * if (hasCapability(collection, 'on')) {
 *   // Collection supports events
 *   collection.on('add', handler)
 * }
 */
export const hasCapability = <C extends Collection<any>, K extends keyof any>(
  collection: C,
  capability: K
): collection is C & Record<K, unknown> => {
  return capability in collection;
};

/**
 * Marker interface for collections that support events.
 * Middleware can use this to detect event capability.
 */
export interface Evented<E extends Record<string, any>> {
  /**
   * Subscribe to an event.
   * @returns Unsubscribe function
   */
  on<K extends keyof E>(event: K, handler: (payload: E[K]) => void): () => void;

  /**
   * Emit an event (internal use by middleware).
   * @internal
   */
  emit?<K extends keyof E>(event: K, payload: E[K]): void;
}

/**
 * Marker interface for collections that support async operations.
 */
export interface Async<T> {
  /**
   * Async iterator for consuming elements.
   */
  [Symbol.asyncIterator](): AsyncIterator<T>;
}

/**
 * Marker interface for collections that are bounded.
 */
export interface BoundedCollection {
  /** Maximum capacity */
  readonly capacity: number;
  /** If collection is at capacity */
  readonly isFull: boolean;
  /** Remaining space */
  readonly remainingCapacity: number;
}

/**
 * Marker interface for collections that support safe (Option/Result) operations.
 */
export interface SafeCollection {
  /**
   * Namespace for safe operations that return Option/Result instead of throwing.
   */
  readonly safe: unknown;
}

/**
 * Type helper to extract the element type from a collection.
 */
export type ElementType<C> = C extends {
  [Symbol.iterator](): Iterator<infer T>;
}
  ? T
  : C extends { get(index: number): infer T }
  ? T
  : C extends { peek(): infer T }
  ? T
  : never;

/**
 * Type helper to make all methods of a type return their async equivalents.
 */
export type Asyncify<C> = {
  [K in keyof C]: C[K] extends (...args: infer Args) => infer R
    ? (...args: Args) => Promise<R>
    : C[K];
};

/**
 * Helper to make a proxy that intercepts method calls.
 * Useful for implementing middleware that needs to wrap method invocations.
 *
 * @example
 * const logged = interceptMethods(collection, (target, method, args) => {
 *   console.log(`Calling ${String(method)} with`, args)
 *   const result = Reflect.apply(target[method], target, args)
 *   console.log(`Result:`, result)
 *   return result
 * })
 */
export const interceptMethods = <C extends object>(
  target: C,
  interceptor: (target: C, method: keyof C, args: unknown[]) => unknown
): C => {
  return new Proxy(target, {
    get(t, prop, receiver) {
      const value = Reflect.get(t, prop, receiver);
      if (typeof value === "function" && typeof prop === "string") {
        return function (this: unknown, ...args: unknown[]) {
          return interceptor(t, prop as keyof C, args);
        };
      }
      return value;
    },
  });
};

/**
 * Helper to make a readonly view of a collection by blocking mutating methods.
 *
 * @param mutatingMethods Set of method names that the middleware blocks
 * @param errorMessage Custom error message to throw
 */
export const blockMethods = <C extends object>(
  target: C,
  mutatingMethods: Set<string | symbol>,
  errorMessage: string = "Operation not allowed"
): C => {
  return new Proxy(target, {
    get(t, prop, receiver) {
      const value = Reflect.get(t, prop, receiver);
      if (typeof value === "function" && mutatingMethods.has(prop)) {
        return () => {
          throw new Error(errorMessage);
        };
      }
      return value;
    },
  });
};

/**
 * Helper to delegate method calls to a target while maintaining correct context.
 * Useful when wrapping collections.
 */
export const delegate = <C extends object, T extends C>(
  target: T,
  wrapper: Partial<C>
): C => {
  return new Proxy(target, {
    get(t, prop, receiver) {
      // If wrapper has the property, use it
      if (prop in wrapper) {
        return Reflect.get(wrapper, prop, receiver);
      }
      // Otherwise delegate to target
      const value = Reflect.get(t, prop, receiver);
      // Bind methods to maintain correct 'this' context
      if (typeof value === "function") {
        return value.bind(t);
      }
      return value;
    },
  }) as C;
};

/**
 * Utility type to add optional capabilities to a collection type.
 */
export type WithCapability<C, Cap> = C & Cap;

/**
 * Builder pattern helper for fluent API construction.
 *
 * @example
 * class ListBuilder<T> {
 *   private middleware: Middleware<List<T>>[] = []
 *
 *   bounded(capacity: number) {
 *     this.middleware.push(boundedList({ capacity }))
 *     return this
 *   }
 *
 *   evented() {
 *     this.middleware.push(eventedList())
 *     return this
 *   }
 *
 *   build(): List<T> {
 *     return compose(...this.middleware)(arrayList<T>())
 *   }
 * }
 */
export abstract class CollectionBuilder<C> {
  protected middleware: Middleware<C>[] = [];

  /**
   * Apply a custom middleware.
   */
  use(middleware: Middleware<C>): this {
    this.middleware.push(middleware);
    return this;
  }

  /**
   * Build the final collection by composing all middleware with the base.
   */
  abstract build(): C;
}

/**
 * Utility to make a middleware that only enhances specific methods.
 *
 * @example
 * const logAdd = enhanceMethod('add', (original, args) => {
 *   console.log('Adding:', args[0])
 *   return original(...args)
 * })
 */
export const enhanceMethod = <C extends object, K extends keyof C & string>(
  methodName: K,
  enhancer: (
    original: C[K] extends (...args: infer Args) => infer R
      ? (...args: Args) => R
      : never,
    args: C[K] extends (...args: infer Args) => any ? Args : never
  ) => C[K] extends (...args: any[]) => infer R ? R : never
): Middleware<C> => {
  return (next: C): C => {
    type MethodArgs = C[K] extends (...args: infer Args) => any ? Args : never;
    return new Proxy(next, {
      get(target, prop, receiver) {
        const value = Reflect.get(target, prop, receiver);
        if (prop === methodName && typeof value === "function") {
          return function (this: unknown, ...args: unknown[]) {
            return enhancer(value.bind(target), args as MethodArgs);
          };
        }
        return value;
      },
    });
  };
};

/**
 * This function combines multiple middleware into a single middleware.
 * Useful for making reusable middleware bundles.
 *
 * Bundle has the same composition semantics as compose - the first middleware
 * is the outermost layer, and types are tracked through the chain.
 *
 * @example
 * const standardBehaviors = bundle(
 *   boundedList<number>({ capacity: 1000 }),
 *   eventedList<number>(),
 *   safeList<number>()
 * )
 *
 * const list = compose(standardBehaviors)(arrayList<number>())
 */
export const bundle: typeof compose = compose;
