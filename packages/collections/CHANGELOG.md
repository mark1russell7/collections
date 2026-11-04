# Changelog

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
