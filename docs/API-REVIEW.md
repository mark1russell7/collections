# The review of the public API (C12)

This review gives a verdict for each name of the public API of `@mark1russell7/collections`. It reviews `main` at 0.7.0, on 2026-11-07. The five entries have 360 names. The pull requests #30 to #34 add only the eight names of the removals (C23), and this review has them too.

A test (`src/api-review.test.ts`) compares this file with `test/api/public-api.txt`. Each name of the API report must be in a table of this file. Thus a new export also needs a verdict.

## The verdicts

| Verdict | What it means | Names |
|---|---|---|
| keep | The name stays as it is. | 205 |
| change | The name stays, but its API changes. Mark decides each change (D1 to D6). | 57 |
| remove | The name leaves the public API. No other file, test or doc of the repository uses it. The code stays only where a kept name uses it. | 76 |
| move | The name goes to its home in the map. Collections keeps the name with a deprecation for one MINOR version. | 22 |
| ask | The map had no home for the area. The strategist named the homes on 2026-11-07 (S1 and S2). | 0 |

The counts are of the 360 names of `main`. The eight names of the removals have their own table at the end.

## The facts that the verdicts use

- A script counted, for each name, the other source files, the tests and the Markdown files that use it. 182 of the 360 names have no use, test or doc.
- Two packages of client use collections: `@procedures/collections` (`client-collections`) and `@procedures/dag` (`client-dag`). `@procedures/client` imports `compose` and `Layer` of `./layers`.
- `@procedures/collections` re-exports each name of the root entry, except the three storage names, which it uses. So each removal also removes a name of `@procedures/collections`. Its next update to collections is a MINOR version (before 1.0).
- Client pins `^0.5.0`. Before 1.0, this range takes only 0.5.x. So no change of this review reaches client until client updates.
- typeset uses `SummaryTree` (T2b).

## The root entry `.`

### The implementations

| Names | Verdict | Reason |
|---|---|---|
| `arrayList`, `ArrayList`, `ArrayListOptions`, `arrayDeque`, `ArrayDeque`, `ArrayDequeOptions`, `treeMap`, `TreeMap`, `TreeMapOptions`, `treeSet`, `TreeSet`, `TreeSetOptions`, `linkedList`, `LinkedList`, `LinkedListOptions`, `priorityQueue`, `PriorityQueue`, `PriorityQueueOptions` | keep | The contracts of C10 test each implementation against a model. |
| `hashMap`, `HashMap`, `HashMapOptions`, `linkedHashMap`, `LinkedHashMap`, `LinkedHashMapOptions`, `hashSet`, `HashSet`, `HashSetOptions` | change | `HashMapOptions` had `keyEq` and `keyHash`. The other two have `eq` and `hash`. Decision D2 picks one set. Version 0.10.0 gives `hashMap` the names `eq` and `hash`, and version 0.11.0 removes the old names. |
| `SummaryTree`, `summaryTree`, `SummaryLocation`, `SummaryMonoid`, `SummarySearch`, `SummarySpec` | keep | typeset uses the summary tree for line breaking. |

### The interfaces

| Names | Verdict | Reason |
|---|---|---|
| `ReadonlyCollection`, `Collection`, `Readonly`, `RandomAccess`, `Stack`, `Entry`, `ReadonlyMapLike`, `MapLike`, `SortedMap`, `NavigableMap`, `ReadonlySet`, `Set`, `SortedSet`, `NavigableSet`, `ReadonlyQueue`, `Queue`, `Deque`, `IPriorityQueue`, `IAsyncQueue` | keep | An implementation or a behavior of the package uses each interface. |
| `ReadonlyList`, `List` | change | The doc of `subList` told a view, but the code gives a copy (C13). Decision D1 picks one. |
| `Vector`, `CircularList`, `MultiMap`, `BiMap`, `WeakMapLike`, `BlockingQueue`, `TransferQueue`, `DelayQueue` | remove | No class implements these interfaces. An interface with no implementation tells a feature that the package does not have. |
| `IsReadonly`, `ElementOf` | remove | No file uses these types. |

### The traits and the policies

| Names | Verdict | Reason |
|---|---|---|
| `Eq`, `Hash`, `Compare`, `Bounded` | keep | The implementations take these types. |
| `Sized`, `Clearable`, `Emptiable`, `Cloneable`, `ArrayConvertible`, `ReadonlyCollectionBase`, `MutableCollectionBase`, `EqualityProvider`, `HashProvider`, `ComparisonProvider`, `Freezable` | remove | No file uses these traits. |
| `Disposable` | remove | No file uses it. The language has a `Disposable` type with `Symbol.dispose`, and this export hides it. |
| `OverflowPolicy`, `OverflowContext`, `OverflowHandler` | keep | `bounded` uses them. |
| `UnderflowPolicy`, `UnderflowContext`, `UnderflowHandler`, `EvictionPolicy`, `EvictionMetadata`, `EvictionCandidate`, `EvictionSelector`, `ConflictResolutionPolicy`, `MergeFunction`, `CompactionPolicy`, `GrowthPolicy`, `ValidationPolicy`, `ValidationContext`, `ValidationHandler` | remove | No behavior applies these policies. |
| `DEFAULT_OVERFLOW_POLICY`, `DEFAULT_UNDERFLOW_POLICY`, `DEFAULT_EVICTION_POLICY`, `DEFAULT_CONFLICT_POLICY`, `DEFAULT_GROWTH_POLICY`, `DEFAULT_VALIDATION_POLICY` | remove | No file reads these values. The default policy of `bounded` is the option value `throw`. |
| `RetryPolicy`, `RetryContext`, `RetryPredicate`, `DEFAULT_RETRY_POLICY` | remove | No file uses them. Retries and backoff have a home: `@mark1russell7/service`. A collection does not retry. |

### The layers and the events

| Names | Verdict | Reason |
|---|---|---|
| `compose`, `bundle`, `Middleware`, `Evented`, `Async`, `BoundedCollection` | keep | The behaviors and the layers guide use them. The root `compose` gives a collection, and `compose` of `./layers` gives a function. |
| `hasCapability`, `SafeCollection`, `ElementType`, `Asyncify`, `interceptMethods`, `blockMethods`, `delegate`, `WithCapability`, `CollectionBuilder`, `enhanceMethod` | remove | No other file uses these helpers. |
| `Emitter`, `createEmitter`, `Listener`, `Unsubscribe`, `EventMap` | keep | `evented` uses the emitter. The strategist made collections its home (S1): collections is the bottom layer, so each package can use it with no new dependency. |
| `EventBatcher`, `AsyncEmitter`, `forwardEvent`, `onWhen` | remove | No file uses them. |
| `StorageListeners`, `reportListenerError`, `ListenerErrorHandler` | keep | The memory storage of `@procedures/collections` uses them. |

### The keys of an order

| Names | Verdict | Reason |
|---|---|---|
| `keyBetween`, `keysBetween`, `keysForDrop`, `compareKeys`, `isValidKey`, `KeyCheckOptions`, `KeyedItem` | keep | These functions give the keys of an ordered list, and the tests examine them. |
| `KEY_DIGITS` | remove | No file reads it. The alphabet of the keys is a detail of the code. |
| `Point`, `dropIndex` | move | A point on the screen and the hit test of a drop are geometry. Their home is `@mark1russell7/layout-contract`. |

### The behaviors

| Names | Verdict | Reason |
|---|---|---|
| `bounded`, `boundedList`, `boundedQueue`, `boundedDeque`, `boundedMap`, `BoundedOptions` | keep | The contracts of the behaviors test them. |
| `readonly`, `readonlyList`, `readonlyMap`, `readonlyQueue`, `readonlyCollection`, `ReadonlyOptions` | keep | `readonly` is the main entry of the behavior. |
| `unmodifiableList`, `unmodifiableMap`, `unmodifiableCollection` | change | Each one is an alias of a `readonly` function. Decision D4 removes one set of names. |
| `safe`, `safeList`, `safeQueue`, `safeMap`, `safeDeque`, `SafeListOperations`, `SafeQueueOperations`, `SafeDequeOperations`, `SafeMapOperations` | keep | The tests examine each safe function. |
| `evented`, `eventedList`, `eventedQueue`, `eventedMap`, `eventedDeque`, `ListEvents`, `QueueEvents`, `DequeEvents`, `MapEvents`, `CollectionEvents` | keep | These names are the evented behavior. `eventedQueue` and `eventedDeque` have no test yet. |
| `synchronized`, `readWriteLock`, `synchronizedList`, `synchronizedMap`, `synchronizedCollection`, `synchronizedSet` | keep | These names are the lock behavior. Only `synchronized` and `readWriteLock` have tests. |
| `reentrantSynchronized` | remove | It is not reentrant. Each use makes a new `Symbol`, so a nested use waits for the outer lock (C28). |
| `lruMap`, `lruCache`, `LRUCache`, `LRUOptions` | keep | The tests examine the LRU order. |
| `ttlMap`, `ttlCache`, `TTLCache`, `ttlCollection`, `TTLOptions` | change | `TTLCache` starts its own timer and reads `Date.now`. Decision D5 gives it a clock, so a test controls the time. |

### The async names

| Names | Verdict | Reason |
|---|---|---|
| `asyncQueue`, `AsyncQueue`, `AsyncQueueOptions`, `asSettled`, `Settled` | keep | The async contracts test them. |
| `channel`, `Channel`, `select`, `timeout`, `ticker`, `pipeline`, `fanOut`, `fanIn`, `merge`, `workerPool`, `buffered`, `unbuffered`, `SelectCase` | move | Channels, `select` and a worker pool are tools of concurrency. Their home is `@mark1russell7/service` (S2). There, `ticker` and `timeout` use its clock, so one fake clock tests each tool. |

### The iterables and the collectors

| Names | Verdict | Reason |
|---|---|---|
| `map`, `filter`, `flatMap`, `flatten`, `take`, `skip`, `takeWhile`, `skipWhile`, `concat`, `zip`, `enumerate`, `chunk`, `window`, `partition`, `reduce`, `scan`, `sort`, `reverse`, `distinct`, `distinctConsecutive`, `tap`, `some`, `every`, `none`, `find`, `count`, `min`, `max`, `sum`, `toArray`, `toSet`, `iterToMap`, `pipe` | change | The language has helpers on each iterator for `map`, `filter`, `take`, `flatMap`, `reduce`, `some`, `every`, `find` and `toArray`. Decision D6 keeps or removes the copies. |
| `average`, `averagingNumber`, `summarizingNumber` | change | A mean is statistics. These functions call `@mark1russell7/rigor-statistics` after the move of `SummaryStatistics`. |
| `SummaryStatistics` | move | Its home is `@mark1russell7/rigor-statistics`, the home of counts, means and spreads. |
| `collect`, `Collector`, `groupingBy`, `groupingByWith`, `partitioningBy`, `counting`, `summingNumber`, `minBy`, `maxBy`, `joining`, `mapping`, `filtering`, `flatMapping`, `reducing`, `reducingWith`, `teeing`, `first`, `last` | keep | The tests of the collectors examine them. |
| `collectToList`, `collectToArray`, `collectToSet`, `collectToMap` | keep | These names are the collectors of the four kinds. Decision D4 also reviews them. |

### The factories, the defaults and the helpers

| Names | Verdict | Reason |
|---|---|---|
| `range`, `toList`, `toMap`, `listOf`, `mapOf`, `queueOf`, `emptyList`, `emptyMap`, `emptyQueue`, `singletonList`, `singletonMap`, `nCopies`, `rangeTo`, `groupBy`, `immutableListOf`, `immutableMapOf`, `buildList`, `buildMap` | keep | These names make collections. Only `range`, `toList` and `toMap` have a use or a test. |
| `mutableListOf`, `mutableMapOf` | change | `mutableListOf` is the same function as `listOf`, and `mutableMapOf` is the same as `mapOf`. Decision D4 removes one set. |
| `defaultEq`, `shallowEq`, `deepEq`, `eqBy`, `defaultHash`, `hashString`, `hashNumber`, `combineHashes`, `hashBy`, `defaultCompare`, `numberCompare`, `stringCompare`, `stringCompareIgnoreCase`, `dateCompare`, `booleanCompare`, `reversed`, `comparing`, `thenComparing`, `nullsFirst`, `nullsLast`, `comparingKey` | keep | The hash tables and the trees take these functions. These hashes are for tables, not for seeds, so collections is their home. |
| `checkBounds`, `checkInsertBounds`, `checkRangeBounds`, `findIndex`, `findLastIndex`, `arrayContains`, `arrayRemove`, `arrayRemoveAll`, `arrayIterator`, `reverseArrayIterator`, `requireNonNull`, `requireNonEmpty`, `clamp` | remove | No other module imports these helpers. The other uses of `findIndex` are the method of an array, and `summary-tree` has its own `clamp`. |
| `stringHashCode` | remove | It is a second string hash, with a different result from `hashString`. Two hashes of one string in one package is a risk. |

## The entry `./dag`

| Names | Verdict | Reason |
|---|---|---|
| `DAGNode`, `DependencyDAG`, `DAGExecutionOptions`, `NodeResult`, `DAGResult`, `NodeProcessor`, `buildLeveledDAG`, `getTopologicalOrder`, `visualizeDAG`, `executeDAG`, `executeDAGSequential`, `createProcessor`, `filterDAGFromRoot`, `getAncestors`, `getDescendants`, `createNode`, `buildNodeMap` | keep | `@procedures/dag` re-exports each name, and the DAG guide tests them. |

## The entry `./graph`

| Names | Verdict | Reason |
|---|---|---|
| `hubBreadthFirstOrder`, `WeightedEdge` | keep | `@procedures/dag` re-exports them, and the graph guide tests the order. |

## The entry `./layers`

| Names | Verdict | Reason |
|---|---|---|
| `compose`, `Layer`, `InnerOf`, `OuterOf`, `Chain`, `Composed`, `Outers`, `Stacked` | keep | `@procedures/client` composes its middleware with these names, and the layers guide tests the four laws. |

## The entry `./testing`

| Names | Verdict | Reason |
|---|---|---|
| `ContractViolation`, `deepEqual`, `holds`, `rejects`, `same`, `show` | move | These checks go to `@mark1russell7/rigor-testkit` (C25). `rejects` goes first (rigor#114). A later MINOR version removes `./testing`, after client moves. |

## The names of the removals (C23)

The pull request #31 adds these names to the root entry.

| Names | Verdict | Reason |
|---|---|---|
| `ElementRemoval`, `MapRemoval`, `RemovalChannel`, `RemovalReason`, `removals`, `removalsOf`, `removalSource`, `RemovalSource` | keep | Each behavior tells the reason of each removal, and the laws of C23 test them. |

## The summary tree as functions (C35)

Version 0.9.3 adds the entry `./summary-tree` and two types of the root entry.

| Names | Verdict | Reason |
|---|---|---|
| `of`, `size`, `isEmpty`, `summary`, `height`, `at`, `summaryOf`, `concat`, `splitAt`, `split`, `search`, `locate`, `slice`, `splice`, `insert`, `remove`, `set`, `append`, `prepend`, `leaves`, `toArray` | keep | A bundle keeps a class with all of its methods. The rope of typeset calls few functions, so it imports them from `./summary-tree`. `bundle-weight.test.ts` holds the weight. |
| `SummaryNode`, `SummaryTreeRecord` | keep | A tree of `./summary-tree` is a plain record of a spec and a root. `SummaryTree.record` gives the record of a class tree. |

## The semaphore (0.9.4)

`@procedures/client` adds this name.

| Names | Verdict | Reason |
|---|---|---|
| `semaphore`, `Semaphore` | keep | `@procedures/client` bounds the calls that run at the same time with it. The strategist placed it here on 2026-11-07. |

## The decisions for Mark

Each decision changes the API. Before 1.0, a change of the API raises the MINOR version.

- **D1. `subList`: a copy or a view.** The code gives a copy, and since C13 the doc tells a copy. A view follows the changes of its list, as in Java. A copy is simpler and safe. The recommendation is a copy.
- **D2. One set of option names.** `hashMap` takes `keyEq` and `keyHash`. `linkedHashMap` and `hashSet` take `eq` and `hash`. The recommendation is `eq` and `hash` for each one, with the old names for one MINOR version. Version 0.10.0 does this. The old names have `@deprecated`, and `eq` and `hash` win when both are given.
- **D3. The 76 removals.** Remove the names with the verdict "remove" in one MINOR version. `@procedures/collections` then removes the same names when it updates.
- **D4. One name for each function.** Remove the aliases `unmodifiableList`, `unmodifiableMap`, `unmodifiableCollection`, `mutableListOf` and `mutableMapOf`. Three functions make a list from an iterable: `toList`, `collectToList` and `toArray`. Keep one of them.
- **D5. A clock for the TTL behaviors.** `TTLCache` takes a clock as an option. The default is the clock of the system, so the change is backward compatible.
- **D6. The iterable functions.** The iterator helpers of the language work on an iterator, but not on each iterable. The recommendation is to keep the functions, and to tell in the doc when to use the language helpers.

## The answers of the strategist

- **S1. A home for events.** `Emitter` and `createEmitter` are a set of listeners for each key. The emitter stays in collections, with the verdict "keep".
- **S2. A home for concurrency.** The channels, `select`, `ticker`, `timeout`, `workerPool` and the pipeline functions go to `@mark1russell7/service`, on its clock. The pull request systems#384 adds them as `@mark1russell7/service/channel`. Service then depends on collections for `asyncQueue`, so collections keeps no re-export. It marks the names `@deprecated` in place for one MINOR version, and removes them in the next.
