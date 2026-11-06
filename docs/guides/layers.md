# Layers

The entry `@mark1russell7/collections/layers` gives `compose` and the types of a stack of layers. It is one file with no imports, and it does no work at load. A program that needs only the fold of a stack, for example a stack of middleware, can import this entry alone.

## A layer

A layer is a function from an inner value to an outer value: `(next: Inner) => Outer`. Usually the inner value is a function or an object, and the outer value wraps it.

```ts
import assert from "node:assert/strict";
import { compose, type Layer } from "@mark1russell7/collections/layers";

type Run = (value: number) => number;

const addOne: Layer<Run> = (next) => (value) => next(value) + 1;
const double: Layer<Run> = (next) => (value) => next(value) * 2;

const run = compose(addOne, double)((value) => value);
assert.equal(run(5), 11);
```

`compose(a, b)(base)` is `a(b(base))`. The first layer is the outermost layer. In the example, `double` wraps the base and `addOne` wraps `double`. Thus a call first goes into `addOne`, then into `double`, then into the base. The values come back out in the opposite order: the base gives 5, `double` gives 10 and `addOne` gives 11.

## The types of a chain

`compose` examines each pair of neighbor layers. The outer value of each layer must fit the inner value of the layer before it. At the first bad pair, the compiler marks that argument.

```ts
import assert from "node:assert/strict";
import { compose, type Layer } from "@mark1russell7/collections/layers";

type Run = (value: number) => number;
type Show = (value: number) => string;

const addOne: Layer<Run> = (next) => (value) => next(value) + 1;
const show: Layer<Run, Show> = (next) => (value) => `value ${next(value)}`;

const text = compose(show, addOne)((value) => value);
assert.equal(text(1), "value 2");

// compose(addOne, show) is a compile error: addOne needs a Run, and show gives a Show.
```

The result of `compose` takes the inner value of the last layer, and it gives the outer value of the first layer. The type of `text` above is `(base: Run) => Show`.

A test of the package compiles a chain of 100 layers. A list of the type `Layer<T>[]`, made at run time, also works. In that list, each layer has the same inner and outer type.

```ts
import assert from "node:assert/strict";
import { compose, type Layer } from "@mark1russell7/collections/layers";

type Run = (value: number) => number;

const layers: Layer<Run>[] = [1, 2, 3].map((step) => (next) => (value) => next(value) + step);
assert.equal(compose(...layers)((value) => value)(0), 6);
```

## The laws

`compose` is a fold, and it obeys these laws. A property test of the package holds each law.

- `compose()` is the identity: `compose()(base)` is `base`.
- One layer stays the same: `compose(a)(base)` is `a(base)`.
- The fold is associative: `compose(a, b, c)` gives the same result as `compose(a, compose(b, c))` and as `compose(compose(a, b), c)`.
- `compose` starts each layer one time, from the last layer to the first.

```ts
import assert from "node:assert/strict";
import { compose, type Layer } from "@mark1russell7/collections/layers";

type Run = (value: number) => number;

const a: Layer<Run> = (next) => (value) => next(value) + 1;
const b: Layer<Run> = (next) => (value) => next(value) * 3;
const c: Layer<Run> = (next) => (value) => next(value) - 2;
const base: Run = (value) => value;

assert.equal(compose()(base), base);
const flat = compose(a, b, c)(base)(10);
assert.equal(compose(a, compose(b, c))(base)(10), flat);
assert.equal(compose(compose(a, b), c)(base)(10), flat);
```

## Layers of collections

The root entry has its own `compose` for the layers of collections, for example `boundedList`, `eventedList` and `safeList`. It uses the same fold. Its result also keeps the capability of each layer, not only the capability of the outermost layer. The guide [Collections](collections.md) shows these layers.

```ts
import assert from "node:assert/strict";
import { arrayList, boundedList, compose, eventedList, safeList } from "@mark1russell7/collections";

const list = compose(
  safeList<number>(),
  eventedList<number>(),
  boundedList<number>({ capacity: 2 })
)(arrayList<number>());

const added: number[] = [];
list.on("add", ({ value }) => added.push(value));
list.add(7);

assert.deepEqual(added, [7]);
assert.equal(list.capacity, 2);
assert.deepEqual(list.safe.get(0), { _tag: "Some", value: 7 });
```

In the example, `on` comes from `eventedList`, `capacity` comes from `boundedList` and `safe` comes from `safeList`.

## The types

| Type | What it is |
| --- | --- |
| `Layer<Inner, Outer>` | A function from `Inner` to `Outer`. `Outer` is `Inner` when you give one type. |
| `InnerOf<L>` | The inner type of the layer `L`. |
| `OuterOf<L>` | The outer type of the layer `L`. |
| `Chain<L>` | The check of each neighbor pair of the tuple `L`. |
| `Composed<L>` | The type of `compose(...L)`: from the inner type of the last layer to the outer type of the first. |
| `Outers<L>` | The intersection of the outer types of the tuple `L`. |
| `Stacked<L>` | The type of the root `compose`: each outer type and the base type together. |
