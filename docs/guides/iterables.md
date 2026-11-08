# Iterables and collectors

The package has two sets of functions for any iterable: an array, a `Set`, a generator or a collection of this package.

| Set | Functions | Result |
| --- | --- | --- |
| Lazy functions | `map`, `filter`, `take`, `chunk`, `distinct`, `pipe` and others | a generator: each step operates when a reader asks for the next value |
| Reducers | `reduce`, `count`, `sum`, `min`, `partition` and others | one value, after a read of the full iterable |
| Collectors | `collect` with `groupingBy`, `partitioningBy`, `joining`, `teeing` and others | one value, from a collector that a caller can put in another collector |

## The lazy functions

Each lazy function takes the iterable first. It gives a generator, and it does no work until a reader asks for a value.

```ts
import assert from "node:assert/strict";
import { filter, map, take, toArray } from "@mark1russell7/collections";

const seen: number[] = [];
const doubled = map([1, 2, 3, 4, 5], (value) => {
  seen.push(value);
  return value * 2;
});
assert.deepEqual(seen, []);

const firstTwo = take(filter(doubled, (value) => value > 4), 2);
assert.deepEqual(toArray(firstTwo), [6, 8]);
assert.deepEqual(seen, [1, 2, 3, 4]);
```

`map` does not read a value before `toArray` asks for one. `take` stops after two values, so `map` does not read the element `5`.

## pipe: a chain from left to right

`pipe` gives a value to the first function, and the result of each function to the next function. A lazy function takes two arguments, so each step is a function of the iterable.

```ts
import assert from "node:assert/strict";
import { filter, map, pipe, take, toArray } from "@mark1russell7/collections";

const result = pipe(
  [1, 2, 3, 4, 5],
  (values: Iterable<number>) => map(values, (value) => value * 2),
  (values: Iterable<number>) => filter(values, (value) => value > 5),
  (values: Iterable<number>) => take(values, 2),
  toArray,
);

assert.deepEqual(result, [6, 8]);
```

`pipe` gives the type `any`. Put a type on the variable of the result.

## Groups of values: chunk, window and zip

`chunk` cuts an iterable into groups of a size. The last group can be shorter. `window` gives each run of neighbors of a size. `zip` gives the values at the same place of each iterable, and stops at the end of the shortest one.

```ts
import assert from "node:assert/strict";
import { chunk, enumerate, toArray, window, zip } from "@mark1russell7/collections";

assert.deepEqual(toArray(chunk([1, 2, 3, 4, 5], 2)), [[1, 2], [3, 4], [5]]);
assert.deepEqual(toArray(window([1, 2, 3, 4], 3)), [[1, 2, 3], [2, 3, 4]]);
assert.deepEqual(toArray(zip(["a", "b", "c"], [1, 2])), [["a", 1], ["b", 2]]);
assert.deepEqual(toArray(enumerate(["x", "y"])), [[0, "x"], [1, "y"]]);
```

## Parts of an iterable: skip, the conditions, flatten and tap

`skip` removes the first values. `takeWhile` gives the values until the first value that fails the condition. `skipWhile` removes the values until that value.

`flatten` gives the values of each inner iterable in order. `flatMap` gives an iterable for each value and its index, and it flattens them. `distinctConsecutive` removes a value with the same key as the value before it. `tap` gives each value and its index to a function, and it does not change the values.

```ts
import assert from "node:assert/strict";
import { distinctConsecutive, flatMap, flatten, skip, skipWhile, takeWhile, tap, toArray } from "@mark1russell7/collections";

assert.deepEqual(toArray(skip([1, 2, 3, 4], 2)), [3, 4]);
assert.deepEqual(toArray(takeWhile([1, 2, 5, 1], (value) => value < 3)), [1, 2]);
assert.deepEqual(toArray(skipWhile([1, 2, 5, 1], (value) => value < 3)), [5, 1]);
assert.deepEqual(toArray(flatten([[1, 2], [], [3]])), [1, 2, 3]);
assert.deepEqual(toArray(flatMap(["ab", "c"], (word, index) => [...word].map((letter) => `${letter}${String(index)}`))), ["a0", "b0", "c1"]);
assert.deepEqual(toArray(distinctConsecutive([1, 1, 2, 1, 1])), [1, 2, 1]);
assert.deepEqual(toArray(distinctConsecutive(["a", "A", "b"], (text) => text.toLowerCase())), ["a", "b"]);

const log: string[] = [];
const values = toArray(tap(["x", "y"], (value, index) => log.push(`${String(index)}:${value}`)));
assert.deepEqual(values, ["x", "y"]);
assert.deepEqual(log, ["0:x", "1:y"]);
```

`takeWhile` reads the first value that fails, and it does not give that value. `skipWhile` gives that value and each value after it, also a value that agrees with the condition.

## distinct: keys by identity

`distinct` keeps the first value of each key. It keeps the keys in a JavaScript `Set`, so two objects with the same fields are two keys. Give a key function to compare a field.

```ts
import assert from "node:assert/strict";
import { distinct, toArray } from "@mark1russell7/collections";

assert.deepEqual(toArray(distinct([3, 1, 3, 2, 1])), [3, 1, 2]);

const users = [{ id: 1, name: "Ada" }, { id: 1, name: "Ada" }];
assert.equal(toArray(distinct(users)).length, 2);
assert.equal(toArray(distinct(users, (user) => user.id)).length, 1);
```

To compare two arrays by their values, give a key function that makes a string.

## scan: each step of a reduce

`reduce` gives the last value of the accumulator. `scan` gives the initial value first, then the accumulator after each value. `scan` is lazy too.

```ts
import assert from "node:assert/strict";
import { reduce, scan, toArray } from "@mark1russell7/collections";

const deposits = [100, -30, 50];
assert.equal(reduce(deposits, (balance, amount) => balance + amount, 0), 120);
assert.deepEqual(toArray(scan(deposits, (balance, amount) => balance + amount, 0)), [0, 100, 70, 120]);
```

## The reducers

A reducer reads the full iterable and gives one value. On an empty iterable, `min`, `max` and `average` give `undefined`, and `sum` gives `0`.

```ts
import assert from "node:assert/strict";
import { average, count, every, find, max, min, partition, some, sum } from "@mark1russell7/collections";

const sizes = [4, 8, 15, 16];
assert.equal(sum(sizes), 43);
assert.equal(average(sizes), 10.75);
assert.equal(min(sizes), 4);
assert.equal(max(["pear", "fig", "plum"], (a, b) => a.length - b.length), "pear");
assert.equal(count(sizes, (size) => size > 10), 2);
assert.equal(find(sizes, (size) => size > 10), 15);
assert.equal(some(sizes, (size) => size > 15), true);
assert.equal(every(sizes, (size) => size > 0), true);
assert.deepEqual(partition(sizes, (size) => size % 2 === 0), [[4, 8, 16], [15]]);

assert.equal(sum([]), 0);
assert.equal(average([]), undefined);
assert.equal(min([]), undefined);
```

`max` keeps the first of two equal values: `"pear"` and `"plum"` have the same length.

## Collectors: collect and groupingBy

A collector has three functions: `supplier` makes an accumulator, `accumulator` adds one element, and `finisher` gives the result. `collect` puts each element of an iterable through a collector.

`groupingBy` gives a `HashMap` from each key to an `ArrayList` of its elements.

```ts
import assert from "node:assert/strict";
import { collect, groupingBy } from "@mark1russell7/collections";

const words = ["apple", "avocado", "banana", "blueberry", "cherry"];
const byLetter = collect(words, groupingBy((word: string) => word[0]));

assert.deepEqual(byLetter.get("a").toArray(), ["apple", "avocado"]);
assert.deepEqual(byLetter.get("b").toArray(), ["banana", "blueberry"]);
assert.equal(byLetter.size, 3);
```

The map compares keys with `===`, as a JavaScript `Map` does. Thus two arrays with the same values are two keys. To group by two fields, make a string key.

```ts
import assert from "node:assert/strict";
import { collect, counting, groupingByWith } from "@mark1russell7/collections";

type Cell = { x: number; y: number };
const cells: Cell[] = [{ x: 0, y: 1 }, { x: 0, y: 1 }, { x: 2, y: 3 }];

const byArray = collect(cells, groupingByWith((cell: Cell) => [cell.x, cell.y], counting()));
assert.equal(byArray.size, 3);

const byString = collect(cells, groupingByWith((cell: Cell) => `${cell.x},${cell.y}`, counting()));
assert.equal(byString.get("0,1"), 2);
assert.equal(byString.get("2,3"), 1);
```

## A collector inside a collector

`groupingByWith` puts the elements of each key through a second collector. `mapping`, `filtering`, `counting`, `summingNumber`, `averagingNumber` and `joining` are collectors for that place.

```ts
import assert from "node:assert/strict";
import { averagingNumber, collect, groupingByWith, joining, mapping, summingNumber } from "@mark1russell7/collections";

type Order = { city: string; item: string; total: number };
const orders: Order[] = [
  { city: "Oslo", item: "tea", total: 12 },
  { city: "Rome", item: "coffee", total: 30 },
  { city: "Oslo", item: "cake", total: 18 },
];

const totals = collect(orders, groupingByWith((order: Order) => order.city, summingNumber((order: Order) => order.total)));
assert.equal(totals.get("Oslo"), 30);

const means = collect(orders, groupingByWith((order: Order) => order.city, averagingNumber((order: Order) => order.total)));
assert.equal(means.get("Oslo"), 15);

const items = collect(
  orders,
  groupingByWith((order: Order) => order.city, mapping((order: Order) => order.item, joining(", "))),
);
assert.equal(items.get("Oslo"), "tea, cake");
```

## partitioningBy, joining and teeing

`partitioningBy` gives a map with the keys `true` and `false`. `joining` puts strings together with a delimiter, a prefix and a suffix. `teeing` puts each element through two collectors, and joins the two results.

```ts
import assert from "node:assert/strict";
import { collect, counting, joining, partitioningBy, summingNumber, teeing } from "@mark1russell7/collections";

const scores = [72, 45, 90, 58];
const passed = collect(scores, partitioningBy((score: number) => score >= 60));
assert.deepEqual(passed.get(true).toArray(), [72, 90]);
assert.deepEqual(passed.get(false).toArray(), [45, 58]);

assert.equal(collect(["a", "b", "c"], joining(", ", "[", "]")), "[a, b, c]");

const mean = collect(scores, teeing(summingNumber((score: number) => score), counting(), (total, n) => total / n));
assert.equal(mean, 66.25);
```

## The statistics of a number

`summarizingNumber` gives the count, the sum, the minimum, the maximum and the mean in one read.

```ts
import assert from "node:assert/strict";
import { collect, summarizingNumber } from "@mark1russell7/collections";

const stats = collect([3, 0, 9], summarizingNumber((value: number) => value));
assert.deepEqual(stats, { count: 3, sum: 12, min: 0, max: 9, average: 4 });
```

## Minimum, maximum and a reduce in a collector

`minBy` and `maxBy` take a comparator. An empty iterable gives `undefined`. When two elements are equal, the first element stays.

`reducing` starts at an identity and adds each element with a function. `reducingWith` maps each element first. `flatMapping` gives each value of a mapped iterable to the next collector.

```ts
import assert from "node:assert/strict";
import { collect, counting, flatMapping, maxBy, minBy, reducing, reducingWith } from "@mark1russell7/collections";

type Order = { readonly id: string; readonly items: readonly string[]; readonly total: number };
const orders: Order[] = [
  { id: "a", items: ["tea", "bun"], total: 7 },
  { id: "b", items: ["cake"], total: 12 },
  { id: "c", items: ["tea"], total: 7 },
];
const byTotal = (x: Order, y: Order) => x.total - y.total;

// "a" and "c" have the same total: the first one stays
assert.equal(collect(orders, minBy(byTotal))?.id, "a");
assert.equal(collect(orders, maxBy(byTotal))?.id, "b");
assert.equal(collect([] as Order[], minBy(byTotal)), undefined);

assert.equal(collect([1, 2, 3, 4], reducing(1, (product: number, n: number) => product * n)), 24);
assert.equal(collect(orders, reducingWith(0, (order: Order) => order.total, (sum, total) => sum + total)), 26);
assert.equal(collect(orders, flatMapping((order: Order) => order.items, counting<string>())), 4);
```

## The names of the root

The lazy functions and the collectors both have a `toArray`, a `toSet` and a `toMap`. The root gives each one a name:

| Root name | Module | Use | Result |
| --- | --- | --- | --- |
| `toArray` | lazy functions | `toArray(iterable)` | an array |
| `toSet` | lazy functions | `toSet(iterable)` | a JavaScript `Set` |
| `iterToMap` | lazy functions | `iterToMap(iterable, keyFn, valueFn)` | a JavaScript `Map` |
| `collectToArray` | collectors | `collect(iterable, collectToArray())` | an array |
| `collectToList` | collectors | `collect(iterable, collectToList())` | an `ArrayList` |
| `collectToSet` | collectors | `collect(iterable, collectToSet())` | a `HashSet` |
| `collectToMap` | collectors | `collect(iterable, collectToMap(keyFn, valueFn))` | a `HashMap` |

```ts
import assert from "node:assert/strict";
import { collect, collectToMap, collectToSet, iterToMap, toSet } from "@mark1russell7/collections";

const words = ["fig", "pear", "fig"];
const plainSet = toSet(words);
const hashedSet = collect(words, collectToSet());
assert.ok(plainSet instanceof Set);
assert.equal(plainSet.size, 2);
assert.equal(hashedSet.size, 2);
assert.equal(hashedSet.contains("pear"), true);

const plainMap = iterToMap(words, (word) => word, (word) => word.length);
assert.ok(plainMap instanceof Map);
const hashedMap = collect(words, collectToMap((word: string) => word, (word: string) => word.length));
assert.equal(plainMap.get("pear"), 4);
assert.equal(hashedMap.get("pear"), 4);
```

The two kinds of result compare keys with `===`. Use a `HashSet` or a `HashMap` with the operations of this package. Use a `Set` or a `Map` with other code.
