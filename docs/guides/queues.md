# Queues

A queue gives its elements in an order. The package has two queues:

| Queue | Order | Add and remove |
| --- | --- | --- |
| `arrayDeque` | first in, first out at one end, or last in, first out | constant time at the two ends |
| `priorityQueue` | the smallest element first, by a comparator | logarithmic time |

For a queue that a consumer waits on with `await`, use `asyncQueue`.

## A queue: first in, first out

`enqueue` adds an element at the end, and `dequeue` removes the element at the start.

```ts
import assert from "node:assert/strict";
import { arrayDeque } from "@mark1russell7/collections";

const jobs = arrayDeque<string>();
jobs.enqueue("build");
jobs.enqueue("test");
jobs.enqueue("deploy");

assert.equal(jobs.peek(), "build");
assert.equal(jobs.dequeue(), "build");
assert.equal(jobs.dequeue(), "test");
assert.equal(jobs.size, 1);
```

## A stack: last in, first out

`push` and `pop` operate at the end of the deque, as `push` and `pop` of an array do. Thus a deque is also a stack. The top of the stack is `peekLast()`. `peek()` reads the start, as a queue does.

```ts
import assert from "node:assert/strict";
import { arrayDeque } from "@mark1russell7/collections";

const undo = arrayDeque<string>();
undo.push("type a");
undo.push("type b");
assert.equal(undo.peekLast(), "type b");
assert.equal(undo.peek(), "type a");

assert.equal(undo.pop(), "type b");
assert.equal(undo.pop(), "type a");
```

The `Deque` of Java has `push` and `pop` at the start. This deque has them at the end.

## The two ends

A deque adds, reads and removes at its two ends: `addFirst` and `addLast`, `peekFirst` and `peekLast`, `removeFirst` and `removeLast`.

```ts
import assert from "node:assert/strict";
import { arrayDeque } from "@mark1russell7/collections";

const deque = arrayDeque([2, 3]);
deque.addFirst(1);
deque.addLast(4);
assert.deepEqual(deque.toArray(), [1, 2, 3, 4]);

assert.equal(deque.peekFirst(), 1);
assert.equal(deque.peekLast(), 4);
assert.equal(deque.removeFirst(), 1);
assert.equal(deque.removeLast(), 4);
assert.deepEqual([...deque], [2, 3]);
```

## An empty queue

On an empty deque, `dequeue`, `peek`, `removeFirst` and `pop` throw. Each operation that throws has a form that gives `undefined`: `peekOrUndefined`, `pollOrUndefined`, `pollFirst`, `pollLast`, `peekFirstOrUndefined` and `peekLastOrUndefined`.

```ts
import assert from "node:assert/strict";
import { arrayDeque } from "@mark1russell7/collections";

const empty = arrayDeque<number>();
assert.throws(() => empty.dequeue());
assert.throws(() => empty.peek());
assert.throws(() => empty.removeFirst());

assert.equal(empty.peekOrUndefined(), undefined);
assert.equal(empty.pollOrUndefined(), undefined);
assert.equal(empty.pollFirst(), undefined);
assert.equal(empty.pollLast(), undefined);
```

## A priority queue

`priorityQueue` gives the smallest element first. The default comparator is `defaultCompare`. Give the option `compare` for a different order.

```ts
import assert from "node:assert/strict";
import { priorityQueue } from "@mark1russell7/collections";

const numbers = priorityQueue([5, 1, 4, 2]);
assert.equal(numbers.peek(), 1);
assert.equal(numbers.poll(), 1);
assert.equal(numbers.poll(), 2);
assert.equal(numbers.size, 2);
```

With a comparator, the queue orders records by a field. To give the largest element first, turn the comparator.

```ts
import assert from "node:assert/strict";
import { priorityQueue } from "@mark1russell7/collections";

type Task = { name: string; priority: number };
const tasks = priorityQueue<Task>({ compare: (a, b) => b.priority - a.priority });
tasks.addAll([
  { name: "lint", priority: 1 },
  { name: "fix the outage", priority: 9 },
  { name: "review", priority: 5 },
]);
assert.equal(tasks.poll().name, "fix the outage");
assert.equal(tasks.poll().name, "review");
```

The iteration and `toArray` of a priority queue use the order of its heap, not the sorted order. `toSortedArray` gives the sorted order, and the queue does not change.

```ts
import assert from "node:assert/strict";
import { priorityQueue } from "@mark1russell7/collections";

const queue = priorityQueue([3, 1, 2, 5, 4]);
assert.deepEqual(queue.toSortedArray(), [1, 2, 3, 4, 5]);
assert.equal(queue.size, 5);
assert.equal(queue.toArray()[0], 1);
```
