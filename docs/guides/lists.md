# Lists

A list keeps its elements in an order, and each element has an index from 0. The package has two lists:

| List | Fast operations | Slow operations |
| --- | --- | --- |
| `arrayList` | `get` and `set` at an index, `add` and `pop` at the end | `insert` and `removeAt` near the start |
| `linkedList` | `push`, `pop`, `shift` and `unshift` at the two ends | `get` and `set` at an index in the middle |

Both lists have the same interface, `List`. Thus a function that takes a `List` takes the two lists.

## Make a list

Give a factory no argument for an empty list, or an iterable for the first elements.

```ts
import assert from "node:assert/strict";
import { arrayList, linkedList } from "@mark1russell7/collections";

const empty = arrayList<number>();
assert.equal(empty.size, 0);
assert.equal(empty.isEmpty, true);

const numbers = arrayList([3, 1, 2]);
assert.deepEqual(numbers.toArray(), [3, 1, 2]);

const names = linkedList(new Set(["ada", "alan"]));
assert.deepEqual([...names], ["ada", "alan"]);
```

## Read and change by index

`get` and `set` use an index from 0. An index out of the range throws a `RangeError`. `set` gives the old element.

```ts
import assert from "node:assert/strict";
import { arrayList } from "@mark1russell7/collections";

const list = arrayList(["a", "b", "c"]);
assert.equal(list.get(1), "b");
assert.equal(list.set(1, "B"), "b");
assert.deepEqual(list.toArray(), ["a", "B", "c"]);

assert.equal(list.first(), "a");
assert.equal(list.last(), "c");
assert.throws(() => list.get(3), RangeError);
```

`insert` puts an element at an index, and moves the elements after it. `removeAt` removes the element at an index and gives it.

```ts
import assert from "node:assert/strict";
import { arrayList } from "@mark1russell7/collections";

const list = arrayList([1, 2, 4]);
list.insert(2, 3);
assert.deepEqual(list.toArray(), [1, 2, 3, 4]);

assert.equal(list.removeAt(0), 1);
assert.deepEqual(list.toArray(), [2, 3, 4]);

list.insertAll(0, [0, 1]);
assert.deepEqual(list.toArray(), [0, 1, 2, 3, 4]);

list.removeRange(1, 3);
assert.deepEqual(list.toArray(), [0, 3, 4]);
```

## The two ends

A list has the four operations of an array at its ends: `push` and `pop` at the end, `unshift` and `shift` at the start. On an empty list, `pop` and `shift` throw.

```ts
import assert from "node:assert/strict";
import { linkedList } from "@mark1russell7/collections";

const list = linkedList<number>();
list.push(2);
list.push(3);
list.unshift(1);
assert.deepEqual(list.toArray(), [1, 2, 3]);

assert.equal(list.shift(), 1);
assert.equal(list.pop(), 3);
assert.deepEqual(list.toArray(), [2]);

list.clear();
assert.throws(() => list.pop());
```

## Find and remove an element

`contains`, `indexOf` and `remove` compare the elements with the equality of the list. The default equality is `===`. Thus two objects with the same fields are two different elements.

```ts
import assert from "node:assert/strict";
import { arrayList } from "@mark1russell7/collections";

const list = arrayList([{ id: 1 }, { id: 2 }]);
assert.equal(list.contains({ id: 1 }), false);
assert.equal(list.indexOf({ id: 2 }), -1);
```

Give the option `eq` to compare the elements in a different way. Then `contains`, `indexOf`, `lastIndexOf` and `remove` use it. `remove` removes the first equal element and gives `true`.

```ts
import assert from "node:assert/strict";
import { arrayList } from "@mark1russell7/collections";

type Point = { x: number; y: number };
const list = arrayList<Point>({ eq: (a, b) => a.x === b.x && a.y === b.y });
list.addAll([{ x: 0, y: 0 }, { x: 1, y: 2 }, { x: 0, y: 0 }]);

assert.equal(list.contains({ x: 1, y: 2 }), true);
assert.equal(list.indexOf({ x: 0, y: 0 }), 0);
assert.equal(list.lastIndexOf({ x: 0, y: 0 }), 2);

assert.equal(list.remove({ x: 0, y: 0 }), true);
assert.equal(list.size, 2);
assert.equal(list.remove({ x: 9, y: 9 }), false);
```

The default equality `===` does not find `NaN`, because `NaN === NaN` is false. A JavaScript `Set` finds it.

```ts
import assert from "node:assert/strict";
import { arrayList } from "@mark1russell7/collections";

const list = arrayList([NaN]);
assert.equal(list.contains(NaN), false);
assert.equal(new Set([NaN]).has(NaN), true);
```

## Sort and reverse

`sort` changes the order of the list. With no argument, it uses `defaultCompare`: numbers by value, strings with `localeCompare`, and dates by time. `reverse` turns the order.

```ts
import assert from "node:assert/strict";
import { arrayList } from "@mark1russell7/collections";

const list = arrayList([10, 9, 100]);
list.sort();
assert.deepEqual(list.toArray(), [9, 10, 100]);

list.sort((a, b) => b - a);
assert.deepEqual(list.toArray(), [100, 10, 9]);

list.reverse();
assert.deepEqual(list.toArray(), [9, 10, 100]);
```

The default order of numbers is by value. `Array.prototype.sort` with no argument compares the numbers as strings.

```ts
import assert from "node:assert/strict";

assert.deepEqual([10, 9, 100].sort(), [10, 100, 9]);
```

## A part of a list

`subList(from, to)` gives a new list with the elements from the index `from` to the index before `to`. The new list is a copy, not a view. Thus a change to one list does not change the other list.

```ts
import assert from "node:assert/strict";
import { arrayList } from "@mark1russell7/collections";

const list = arrayList(["a", "b", "c", "d"]);
const part = list.subList(1, 3);
assert.deepEqual(part.toArray(), ["b", "c"]);

part.set(0, "B");
list.set(2, "C");
assert.deepEqual(list.toArray(), ["a", "b", "C", "d"]);
assert.deepEqual(part.toArray(), ["B", "c"]);
```

## Iterate

A list is iterable, so `for...of`, the spread syntax and `Array.from` operate on it. `forEach` also gives the index.

```ts
import assert from "node:assert/strict";
import { arrayList } from "@mark1russell7/collections";

const list = arrayList(["x", "y"]);
const seen: string[] = [];
list.forEach((element, index) => seen.push(`${index}:${element}`));
assert.deepEqual(seen, ["0:x", "1:y"]);
assert.deepEqual(Array.from(list), ["x", "y"]);
```
