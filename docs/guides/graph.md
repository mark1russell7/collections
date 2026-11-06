# Graph order

The entry `@mark1russell7/collections/graph` gives `hubBreadthFirstOrder`: an order of the nodes of an undirected weighted graph. The entry has no other imports.

The order starts at the hub of each component and goes breadth-first. Thus the nodes with strong links come near to each other in the order. A layout uses this order, for example, to put the nodes of a diagram in a row.

```ts
import assert from "node:assert/strict";
import { hubBreadthFirstOrder } from "@mark1russell7/collections/graph";

// A path 0 - 1 - 2: node 1 has the largest sum of weights, so it is the hub
assert.deepEqual(hubBreadthFirstOrder(3, [{ a: 0, b: 1 }, { a: 1, b: 2 }]), [1, 0, 2]);
```

## The rules

- The nodes are the numbers `0` to `n - 1`. An edge `{ a, b, weight }` joins the nodes `a` and `b`. The default weight is 1.
- The hub of a component is the node with the largest sum of the weights of its edges.
- The order starts at the hub of the component with the strongest hub. It goes breadth-first, and then goes to the hub of the next component.
- The function `compare`, then the lower index, breaks a tie between two hubs. They also put the neighbors of a node in order.
- A node with no edges is a component alone.
- An edge from a node to itself adds no weight.

```ts
import assert from "node:assert/strict";
import { hubBreadthFirstOrder } from "@mark1russell7/collections/graph";

const edges = [
  { a: 0, b: 1, weight: 1 },
  { a: 2, b: 3, weight: 5 },
  { a: 3, b: 4, weight: 1 },
];

// The component 2 - 3 - 4 has the strongest hub, 3. The component 0 - 1 comes next. Node 5 has no edges.
assert.deepEqual(hubBreadthFirstOrder(6, edges), [3, 2, 4, 0, 1, 5]);

// A compare function that puts the larger index first changes the order of the ties: the hubs of equal weight and the neighbors
assert.deepEqual(hubBreadthFirstOrder(6, edges, (i, j) => j - i), [3, 4, 2, 1, 0, 5]);
```

## Errors

The function throws a `RangeError` in these cases:

- `n` is not a whole number from 0.
- An edge has an index outside `0` to `n - 1`.
- A weight is not a finite number above 0.

```ts
import assert from "node:assert/strict";
import { hubBreadthFirstOrder } from "@mark1russell7/collections/graph";

assert.throws(() => hubBreadthFirstOrder(2, [{ a: 0, b: 2 }]), RangeError);
assert.throws(() => hubBreadthFirstOrder(2, [{ a: 0, b: 1, weight: 0 }]), RangeError);
```

The function is pure. It keeps no state, and it does not change its arguments.
