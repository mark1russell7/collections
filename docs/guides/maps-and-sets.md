# Maps and sets

A map keeps one value for each key. A set keeps each element one time. The package has three kinds of each:

| Map | Set | Order of iteration | Find a key in |
| --- | --- | --- | --- |
| `hashMap` | `hashSet` | no fixed order | constant time on average, with a hash |
| `linkedHashMap` | | the order of the first `set`, or the order of use | constant time on average, with a hash |
| `treeMap` | `treeSet` | sorted by a comparator | logarithmic time, with a comparator |

## Make a map

Give a factory no argument for an empty map, or an iterable of `[key, value]` pairs.

```ts
import assert from "node:assert/strict";
import { hashMap } from "@mark1russell7/collections";

const ages = hashMap([["ada", 36], ["alan", 41]]);
assert.equal(ages.size, 2);
assert.equal(ages.get("ada"), 36);
assert.equal(ages.has("grace"), false);
```

## Read a value

`get` throws when the map does not have the key. `getOrUndefined` gives `undefined`, and `getOrDefault` gives the default that you supply.

```ts
import assert from "node:assert/strict";
import { hashMap } from "@mark1russell7/collections";

const map = hashMap([["a", 1]]);
assert.throws(() => map.get("b"));
assert.equal(map.getOrUndefined("b"), undefined);
assert.equal(map.getOrDefault("b", 0), 0);
```

## Change a value

`set` gives the old value, or `undefined` when the key is new. `delete` also gives the old value.

```ts
import assert from "node:assert/strict";
import { hashMap } from "@mark1russell7/collections";

const map = hashMap<string, number>();
assert.equal(map.set("a", 1), undefined);
assert.equal(map.set("a", 2), 1);
assert.equal(map.delete("a"), 2);
assert.equal(map.delete("a"), undefined);
```

The operations `setIfAbsent`, `computeIfAbsent` and `merge` read and change a key in one call.

```ts
import assert from "node:assert/strict";
import { hashMap } from "@mark1russell7/collections";

const counts = hashMap<string, number>();
for (const word of ["to", "be", "or", "not", "to", "be"]) counts.merge(word, 1, (old, one) => old + one);
assert.equal(counts.get("to"), 2);
assert.equal(counts.get("or"), 1);

const groups = hashMap<number, string[]>();
for (const word of ["ab", "cd", "efg"]) groups.computeIfAbsent(word.length, () => []).push(word);
assert.deepEqual(groups.get(2), ["ab", "cd"]);
assert.deepEqual(groups.get(3), ["efg"]);

assert.equal(counts.setIfAbsent("to", 100), 2);
assert.equal(counts.setIfAbsent("is", 100), 100);
```

A `merge` whose function gives `undefined` removes the key.

```ts
import assert from "node:assert/strict";
import { hashMap } from "@mark1russell7/collections";

const stock = hashMap([["apples", 1]]);
stock.merge("apples", 1, (have, sold) => (have - sold === 0 ? undefined : have - sold));
assert.equal(stock.has("apples"), false);
```

## Keys that are objects

The default equality of keys is `===`. Thus two objects with the same fields are two keys. Give `keyEq` and `keyHash` to `hashMap` to find a key by its fields. Equal keys must have the same hash.

```ts
import assert from "node:assert/strict";
import { hashMap } from "@mark1russell7/collections";

type Cell = { row: number; column: number };

const byIdentity = hashMap<Cell, string>();
byIdentity.set({ row: 1, column: 2 }, "x");
assert.equal(byIdentity.has({ row: 1, column: 2 }), false);

const byFields = hashMap<Cell, string>({
  keyEq: (a, b) => a.row === b.row && a.column === b.column,
  keyHash: (cell) => cell.row * 31 + cell.column,
});
byFields.set({ row: 1, column: 2 }, "x");
assert.equal(byFields.get({ row: 1, column: 2 }), "x");
```

`linkedHashMap` and `hashSet` take the same functions with the names `eq` and `hash`.

```ts
import assert from "node:assert/strict";
import { hashSet } from "@mark1russell7/collections";

const cells = hashSet<{ row: number; column: number }>({
  eq: (a, b) => a.row === b.row && a.column === b.column,
  hash: (cell) => cell.row * 31 + cell.column,
});
assert.equal(cells.add({ row: 0, column: 0 }), true);
assert.equal(cells.add({ row: 0, column: 0 }), false);
assert.equal(cells.size, 1);
```

## The order of a linked map

`linkedHashMap` iterates in the order of the first `set` of each key. A `set` of a key that the map has keeps its place.

```ts
import assert from "node:assert/strict";
import { linkedHashMap } from "@mark1russell7/collections";

const map = linkedHashMap<string, number>();
map.set("b", 1);
map.set("a", 2);
map.set("b", 3);
assert.deepEqual([...map.keys()], ["b", "a"]);
```

With `accessOrder: true`, a `get` also moves the key to the end. Then the first key is the key with the oldest use.

```ts
import assert from "node:assert/strict";
import { linkedHashMap } from "@mark1russell7/collections";

const map = linkedHashMap<string, number>({ accessOrder: true });
map.set("a", 1);
map.set("b", 2);
map.get("a");
assert.deepEqual([...map.keys()], ["b", "a"]);
```

## A sorted map

`treeMap` keeps its keys sorted by a comparator. The default comparator is `defaultCompare`: numbers by value, strings with `localeCompare`, and dates by time.

```ts
import assert from "node:assert/strict";
import { treeMap } from "@mark1russell7/collections";

const scores = treeMap<number, string>([[70, "C"], [90, "A"], [80, "B"]]);
assert.deepEqual([...scores.keys()], [70, 80, 90]);
assert.equal(scores.firstKey(), 70);
assert.equal(scores.lastKey(), 90);
```

A tree map also finds the nearest key. `floorKey` gives the largest key that is not more than the argument, and `ceilingKey` gives the smallest key that is not less.

```ts
import assert from "node:assert/strict";
import { treeMap } from "@mark1russell7/collections";

const grades = treeMap<number, string>([[0, "F"], [60, "D"], [70, "C"], [80, "B"], [90, "A"]]);
const grade = (score: number) => grades.get(grades.floorKey(score)!);
assert.equal(grade(85), "B");
assert.equal(grade(90), "A");
assert.equal(grade(12), "F");

assert.equal(grades.ceilingKey(61), 70);
assert.equal(grades.lowerKey(60), 0);
assert.equal(grades.higherKey(90), undefined);
```

`headMap(to)` has the keys before `to`, and `tailMap(from)` has the keys from `from`.

```ts
import assert from "node:assert/strict";
import { treeMap } from "@mark1russell7/collections";

const map = treeMap<number, string>([[1, "a"], [2, "b"], [3, "c"]]);
assert.deepEqual([...map.headMap(2).keys()], [1]);
assert.deepEqual([...map.tailMap(2).keys()], [2, 3]);
```

The comparator is also the equality of the keys. Two keys that compare as 0 are one key.

```ts
import assert from "node:assert/strict";
import { treeMap } from "@mark1russell7/collections";

const byName = treeMap<string, number>({ compare: (a, b) => a.toLowerCase().localeCompare(b.toLowerCase()) });
byName.set("Ada", 1);
byName.set("ADA", 2);
assert.equal(byName.size, 1);
assert.equal(byName.get("ada"), 2);
```

## A sorted set

`treeSet` keeps its elements sorted, and it finds the nearest element with `floor`, `ceiling`, `lower` and `higher`.

```ts
import assert from "node:assert/strict";
import { treeSet } from "@mark1russell7/collections";

const stops = treeSet([30, 10, 20]);
assert.deepEqual(stops.toArray(), [10, 20, 30]);
assert.equal(stops.first(), 10);
assert.equal(stops.ceiling(15), 20);
assert.equal(stops.floor(15), 10);
assert.equal(stops.higher(30), undefined);

assert.equal(stops.pollFirst(), 10);
assert.deepEqual(stops.toArray(), [20, 30]);
```
