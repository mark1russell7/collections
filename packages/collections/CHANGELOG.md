# Changelog

## 0.6.0

`executeDAG` does not start a node whose dependency failed. MINOR: before 1.0.0 a breaking change raises MINOR. With `failFast: false`, such a node now gets a skipped result.

### Added

- The option `skipDependents` of `executeDAG`. The default is true. Give false to start each node, as before.
- `NodeResult.skipped` is true for a node that did not start. Its error names the dependencies that failed or were skipped.
- `DAGResult.skippedNodes` has the ids of the skipped nodes. `failedNodes` has only the nodes whose processor failed.

### Changed

- With `failFast: false`, `executeDAG` started each node of each level, also when a dependency of the node failed. So a node used the work of a failed node. Now the node does not start.
## 0.5.0

The LRU and bounded layers check their capacity, and `LRUCache` gets `deleteWhere`. MINOR: before 1.0.0 a breaking change raises MINOR. A capacity that is not a positive whole number now throws.

### Added

- `LRUCache.deleteWhere(matches)` deletes each entry for which `matches` gives true, and gives their number. It is not a use, and it does not start `onEvict`.

### Changed

- `LRUCache`, `lruCache`, `lruMap`, `boundedList`, `boundedQueue`, `boundedDeque` and `boundedMap` throw `RangeError` when the capacity is not a positive whole number.

### Fixed

- A capacity of `NaN` made these structures grow without a limit, because the comparison `size >= capacity` was always false.

## 0.4.0

The entry `./layers` holds one fold for a stack of layers, and `compose` keeps the type of each layer. MINOR: before 1.0.0 a breaking change raises MINOR. A call of `compose` with an explicit type argument no longer compiles.

### Added

- The new entry `@mark1russell7/collections/layers` gives `compose`, `Layer`, `Chain`, `Composed`, `Stacked`, `InnerOf`, `OuterOf` and `Outers`. The entry has no imports, and it does no work at load.
- Tests hold the 4 laws of the fold. A test holds the rule that a collection layer keeps each capability of the layers under it.

### Changed

- `compose` and `bundle` now check each neighbor pair, and a test compiles a chain of 100 layers. They stopped at 5 layers and then gave `any`.
- The result of `compose` now has the type of each layer. It had only the type of the outermost layer, so `on` and `dispose` were compile errors under another layer.
- `bundle` is now the same function as `compose`.

### Fixed

- The doc examples of `compose` did not compile, because the layers had no type arguments.

## 0.3.0

`defaultHash` now agrees with `deepEq`: two equal values have one hash. MINOR: before 1.0.0 a change of behavior that a caller can see raises MINOR.

### Changed

- The hash of each object changes, so the order of a hash map or a hash set with object keys changes. The hash of a primitive does not change.
- The hash reads 16 levels of an object. Two values that differ only below that depth have one hash.

### Fixed

- The hash of an object came from `JSON.stringify`, so equal values had different hashes when their keys had another order, and a `Map` or a `Set` of any content hashed as `{}`. A hash map then did not find an equal key, or all such keys shared one bucket.
- A dense graph made a very long string, and it failed with `RangeError` after about 90 seconds in one local run. It now ends.

## 0.2.0

`deepEq` now has a stated meaning, and it is an equivalence. Its doc comment gives each rule. MINOR: before 1.0.0 a change of behavior that a caller can see raises MINOR.

### Changed

- `deepEq(NaN, NaN)` is now true. Leaves compare by SameValueZero.
- Two objects with different prototypes are now different, also with the same keys. An example is `{}` and `Object.create(null)`.
- Own enumerable symbol keys now count.

### Fixed

- Two different `Date`, `RegExp`, `Map`, `Set`, `Error` or boxed values compared equal, because they have no enumerable keys. They now compare by value. Typed arrays, `ArrayBuffer` and `DataView` compare by their elements or bytes.
- `Promise`, `WeakMap`, `WeakSet` and `WeakRef` compared equal for the same reason. They now compare by identity.
- A cyclic value threw `RangeError`. The comparison now ends, and a shared part costs one visit.
- A key that is own and not enumerable in `b` made the relation asymmetric. Only enumerable keys count now.

## 0.1.0

This release is the first release of the package. The code comes from `@procedures/collections` and `@procedures/dag`, which now use this package.

### Added

- The lists, sets, maps, queues, the summary tree, the behaviors, the channels, the lazy operations and the ranks of a list.
- The entry `./dag`: levels, topological order, a run with a limit of concurrency and filters.
- The entry `./graph`: `hubBreadthFirstOrder`.
- The entry `./testing`: the checks of a contract suite.
