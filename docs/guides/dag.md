# Dependency graphs

The entry `@mark1russell7/collections/dag` puts the nodes of a dependency graph into levels, and starts the levels in order. A node starts only after each node of the levels below it. The nodes of one level operate at the same time, up to a limit.

## Nodes

A node has an `id` and the ids of the nodes that it depends on. A node can also carry `data` of any type.

```ts
import assert from "node:assert/strict";
import { buildNodeMap, createNode } from "@mark1russell7/collections/dag";

const nodes = buildNodeMap([
  createNode("app", ["ui", "api"]),
  createNode("ui", ["core"]),
  createNode("api", ["core"]),
  createNode("core", [], { path: "packages/core" }),
]);

assert.equal(nodes.size, 4);
assert.deepEqual(nodes.get("core")?.data, { path: "packages/core" });
```

`buildNodeMap` makes the map from the ids to the nodes. The other functions of the entry take this map.

## Levels

`buildLeveledDAG` puts each node into a level. Level 0 has the nodes with no dependencies. Level `n` has the nodes whose dependencies are all in the levels below `n`, with at least one in level `n - 1`.

```ts
import assert from "node:assert/strict";
import { buildLeveledDAG, buildNodeMap, createNode, getTopologicalOrder } from "@mark1russell7/collections/dag";

const dag = buildLeveledDAG(
  buildNodeMap([
    createNode("app", ["ui", "api"]),
    createNode("ui", ["core"]),
    createNode("api", ["core"]),
    createNode("core"),
  ])
);

assert.deepEqual(dag.levels.map((level) => level.map((node) => node.id)), [["core"], ["ui", "api"], ["app"]]);
assert.deepEqual(dag.leaves, ["core"]);
assert.deepEqual(dag.roots, ["app"]);
assert.deepEqual(getTopologicalOrder(dag).map((node) => node.id), ["core", "ui", "api", "app"]);
```

- `dag.leaves` has the nodes with no dependencies. `dag.roots` has the nodes that no node depends on.
- `getTopologicalOrder` gives the levels as one list. Each node comes after each of its dependencies.
- A dependency that is not in the map does not count. Thus a node can name a package outside the graph.
- `buildLeveledDAG` writes the number of its level into the field `level` of each node. It changes the nodes of the map.

A cycle has no levels, so `buildLeveledDAG` throws an error with the ids of the nodes in the cycle and of the nodes after it.

```ts
import assert from "node:assert/strict";
import { buildLeveledDAG, buildNodeMap, createNode } from "@mark1russell7/collections/dag";

const cyclic = buildNodeMap([createNode("a", ["b"]), createNode("b", ["a"]), createNode("c")]);
assert.throws(() => buildLeveledDAG(cyclic), /Circular dependency detected involving: a, b/);
```

## A run of the levels

`executeDAG` starts a processor for each node, one level after the other. In one level, at most `concurrency` nodes operate at the same time. The default limit is 4.

```ts
import assert from "node:assert/strict";
import { buildLeveledDAG, buildNodeMap, createNode, createProcessor, executeDAG } from "@mark1russell7/collections/dag";

const dag = buildLeveledDAG(
  buildNodeMap([createNode("app", ["ui", "api"]), createNode("ui", ["core"]), createNode("api", ["core"]), createNode("core")])
);

const built: string[] = [];
const result = await executeDAG(
  dag,
  createProcessor(async (node) => {
    built.push(node.id);
  }),
  { concurrency: 2 }
);

assert.equal(result.success, true);
assert.equal(built[0], "core");
assert.equal(built[3], "app");
assert.deepEqual(result.failedNodes, []);
assert.deepEqual(result.results.get("core")?.logs, ["Starting core", "Completed core"]);
```

`createProcessor` makes a processor from an async function. The processor catches an error of the function and gives a failed result with the error and a log. A processor that you write yourself gives a `NodeResult`.

### Failures

- A processor that throws does not stop the run with a rejection. The run records a failed result for the node.
- With `failFast: true`, the default, the run starts no new level after a level with a failure. The other nodes of that level finish.
- With `failFast: false`, the run starts each level. A node whose dependency failed also starts, so the processor must examine the results of the dependencies itself.
- `result.success` is true only when no node failed. `result.failedNodes` has the ids of the failed nodes.

```ts
import assert from "node:assert/strict";
import { buildLeveledDAG, buildNodeMap, createNode, createProcessor, executeDAG } from "@mark1russell7/collections/dag";

const dag = buildLeveledDAG(buildNodeMap([createNode("app", ["core"]), createNode("core")]));
const broken = createProcessor(async (node) => {
  if (node.id === "core") throw new Error("no disk");
});

const stopped = await executeDAG(dag, broken);
assert.equal(stopped.success, false);
assert.deepEqual(stopped.failedNodes, ["core"]);
assert.equal(stopped.results.has("app"), false);

const continued = await executeDAG(dag, broken, { failFast: false });
assert.equal(continued.results.get("app")?.success, true);
```

The options `onNodeStart` and `onNodeComplete` take a function for each node. An error of one of these functions does not stop the run. It goes into the logs of the result of the node. `executeDAGSequential` is `executeDAG` with a limit of 1.

## Parts of a graph

- `filterDAGFromRoot(nodes, id)` gives the node `id` and each node that it depends on, transitively. Use it to start one target and its dependencies only.
- `getAncestors(nodes, id)` gives the ids of each node that `id` depends on, transitively.
- `getDescendants(nodes, id)` gives the ids of each node that depends on `id`, transitively. Use it to find what a change of `id` touches.

```ts
import assert from "node:assert/strict";
import { buildNodeMap, createNode, filterDAGFromRoot, getAncestors, getDescendants } from "@mark1russell7/collections/dag";

const nodes = buildNodeMap([
  createNode("app", ["ui", "api"]),
  createNode("ui", ["core"]),
  createNode("api", ["core"]),
  createNode("core"),
  createNode("docs"),
]);

assert.deepEqual([...filterDAGFromRoot(nodes, "ui").keys()], ["ui", "core"]);
assert.deepEqual([...getAncestors(nodes, "app")].sort(), ["api", "core", "ui"]);
assert.deepEqual([...getDescendants(nodes, "core")].sort(), ["api", "app", "ui"]);
```

`visualizeDAG(dag)` gives a text of the levels, with the dependencies of each node, for a log.
