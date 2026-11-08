# Async queues and tasks

The root entry has three tools for work that waits on promises:

| Name | What it does |
| --- | --- |
| `asyncQueue` | a queue that a consumer waits on with `await`, with a capacity that makes a producer wait |
| `semaphore` | a bound on the tasks that are in progress at the same time |
| `asSettled` | the result of each promise, in the order that the promises settle |

For a queue with no wait, use `arrayDeque` (refer to [Queues](queues.md)). The channels are in `@mark1russell7/service/channel`. Version 0.10.0 of collections removed them.

## A producer and a consumer

`put` adds an element, and `take` removes the first element. A consumer can also read the queue with `for await`. The loop stops when the queue is closed and empty.

```ts
import assert from "node:assert/strict";
import { asyncQueue } from "@mark1russell7/collections";

const jobs = asyncQueue<string>();
const producer = (async () => {
  for (const job of ["build", "test", "deploy"]) await jobs.put(job);
  jobs.close();
})();

const done: string[] = [];
for await (const job of jobs) done.push(job);
await producer;

assert.deepEqual(done, ["build", "test", "deploy"]);
assert.equal(jobs.isClosed, true);
```

## Backpressure: a capacity

A queue with a capacity is full when it holds that number of elements. Then `put` waits until a `take` makes space. Thus a fast producer cannot fill the memory. With no capacity, the queue has no bound.

```ts
import assert from "node:assert/strict";
import { asyncQueue } from "@mark1russell7/collections";

const queue = asyncQueue<number>({ capacity: 2 });
await queue.put(1);
await queue.put(2);
assert.equal(queue.isFull, true);
assert.equal(queue.remainingCapacity, 0);

// The third put waits, and it keeps its element
let added = false;
const third = queue.put(3).then(() => {
  added = true;
});
await Promise.resolve();
assert.equal(added, false);
assert.equal(queue.getStats().waitingPutters, 1);

// A take makes space, so the waiting element goes into the queue
assert.equal(await queue.take(), 1);
await third;
assert.equal(added, true);
assert.deepEqual(queue.drain(), [2, 3]);
```

`drain` removes all the elements and gives them in an array. It also takes the elements of the waiting puts, and their promises resolve.

## A capacity of 0: a handoff

A queue with a capacity of 0 holds no element. A `put` waits until a `take` gets its element. Thus the producer knows that a consumer has the element.

```ts
import assert from "node:assert/strict";
import { asyncQueue } from "@mark1russell7/collections";

const handoff = asyncQueue<string>({ capacity: 0 });

// No consumer waits, so tryPut does not add the element
assert.equal(handoff.tryPut("a"), false);

// A consumer waits, so tryPut gives the element to it
const taken = handoff.take();
assert.equal(handoff.tryPut("b"), true);
assert.equal(await taken, "b");

// A put waits until a take. A peek sees the element of the waiting put
let delivered = false;
const put = handoff.put("c").then(() => {
  delivered = true;
});
assert.equal(handoff.tryPeek(), "c");
assert.equal(handoff.size, 0);
assert.equal(await handoff.take(), "c");
await put;
assert.equal(delivered, true);
```

## No wait: tryPut, tryTake and the peeks

`tryPut` and `tryTake` do not wait. `tryPut` gives `false` when the queue is full or closed. `tryTake` gives `undefined` when the queue is empty.

`peek` waits for the next element, but it does not remove the element. `tryPeek` gives the next element or `undefined`.

```ts
import assert from "node:assert/strict";
import { asyncQueue } from "@mark1russell7/collections";

const queue = asyncQueue<number>();
assert.equal(queue.tryTake(), undefined);
assert.equal(queue.tryPeek(), undefined);

const next = queue.peek();
assert.equal(queue.tryPut(7), true);
assert.equal(await next, 7);

// The element stays in the queue after a peek
assert.equal(queue.size, 1);
assert.equal(queue.tryTake(), 7);
```

## Timeouts

The option `timeout` gives each `put`, `take` and `peek` a limit in milliseconds. `put` and `take` also take a timeout of their own. At the limit, the promise rejects, and the queue removes the wait.

```ts
import assert from "node:assert/strict";
import { asyncQueue } from "@mark1russell7/collections";

const queue = asyncQueue<number>({ capacity: 1, timeout: 20 });
await assert.rejects(queue.take(), /Take timeout after 20ms/);

await queue.put(1);
await assert.rejects(queue.put(2, 5), /Put timeout after 5ms/);

// The put that timed out left no element and no wait
assert.equal(queue.size, 1);
assert.equal(queue.getStats().waitingPutters, 0);

// A for await loop over a queue with a timeout throws at the limit
const empty = asyncQueue<number>({ timeout: 5 });
await assert.rejects(async () => {
  for await (const value of empty) assert.fail(`no element, but got ${value}`);
}, /Take timeout after 5ms/);
```

## Close

`close` stops the puts. The elements in the queue stay, and a consumer can take them. After the last element, `take` rejects and `for await` stops.

```ts
import assert from "node:assert/strict";
import { asyncQueue } from "@mark1russell7/collections";

const queue = asyncQueue<string>({ capacity: 1 });
await queue.put("a");
const waiting = queue.put("b");
queue.close();

// The waiting put rejects, and a new put rejects
await assert.rejects(waiting, { message: "Queue is closed" });
await assert.rejects(queue.put("c"), { message: "Queue is closed" });
assert.equal(queue.tryPut("c"), false);

// The element in the queue stays
assert.equal(await queue.take(), "a");
await assert.rejects(queue.take(), { message: "Queue is closed and empty" });
```

Each error has one text. A put on a closed queue, new or waiting, gives `Queue is closed`. A take, a peek or a wait on a closed and empty queue gives `Queue is closed and empty`.

The capacity is a whole number of 0 or more, or `Infinity`. A capacity of -1, 1.5 or `NaN` gives a `RangeError`.

## A bound on the tasks: semaphore

`semaphore(permits)` lets at most `permits` tasks be in progress at the same time. `run` starts a task when a permit is free, and it gives the permit back when the task ends. The permit also goes back when the task throws.

```ts
import assert from "node:assert/strict";
import { semaphore } from "@mark1russell7/collections";

const writes = semaphore(2);
let active = 0;
let highest = 0;
const write = async (n: number): Promise<number> => {
  active += 1;
  highest = Math.max(highest, active);
  await new Promise((resolve) => setTimeout(resolve, 5));
  active -= 1;
  return n * 10;
};

const results = await Promise.all([1, 2, 3, 4, 5].map((n) => writes.run(() => write(n))));
assert.deepEqual(results, [10, 20, 30, 40, 50]);
assert.equal(highest, 2);
assert.equal(writes.available, 2);

await assert.rejects(
  writes.run(() => {
    throw new Error("disk full");
  }),
  /disk full/,
);
assert.equal(writes.available, 2);
```

`acquire` gives a permit, and its result is the release of the permit. The waiting callers get the permits in the order that they came. A second call of a release does nothing.

```ts
import assert from "node:assert/strict";
import { semaphore } from "@mark1russell7/collections";

const lock = semaphore(1);
const release = await lock.acquire();
assert.equal(lock.available, 0);

const order: string[] = [];
const first = lock.acquire().then((done) => {
  order.push("first");
  return done;
});
const second = lock.acquire().then((done) => {
  order.push("second");
  return done;
});
assert.equal(lock.waiting, 2);

release();
release(); // This call does nothing
const releaseFirst = await first;
assert.deepEqual(order, ["first"]);
assert.equal(lock.waiting, 1);

releaseFirst();
(await second)();
assert.deepEqual(order, ["first", "second"]);
assert.equal(lock.available, 1);

// The permits are a whole number of 1 or more, or Infinity
assert.throws(() => semaphore(0), RangeError);
```

## Results in settle order: asSettled

`asSettled` gives the result of each promise when the promise settles. The order is the settle order, not the input order. Each result has the index of its promise in the input.

A rejected promise gives a result with `status: "rejected"`, as `Promise.allSettled` does. The loop does not throw it.

```ts
import assert from "node:assert/strict";
import { asSettled } from "@mark1russell7/collections";

const slow = new Promise<string>((resolve) => setTimeout(() => resolve("slow"), 10));
const pages = [slow, Promise.reject(new Error("offline")), Promise.resolve("fast")];

const seen: string[] = [];
const indexes: number[] = [];
for await (const result of asSettled(pages)) {
  indexes.push(result.index);
  seen.push(result.status === "fulfilled" ? result.value : (result.reason as Error).message);
}

assert.deepEqual(indexes, [1, 2, 0]);
assert.deepEqual(seen, ["offline", "fast", "slow"]);
```

`asSettled` starts nothing: the promises are already in progress. When the loop stops early, the other promises continue, and their rejections do not show as unhandled.
