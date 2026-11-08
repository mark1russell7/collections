# Behaviors

A behavior is a layer that adds a rule to a collection. `compose` puts the layers on a base collection. The guide [Layers](layers.md) tells how `compose` folds them.

This guide shows three behaviors:

| Behavior | Functions | Rule |
| --- | --- | --- |
| Readonly | `readonly`, `readonlyList`, `readonlyQueue`, `readonlyMap`, `readonlyCollection` | a read works, and a change throws an error |
| Safe | `safeList`, `safeQueue`, `safeDeque`, `safeMap` | a read of a missing element gives an `Optional` or a `Result`, not an error |
| Locks | `synchronized`, `readWriteLock` | the async calls run in a fixed order |

The guide [Events and caches](caches.md) shows `evented`, `lruMap` and `ttlMap`. A later guide shows `bounded`. An open pull request changes it.

## Readonly: a change throws an error

`readonly()` gives a view of the base. The view reads the base, and each method that changes the base throws an error. A test examines each method of each structure of the package.

```ts
import assert from "node:assert/strict";
import { arrayList, compose, readonly } from "@mark1russell7/collections";

const base = arrayList([1, 2, 3]);
const view = compose(readonly())(base);

assert.equal(view.get(0), 1);
assert.equal(view.size, 3);
assert.throws(() => view.add(4), /Cannot modify readonly collection/);
assert.throws(() => view.set(0, 9), /Cannot modify readonly collection/);
assert.deepEqual(base.toArray(), [1, 2, 3]);
```

`readonly()` keeps the type of the base, so the compiler accepts `view.add(4)`, and the call throws at run time. `readonlyList()` gives the type `ReadonlyList`. That type has no `add`, so the compiler refuses the call.

## Readonly: the view follows the base

The view is not a copy. A change to the base shows in the view.

```ts
import assert from "node:assert/strict";
import { arrayList, compose, readonly } from "@mark1russell7/collections";

const base = arrayList(["a"]);
const view = compose(readonly())(base);

base.add("b");
assert.equal(view.size, 2);
assert.equal(view.last(), "b");
```

To give a value that does not change, copy it first: `compose(readonly())(arrayList(base.toArray()))`.

## Readonly: a sublist and a submap are readonly too

A method that gives a view gives a readonly result. Examples are `subList`, `subMap` and `descendingMap`.

```ts
import assert from "node:assert/strict";
import { arrayList, compose, readonly } from "@mark1russell7/collections";

const view = compose(readonly())(arrayList([1, 2, 3, 4]));
const middle = view.subList(1, 3);

assert.deepEqual(middle.toArray(), [2, 3]);
assert.throws(() => middle.add(5), /Cannot modify readonly collection/);
```

## Readonly: a map, and the message of the error

`readonlyMap` blocks `set`, `delete`, `clear` and the other changes of a map. The option `errorMessage` sets the text of the error.

```ts
import assert from "node:assert/strict";
import { compose, hashMap, readonly } from "@mark1russell7/collections";

const base = hashMap<string, number>();
base.set("port", 8080);
const config = compose(readonly({ errorMessage: "The config is frozen" }))(base);

assert.equal(config.get("port"), 8080);
assert.throws(() => config.set("port", 80), /The config is frozen/);
assert.throws(() => config.delete("port"), /The config is frozen/);
```

`readonlyList`, `readonlyQueue` and `readonlyMap` use a default message that names the kind: `Cannot modify readonly list`, `Cannot modify readonly queue` and `Cannot modify readonly map`.

## Safe: a missing element gives none

`safeList()` adds the property `safe` to the list. Each read of `safe` gives an `Optional` of `@mark1russell7/optional`. A read out of the range gives `none`, not an error.

```ts
import assert from "node:assert/strict";
import { arrayList, compose, safeList } from "@mark1russell7/collections";
import { getOr, isNone, isSome } from "@mark1russell7/optional";

const list = compose(safeList<number>())(arrayList([10, 20]));

const second = list.safe.get(1);
assert.ok(isSome(second));
assert.equal(second.value, 20);

assert.ok(isNone(list.safe.get(5)));
assert.equal(getOr(list.safe.get(5), 0), 0);
assert.throws(() => list.get(5));
```

The methods of the list stay as they are: `list.get(5)` still throws.

## Safe: a change gives a Result

`safe.set` and `safe.removeAt` change the list. Each one gives a `Result`: `ok` with the old element, or `err` with the text of the error.

```ts
import assert from "node:assert/strict";
import { arrayList, compose, safeList } from "@mark1russell7/collections";
import { isErr, isOk } from "@mark1russell7/optional";

const list = compose(safeList<string>())(arrayList(["a", "b"]));

const replaced = list.safe.set(0, "z");
assert.ok(isOk(replaced));
assert.equal(replaced.value, "a");
assert.deepEqual(list.toArray(), ["z", "b"]);

const missing = list.safe.removeAt(9);
assert.ok(isErr(missing));
assert.equal(typeof missing.error, "string");
assert.equal(list.size, 2);
```

## Safe: queues, deques and maps

`safeQueue`, `safeDeque` and `safeMap` add the same property. On an empty queue, `safe.poll()` gives `none`. On a map, `safe.get` gives `none` for a missing key.

```ts
import assert from "node:assert/strict";
import { arrayDeque, compose, hashMap, safeDeque, safeMap } from "@mark1russell7/collections";
import { isNone, isSome } from "@mark1russell7/optional";

const jobs = compose(safeDeque<string>())(arrayDeque(["build"]));
const first = jobs.safe.poll();
assert.ok(isSome(first));
assert.equal(first.value, "build");
assert.ok(isNone(jobs.safe.poll()));
assert.ok(isNone(jobs.safe.peekLast()));

const ports = compose(safeMap<string, number>())(hashMap<string, number>());
ports.set("http", 80);
assert.ok(isSome(ports.safe.get("http")));
assert.ok(isNone(ports.safe.get("ftp")));
```

A safe layer does not make a new object. It adds `safe` to the base, so the base and the result are the same object.

```ts
import assert from "node:assert/strict";
import { arrayList, compose, safeList } from "@mark1russell7/collections";

const base = arrayList([1]);
const list = compose(safeList<number>())(base);

assert.equal(list, base);
assert.ok("safe" in base);
```

## Locks: synchronized

JavaScript does not interrupt a function that does not wait. But two async calls can interleave at each `await`. `synchronized()` puts each async method inside one lock. A call starts after the earlier async calls end.

```ts
import assert from "node:assert/strict";
import { compose, synchronized } from "@mark1russell7/collections";

const log: string[] = [];
const account = {
  balance: 100,
  async withdraw(amount: number) {
    const before = this.balance;
    log.push(`read ${before}`);
    await Promise.resolve();
    this.balance = before - amount;
    log.push(`wrote ${this.balance}`);
  },
};

const locked = compose(synchronized())(account);
await Promise.all([locked.withdraw(30), locked.withdraw(50)]);

assert.equal(account.balance, 20);
assert.deepEqual(log, ["read 100", "wrote 70", "read 70", "wrote 20"]);
```

Without the lock, the two calls read 100 before a write, and the balance is 50 at the end.

A method that is not `async` starts at once, also on a synchronized object. If it gives a promise, the lock waits for that promise before the next async call.

```ts
import assert from "node:assert/strict";
import { arrayList, compose, synchronized } from "@mark1russell7/collections";

const list = compose(synchronized())(arrayList<number>());

assert.equal(list.add(1), true);
assert.equal(list.size, 1);
```

## Locks: readWriteLock

`readWriteLock()` lets many reads run at the same time, and gives a write the object for itself. A write waits until the current reads end. A read waits until each write that waits or operates ends.

The names of the read methods are fixed: `get`, `has`, `contains`, `peek`, `first`, `last`, `toArray`, `keys`, `values`, `entries`, `forEach` and some others. Each other method is a write.

```ts
import assert from "node:assert/strict";
import { compose, readWriteLock } from "@mark1russell7/collections";

const log: string[] = [];
const store = {
  async get(key: string) {
    log.push(`get ${key}`);
    await Promise.resolve();
    log.push(`got ${key}`);
    return key;
  },
  async set(key: string) {
    log.push(`set ${key}`);
    await Promise.resolve();
    log.push(`done ${key}`);
  },
};

const locked = compose(readWriteLock())(store);
await Promise.all([locked.get("a"), locked.get("b"), locked.set("c")]);

assert.deepEqual(log, ["get a", "get b", "got a", "got b", "set c", "done c"]);
```

Each method of a locked object gives a promise. This is also true for a method that does not wait, for example `get` of a list. A property, for example `size`, does not change.

```ts
import assert from "node:assert/strict";
import { arrayList, compose, readWriteLock } from "@mark1russell7/collections";

const list = compose(readWriteLock())(arrayList([5]));

const read: unknown = list.get(0);
assert.ok(read instanceof Promise);
assert.equal(await read, 5);
assert.equal(list.size, 1);
```

## Known defects

The examples of this guide found two defects. This guide does not show the functions until each defect has a fix:

- `reentrantSynchronized` is not reentrant. A call from inside a locked method waits for the lock of the outer call, so the two calls do not end.
- The generic `safe()` gives the collection with no change, and adds no property `safe`. Use `safeList`, `safeQueue`, `safeDeque` or `safeMap`.
