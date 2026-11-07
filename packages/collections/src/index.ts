/**
 * `@mark1russell7/collections`: collections with no dependencies.
 *
 * This entry gives the lists, sets, maps, queues, the summary tree, the behaviors, the channels and the lazy
 * operations. The entries `./dag` and `./graph` give the graph code. The entry `./testing` gives the checks.
 */

// ============================================================================
// Core types and utilities
// ============================================================================

export * from "./core/traits.js";
export * from "./core/policies.js";
export * from "./core/middleware.js";
export * from "./core/events.js";
// ============================================================================
// Interfaces
// ============================================================================

export * from "./interfaces/collection.js";
export * from "./interfaces/list.js";
export * from "./interfaces/map.js";
export * from "./interfaces/set.js";

// The listeners of a storage
export { StorageListeners, reportListenerError, type ListenerErrorHandler } from "./storage/listeners.js";

// The order of a list as data: a rank between two neighbors, and the index of a drop
export * from "./order/index.js";

// Export queue interfaces with disambiguation for PriorityQueue
export type {
  ReadonlyQueue,
  Queue,
  Deque,
  BlockingQueue,
  PriorityQueue as IPriorityQueue,
  AsyncQueue as IAsyncQueue,
  TransferQueue,
  DelayQueue,
} from "./interfaces/queue.js";

// ============================================================================
// Implementations
// ============================================================================

export * from "./impl/array-list.js";
export * from "./impl/array-deque.js";
export * from "./impl/hash-map.js";
export * from "./impl/linked-hash-map.js";
export * from "./impl/tree-map.js";
export * from "./impl/tree-set.js";
export * from "./impl/linked-list.js";
export * from "./impl/hash-set.js";
export * from "./impl/priority-queue.js";
export { SummaryTree, summaryTree, type SummaryLocation, type SummaryMonoid, type SummarySearch, type SummarySpec } from "./impl/summary-tree.js";

// ============================================================================
// Behaviors
// ============================================================================

// Export bounded behaviors (excluding duplicate BoundedCollection interface)
export {
  type BoundedOptions,
  boundedList,
  boundedQueue,
  boundedDeque,
  boundedMap,
  bounded,
} from "./behaviors/bounded.js";

export * from "./behaviors/readonly.js";
export * from "./behaviors/safe.js";
export * from "./behaviors/evented.js";
export * from "./behaviors/synchronized.js";
export * from "./behaviors/lru.js";
export * from "./behaviors/ttl.js";

// ============================================================================
// Async/Concurrent
// ============================================================================

export * from "./async/async-queue.js";
export * from "./async/channels.js";
export * from "./async/settled.js";

// ============================================================================
// Functional Operations
// ============================================================================

export * from "./fx/iter.js";
export * from "./fx/collectors.js";

// ============================================================================
// Utilities
// ============================================================================

export * from "./utils/defaults.js";
export * from "./utils/factories.js";
export * from "./utils/helpers.js";

// ============================================================================
// Re-exports for convenience
// ============================================================================

// Most commonly used exports
export { compose, bundle } from "./core/middleware.js";
export { arrayList } from "./impl/array-list.js";
export { arrayDeque } from "./impl/array-deque.js";
export { hashMap } from "./impl/hash-map.js";
export { linkedHashMap } from "./impl/linked-hash-map.js";
export { treeMap } from "./impl/tree-map.js";
export { treeSet } from "./impl/tree-set.js";
export { linkedList } from "./impl/linked-list.js";
export { hashSet } from "./impl/hash-set.js";
export { priorityQueue } from "./impl/priority-queue.js";
// Common behaviors
export { readonly, readonlyList, readonlyMap } from "./behaviors/readonly.js";
export { safeList, safeQueue, safeMap } from "./behaviors/safe.js";
export { eventedList, eventedQueue, eventedMap } from "./behaviors/evented.js";
export { synchronized } from "./behaviors/synchronized.js";
export { lruMap, lruCache, LRUCache } from "./behaviors/lru.js";
export { ttlMap, ttlCache, TTLCache, ttlCollection } from "./behaviors/ttl.js";

// Async/Concurrent
export { asyncQueue, AsyncQueue } from "./async/async-queue.js";
export { asSettled, type Settled } from "./async/settled.js";
export {
  channel,
  Channel,
  select,
  timeout,
  ticker,
  pipeline,
  fanOut,
  fanIn,
  merge,
  workerPool,
} from "./async/channels.js";

// Functional operations
export {
  map,
  filter,
  flatMap,
  flatten,
  take,
  skip,
  takeWhile,
  skipWhile,
  concat,
  zip,
  enumerate,
  chunk,
  window,
  partition,
  reduce,
  scan,
  sort,
  reverse,
  distinct,
  distinctConsecutive,
  tap,
  some,
  every,
  none,
  find,
  count,
  min,
  max,
  sum,
  average,
  toArray,
  toSet,
  toMap as iterToMap,
  pipe,
} from "./fx/iter.js";

export {
  collect,
  toList as collectToList,
  toArray as collectToArray,
  toSet as collectToSet,
  toMap as collectToMap,
  groupingBy,
  groupingByWith,
  partitioningBy,
  counting,
  summingNumber,
  averagingNumber,
  minBy,
  maxBy,
  joining,
  mapping,
  filtering,
  flatMapping,
  reducing,
  reducingWith,
  teeing,
  first,
  last,
  summarizingNumber,
} from "./fx/collectors.js";

// Common factories
export {
  emptyList,
  emptyMap,
  emptyQueue,
  singletonList,
  singletonMap,
  nCopies,
  listOf,
  mapOf,
  range,
  rangeTo,
  toList,
  toMap,
  groupBy,
} from "./utils/factories.js";

