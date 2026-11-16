# Contract checks

The entry `@mark1russell7/collections/testing` gives the small checks of a contract suite. A contract suite is one set of tests that each implementation of an interface must pass, for example each storage of a list. The entry imports no test framework, so a suite operates under `vitest`, `node:test` or a plain script.

## The checks

| Check | What it does |
| --- | --- |
| `holds(condition, what)` | It throws a `ContractViolation` with the text `what` when `condition` is false. |
| `same(actual, expected, what)` | It throws a `ContractViolation` when the two values are not equal by `deepEqual`. The message shows the two values. |
| `rejects(start, what)` | It starts an operation that must give a rejected promise, and gives the error. |
| `deepEqual(actual, expected)` | It gives true when two JSON values and maps are equal. |
| `show(value)` | It gives the text of a value for a message, with a `Map` as its entries. |

```ts
import assert from "node:assert/strict";
import { arrayList } from "@mark1russell7/collections";
import { ContractViolation, holds, same } from "@mark1russell7/collections/testing";

const list = arrayList<number>();
list.add(1);
list.add(2);

holds(list.size === 2, "the size after two adds is 2");
same([...list], [1, 2], "the order of the values");

assert.throws(() => same([...list], [2, 1], "the order of the values"), ContractViolation);
assert.throws(() => same([...list], [2, 1], "the order"), /the order: expected \[2,1\], got \[1,2\]/);
```

## A rejected promise

`rejects` is for an async method. The method must give a promise that rejects. A method that throws at once, before it gives a promise, breaks the contract too: each caller of an async method expects a promise.

```ts
import assert from "node:assert/strict";
import { ContractViolation, rejects } from "@mark1russell7/collections/testing";

const error = await rejects(() => Promise.reject(new RangeError("no key")), "a get of a missing key");
assert.ok(error instanceof RangeError);

await assert.rejects(
  rejects(() => Promise.resolve(1), "a get of a missing key"),
  /a get of a missing key: the promise did not reject/
);

await assert.rejects(
  rejects(() => {
    throw new Error("sync");
  }, "a get of a missing key"),
  ContractViolation
);
```

## `deepEqual` is not `deepEq`

`deepEqual` of this entry is for JSON values in tests. The root entry has `deepEq`, the deep equality of the collections, for example for the option `keyEq` of `hashMap`. The two differ in these cases:

- A `Date`, a `Set` or an instance of a class equals only itself under `deepEqual`. Under `deepEq`, two dates of the same time are equal.
- `0` does not equal `-0` under `deepEqual`. It does under `deepEq`.
- `{}` equals `Object.create(null)` under `deepEqual`. It does not under `deepEq`.

```ts
import assert from "node:assert/strict";
import { deepEq } from "@mark1russell7/collections";
import { deepEqual } from "@mark1russell7/collections/testing";

assert.equal(deepEqual(new Map([["a", [1]]]), new Map([["a", [1]]])), true);
assert.equal(deepEqual(new Date(0), new Date(0)), false);
assert.equal(deepEq(new Date(0), new Date(0)), true);
assert.equal(deepEqual(0, -0), false);
assert.equal(deepEq(0, -0), true);
```

## A suite for each implementation

Write the suite one time, as a function of a maker. Then start it for each implementation.

```ts
import { arrayList, linkedList, type List } from "@mark1russell7/collections";
import { holds, same } from "@mark1russell7/collections/testing";

function listContract(name: string, make: () => List<number>): void {
  const list = make();
  list.add(3);
  list.add(1);
  same([...list], [3, 1], `${name}: add keeps the order`);
  holds(list.remove(3), `${name}: remove gives true for a value of the list`);
  same([...list], [1], `${name}: remove removes the value`);
}

listContract("arrayList", () => arrayList<number>());
listContract("linkedList", () => linkedList<number>());
```

A suite for a test runner wraps each check in a test case. The checks stay the same in each runner.
