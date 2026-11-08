# Write a layer

A layer is a function. It gets the collection below it and gives a new collection. The type `Middleware<In, Out>` is this function. `compose` puts layers on a base, and the guide [Layers](layers.md) tells how.

The root of the package has five tools to write a layer:

| Tool | What it does |
| --- | --- |
| `delegate` | replaces some members, and gives the other members of the collection below |
| `enhanceMethod` | puts a function around one method |
| `interceptMethods` | sends each method to one function |
| `blockMethods` | makes some methods throw an error |
| `removalSource` | makes the removal channel of a layer that removes elements by itself |

## Replace a member with delegate

`delegate` gives a proxy. A member of the wrapper replaces the member of the collection below. Each other method is bound to the collection below.

```ts
import assert from "node:assert/strict";
import { arrayList, compose, delegate, type List, type Middleware } from "@mark1russell7/collections";

const trimmed = (): Middleware<List<string>> => (next) =>
  delegate<List<string>, List<string>>(next, {
    add: (value: string) => next.add(value.trim()),
  });

const names = compose(trimmed())(arrayList<string>());
names.add("  Ada ");
names.insert(0, " Alan ");

assert.deepEqual(names.toArray(), [" Alan ", "Ada"]);
```

The layer replaces `add` only. `insert` comes from the list below, so it keeps the spaces. A layer that changes each write replaces each method that writes: `add`, `addAll`, `insert`, `insertAll` and `set`.

## Put a function around one method

`enhanceMethod` gives a layer. Its function gets the method of the collection below and the arguments.

```ts
import assert from "node:assert/strict";
import { arrayList, compose, enhanceMethod, type List } from "@mark1russell7/collections";

const added: string[] = [];
const logged = enhanceMethod<List<string>, "add">("add", (add, [value]) => {
  added.push(value);
  return add(value);
});

const tags = compose(logged)(arrayList<string>());
tags.add("red");
tags.addAll(["green", "blue"]);

assert.deepEqual(added, ["red"]);
assert.deepEqual(tags.toArray(), ["red", "green", "blue"]);
```

`addAll` of `arrayList` writes its storage directly. It does not use `add`, so the layer does not get the two values of `addAll`. Thus a layer around `add` also replaces `addAll`.

## Send each method to one function

`interceptMethods` is not a layer. It gets a collection and gives a proxy. Each method of the proxy goes to the function. Wrap it in a function to make a layer.

```ts
import assert from "node:assert/strict";
import { arrayList, compose, interceptMethods, type List, type Middleware } from "@mark1russell7/collections";

const methods: string[] = [];
const traced = (): Middleware<List<number>> => (next) =>
  interceptMethods(next, (target, method, args) => {
    methods.push(String(method));
    const body = target[method] as unknown as (...values: unknown[]) => unknown;
    return body.apply(target, args);
  });

const list = compose(traced())(arrayList<number>());
list.add(1);
list.addAll([2, 3]);
assert.equal(list.get(0), 1);
assert.equal(list.size, 3);
assert.deepEqual([...list], [1, 2, 3]);

assert.deepEqual(methods, ["add", "addAll", "get"]);
```

The function gets only the methods that have a string as their name. `size` is a property, and `Symbol.iterator` has a name that is a symbol. Thus the function does not get them.

## Block methods

`blockMethods` gives a proxy. Each method in the set throws an `Error` with the message.

```ts
import assert from "node:assert/strict";
import { arrayList, blockMethods } from "@mark1russell7/collections";

const fixed = blockMethods(arrayList([1, 2]), new Set(["clear", "removeAt"]), "The list is fixed");

assert.throws(() => fixed.clear(), { message: "The list is fixed" });
assert.equal(fixed.size, 2);
assert.equal(fixed.get(1), 2);
```

`blockMethods` blocks only the names in the set. A readonly view must block each method that changes the collection. The readonly layers of the root have the full list, so use them for a readonly view. The guide [Behaviors](behaviors.md) tells of them.

## A layer that removes elements by itself

Some layers remove elements by themselves. The bounded layers drop an element, and `lruMap` evicts an entry. A layer above does not get this removal from a method. The removal channel tells it.

- `removalSource(next)` makes the channel of the layer. The channel also forwards each removal of the channel below.
- The layer gives the channel under the key `removals`.
- The layer sends each removal with `emit`, after the collection changed.

```ts
import assert from "node:assert/strict";
import { eventedMap, hashMap, removals, removalSource, type MapLike, type MapRemoval, type Middleware } from "@mark1russell7/collections";

type Prunable<K, V> = MapLike<K, V> & { prune(drop: (value: V, key: K) => boolean): number };

const prunable = <K, V>(): Middleware<MapLike<K, V>, Prunable<K, V>> => (next) => {
  const source = removalSource<MapRemoval<K, V>>(next);
  const prune = (drop: (value: V, key: K) => boolean): number => {
    let count = 0;
    for (const { key, value } of [...next.entries()]) {
      if (!drop(value, key)) continue;
      next.delete(key);
      source.emit({ key, value, reason: "drop" });
      count++;
    }
    return count;
  };
  return new Proxy(next, {
    get(target, prop, receiver) {
      if (prop === removals) return source.channel;
      if (prop === "prune") return prune;
      return Reflect.get(target, prop, receiver);
    },
  }) as Prunable<K, V>;
};

const stock = prunable<string, number>()(hashMap<string, number>());
const shelf = eventedMap<string, number>()(stock);
const log: string[] = [];
shelf.on("delete", ({ key, reason }) => log.push(`${key} (${reason})`));

shelf.set("tea", 0);
shelf.set("cake", 4);
shelf.set("bun", 0);
assert.equal(stock.prune((count) => count === 0), 2);

assert.deepEqual(log.sort(), ["bun (drop)", "tea (drop)"]);
assert.equal(shelf.size, 1);
```

`eventedMap` gets the removals of `prune` from the channel. Thus its `delete` event has the reason `"drop"`. A layer that does not remove needs no channel of its own. A proxy gives each unknown key of its target, so it forwards the channel below. A class that wraps a collection, not a proxy, must give the key `removals` of the collection below.

## Events of your own

`createEmitter` makes an `Emitter` for a map of events. `on` gives a function that removes the listener.

```ts
import assert from "node:assert/strict";
import { createEmitter } from "@mark1russell7/collections";

const events = createEmitter<{ full: { size: number } }>();
const sizes: number[] = [];
const stop = events.on("full", ({ size }) => sizes.push(size));

events.emit("full", { size: 3 });
stop();
events.emit("full", { size: 4 });

assert.deepEqual(sizes, [3]);
```

`StorageListeners` keeps the listeners of one kind of event. `emit` gives the event to each listener, in the order of `add`. The error of a listener goes to a handler, and the other listeners get the event.

```ts
import assert from "node:assert/strict";
import { StorageListeners } from "@mark1russell7/collections";

const errors: unknown[] = [];
const listeners = new StorageListeners<string>((error) => errors.push(error));
const seen: string[] = [];
listeners.add(() => {
  throw new Error("broken");
});
const stop = listeners.add((event) => seen.push(event));

listeners.emit("tea");
stop();
listeners.emit("bun");

assert.deepEqual(seen, ["tea"]);
assert.equal(errors.length, 2);
assert.equal(listeners.size, 1);
```

The default handler is `reportListenerError`. It throws the error again in a microtask, as an `EventTarget` does. Thus the error is not lost, and the write that gave the event does not fail.

## The rules of a layer

- A layer gives each member of the collection below that it does not change. A proxy does this with `Reflect.get`.
- The bulk methods of a base write its storage directly. A layer that changes `add` also changes `addAll`, and the same for each bulk method.
- A layer that removes elements by itself gives a removal channel, and sends each removal after the change.
- The four laws of the guide [Layers](layers.md) also apply to a layer of your own. The model tests of `src/contracts` examine them for the layers of the root.

## Known defects

The reading for this guide found two defects. Roadmap row C41 has them.

- `hasCapability` uses the operator `in`. The evented layers give `on` from a proxy, and the proxy has no `has` trap. Thus `hasCapability(eventedList()(arrayList()), "on")` gives `false`, and the example of its doc comment fails. Examine `typeof collection.on === "function"` instead.
- `eventedMap` gives its `set` event after the `set` of the layer below. A layer below that removes the key of the same `set` sends its removal first. Thus a replay of the events gives `delete` and then `set`, and the replay has the key, but the map does not. The layers of the root do not remove the key that they set.
