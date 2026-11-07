/**
 * The removal channel of a stack of layers (C23).
 *
 * Some layers remove entries or elements by themselves. The bounded layers drop one when they are full.
 * `lruMap` evicts one, and `ttlMap` removes an expired one. A layer
 * above them does not call these removals, so it cannot see them. The removal channel tells it.
 *
 * - Each removing layer gives its channel under the key `removals`. Its channel gives its own removals and the
 *   removals of the channel below it.
 * - A layer that does not remove forwards the channel below it: a proxy gives each unknown key of its target.
 * - `eventedMap` and the other evented layers emit an event for each removal of the channel below them.
 *
 * @example
 * const cache = compose(eventedMap<string, number>(), lruMap({ capacity: 2 }))(hashMap());
 * cache.on("delete", ({ key, reason }) => console.log(key, reason)); // an eviction gives the reason "evict"
 */

import type { Listener, Unsubscribe } from "./events.js";

/** The key of the removal channel on a layer. */
export const removals: unique symbol = Symbol.for("@mark1russell7/collections/removals");

/**
 * The cause of a removal: a bounded layer drops, `lruMap` evicts and `ttlMap` removes an expired entry.
 */
export type RemovalReason = "drop" | "evict" | "expire";

/** A removal from a map: the key and the value that the layer removed. */
export interface MapRemoval<K, V> {
  readonly key: K;
  readonly value: V;
  readonly reason: RemovalReason;
}

/**
 * A removal of an element: the element and the end that it left. A removal from a collection with no ends,
 * for example by `ttlCollection`, has no `end`.
 */
export interface ElementRemoval<T> {
  readonly value: T;
  readonly end?: "first" | "last";
  readonly reason: RemovalReason;
}

/** A channel of removals. The listener gets each removal after the collection changed. */
export interface RemovalChannel<R> {
  on(listener: Listener<R>): Unsubscribe;
}

/** The channel of a removing layer, and the function that sends its own removals. */
export interface RemovalSource<R> {
  readonly channel: RemovalChannel<R>;
  emit(removal: R): void;
}

/**
 * This function gives the removal channel of a collection, or `undefined` when no layer of it removes.
 */
export function removalsOf<R>(collection: object): RemovalChannel<R> | undefined {
  const channel: unknown = (collection as { readonly [removals]?: unknown })[removals];
  if (typeof channel !== "object" || channel === null) return undefined;
  return typeof (channel as { on?: unknown }).on === "function" ? (channel as RemovalChannel<R>) : undefined;
}

/**
 * This function makes the channel of a removing layer over `next`.
 * The channel forwards each removal below. It calls `below` first, so the layer corrects its own state first.
 */
export function removalSource<R>(next: object, below?: (removal: R) => void): RemovalSource<R> {
  const listeners = new Set<Listener<R>>();
  const emit = (removal: R): void => {
    for (const listener of [...listeners]) listener(removal);
  };
  removalsOf<R>(next)?.on((removal) => {
    below?.(removal);
    emit(removal);
  });
  const channel: RemovalChannel<R> = {
    on(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
  return { channel, emit };
}
