# Events and caches

Three behaviors of the root entry add a rule to a map or a list:

| Behavior | Functions | Rule |
| --- | --- | --- |
| Events | `eventedMap`, `eventedList`, `eventedQueue`, `eventedDeque`, `evented` | each change gives an event to the listeners |
| LRU | `lruMap` | a full map evicts the entry that had no use for the longest time |
| TTL | `ttlMap`, `ttlCollection` | an entry expires at a fixed time after its last `set` |

`compose` puts the behaviors on a base collection. The guide [Layers](layers.md) tells how `compose` folds them. The classes `LRUCache` and `TTLCache` are caches with no base, at the end of this guide.

## Events on a map

`eventedMap` adds `on`. A listener gets the payload of each event. `on` gives a function that removes the listener.

```ts
import assert from "node:assert/strict";
import { compose, eventedMap, hashMap } from "@mark1russell7/collections";

const prices = compose(eventedMap<string, number>())(hashMap<string, number>());
const log: string[] = [];
prices.on("set", ({ key, value, oldValue }) => {
  log.push(oldValue === undefined ? `new ${key} = ${value}` : `${key}: ${oldValue} to ${value}`);
});
const stop = prices.on("delete", ({ key, reason }) => log.push(`delete ${key} (${reason ?? "a call"})`));
prices.on("clear", () => log.push("clear"));

prices.set("tea", 3);
prices.set("tea", 4);
prices.delete("tea");
prices.delete("tea"); // The key is not in the map, so no event occurs
prices.set("cake", 5);
stop();
prices.delete("cake"); // The listener is removed, so the log does not change
prices.set("bun", 2);
prices.clear();

assert.deepEqual(log, ["new tea = 3", "tea: 3 to 4", "delete tea (a call)", "new cake = 5", "new bun = 2", "clear"]);
```

The payload of a new key has `oldValue: undefined`. A listener that throws does not stop the other listeners: the layer writes the error with `console.error`, and the change stays.

## Events on a list

`eventedList` gives `add`, `set`, `remove`, `clear`, `sort` and `reverse`. An event at a position has its `index`. `add` at the end has no `index`.

```ts
import assert from "node:assert/strict";
import { arrayList, compose, eventedList } from "@mark1russell7/collections";

const steps = compose(eventedList<string>())(arrayList<string>());
const log: string[] = [];
steps.on("add", ({ value, index }) => log.push(`add ${value} at ${index ?? "the end"}`));
steps.on("set", ({ oldValue, newValue, index }) => log.push(`set ${index}: ${oldValue} to ${newValue}`));
steps.on("remove", ({ value, index }) => log.push(`remove ${value} at ${index}`));

steps.add("build");
steps.add("deploy");
steps.insert(1, "test");
steps.set(2, "release");
steps.removeAt(0);

assert.deepEqual(log, [
  "add build at the end",
  "add deploy at the end",
  "add test at 1",
  "set 2: deploy to release",
  "remove build at 0",
]);
assert.deepEqual(steps.toArray(), ["test", "release"]);
```

`eventedQueue` gives `enqueue`, `dequeue` and `clear`. `eventedDeque` gives an event for each end: `addFirst`, `addLast`, `removeFirst` and `removeLast`. A removal from the middle of a queue or a deque gives `remove`.

## Events of a bulk change

A bulk change gives one event for each element that it adds or removes. Thus a replay of the events gives the contents. The bulk changes are `addAll`, `insertAll`, `removeAll`, `retainAll` and `removeRange`. On a map, they are `putAll`, `merge` and the compute methods.

```ts
import assert from "node:assert/strict";
import { arrayList, compose, eventedList, eventedMap, hashMap } from "@mark1russell7/collections";

const tags = compose(eventedList<string>())(arrayList<string>());
const log: string[] = [];
tags.on("add", ({ value }) => log.push(`add ${value}`));
tags.on("remove", ({ value, index }) => log.push(`remove ${value} at ${index}`));

tags.addAll(["a", "b", "c", "d"]);
tags.removeAll(["b", "d"]);
assert.deepEqual(log, ["add a", "add b", "add c", "add d", "remove b at 1", "remove d at 2"]);

const counts = compose(eventedMap<string, number>())(hashMap<string, number>());
const changes: string[] = [];
counts.on("set", ({ key, value }) => changes.push(`${key} = ${value}`));

counts.merge("tea", 1, (total, one) => total + one);
counts.merge("tea", 1, (total, one) => total + one);
counts.computeIfAbsent("cake", () => 0);
assert.deepEqual(changes, ["tea = 1", "tea = 2", "cake = 0"]);
```

The index of each `remove` is the place of the element at the time of the event. Thus a replay removes the elements in the order of the events.

The layer adds the elements of `addAll` and `insertAll` one at a time, with the rules of a single add. A layer below, for example `bounded`, can drop or refuse each element. A bulk removal reads the contents before and after the change, so its time grows with the size of the collection.

## LRU: evict the entry with no use for the longest time

`lruMap({ capacity })` keeps at most `capacity` entries. A new key in a full map evicts the least recently used entry. `get`, `has` and a `set` of a key that is in the map are a use.

```ts
import assert from "node:assert/strict";
import { compose, hashMap, lruMap } from "@mark1russell7/collections";

const evicted: string[] = [];
const pages = compose(
  lruMap<string, string>({ capacity: 2, onEvict: ({ key }) => evicted.push(key) }),
)(hashMap<string, string>());

pages.set("/home", "<h1>Home</h1>");
pages.set("/about", "<h1>About</h1>");
assert.equal(pages.isFull, true);

// A use of "/home" makes "/about" the least recently used entry
assert.equal(pages.get("/home"), "<h1>Home</h1>");
pages.set("/blog", "<h1>Blog</h1>");
assert.deepEqual(evicted, ["/about"]);
assert.equal(pages.size, 2);

// getOrUndefined is a peek: it is not a use, so "/home" stays the least recently used entry
assert.equal(pages.getOrUndefined("/home"), "<h1>Home</h1>");
pages.set("/shop", "<h1>Shop</h1>");
assert.deepEqual(evicted, ["/about", "/home"]);

// The capacity is a positive whole number
assert.throws(() => lruMap({ capacity: 0 }), RangeError);
```

`delete` and the iteration are not a use. A `delete` is not an eviction, so `onEvict` does not occur.

## An eviction as an event

A layer tells the layers above it about each removal that it makes. Put `eventedMap` above `lruMap`, and each eviction gives a `delete` event with the reason `"evict"`.

```ts
import assert from "node:assert/strict";
import { compose, eventedMap, hashMap, lruMap } from "@mark1russell7/collections";

const cache = compose(eventedMap<string, number>(), lruMap<string, number>({ capacity: 2 }))(hashMap<string, number>());
const log: string[] = [];
cache.on("set", ({ key }) => log.push(`set ${key}`));
cache.on("delete", ({ key, reason }) => log.push(`delete ${key} (${reason ?? "a call"})`));

cache.set("a", 1);
cache.set("b", 2);
cache.get("a");
cache.set("c", 3);
cache.delete("a");

// The eviction of "b" comes before the set of "c", because the set makes the space first
assert.deepEqual(log, ["set a", "set b", "delete b (evict)", "set c", "delete a (a call)"]);
```

A `delete` event with no `reason` comes from a `delete` on the map. A `reason` tells that a layer below removed the entry: `"evict"`, `"expire"` or `"drop"`.

## TTL: entries that expire

`ttlMap({ ttl })` keeps an entry for `ttl` milliseconds after its last `set`. Each read first removes the expired entries, so a read shows only live entries. A `get` does not make an entry live for longer.

```ts
import assert from "node:assert/strict";
import { compose, hashMap, ttlMap } from "@mark1russell7/collections";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const sessions = compose(ttlMap<string, string>({ ttl: 200 }))(hashMap<string, string>());

sessions.set("ada", "token-1");
await wait(120);
// A second set starts the time again
sessions.set("ada", "token-2");
await wait(120);
assert.equal(sessions.get("ada"), "token-2");

await wait(250);
assert.equal(sessions.has("ada"), false);
assert.equal(sessions.size, 0);
sessions.dispose();
```

A background interval also removes the expired entries, each `checkInterval` milliseconds (1000 by default). Thus `onExpire` occurs also when nothing reads the map. The interval does not keep a Node.js process alive. `dispose` stops it.

```ts
import assert from "node:assert/strict";
import { compose, hashMap, ttlMap } from "@mark1russell7/collections";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const expired: string[] = [];
const locks = compose(
  ttlMap<string, number>({ ttl: 20, checkInterval: 10, onExpire: ({ key }) => expired.push(key) }),
)(hashMap<string, number>());

locks.set("row-1", 1);
locks.set("row-2", 2);
await wait(80);

// The interval removed both entries, in the order of expiry, with no read of the map
assert.deepEqual(expired, ["row-1", "row-2"]);
locks.dispose();
```

## An expiry as an event

Put `eventedMap` above `ttlMap`, and each expiry gives a `delete` event with the reason `"expire"`.

```ts
import assert from "node:assert/strict";
import { compose, eventedMap, hashMap, ttlMap } from "@mark1russell7/collections";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const flags = compose(eventedMap<string, boolean>(), ttlMap<string, boolean>({ ttl: 20 }))(hashMap<string, boolean>());
const deleted: string[] = [];
flags.on("delete", ({ key, reason }) => deleted.push(`${key} (${reason ?? "a call"})`));

flags.set("beta", true);
await wait(50);

// The read of the size removes the expired entry, and the event comes from the layer below
assert.equal(flags.size, 0);
assert.deepEqual(deleted, ["beta (expire)"]);
flags.dispose();
```

## A clock for tests

`ttlMap`, `ttlCollection`, `TTLCache` and `ttlCache` take the option `clock`. A test gives `fakeClock()` of `@mark1russell7/algebra/clock`. The test then sets the time, and the expiry times are exact.

```ts
import assert from "node:assert/strict";
import { fakeClock } from "@mark1russell7/algebra/clock";
import { compose, hashMap, ttlMap } from "@mark1russell7/collections";

const clock = fakeClock();
const expired: string[] = [];
const sessions = compose(
  ttlMap<string, string>({ ttl: 100, checkInterval: 10, clock, onExpire: ({ key }) => expired.push(key) }),
)(hashMap<string, string>());

sessions.set("ann", "s-1");
await clock.advance(99);
assert.equal(sessions.get("ann"), "s-1");

// The background check at 100 removes the entry, with no access
await clock.advance(1);
assert.deepEqual(expired, ["ann"]);
sessions.dispose();
assert.equal(clock.pending, 0);
```

The default clock reads `Date.now()`. A monotonic clock, for example `realClock` of `@mark1russell7/algebra/clock`, keeps the order of expiry also when the wall clock goes back.

`lruMap` takes the option `clock` too. The `timestamp` of `onEvict` is the time of the clock at the last use of the entry.

## LRU and TTL together

In `compose(lruMap, ttlMap)`, an entry leaves at its expiry or at an eviction. An expiry is not an eviction, so `onEvict` does not occur for it.

```ts
import assert from "node:assert/strict";
import { compose, hashMap, lruMap, ttlMap } from "@mark1russell7/collections";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const evicted: string[] = [];
const cache = compose(
  lruMap<string, number>({ capacity: 2, onEvict: ({ key }) => evicted.push(key) }),
  ttlMap<string, number>({ ttl: 50 }),
)(hashMap<string, number>());

cache.set("a", 1);
cache.set("b", 2);
await wait(100);

// "a" and "b" expired, so the map has space for two new keys and evicts nothing
cache.set("c", 3);
cache.set("d", 4);
assert.deepEqual(evicted, []);

// The map is full, so a third key evicts the least recently used entry
cache.set("e", 5);
assert.deepEqual(evicted, ["c"]);
cache.dispose();
```

## Caches with no base: lruCache and ttlCache

`lruCache(capacity, onEvict)` gives an `LRUCache`, and `ttlCache(ttl, options)` gives a `TTLCache`. They are classes with their own storage, and they do not use `compose`. A `get` of a missing key gives `undefined`.

```ts
import assert from "node:assert/strict";
import { lruCache, ttlCache } from "@mark1russell7/collections";

const evicted: string[] = [];
const recent = lruCache<string, number>(2, (key) => evicted.push(key));
recent.set("a", 1);
recent.set("b", 2);
recent.get("a");
recent.set("c", 3);
assert.deepEqual(evicted, ["b"]);
assert.equal(recent.get("b"), undefined);

// deleteWhere is not a use, and it is not an eviction
assert.equal(recent.deleteWhere((value) => value > 2), 1);
assert.equal(recent.size, 1);
assert.deepEqual(evicted, ["b"]);

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const tokens = ttlCache<string, string>(200);
tokens.set("ada", "t-1");
tokens.set("bob", "t-2", 20); // This entry has a TTL of its own
const left = tokens.getTTL("ada");
assert.ok(left !== undefined && left > 100 && left <= 200);

await wait(50);
assert.equal(tokens.get("bob"), undefined);
assert.equal(tokens.get("ada"), "t-1");

// touch gives a live entry a new TTL
assert.equal(tokens.touch("ada", 1000), true);
assert.ok((tokens.getTTL("ada") ?? 0) > 200);
tokens.dispose();
```

## Known differences

The reading for this guide found three differences between the layers and the classes. Item C37 of the roadmap removes them.

- `has` of `lruMap` is a use, but `has` of `LRUCache` is not a use.
- `ttlMap`, `ttlCollection` and `TTLCache` do not examine `ttl` and `checkInterval`. A `checkInterval` of 0 or `NaN` starts the interval each millisecond.
- `touch` of `TTLCache` removes an expired entry with no `onExpire`. `get` gives `onExpire` for the same entry.
