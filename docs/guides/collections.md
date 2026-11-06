# Collections and behaviors

The root entry `@mark1russell7/collections` gives the collections, the behaviors that wrap them, and lazy operations over each iterable.

## Collections

A maker function makes each collection. Each collection has the interface of its kind: `List`, `MapLike`, `SetLike` or a queue.

| Maker | Kind | Notes |
| --- | --- | --- |
| `arrayList` | List | An array. A get by index is fast. |
| `linkedList` | List | A doubly linked list. An add at each end is fast. |
| `arrayDeque` | Deque | A ring buffer. An add and a remove at each end are fast. |
| `hashMap` | Map | The keys are equal by `===`. The option `keyEq: deepEq` makes keys equal by value. |
| `linkedHashMap` | Map | A hash map that keeps the order of the adds. |
| `treeMap` | Map | A sorted map, with a compare function. |
| `hashSet`, `treeSet` | Set | The sets of `hashMap` and `treeMap`. |
| `priorityQueue` | Queue | A binary heap, with a compare function. |
| `summaryTree` | Sequence | A persistent sequence. Each node keeps the sum of its leaves in a monoid. |

```ts
import assert from "node:assert/strict";
import { arrayList, deepEq, hashMap } from "@mark1russell7/collections";

const list = arrayList<number>();
list.add(1);
list.add(2);
assert.equal(list.size, 2);
assert.equal(list.get(1), 2);

// With keyEq: deepEq, two arrays with the same values are the same key
const map = hashMap<number[], string>({ keyEq: deepEq });
map.set([1, 2], "a");
assert.equal(map.get([1, 2]), "a");
```

## Behaviors

A behavior is a layer: it wraps a collection and adds one capability. `compose` puts the layers of a stack together. The first layer is the outermost layer. The guide [Layers](layers.md) tells how the fold works.

| Behavior | What it adds |
| --- | --- |
| `boundedList`, `boundedQueue`, `boundedDeque`, `boundedMap` | A capacity, and a policy for an add to a full collection. |
| `eventedList`, `eventedQueue`, `eventedMap` | Events for each change, with `on`. |
| `safeList`, `safeQueue`, `safeMap` | The property `safe`, with operations that give an option and do not throw. |
| `readonlyList`, `readonlyMap` | An error for each change. |
| `lruMap` | A capacity. A full map removes the key of the oldest use. |
| `ttlMap` | A time to live for each key. |
| `synchronized` | One change at a time. |

```ts
import assert from "node:assert/strict";
import { compose, hashMap, lruMap } from "@mark1russell7/collections";

const evicted: string[] = [];
const cache = compose(lruMap<string, number>({ capacity: 2, onEvict: ({ key }) => evicted.push(key) }))(hashMap<string, number>());
cache.set("a", 1);
cache.set("b", 2);
cache.get("a");
cache.set("c", 3);

// "b" had the oldest use, because the get of "a" was more recent
assert.deepEqual(evicted, ["b"]);
assert.equal(cache.has("a"), true);
assert.equal(cache.isFull, true);
```

### The overflow policies

A bounded collection applies its policy when an add finds the collection full.

| Policy | What an add to a full collection does |
| --- | --- |
| `throw` | It throws an error. This is the default. |
| `drop-oldest` | It removes the oldest value, then adds the new value. |
| `drop-newest` | It does not add the new value. |
| `reject` | It does not add the new value, and an add gives `false`. |
| `grow` | It adds the new value, above the capacity. |

```ts
import assert from "node:assert/strict";
import { arrayList, boundedList, compose } from "@mark1russell7/collections";

const recent = compose(boundedList<number>({ capacity: 3, policy: "drop-oldest" }))(arrayList<number>());
for (const value of [1, 2, 3, 4, 5]) recent.add(value);
assert.deepEqual([...recent], [3, 4, 5]);

const strict = compose(boundedList<number>({ capacity: 1 }))(arrayList<number>());
strict.add(1);
assert.throws(() => strict.add(2), /List is full/);
```

The capacity must be a positive whole number. A capacity of `0`, a fraction or `NaN` throws a `RangeError` when you make the layer.

### A stack of behaviors

The root `compose` keeps the capability of each layer of the stack.

```ts
import assert from "node:assert/strict";
import { arrayList, boundedList, compose, eventedList, safeList } from "@mark1russell7/collections";

const list = compose(safeList<number>(), eventedList<number>(), boundedList<number>({ capacity: 2 }))(arrayList<number>());

const removed: number[] = [];
list.on("remove", ({ value }) => removed.push(value));
list.add(7);
list.removeAt(0);

assert.deepEqual(removed, [7]);
assert.deepEqual(list.safe.get(0), { _tag: "None" });
```

The order of the stack has an effect. In the example, `eventedList` is outside `boundedList`. Thus an add that the bound refuses with an error emits no event.

## Lazy operations

The functions `map`, `filter`, `take`, `chunk`, `window`, `zip` and the others take each iterable, and give a generator. They do no work until a loop reads the generator. The collectors `reduce`, `sum`, `count`, `min`, `max` and `partition` read an iterable to its end.

```ts
import assert from "node:assert/strict";
import { chunk, filter, map, sum, take } from "@mark1russell7/collections";

function* naturals(): Generator<number> {
  for (let n = 1; ; n++) yield n;
}

const firstOddSquares = [...take(filter(map(naturals(), (n) => n * n), (n) => n % 2 === 1), 3)];
assert.deepEqual(firstOddSquares, [1, 9, 25]);
assert.equal(sum(firstOddSquares), 35);
assert.deepEqual([...chunk([1, 2, 3, 4, 5], 2)], [[1, 2], [3, 4], [5]]);
```

The example reads an infinite generator: `take` stops the loop after three values.

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

The monoid must obey its laws: `empty` is the identity of `combine`, and `combine` is associative. Then the summary of each node is correct after each change.
