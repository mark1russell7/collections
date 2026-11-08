# Graph orders

The entry `@mark1russell7/collections/graph` has pure functions on graphs. It imports no other package. It has `hubBreadthFirstOrder` and a search of the strongly connected components.

## The order from the hubs

`hubBreadthFirstOrder(n, edges, compare)` gives an order of the nodes `0` to `n - 1` of an undirected graph. Each edge joins the nodes `a` and `b`, with a `weight` above 0. The default weight is 1.

- The hub of a component is its node with the largest sum of edge weights.
- The order starts at the node with the largest sum, and goes breadth-first through its component.
- Then the order starts at the hub of the next component. The components come in the order of the sums of their hubs.

Use the order to put the nodes of a diagram on a grid. Then each node is near its neighbours, and the hubs come first.

```ts
import assert from "node:assert/strict";
import { hubBreadthFirstOrder } from "@mark1russell7/collections/graph";

// A star with the hub 3, and a pair 0 to 1 that is a second component
const edges = [
  { a: 3, b: 2 },
  { a: 3, b: 4 },
  { a: 3, b: 5 },
  { a: 0, b: 1 },
];
assert.deepEqual(hubBreadthFirstOrder(6, edges), [3, 2, 4, 5, 0, 1]);
```

## Weights

The weight of an edge counts in the sum of its two nodes. Two edges between the same nodes count two times. An edge from a node to itself adds no weight.

```ts
import assert from "node:assert/strict";
import { hubBreadthFirstOrder } from "@mark1russell7/collections/graph";

// The path 0 - 1 - 2 - 3. The nodes 1 and 2 have the sum 2, and the lower index wins the tie.
const path = [{ a: 0, b: 1 }, { a: 1, b: 2 }, { a: 2, b: 3 }];
assert.deepEqual(hubBreadthFirstOrder(4, path), [1, 0, 2, 3]);

// The weight 5 on the edge 2 - 3 makes 2 the hub (the sum 6)
assert.deepEqual(hubBreadthFirstOrder(4, [path[0]!, path[1]!, { a: 2, b: 3, weight: 5 }]), [2, 1, 3, 0]);

// A second edge 2 - 3 also makes 2 the hub (the sum 3)
assert.deepEqual(hubBreadthFirstOrder(4, [...path, { a: 3, b: 2 }]), [2, 1, 3, 0]);

// An edge from 0 to itself changes nothing
assert.deepEqual(hubBreadthFirstOrder(4, [...path, { a: 0, b: 0, weight: 50 }]), [1, 0, 2, 3]);
```

## Ties

When two nodes have the same sum of weights, `compare` puts them in order. When `compare` gives 0, the lower index comes first. `compare` also puts the neighbours of a node in order. The default `compare` gives 0 for each pair.

Without edges, each node is its own component. Then the order is the order of `compare`.

```ts
import assert from "node:assert/strict";
import { hubBreadthFirstOrder } from "@mark1russell7/collections/graph";

const names = ["delta", "alpha", "charlie", "bravo"];
const byName = (i: number, j: number) => names[i]!.localeCompare(names[j]!);

assert.deepEqual(hubBreadthFirstOrder(4), [0, 1, 2, 3]);
assert.deepEqual(hubBreadthFirstOrder(4, [], byName), [1, 3, 2, 0]);
// The hub 0 has three neighbours of the same weight: compare puts them in order of the name
assert.deepEqual(hubBreadthFirstOrder(4, [{ a: 0, b: 1 }, { a: 0, b: 2 }, { a: 0, b: 3 }], byName), [0, 1, 3, 2]);
```

## Bad input

The function throws a `RangeError` for a bad count of nodes or for an edge to an index outside the nodes. It also throws for a weight that is not a finite number above 0. It does not change its arguments.

```ts
import assert from "node:assert/strict";
import { hubBreadthFirstOrder } from "@mark1russell7/collections/graph";

assert.throws(() => hubBreadthFirstOrder(-1), RangeError);
assert.throws(() => hubBreadthFirstOrder(2, [{ a: 0, b: 2 }]), RangeError);
assert.throws(() => hubBreadthFirstOrder(2, [{ a: 0, b: 1, weight: 0 }]), RangeError);
assert.throws(() => hubBreadthFirstOrder(2, [{ a: 0, b: 1, weight: Number.NaN }]), RangeError);

const edges = Object.freeze([Object.freeze({ a: 1, b: 0 })]);
assert.deepEqual(hubBreadthFirstOrder(2, edges), [0, 1]);
```

## The strongly connected components

A strongly connected component of a directed graph is a largest set of nodes in which each node reaches each other node. The nodes of a cycle are in one component. A node on no cycle is a component of one node.

`stronglyConnectedComponents(nodes, successors)` gives the components. The function `successors` gives the nodes that the edges from a node reach.

- Each component comes after each component that its nodes reach. Thus the deepest component is first, as the algorithm of Tarjan gives them.
- The nodes of a component are in the order of `nodes`.
- A successor that is not in `nodes` is not an edge.

```ts
import assert from "node:assert/strict";
import { stronglyConnectedComponents } from "@mark1russell7/collections/graph";

// The cycle a, b, c reads d, and e reads the cycle.
const next: Record<string, string[]> = { a: ["b"], b: ["c"], c: ["a", "d"], d: [], e: ["a"] };
const found = stronglyConnectedComponents(["a", "b", "c", "d", "e"], (node) => next[node] ?? []);
assert.deepEqual(found, [["d"], ["a", "b", "c"], ["e"]]);
```

`strongComponentsCompact(n, start, targets)` is the same search on the nodes `0` to `n - 1`, in a compact form. The edges of the node `v` go to the items of `targets` from `start[v]` up to `start[v + 1]`. The result has the list of the components, and `of`, the index of the component of each node. Use this form for a large graph or for your own rules of the edges.

Both functions keep their own stack, so a chain of 100000 nodes does not overflow the stack of the host. A bad count, a bad `start` or a target outside the nodes throws a `RangeError`.

```ts
import assert from "node:assert/strict";
import { strongComponentsCompact } from "@mark1russell7/collections/graph";

// The edges 0 to 1, 1 to 0 and 1 to 2
const { of, list } = strongComponentsCompact(3, [0, 1, 3, 3], [1, 0, 2]);
assert.deepEqual(list, [[2], [0, 1]]);
assert.deepEqual([...of], [1, 1, 0]);
assert.throws(() => strongComponentsCompact(2, [0, 1, 1], [2]), RangeError);
```
