# Layers

A layer is a function that takes the next thing and gives a wrapped thing. The next thing can be a collection, a function or any other value. `compose` folds a list of layers into one function that wraps a base.

The package has two `compose` functions. They have the same fold, but their result types are not the same:

| Entry | Use | Result type |
| --- | --- | --- |
| `@mark1russell7/collections/layers` | a stack of any layers | the result of the first layer |
| `@mark1russell7/collections` | a stack of behaviors on a collection | the results of all the layers and the base |

The entry `./layers` is one file with no imports. A package that needs only the fold loads that one file.

## A stack of functions

Each layer below wraps a function from text to a number. The first layer is the outermost, so it gets the input first.

```ts
import assert from "node:assert/strict";
import { compose, type Layer } from "@mark1russell7/collections/layers";

type Parse = (text: string) => number;

const trim: Layer<Parse> = (next) => (text) => next(text.trim());
const double: Layer<Parse> = (next) => (text) => next(text) * 2;

const parse = compose(trim, double)(Number);
assert.equal(parse(" 21 "), 42);
```

`compose(trim, double)(Number)` is `trim(double(Number))`. Thus a call goes in through `trim`, then `double`, then `Number`. The result comes out in the opposite order.

```ts
import assert from "node:assert/strict";
import { compose, type Layer } from "@mark1russell7/collections/layers";

type Handler = (request: string) => string;

const log: string[] = [];
const trace =
  (name: string): Layer<Handler> =>
  (next) =>
  (request) => {
    log.push(`${name} in`);
    const response = next(request);
    log.push(`${name} out`);
    return response;
  };

const handle = compose(trace("auth"), trace("cache"))((request) => `ok: ${request}`);
assert.equal(handle("/a"), "ok: /a");
assert.deepEqual(log, ["auth in", "cache in", "cache out", "auth out"]);
```

## The four laws

The fold holds four laws. A test of the package examines each law with random layers and values.

| Law | Statement |
| --- | --- |
| Identity | `compose()(b)` is `b` |
| One layer | `compose(f)(b)` is `f(b)` |
| Associativity | `compose(f, compose(g, h))` gives the same result as `compose(compose(f, g), h)` |
| Order | `compose(f, g)(b)` is `f(g(b))` |

Associativity lets you put a part of a stack in a constant and use it in many stacks.

```ts
import assert from "node:assert/strict";
import { compose, type Layer } from "@mark1russell7/collections/layers";

const add =
  (n: number): Layer<number> =>
  (next) =>
    next + n;
const times =
  (n: number): Layer<number> =>
  (next) =>
    next * n;

const base = { value: 1 };
assert.equal(compose()(base), base);
assert.equal(compose(add(2))(5), 7);
assert.equal(compose(add(1), times(3))(5), add(1)(times(3)(5)));

const inner = compose(times(3), add(4));
assert.equal(compose(add(1), inner)(5), compose(compose(add(1), times(3)), add(4))(5));
assert.equal(compose(add(1), inner)(5), 28);
```

## The types

A layer has two types: `Layer<Inner, Outer>` takes an `Inner` and gives an `Outer`. A layer that gives the type that it takes is `Layer<T>`.

The function that `compose` gives takes the input of the last layer. It gives the result of the first layer. Thus a stack can change the type at each layer.

```ts
import assert from "node:assert/strict";
import { compose, type Layer } from "@mark1russell7/collections/layers";

const toText: Layer<number, string> = (next) => `#${next}`;
const shout: Layer<string> = (next) => next.toUpperCase();
const length: Layer<string, number> = (next) => next.length;

const label: (base: string) => string = compose(shout, toText, length);
assert.equal(label("abc"), "#3");
```

The type `Chain` examines each pair of neighbors. The result of the inner layer must fit the input of the outer layer. The check works for a chain of 100 layers.

A bad pair makes the compiler refuse the call. The compiler marks the first argument, not the bad pair. Its message shows the type that the first bad pair needs.

```ts no-run
import { compose, type Layer } from "@mark1russell7/collections/layers";

const toText: Layer<number, string> = (next) => `#${next}`;
const half: Layer<number> = (next) => next / 2;

// `toText` gives text, but `half` takes a number. The compiler marks `half`, and its message
// needs `Layer<any, number>` at the place of `toText`.
compose(half, toText);
```

## Behaviors on a collection

The root entry has the `compose` for behaviors. A behavior is a layer that adds a capability to a collection, and it keeps each capability of the layers under it. Thus the result type has the capabilities of all the layers and of the base.

```ts
import assert from "node:assert/strict";
import { compose, eventedMap, hashMap, lruMap } from "@mark1russell7/collections";

const cache = compose(eventedMap<string, number>(), lruMap<string, number>({ capacity: 2 }))(hashMap<string, number>());

const sets: string[] = [];
const deletes: string[] = [];
cache.on("set", ({ key }) => sets.push(key));
cache.on("delete", ({ key, reason }) => deletes.push(`${key} (${reason ?? "a call"})`));
cache.set("a", 1);
cache.set("b", 2);
assert.equal(cache.isFull, true);
cache.set("c", 3);

assert.deepEqual(sets, ["a", "b", "c"]);
assert.deepEqual(deletes, ["a (evict)"]);
assert.equal(cache.has("a"), false);
assert.equal(cache.get("c"), 3);
```

`on` comes from `eventedMap`, `isFull` comes from `lruMap`, and `get` comes from the base. The `compose` of `./layers` gives only the type of the first layer. Use the root `compose` when each layer keeps the capabilities under it.

A behavior in a stack sees the calls that come through it. It also hears each removal by a layer below it. In the example, the eviction of `"a"` gives a `delete` event with the reason `"evict"`. The guide [Events and caches](caches.md) shows more stacks.
