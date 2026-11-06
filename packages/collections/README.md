# @mark1russell7/collections

[![npm](https://img.shields.io/npm/v/@mark1russell7/collections?color=2346c4)](https://www.npmjs.com/package/@mark1russell7/collections)

Collections for TypeScript with no dependencies: lists, maps, queues, a summary tree, channels, lazy operations and dependency graphs.

```sh
npm i @mark1russell7/collections
```

## Lists, maps and behaviors

```ts
import { arrayList, compose, hashMap, lruMap } from "@mark1russell7/collections";

const list = arrayList<number>();
list.add(1);
list.add(2);

const cache = compose(lruMap<string, number>({ capacity: 2 }))(hashMap<string, number>());
cache.set("a", 1);
cache.set("b", 2);
cache.set("c", 3);
cache.has("a"); // false: the map removed the oldest key
```

`compose` applies its layers from right to left, so the last layer is next to the base. The order of the layers is important:

- Put `ttlMap` below `lruMap`: `compose(lruMap(...), ttlMap(...))`. Then an expired entry is not an eviction.
- Put an evented layer next to the base. Then its events include each drop, eviction and expiry of the layers above it. A layer above `boundedMap`, `lruMap` or `ttlMap` does not see their removals.

## The summary tree

A summary tree is a persistent sequence. Each node keeps the sum of its leaves in a monoid. Each change gives a new tree in logarithmic time, and the old tree stays the same.

```ts
import { summaryTree, type SummarySpec } from "@mark1russell7/collections";

const text: SummarySpec<string, string> = {
  monoid: { empty: "", combine: (a, b) => a + b },
  measure: (leaf) => leaf,
};
const tree = summaryTree(text, ["a", "b", "c"]);
tree.summary; // "abc"
```

## Dependency graphs

The entry `./dag` gives the levels of a graph, and a run of each level with a limit of concurrency.

```ts
import { buildLeveledDAG, getTopologicalOrder } from "@mark1russell7/collections/dag";

const nodes = new Map([
  ["app", { id: "app", dependencies: ["lib"] }],
  ["lib", { id: "lib", dependencies: [] }],
]);
getTopologicalOrder(buildLeveledDAG(nodes)).map((node) => node.id); // ["lib", "app"]
```

The entry `./graph` gives `hubBreadthFirstOrder`: the order of a weighted graph, from its largest hub, with no other imports.

```ts
import { hubBreadthFirstOrder } from "@mark1russell7/collections/graph";

hubBreadthFirstOrder(3, [{ a: 0, b: 1 }, { a: 1, b: 2 }]); // [1, 0, 2]
```

## Contract checks

The entry `./testing` gives the small checks of a contract suite: `holds`, `same`, `rejects`, `deepEqual`, `show` and `ContractViolation`. These checks import no test framework.

## Entries

| Entry | Contents |
| --- | --- |
| `@mark1russell7/collections` | Lists, sets, maps, queues, the summary tree, behaviors, channels, lazy operations, `keyBetween` and the other functions of ranks |
| `@mark1russell7/collections/dag` | Levels, topological order, a run with a limit of concurrency, filters |
| `@mark1russell7/collections/graph` | `hubBreadthFirstOrder` |
| `@mark1russell7/collections/testing` | The checks of a contract suite |
| `@mark1russell7/collections/layers` | `compose` and the types of a stack of layers, in one file with no imports |

## License

MIT
