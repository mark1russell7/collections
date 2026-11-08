# Equality, hashes and order

A collection finds, removes and sorts its elements with three kinds of function. This guide tells the functions of the package for each kind, and the rules that a function of your own must keep.

| Type | Shape | Options that take it |
| --- | --- | --- |
| `Eq<T>` | `(a, b) => boolean` | `eq` of the lists, the deques, `hashSet` and `linkedHashMap`. `keyEq` and `valueEq` of `hashMap` |
| `Hash<T>` | `(value) => number` | `keyHash` of `hashMap`. `hash` of `hashSet` and `linkedHashMap` |
| `Compare<T>` | `(a, b) => number` | `compare` of `treeMap`, `treeSet` and `priorityQueue`. The argument of `sort` |

## The rules of the three functions

- An `Eq` is an equivalence. Each value equals itself. When `a` equals `b`, `b` equals `a`. When `a` equals `b` and `b` equals `c`, `a` equals `c`.
- Two equal values have one hash. Two different values can have one hash: then the map compares them with its `Eq`.
- A `Compare` gives a negative number when `a` comes first, 0 for the same place, and a positive number when `b` comes first. A swap of `a` and `b` changes the sign. The order is transitive.
- A `Compare` gives a number, not `NaN`. A sorted collection takes a result of 0 as one key.

## Equality: defaultEq, shallowEq, deepEq and eqBy

| Function | Two values are equal when |
| --- | --- |
| `defaultEq` | they are `===`. Two objects are equal only when they are the same object |
| `shallowEq` | they are `===`, or two objects with the same own keys and `===` values |
| `deepEq` | they have the same structure, at each depth |
| `eqBy(key)` | one key or one function of the two values gives `===` results |

```ts
import assert from "node:assert/strict";
import { defaultEq, shallowEq, deepEq, eqBy } from "@mark1russell7/collections";

assert.equal(defaultEq({ x: 1 }, { x: 1 }), false);

// shallowEq compares one level, with ===
assert.equal(shallowEq({ x: 1 }, { x: 1 }), true);
assert.equal(shallowEq({ a: { b: 1 } }, { a: { b: 1 } }), false);
assert.equal(shallowEq({ x: NaN }, { x: NaN }), false);

// deepEq compares each level, and NaN equals NaN
assert.equal(deepEq({ a: { b: [1, 2] } }, { a: { b: [1, 2] } }), true);
assert.equal(deepEq({ x: NaN }, { x: NaN }), true);
assert.equal(deepEq(new Map([["a", 1], ["b", 2]]), new Map([["b", 2], ["a", 1]])), true);
assert.equal(deepEq(new Date(5), new Date(5)), true);

// eqBy compares one field
type User = { id: number; name: string };
const sameUser = eqBy<User>("id");
assert.equal(sameUser({ id: 1, name: "Ada" }, { id: 1, name: "A. Lovelace" }), true);
```

`deepEq` compares by SameValueZero: `NaN` equals `NaN`, and 0 equals -0. Two objects must have the same prototype, so `{}` differs from an instance of a class with no fields. `Map` and `Set` compare by their entries in any order. A cycle is safe.

`eqBy` compares the results with `===`. Thus a field that holds an object, or `NaN`, does not make two values equal.

## Hashes: defaultHash, hashBy and combineHashes

`defaultHash` agrees with `deepEq`: two values that `deepEq` holds equal have one hash. The order of the keys of an object has no effect. `hashMap` and `hashSet` use `defaultHash` when you give no hash. Thus `deepEq` alone makes a map with keys by structure.

```ts
import assert from "node:assert/strict";
import { deepEq, defaultHash, hashMap } from "@mark1russell7/collections";

assert.equal(defaultHash({ a: 1, b: [2] }), defaultHash({ b: [2], a: 1 }));

type Cell = { row: number; column: number };
const cells = hashMap<Cell, string>({ keyEq: deepEq });
cells.set({ row: 1, column: 2 }, "x");
assert.equal(cells.get({ row: 1, column: 2 }), "x");
assert.equal(cells.size, 1);
```

Give a hash with `eqBy`: `hashBy` makes the hash of the same field. `hashBy` hashes the field with `defaultHash`, so the two functions agree.

```ts
import assert from "node:assert/strict";
import { eqBy, hashBy, hashSet } from "@mark1russell7/collections";

type User = { id: number; name: string };
const users = hashSet<User>({ eq: eqBy<User>("id"), hash: hashBy<User>((user) => user.id) });
assert.equal(users.add({ id: 1, name: "Ada" }), true);
assert.equal(users.add({ id: 1, name: "A. Lovelace" }), false);
assert.equal(users.size, 1);
```

For a hash of your own, `hashString` and `hashNumber` hash one primitive, and `combineHashes` combines the hashes of the fields. The order of the arguments of `combineHashes` changes the result.

```ts
import assert from "node:assert/strict";
import { combineHashes, hashNumber, hashSet } from "@mark1russell7/collections";

type Point = { x: number; y: number };
const points = hashSet<Point>({
  eq: (a, b) => a.x === b.x && a.y === b.y,
  hash: (p) => combineHashes(hashNumber(p.x), hashNumber(p.y)),
});
points.add({ x: 1, y: 2 });
assert.equal(points.contains({ x: 1, y: 2 }), true);
assert.equal(points.contains({ x: 2, y: 1 }), false);
```

A hash can change in a new version of the package. Do not store a hash.

## Order: defaultCompare and a comparator for each type

`defaultCompare` is the default of `treeMap`, `treeSet`, `priorityQueue` and `sort`.

| Values | The order of `defaultCompare` |
| --- | --- |
| `null` and `undefined` | before each other value |
| numbers | by value, with `NaN` first |
| strings | by `localeCompare` |
| booleans | `false` before `true` |
| dates | by time |
| two values of different types | by their text, with `String` |

A comparator for one type gives the same order for its type: `numberCompare`, `stringCompare`, `stringCompareIgnoreCase`, `booleanCompare` and `dateCompare`.

A result of 0 makes one key of a sorted collection. Thus `stringCompareIgnoreCase` keeps one of `Apple` and `apple`.

```ts
import assert from "node:assert/strict";
import { numberCompare, stringCompareIgnoreCase, treeSet } from "@mark1russell7/collections";

assert.deepEqual([10, 9, 1].sort(numberCompare), [1, 9, 10]);

const names = treeSet<string>({ compare: stringCompareIgnoreCase });
names.add("Apple");
names.add("apple");
names.add("Banana");
assert.equal(names.size, 2);
```

`localeCompare` gives 0 for two texts with the same letters in different Unicode forms. Thus a `treeSet` with `stringCompare` holds one of them, but a `hashSet` holds the two. Normalize the text with `normalize("NFC")` when the two sets must agree.

```ts
import assert from "node:assert/strict";
import { hashSet, treeSet } from "@mark1russell7/collections";

const composed = "é";
const decomposed = "é";
assert.equal(treeSet<string>([composed, decomposed]).size, 1);
assert.equal(hashSet<string>([composed, decomposed]).size, 2);
assert.equal(hashSet<string>([composed, decomposed].map((text) => text.normalize("NFC"))).size, 1);
```

## Comparators from parts: comparing, thenComparing and the others

| Function | The comparator that it gives |
| --- | --- |
| `comparing(key, compare?)` | the order of one field or one function of the values |
| `comparingKey(keyOf, compare?)` | the order of a key that `keyOf` gives |
| `thenComparing(...comparators)` | the order of the first comparator that does not give 0 |
| `reversed(compare)` | the opposite order |
| `nullsFirst(compare)` and `nullsLast(compare)` | the order of `compare`, with `null` and `undefined` at one end |

```ts
import assert from "node:assert/strict";
import { comparing, comparingKey, nullsLast, numberCompare, reversed, thenComparing } from "@mark1russell7/collections";

type Person = { name: string; age: number };
const people: Person[] = [
  { name: "Bea", age: 30 },
  { name: "Ada", age: 30 },
  { name: "Cy", age: 20 },
];

const byAgeThenName = thenComparing(comparing<Person>("age"), comparing<Person>("name"));
assert.deepEqual([...people].sort(byAgeThenName).map((p) => p.name), ["Cy", "Ada", "Bea"]);

const oldestFirst = reversed(comparing<Person>("age", numberCompare));
assert.equal([...people].sort(oldestFirst)[2]!.name, "Cy");

const byLength = comparingKey<string, number>((text) => text.length, numberCompare);
assert.deepEqual(["ccc", "a", "bb"].sort(byLength), ["a", "bb", "ccc"]);

assert.deepEqual([3, null, 1].sort(nullsLast(numberCompare)), [1, 3, null]);
```

## Known defects

The reading for this guide found two defects of the comparators. Roadmap row C38 has the fix.

- `numberCompare` gives `NaN` for two equal infinities. `dateCompare` gives `NaN` for two invalid dates, and `defaultCompare` does too. A `treeMap` or a `treeSet` with such a key then holds the key two times. Then `has` of the map and `contains` of the set give `false`. `defaultCompare` gives 0 for two equal infinities, because it examines `===` first. Thus use `defaultCompare` for keys that can be infinite.
- `defaultCompare(null, undefined)` and `defaultCompare(undefined, null)` both give -1. Thus the sign does not change with a swap. Do not use `null` and `undefined` as two keys of one sorted collection.

```ts
import assert from "node:assert/strict";
import { treeSet } from "@mark1russell7/collections";

const limits = treeSet<number>();
limits.add(Infinity);
limits.add(Infinity);
limits.add(-Infinity);
assert.equal(limits.size, 2);
assert.equal(limits.contains(Infinity), true);
```
