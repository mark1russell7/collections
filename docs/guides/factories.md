# Factories

A factory makes a collection from a list of values. The factories are in the root of the package.

| Factory | Result | Writes |
| --- | --- | --- |
| `listOf`, `mutableListOf`, `toList` | an `arrayList` | yes |
| `queueOf` | an `arrayDeque` | yes |
| `mapOf`, `mutableMapOf` | a `hashMap` | yes |
| `immutableListOf`, `immutableMapOf` | a readonly list or map | no |
| `emptyList`, `emptyQueue`, `emptyMap` | one readonly empty collection | no |
| `singletonList`, `singletonMap`, `nCopies` | a readonly list or map | no |
| `range`, `rangeTo` | an `arrayList` of numbers | yes |
| `buildList`, `buildMap` | the list or map that a function fills | yes |
| `toMap`, `groupBy` | a `hashMap` of the values of an iterable | yes |

## Collections from values

`listOf`, `queueOf` and `mapOf` make a collection that you can change. `immutableListOf` and `immutableMapOf` make a readonly view. A write to a readonly view throws an error.

```ts
import assert from "node:assert/strict";
import { immutableListOf, listOf, mapOf, queueOf } from "@mark1russell7/collections";

const list = listOf(1, 2, 3);
list.add(4);
assert.deepEqual(list.toArray(), [1, 2, 3, 4]);

const queue = queueOf("first", "second");
assert.equal(queue.dequeue(), "first");

const prices = mapOf<string, number>(["tea", 3], ["cake", 5]);
assert.equal(prices.get("cake"), 5);

const fixed = immutableListOf(1, 2, 3);
assert.equal(fixed.get(0), 1);
assert.throws(() => fixed.add(4), /readonly/);
```

`mutableListOf` and `mutableMapOf` are the same functions as `listOf` and `mapOf`. Their names tell the reader that the code changes the result.

## Empty collections, one value and copies

`emptyList`, `emptyQueue` and `emptyMap` each give the same readonly object for all types of element. `singletonList` and `singletonMap` give a readonly collection with one value. `nCopies` gives a readonly list with one value at each index.

```ts
import assert from "node:assert/strict";
import { emptyList, nCopies, singletonMap } from "@mark1russell7/collections";

assert.equal(emptyList<number>(), emptyList<string>());
assert.equal(emptyList<number>().size, 0);
assert.throws(() => emptyList<number>().add(1), /readonly/);

const one = singletonMap("key", 1);
assert.equal(one.size, 1);
assert.equal(one.get("key"), 1);

assert.deepEqual(nCopies(3, 0).toArray(), [0, 0, 0]);
```

## Ranges of numbers

`range(start, end, step)` gives the numbers from `start` up to `end`, and `end` is not in the list. The default `step` is 1. A negative `step` counts down. A `step` of 0 throws an error. `rangeTo(n)` is `range(0, n)`.

```ts
import assert from "node:assert/strict";
import { range, rangeTo } from "@mark1russell7/collections";

assert.deepEqual(rangeTo(5).toArray(), [0, 1, 2, 3, 4]);
assert.deepEqual(range(10, 0, -3).toArray(), [10, 7, 4, 1]);
assert.throws(() => range(0, 5, 0), /step/);
```

## Builders, maps by key and groups

`buildList` and `buildMap` give a new collection to a function, and then give the collection back. `toMap` puts each value of an iterable at the key that a function gives. A second function can give the value. `groupBy` puts the values with the same key in one list.

```ts
import assert from "node:assert/strict";
import { buildList, groupBy, rangeTo, toList, toMap } from "@mark1russell7/collections";

const users = [
  { id: 1, team: "core", name: "Ada" },
  { id: 2, team: "web", name: "Bo" },
  { id: 3, team: "core", name: "Cy" },
];

const byId = toMap(users, (user) => user.id);
assert.equal(byId.get(2).name, "Bo");

const names = toMap(
  users,
  (user) => user.id,
  (user) => user.name,
);
assert.equal(names.get(3), "Cy");

const teams = groupBy(users, (user) => user.team);
assert.deepEqual(
  teams.get("core").toArray().map((user) => user.name),
  ["Ada", "Cy"],
);

const evens = buildList<number>((list) => {
  for (const n of rangeTo(6)) {
    if (n % 2 === 0) list.add(n);
  }
});
assert.deepEqual(evens.toArray(), [0, 2, 4]);

assert.deepEqual(toList(new Set([3, 1])).toArray(), [3, 1]);
```

For two values with the same key, `toMap` keeps the last value, and gives no error.

```ts
import assert from "node:assert/strict";
import { toMap } from "@mark1russell7/collections";

const byLetter = toMap(["apple", "avocado", "banana"], (word) => word.charAt(0));
assert.equal(byLetter.size, 2);
assert.equal(byLetter.get("a"), "avocado");
```

The root name `toList` is the factory of this guide. The collector with the same name has the root name `collectToList`. The guide of the iterables tells the names of the root.

## The classes of the factories

Each factory of a collection gives an object of a class of the root. The class has the name of the factory with a capital letter: `treeSet` gives a `TreeSet`. A `new` of the class with options is the same as the factory with these options. Use the class for `instanceof` and for the type of a field.

```ts
import assert from "node:assert/strict";
import {
  ArrayDeque, AsyncQueue, LinkedHashMap, LinkedList, PriorityQueue, TreeMap, TreeSet,
  arrayDeque, asyncQueue, linkedHashMap, linkedList, priorityQueue, treeMap, treeSet,
} from "@mark1russell7/collections";

assert.ok(arrayDeque<number>() instanceof ArrayDeque);
assert.ok(linkedList<number>() instanceof LinkedList);
assert.ok(linkedHashMap<string, number>() instanceof LinkedHashMap);
assert.ok(treeMap<string, number>() instanceof TreeMap);
assert.ok(asyncQueue<number>() instanceof AsyncQueue);

const descending = (a: number, b: number): number => b - a;
const set = new TreeSet<number>({ compare: descending });
const same = treeSet<number>({ compare: descending });
for (const n of [2, 9, 4]) {
  set.add(n);
  same.add(n);
}
assert.deepEqual([...set], [9, 4, 2]);
assert.deepEqual([...same], [...set]);

const queue = new PriorityQueue<number>({ compare: descending });
for (const n of [2, 9, 4]) queue.enqueue(n);
assert.equal(queue.dequeue(), 9);
assert.ok(priorityQueue<number>() instanceof PriorityQueue);
```

## Known defects

The reading for this guide found three defects of `range` and `nCopies`. Roadmap row C40 has them.

- `range` adds `step` to the last number at each step, so the error of a fraction grows. `range(0, 1, 0.1)` gives 11 numbers, and the last number is `0.9999999999999999`.
- `range(0, Infinity)` and `nCopies(Infinity, value)` do not stop. They add values until the memory is full.
- `nCopies` does not examine that `n` is an integer. `nCopies(2.5, value)` gives 3 copies, and `nCopies(NaN, value)` gives an empty list with no error.
