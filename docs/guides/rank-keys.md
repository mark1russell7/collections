# Rank keys of an ordered list

A rank key gives the place of an item in a list that a user can reorder. Examples are a to-do list, the cards of a board and the rows of a table. Each item keeps one string key, and the list sorts by it.

When an item moves between two others, it gets a key between their keys. Thus a move writes one item, and no other item changes. This is fractional indexing with base-62 keys.

| Function | Use |
| --- | --- |
| `keyBetween(prev, next)` | the key of one item between two keys |
| `keysBetween(prev, next, count)` | `count` keys in order between two keys |
| `compareKeys(a, b)` | the order of two keys |
| `isValidKey(value)` | the check of a key that a client sends |
| `keysForDrop(items, index, movingId)` | the writes of a move, with a repair of equal keys |

## keyBetween: one key between two keys

Without `prev`, the key comes before `next`. Without `next`, it comes after `prev`. Without the two keys, it gives the first key of a list.

```ts
import assert from "node:assert/strict";
import { keyBetween } from "@mark1russell7/collections";

const first = keyBetween(null, null);
assert.equal(first, "a0");

const second = keyBetween(first, null);
assert.equal(second, "a1");

const between = keyBetween(first, second);
assert.equal(between, "a0V");
assert.ok(first < between && between < second);

const before = keyBetween(null, first);
assert.ok(before < first);
```

An insertion at an end changes the integer part of the key, so the keys at the ends stay short. An insertion between two keys makes the fraction part longer.

## The keys are not limited

The fraction part has no limit of length. Thus there is always a key between two keys, and the list does not need a rebalance at any time.

```ts
import assert from "node:assert/strict";
import { keyBetween } from "@mark1russell7/collections";

let low = "a0";
const high = "a1";
for (let move = 0; move < 50; move++) {
  const middle = keyBetween(low, high);
  assert.ok(low < middle && middle < high);
  low = middle;
}
assert.equal(low.length, 12);
```

Each move halves the gap. Thus approximately five moves into the same gap add one character: after 50 moves, the key has 12 characters.

## keysBetween: keys for many items

`keysBetween` gives `count` keys in ascending order. Use it to give keys to a new list, or to put several items at one place.

```ts
import assert from "node:assert/strict";
import { keysBetween } from "@mark1russell7/collections";

const list = keysBetween(null, null, 4);
assert.equal(list.length, 4);
assert.deepEqual([...list].sort(), list);

const pasted = keysBetween(list[1], list[2], 3);
assert.ok(pasted.every((key) => list[1]! < key && key < list[2]!));
assert.deepEqual([...pasted].sort(), pasted);

assert.deepEqual(keysBetween("a0", "a1", 0), []);
```

## compareKeys: sort by the code units

Sort the keys by the code units of the strings: `a < b`, or `compareKeys`. Do not sort them with `localeCompare`. It puts lower case and upper case letters together, but a key uses their code units.

```ts
import assert from "node:assert/strict";
import { compareKeys, keyBetween } from "@mark1russell7/collections";

const first = keyBetween(null, null);
const before = keyBetween(null, first);
const keys = [first, before];

assert.deepEqual([...keys].sort(compareKeys), [before, first]);
assert.notDeepEqual([...keys].sort((a, b) => a.localeCompare(b)), [before, first]);
```

A database sorts the keys correctly with a binary collation, for example `COLLATE "C"` in PostgreSQL.

## isValidKey: the check of a key from a client

A server examines each key that a client writes. `isValidKey` accepts only a key that `keyBetween` can make, with no more than 1024 characters. The option `maxLength` changes this limit.

```ts
import assert from "node:assert/strict";
import { isValidKey } from "@mark1russell7/collections";

assert.equal(isValidKey("a0"), true);
assert.equal(isValidKey("a0V"), true);
assert.equal(isValidKey(""), false);
assert.equal(isValidKey("a0 "), false);
assert.equal(isValidKey("a00"), false);
assert.equal(isValidKey(42), false);
assert.equal(isValidKey("a0V", { maxLength: 2 }), false);
```

The fraction part of a key does not end with the digit `0`, so `"a00"` is not valid. `keyBetween` and `keysBetween` throw a `RangeError` for a key that is not valid, and when `prev` does not come before `next`.

```ts
import assert from "node:assert/strict";
import { keyBetween } from "@mark1russell7/collections";

assert.throws(() => keyBetween("a1", "a0"), RangeError);
assert.throws(() => keyBetween("a1", "a1"), RangeError);
assert.throws(() => keyBetween("a00", null), RangeError);
```

## Two writers in one gap

Two writers can move two items into the same gap at the same time. Each one makes the same key. Sort by the key, then by the id of the item, so that each reader sees one order.

```ts
import assert from "node:assert/strict";
import { compareKeys, keyBetween } from "@mark1russell7/collections";

const left = "a0";
const right = "a1";
const fromAda = { id: "card-7", key: keyBetween(left, right) };
const fromBo = { id: "card-3", key: keyBetween(left, right) };
assert.equal(fromAda.key, fromBo.key);

const order = [fromAda, fromBo].sort((a, b) => compareKeys(a.key, b.key) || compareKeys(a.id, b.id));
assert.deepEqual(order.map((item) => item.id), ["card-3", "card-7"]);
```

## keysForDrop: the writes of a move

`keysForDrop` gives the writes of a move. Give it the other items in order, without the item that moves, and the index of the drop.

Two items with one key have no key between them. Thus a drop between them first gives new keys to the items after the drop that have the key of the item before it. The writes of these neighbors come first, and the write of the item that moves comes last.

```ts
import assert from "node:assert/strict";
import { keysForDrop } from "@mark1russell7/collections";

const others = [
  { id: "buy milk", key: "a0" },
  { id: "call Bo", key: "a1" },
  { id: "pay rent", key: "a1" },
];

const writes = keysForDrop(others, 2, "water plants");
assert.deepEqual(writes, [
  { id: "pay rent", key: "a2" },
  { id: "water plants", key: "a1V" },
]);

const keyOf = new Map([...others.map((item) => [item.id, item.key] as const), ...writes.map((write) => [write.id, write.key] as const)]);
const order = [...keyOf.keys()].sort((a, b) => (keyOf.get(a)! < keyOf.get(b)! ? -1 : 1));
assert.deepEqual(order, ["buy milk", "call Bo", "water plants", "pay rent"]);
```

When no key is equal, `keysForDrop` gives one write: the write of the item that moves.

```ts
import assert from "node:assert/strict";
import { keysForDrop } from "@mark1russell7/collections";

const others = [
  { id: "a", key: "a0" },
  { id: "b", key: "a1" },
];
assert.deepEqual(keysForDrop(others, 0, "c"), [{ id: "c", key: "Zz" }]);
assert.deepEqual(keysForDrop(others, 2, "c"), [{ id: "c", key: "a2" }]);
assert.throws(() => keysForDrop(others, 3, "c"), RangeError);
assert.throws(() => keysForDrop(others, 1, "a"), RangeError);
```

The index of a drop comes from the place of the pointer on the screen. `dropIndex` of `@mark1russell7/layout-contract` (0.6.2 or later) gives this index. A hit test on the screen is geometry, so its home is `layout-contract`. The `dropIndex` and `Point` of this package are deprecated, and version 0.11.0 removes them.
