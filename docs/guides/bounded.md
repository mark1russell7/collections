# Bounded collections

A bounded layer keeps a collection at a maximum size, its capacity. A policy tells what an add into a full collection does.

| Function | Base | Error text of `throw` |
| --- | --- | --- |
| `boundedList` | a list: `arrayList`, `linkedList` | `List is full (capacity: N)` |
| `boundedQueue` | a queue: `arrayDeque`, `linkedList` | `Queue is full (capacity: N)` |
| `boundedDeque` | a deque: `arrayDeque`, `linkedList` | `Deque is full (capacity: N)` |
| `boundedMap` | a map: `hashMap`, `linkedHashMap`, `treeMap` | `Map is full (capacity: N)` |
| `bounded` | each collection with `add`: it is `boundedList` | `List is full (capacity: N)` |

| Policy | An add into a full collection |
| --- | --- |
| `throw` (the default) | throws an `Error`, and the collection does not change |
| `drop-oldest` | removes one element, and then adds the new element |
| `drop-newest` | does not add the new element |
| `reject` | does not add the new element |
| `grow` | adds the new element, so the size goes past the capacity |
| `block` | throws an `Error`, because a sync collection cannot wait |

The layer bounds each add method of its base. For a `linkedList`, these are also `addFirst`, `addLast`, the `offer` methods and `enqueue`. `compose` puts the layer on a base. The guide [Layers](layers.md) tells how `compose` folds the layers.

## The capacity and the policy `throw`

Each bounded layer adds three members: `capacity`, `isFull` and `remainingCapacity`. An add into a full collection throws with the default policy.

```ts
import assert from "node:assert/strict";
import { arrayList, boundedList, compose } from "@mark1russell7/collections";

const list = compose(boundedList<number>({ capacity: 3 }))(arrayList<number>());
list.add(1);
assert.equal(list.capacity, 3);
assert.equal(list.remainingCapacity, 2);

list.addAll([2, 3]);
assert.equal(list.isFull, true);
assert.throws(() => list.add(4), { message: "List is full (capacity: 3)" });
assert.throws(() => list.unshift(0), { message: "List is full (capacity: 3)" });
assert.deepEqual(list.toArray(), [1, 2, 3]);
```

The capacity is a positive whole number. A capacity of 0, -1, 2.5 or `NaN` throws a `RangeError` when you make the layer.

## The policy `drop-oldest` on a list

The policy removes one element at the end opposite to the add. An add at the end (`add`, `push`, `insert` at an index after 0) removes the first element. An add at the front (`unshift`, `insert` at 0) removes the last element.

```ts
import assert from "node:assert/strict";
import { arrayList, boundedList, compose, removalsOf, type ElementRemoval } from "@mark1russell7/collections";

const recent = compose(boundedList<string>({ capacity: 3, policy: "drop-oldest" }))(arrayList<string>());
const dropped: string[] = [];
removalsOf<ElementRemoval<string>>(recent)?.on(({ value, end }) => dropped.push(`${value} (${end})`));

recent.addAll(["a", "b", "c"]);
recent.add("d");
assert.deepEqual(recent.toArray(), ["b", "c", "d"]);

recent.unshift("z");
assert.deepEqual(recent.toArray(), ["z", "b", "c"]);

recent.insert(0, "y");
assert.deepEqual(recent.toArray(), ["y", "z", "b"]);

assert.deepEqual(dropped, ["a (first)", "d (last)", "c (last)"]);
```

The removal channel of the layer gives each element that the policy removes. An `eventedList` above the layer gives a `remove` event for it. The guide [Write a layer](writing-layers.md) tells how the channel works.

## The policies `reject`, `drop-newest` and `grow`

The policies `reject` and `drop-newest` keep the new element out. An add method that gives a boolean gives `false` for that element. The other add methods give `undefined`.

```ts
import assert from "node:assert/strict";
import { arrayList, boundedList, compose } from "@mark1russell7/collections";

const strict = compose(boundedList<number>({ capacity: 2, policy: "reject" }))(arrayList<number>());
assert.equal(strict.add(1), true);
assert.equal(strict.add(2), true);
assert.equal(strict.add(3), false);
assert.equal(strict.addAll([4, 5]), false);
assert.deepEqual(strict.toArray(), [1, 2]);

const loose = compose(boundedList<number>({ capacity: 2, policy: "grow" }))(arrayList<number>());
loose.addAll([1, 2, 3]);
assert.equal(loose.size, 3);
assert.equal(loose.isFull, true);
assert.equal(loose.remainingCapacity, 0);
```

With `grow`, the capacity tells only when the collection is full. Use `onOverflow` (below) to see each add past the capacity.

## Queues and deques

A bounded queue with `drop-oldest` removes its head. A deque removes the element at the end opposite to the add: `addFirst` and `offerFirst` remove the last element.

```ts
import assert from "node:assert/strict";
import { arrayDeque, boundedDeque, boundedQueue, compose } from "@mark1russell7/collections";

const jobs = compose(boundedQueue<string>({ capacity: 2, policy: "drop-oldest" }))(arrayDeque<string>());
jobs.offer("build");
jobs.offer("test");
jobs.offer("lint");
assert.deepEqual(jobs.toArray(), ["test", "lint"]);
assert.equal(jobs.poll(), "test");

const history = compose(boundedDeque<number>({ capacity: 3, policy: "drop-oldest" }))(arrayDeque<number>());
history.addLast(1);
history.addLast(2);
history.addLast(3);
history.addLast(4);
assert.deepEqual(history.toArray(), [2, 3, 4]);
history.addFirst(0);
assert.deepEqual(history.toArray(), [0, 2, 3]);
```

The base `arrayDeque` also has `push`, `addFirst` and `addLast`. A bounded queue bounds them too.

## Maps

A bounded map counts its keys. A `set` of a key that the map has changes the value and does not overflow. With `drop-oldest`, a `set` of a new key removes the oldest key that the map still has. The order is the order of the first `set` of each key.

```ts
import assert from "node:assert/strict";
import { boundedMap, compose, hashMap, removalsOf, type MapRemoval } from "@mark1russell7/collections";

const sessions = compose(boundedMap<string, number>({ capacity: 2, policy: "drop-oldest" }))(hashMap<string, number>());
const dropped: string[] = [];
removalsOf<MapRemoval<string, number>>(sessions)?.on(({ key, value }) => dropped.push(`${key}=${value}`));

sessions.set("ana", 1);
sessions.set("ben", 2);
sessions.set("ana", 3);
assert.equal(sessions.size, 2);
assert.deepEqual(dropped, []);

sessions.set("cy", 4);
assert.equal(sessions.has("ana"), false);
assert.deepEqual([...sessions.keys()].sort(), ["ben", "cy"]);
assert.deepEqual(dropped, ["ana=3"]);
```

With `reject` or `drop-newest`, a `set` of a new key into a full map gives `undefined`, and the map does not change.

## The handler `onOverflow`

The layer calls `onOverflow` before it applies the policy, one time for each add into a full collection. It does not call it with `grow`. The context has `newElement`, `currentSize`, `capacity` and `timestamp`. For a map, the context has `key` and `value` in place of `newElement`.

```ts
import assert from "node:assert/strict";
import { arrayList, boundedList, compose } from "@mark1russell7/collections";

const seen: string[] = [];
const list = compose(
  boundedList<number>({
    capacity: 2,
    policy: "drop-oldest",
    onOverflow: ({ newElement, currentSize, capacity }) => seen.push(`${newElement} at ${currentSize} of ${capacity}`),
  }),
)(arrayList<number>());

list.addAll([1, 2, 3, 4]);
assert.deepEqual(list.toArray(), [3, 4]);
assert.deepEqual(seen, ["3 at 2 of 2", "4 at 2 of 2"]);
```

A handler that throws stops the add, and the collection does not change.

## The rules of the layers

- An add of many elements (`addAll`, `insertAll`) is the adds of its elements, one after the other. A throw stops it, and the elements before the throw stay.
- Each element of `addAll` goes through `add` of the top layer. So a layer above, for example `eventedList`, sees each element.
- An insert at an index that the base refuses changes nothing. The base throws before a drop.
- A removal that the layer does not cause, for example `remove` or `clear`, makes room again.
