# Graph orders

The entry `@mark1russell7/collections/graph` has pure functions on graphs. It imports no other package. It has `hubBreadthFirstOrder`, a search of the strongly connected components, a search of the minimum hitting set and the two-terminal reliability. It also has three schedules of tasks with dependencies, the shortest path and different alternative paths.

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

## The minimum hitting set

A hitting set of a family of sets has one or more elements of each set. It is the vertex cover of a hypergraph: each set is an edge.

`minimumHittingSet(sets, options)` gives the hitting set with the smallest sum of weights. The search is exact.

- The option `weight` gives the weight of an element: a finite number above 0. The default weight is 1.
- The elements of the result are in the order of their first occurrence in the family.
- The result is `exact` when the search ends. It is `budget` when the search passes `maxSteps`, with the best hitting set that it found. A smaller one can exist.
- A family with an empty set has no hitting set. The result is then `none`, with the index of that set.

A use is the count of the faults that stop a group of services. Each set is the failure domains of one service.

```ts
import assert from "node:assert/strict";
import { minimumHittingSet } from "@mark1russell7/collections/graph";

// Two services use one CDN, and the third service uses no CDN.
const domains = [
  ["provider:a", "cdn:x"],
  ["provider:b", "cdn:x"],
  ["provider:c", "dns:y"],
];
const result = minimumHittingSet(domains);
assert.equal(result.kind, "exact");
if (result.kind === "exact") {
  assert.deepEqual(result.elements, ["cdn:x", "provider:c"]);
  assert.equal(result.weight, 2);
}

// A heavy weight makes the search choose other elements.
const costly = minimumHittingSet([["a", "b"], ["a", "c"]], { weight: (e) => (e === "a" ? 5 : 1) });
assert.deepEqual(costly.kind === "exact" ? costly.elements : [], ["b", "c"]);

assert.deepEqual(minimumHittingSet([["a"], []]), { kind: "none", empty: 1 });
assert.throws(() => minimumHittingSet([["a"]], { weight: () => 0 }), RangeError);
```

## The two-terminal reliability

Each edge of a directed graph works or fails alone, with its chance. The two-terminal reliability is the chance that the target gets a signal from the source. The signal goes along a path of working edges, through no node two times.

`twoTerminalReliability(edges, source, target, ring, options)` gives this chance.

- The option `hopCap` gives the most edges of a path. A longer path does not count. The default is `Infinity`.
- The argument `ring` gives the arithmetic. `NUMBER_RING` uses floats. A ring of exact fractions gives an exact value.
- A Shannon expansion takes the edges in the order of their indices. It merges two states with the same paths left.
- The result `exact` has the `value`, two bounds and the Birnbaum importance of each edge.
- The importance of an edge is the value when the edge works, minus the value when it fails.
- `best` is the chance of the best path. `noisyOr` is one minus the product of the chances that each path fails. The value is between them.
- The result is `bounds` when the expansion passes `maxSteps`. It is `partial` when the path search passes `maxSteps`.
- The paths come from the largest chance to the smallest.
- A step is one edge of the path search, one state of the expansion, or one comparison of two paths in a state. Thus `maxSteps` holds the time.

`pathSetReliability(paths, chances, ring)` gives the chance that one path or more of a given set works. A path is a list of edge indices. Use it for the chance of the paths that an alert shows, alone.

A use is the chance that an outage gets to a person through the services of the person. Two paths that share an edge are not independent, so `noisyOr` is too high.

```ts
import assert from "node:assert/strict";
import { NUMBER_RING, pathSetReliability, twoTerminalReliability } from "@mark1russell7/collections/graph";

// Two services use one DNS provider, and the person uses each service.
const edges = [
  { from: "event", to: "dns", chance: 0.5 },
  { from: "dns", to: "service:a", chance: 0.5 },
  { from: "dns", to: "service:b", chance: 0.5 },
  { from: "service:a", to: "person", chance: 1 },
  { from: "service:b", to: "person", chance: 1 },
];
const result = twoTerminalReliability(edges, "event", "person", NUMBER_RING, { hopCap: 4 });
assert.equal(result.kind, "exact");
if (result.kind === "exact") {
  assert.equal(result.value, 0.375);
  assert.equal(result.best, 0.25);
  assert.equal(result.noisyOr, 0.4375);
  // The DNS edge is in each path, so its importance is the largest.
  assert.deepEqual(result.importance, [0.75, 0.25, 0.25, 0.125, 0.125]);
  assert.deepEqual(result.paths.map((path) => path.edges), [[0, 1, 3], [0, 2, 4]]);
}

// The first path alone explains two thirds of the value.
const shown = pathSetReliability([[0, 1, 3]], edges.map((edge) => edge.chance), NUMBER_RING);
assert.equal(shown.kind === "exact" && shown.value, 0.25);

// Each path has 3 edges. With the hop cap 2, no path counts.
const short = twoTerminalReliability(edges, "event", "person", NUMBER_RING, { hopCap: 2 });
assert.equal(short.kind === "exact" && short.value, 0);
assert.throws(() => twoTerminalReliability([{ from: 0, to: 1, chance: 2 }], 0, 1, NUMBER_RING), RangeError);
```

## Schedules

A task has an id, a duration and the ids of the tasks that end before it starts (`after`). Three functions give a schedule of the tasks.

- `criticalPath(tasks)` gives the earliest and the latest times of each task, its slack, and one critical path. It has no limit of resources.
- `listSchedule(tasks, options)` puts each task on a resource with a count of units. At each time, a free unit starts the ready task with the highest priority.
- `periodSchedule(tasks, options)` puts the tasks into periods, for example days. Each resource has a capacity in each period, for example a count of items that a drawn number gives.

The rules:

- The default priority is the tail of a task: its duration plus the longest chain after it. Thus the longest chain goes first.
- A tie in the priority goes to the first task in the input order. Thus equal inputs give equal schedules.
- With an infinite capacity, `listSchedule` gives the earliest start of `criticalPath` to each task.
- In `periodSchedule`, the capacity of a resource goes first to its started tasks, and then to its ready tasks by priority.
- In `periodSchedule`, a task is ready `gap` periods after the end of its last dependency. The default `gap` is 1.
- `periodSchedule` calls `capacity` for each period and each resource in a fixed order. Thus a seeded stream of draws gives the same schedule each time.
- Two tasks with one id, a dependency that is not a task, or a cycle, give a problem in place of a result.

A use is a roadmap model. Each role ends a count of items a day, drawn from its history. A run of `periodSchedule` with each seed gives a distribution of the end dates.

```ts
import assert from "node:assert/strict";
import { criticalPath, listSchedule, periodSchedule } from "@mark1russell7/collections/graph";

const tasks = [
  { id: "design", duration: 2 },
  { id: "build", duration: 5, after: ["design"] },
  { id: "docs", duration: 1, after: ["design"] },
  { id: "release", duration: 1, after: ["build", "docs"] },
];

const plan = criticalPath(tasks);
assert.equal(plan.kind, "ok");
if (plan.kind === "ok") {
  assert.equal(plan.length, 8);
  assert.deepEqual(plan.path, ["design", "build", "release"]);
  assert.equal(plan.times.get("docs")?.slack, 4);
}

// One person does one task at a time, the longest tail first. Two people do the docs next to the build.
const one = listSchedule(tasks);
assert.equal(one.kind === "ok" && one.makespan, 9);
const two = listSchedule(tasks, { capacity: () => 2 });
assert.equal(two.kind === "ok" && two.makespan, 8);

// Each task is one item. The team ends 1, 0, 2 and 1 items on the days 0 to 3.
const items = tasks.map((task) => ({ ...task, duration: 1 }));
const perDay = [1, 0, 2, 1];
const days = periodSchedule(items, { capacity: (_team, day) => perDay[day] ?? 1 });
assert.equal(days.kind, "ok");
if (days.kind === "ok") {
  assert.equal(days.periods, 4);
  assert.deepEqual(days.byId.get("build"), { id: "build", resource: undefined, start: 2, end: 2, wait: 1 });
}

// Each task of a cycle comes after the task before it.
const loop = criticalPath([{ id: "a", duration: 1, after: ["b"] }, { id: "b", duration: 1, after: ["a"] }]);
assert.deepEqual(loop, { kind: "cycle", cycle: ["b", "a"] });
```

## The shortest path

`shortestPath(edges, from, to, { heuristic })` gives the path with the smallest cost, by the algorithm of Dijkstra on the binary heap of this package.

- Each edge goes from the node `from` to the node `to`, with a `weight`: a finite number from 0. A negative, `NaN` or infinite weight throws a `RangeError`.
- Each edge is directed. Model a one-way road with one edge, and a two-way road with two edges, one in each direction.
- The result `path` has the nodes, the indices of the edges in the edge list, and the cost. The result `none` tells that no path goes to the target.
- When `from` is `to`, the path has one node, no edges and the cost 0.
- The option `heuristic` gives a lower bound of the cost from a node to the target. The search is then A*, and it gives the same cost with fewer steps.

Ties: the search takes the edges of a node in the order of the edge list. A path of the same cost does not replace a path that the search found first. Thus the same edges in the same order always give the same path.

```ts
import assert from "node:assert/strict";
import { shortestPath, type PathEdge } from "@mark1russell7/collections/graph";

// A two-way road a - b - d, a one-way road a - c - d, and a direct road a - d that costs more.
const two = (from: string, to: string, weight: number): PathEdge<string>[] => [
  { from, to, weight },
  { from: to, to: from, weight },
];
const oneWay: PathEdge<string>[] = [
  { from: "a", to: "c", weight: 1 },
  { from: "c", to: "d", weight: 1 },
];
const edges = [...two("a", "b", 2), ...two("b", "d", 2), ...oneWay, ...two("a", "d", 5)];

const there = shortestPath(edges, "a", "d");
assert.equal(there.kind, "path");
if (there.kind === "path") {
  assert.deepEqual(there.nodes, ["a", "c", "d"]);
  assert.deepEqual(there.edges, [4, 5]);
  assert.equal(there.cost, 2);
}

// The one-way road goes from a to d only, so the way back uses the two-way road.
const back = shortestPath(edges, "d", "a");
assert.equal(back.kind === "path" && back.nodes.join(" "), "d b a");

assert.equal(shortestPath(edges, "a", "z").kind, "none");
assert.throws(() => shortestPath([{ from: "a", to: "b", weight: -1 }], "a", "b"), RangeError);
```

A* with a lower bound gives the same cost as the search with no heuristic. A straight-line distance is a lower bound of a road distance.

```ts
import assert from "node:assert/strict";
import { shortestPath, type PathEdge } from "@mark1russell7/collections/graph";

// The points of a small made-up grid, in meters. Each road has its straight length.
const at: Record<string, readonly [number, number]> = { a: [0, 0], b: [100, 0], c: [0, 100], d: [100, 100], e: [200, 100] };
const length = (p: string, q: string): number => Math.hypot(at[p]![0] - at[q]![0], at[p]![1] - at[q]![1]);
const pairs: readonly (readonly [string, string])[] = [["a", "b"], ["a", "c"], ["b", "d"], ["c", "d"], ["d", "e"]];
const roads: PathEdge<string>[] = pairs.map(([p, q]) => ({ from: p, to: q, weight: length(p, q) }));

const plain = shortestPath(roads, "a", "e");
const guided = shortestPath(roads, "a", "e", { heuristic: (node) => length(node, "e") });
assert.ok(plain.kind === "path" && guided.kind === "path");
assert.equal(guided.cost, plain.cost);
assert.equal(guided.cost, 300);
assert.ok(guided.steps <= plain.steps);
```

## Alternative paths

`alternativePaths(edges, from, to, options)` gives the shortest path, and then paths that differ from it. The searches stop at `count` paths (the default is 3), at `maxRounds` searches, or when no path is left.

- The mode `penalty`, the default, multiplies the weight of each edge of the last path by `penalty` (the default is 2). Then it searches again. A later path avoids the earlier edges, but it can use some of them.
- The mode `disjoint` removes the edges of each path before the next search. Thus no two paths share an edge. The order is greedy, so a graph can have more disjoint paths than the result.
- Each path has its true `cost`, with the weights of the edge list. Its `overlap` is the share of its cost on edges of the first path.
- A path with the same edges as an earlier path is not in the result again. The option `maxOverlap` keeps out a path with more overlap.
- An edge with the weight 0 keeps the weight 0 in the mode `penalty`. Use the mode `disjoint` to avoid it.

```ts
import assert from "node:assert/strict";
import { alternativePaths, type PathEdge } from "@mark1russell7/collections/graph";

// Three roads from s to t, and a link from the middle road to the north road.
const edges: PathEdge<string>[] = [
  { from: "s", to: "m", weight: 1 },
  { from: "m", to: "t", weight: 1 },
  { from: "s", to: "n", weight: 2 },
  { from: "n", to: "t", weight: 2 },
  { from: "s", to: "q", weight: 3 },
  { from: "q", to: "t", weight: 3 },
  { from: "m", to: "n", weight: 1 },
];

const { paths } = alternativePaths(edges, "s", "t", { count: 3, penalty: 4 });
assert.deepEqual(
  paths.map((path) => [path.nodes.join(""), path.cost, path.overlap]),
  [
    ["smt", 2, 1],
    ["snt", 4, 0],
    ["sqt", 6, 0],
  ],
);

// No two paths share an edge in the mode disjoint.
const disjoint = alternativePaths(edges, "s", "t", { count: 5, mode: "disjoint" });
assert.deepEqual(
  disjoint.paths.map((path) => path.nodes.join("")),
  ["smt", "snt", "sqt"],
);
```
