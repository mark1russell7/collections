# @mark1russell7/collections

[![npm](https://img.shields.io/npm/v/@mark1russell7/collections?color=2346c4)](https://www.npmjs.com/package/@mark1russell7/collections)

Collections for TypeScript: lists, maps, queues, a summary tree, async queues, lazy operations and dependency graphs.

```sh
npm i @mark1russell7/collections
```

> The channels are in `@mark1russell7/service/channel` (service 0.6.6 or later). Version 0.10.0 of collections removed them.

## Lists, maps and behaviors

```ts
import assert from "node:assert/strict";
import { arrayList, compose, hashMap, lruMap } from "@mark1russell7/collections";

const list = arrayList<number>();
list.add(1);
list.add(2);
assert.deepEqual(list.toArray(), [1, 2]);

const cache = compose(lruMap<string, number>({ capacity: 2 }))(hashMap<string, number>());
cache.set("a", 1);
cache.set("b", 2);
cache.set("c", 3);
// The map removed the oldest key
assert.equal(cache.has("a"), false);
assert.equal(cache.get("c"), 3);
```

`compose` applies its layers from right to left, so the last layer is next to the base. The order of the layers is important:

- Put `ttlMap` below `lruMap`: `compose(lruMap(...), ttlMap(...))`. Then an expired entry is not an eviction.
- An evented layer can go at each place. Below a removing layer, it gets each removal as a call. Above it, it gets each removal from the removal channel, with a `reason`.

The bounded layers, `lruMap` and `ttlMap` remove entries by themselves. Each of them sends its removals on a removal channel, and each layer above it gets them. `removalsOf(collection)` gives the channel:

```typescript
removalsOf<MapRemoval<string, User>>(cache)?.on(({ key, reason }) => console.log(key, reason)); // "evict" or "expire"
```

## The summary tree

A summary tree is a persistent sequence. Each node keeps the sum of its leaves in a monoid. Each change gives a new tree in logarithmic time, and the old tree stays the same.

```ts
import assert from "node:assert/strict";
import { summaryTree, type SummarySpec } from "@mark1russell7/collections";

const text: SummarySpec<string, string> = {
  monoid: { empty: "", combine: (a, b) => a + b },
  measure: (leaf) => leaf,
};
const tree = summaryTree(text, ["a", "b", "c"]);
assert.equal(tree.summary, "abc");
```

The entry `./summary-tree` gives the same tree as plain functions over a plain record. A bundler then keeps only the functions that a program calls. The class `SummaryTree` wraps these functions, and its field `record` is the record.

```ts
import assert from "node:assert/strict";
import * as Tree from "@mark1russell7/collections/summary-tree";

const text: Tree.SummarySpec<string, string> = {
  monoid: { empty: "", combine: (a, b) => a + b },
  measure: (leaf) => leaf,
};
const tree = Tree.splice(Tree.of(text, ["a", "b", "c"]), 1, 1, ["x", "y"]);
assert.equal(Tree.summary(tree), "axyc");
assert.deepEqual(Tree.locate(tree, (s) => s.length, 2), { index: 2, leaf: "y", offset: 0 });
```

## Dependency graphs

The entry `./dag` gives the levels of a graph, and a run of each level with a limit of concurrency.

```ts
import assert from "node:assert/strict";
import { buildLeveledDAG, getTopologicalOrder } from "@mark1russell7/collections/dag";

const nodes = new Map([
  ["app", { id: "app", dependencies: ["lib"] }],
  ["lib", { id: "lib", dependencies: [] }],
]);
assert.deepEqual(getTopologicalOrder(buildLeveledDAG(nodes)).map((node) => node.id), ["lib", "app"]);
```

The entry `./graph` gives `hubBreadthFirstOrder`: the order of a weighted graph, from its largest hub, with no other imports.

```ts
import assert from "node:assert/strict";
import { hubBreadthFirstOrder } from "@mark1russell7/collections/graph";

assert.deepEqual(hubBreadthFirstOrder(3, [{ a: 0, b: 1 }, { a: 1, b: 2 }]), [1, 0, 2]);
```

## Guides

Each guide has examples, and a test runs each example:

- [Lists](https://github.com/mark1russell7/collections/blob/main/docs/guides/lists.md): `arrayList` and `linkedList`
- [Maps and sets](https://github.com/mark1russell7/collections/blob/main/docs/guides/maps-and-sets.md): hash maps, tree maps, linked maps, and their sets
- [Queues](https://github.com/mark1russell7/collections/blob/main/docs/guides/queues.md): `arrayDeque` and `priorityQueue`
- [Equality, hashes and order](https://github.com/mark1russell7/collections/blob/main/docs/guides/equality-and-order.md): `deepEq`, `defaultHash`, the comparators and their rules
- [Async queues and tasks](https://github.com/mark1russell7/collections/blob/main/docs/guides/async.md): `asyncQueue`, `semaphore` and `asSettled`
- [Dependency graphs](https://github.com/mark1russell7/collections/blob/main/docs/guides/dag.md): levels, the topological order, and a run with `executeDAG`
- [Graph orders](https://github.com/mark1russell7/collections/blob/main/docs/guides/graph.md): `hubBreadthFirstOrder`
- [Layers](https://github.com/mark1russell7/collections/blob/main/docs/guides/layers.md): `compose`, its types and its laws, and behaviors on a collection
- [Behaviors](https://github.com/mark1russell7/collections/blob/main/docs/guides/behaviors.md): readonly views, safe reads and the locks
- [Events and caches](https://github.com/mark1russell7/collections/blob/main/docs/guides/caches.md): `eventedMap`, `eventedList`, `lruMap`, `ttlMap` and their stacks
- [Write a layer](https://github.com/mark1russell7/collections/blob/main/docs/guides/writing-layers.md): `delegate`, `enhanceMethod`, `interceptMethods`, `blockMethods` and the removal channel
- [Iterables and collectors](https://github.com/mark1russell7/collections/blob/main/docs/guides/iterables.md): lazy functions, reducers, collectors and the names of the root
- [Factories](https://github.com/mark1russell7/collections/blob/main/docs/guides/factories.md): `listOf`, `mapOf`, `range`, `toMap`, `groupBy` and the empty and readonly collections
- [Rank keys](https://github.com/mark1russell7/collections/blob/main/docs/guides/rank-keys.md): the keys of a list that a user can reorder, and the writes of a move
- [Summary trees](https://github.com/mark1russell7/collections/blob/main/docs/guides/summary-tree.md): the spec, a search by a summary, positions in a text, the edits and `merge`

## Contract checks

The entry `./testing` gives the small checks of a contract suite: `holds`, `same`, `rejects`, `deepEqual`, `show` and `ContractViolation`. These checks import no test framework.

## Entries

| Entry | Contents |
| --- | --- |
| `@mark1russell7/collections` | Lists, sets, maps, queues, the summary tree, behaviors, async queues, lazy operations, `keyBetween` and the other functions of ranks |
| `@mark1russell7/collections/dag` | Levels, topological order, a run with a limit of concurrency, filters |
| `@mark1russell7/collections/graph` | `hubBreadthFirstOrder` |
| `@mark1russell7/collections/summary-tree` | The summary tree as plain functions over a plain record |
| `@mark1russell7/collections/testing` | The checks of a contract suite |
| `@mark1russell7/collections/layers` | `compose` and the types of a stack of layers, in one file with no imports |

## License

MIT
