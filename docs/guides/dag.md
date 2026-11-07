# Dependency graphs

The entry `@mark1russell7/collections/dag` operates on a graph of dependencies with no cycles. Each node has an `id` and the ids of its dependencies. The entry gives:

| Function | Result |
| --- | --- |
| `buildLeveledDAG` | the levels of the graph: a node is one level above its highest dependency |
| `getTopologicalOrder` | the nodes, each node after its dependencies |
| `getAncestors`, `getDescendants` | the nodes that a node needs, or the nodes that need it |
| `filterDAGFromRoot` | a node and all the nodes that it needs |
| `executeDAG` | a run of each node, level by level, with a limit of concurrency |

## Levels and the topological order

`buildLeveledDAG` takes a map from each id to its node. `buildNodeMap` makes this map from an array, and `createNode` makes a node.

Level 0 has the leaves: the nodes with no dependencies. A node at level `n` has its highest dependency at level `n - 1`. The nodes of one level do not depend on each other, so they can run at the same time.

```ts
import assert from "node:assert/strict";
import { buildLeveledDAG, buildNodeMap, createNode, getTopologicalOrder } from "@mark1russell7/collections/dag";

const nodes = buildNodeMap([
  createNode("app", ["api", "ui"]),
  createNode("api", ["core"]),
  createNode("ui", ["core"]),
  createNode("core"),
]);
const dag = buildLeveledDAG(nodes);

assert.deepEqual(dag.levels.map((level) => level.map((node) => node.id)), [["core"], ["api", "ui"], ["app"]]);
assert.deepEqual(dag.leaves, ["core"]);
assert.deepEqual(dag.roots, ["app"]);
assert.deepEqual(getTopologicalOrder(dag).map((node) => node.id), ["core", "api", "ui", "app"]);
```

The leaves have no dependencies, and the roots have no dependents. `buildLeveledDAG` also writes the level into the field `level` of each node of the map. It does not copy the nodes.

```ts
import assert from "node:assert/strict";
import { buildLeveledDAG, buildNodeMap, createNode } from "@mark1russell7/collections/dag";

const nodes = buildNodeMap([createNode("b", ["a"]), createNode("a")]);
buildLeveledDAG(nodes);
assert.equal(nodes.get("a")!.level, 0);
assert.equal(nodes.get("b")!.level, 1);
```

## Dependencies outside the graph

A dependency that is not a node of the map does not count. A node with only such dependencies is a leaf, at level 0. Thus you can make the graph of a part of a project, and ignore the packages outside it.

```ts
import assert from "node:assert/strict";
import { buildLeveledDAG, buildNodeMap, createNode } from "@mark1russell7/collections/dag";

const dag = buildLeveledDAG(buildNodeMap([createNode("app", ["lib", "node:fs"]), createNode("lib", ["node:path"])]));
assert.deepEqual(dag.leaves, ["lib"]);
assert.deepEqual(dag.levels.map((level) => level.map((node) => node.id)), [["lib"], ["app"]]);
```

## Cycles

A graph with a cycle has no topological order. `buildLeveledDAG` throws an error that names the nodes that it could not put on a level. These are the nodes of the cycle, and the nodes that depend on them.

```ts
import assert from "node:assert/strict";
import { buildLeveledDAG, buildNodeMap, createNode } from "@mark1russell7/collections/dag";

const nodes = buildNodeMap([createNode("a", ["b"]), createNode("b", ["a"]), createNode("c", ["a"]), createNode("d")]);
assert.throws(() => buildLeveledDAG(nodes), { message: "Circular dependency detected involving: a, b, c" });
```

## Ancestors, descendants and a part of the graph

`getAncestors` gives the ids of the nodes that a node needs, directly or through other nodes. `getDescendants` gives the ids of the nodes that need it. The node itself is not in the result.

`filterDAGFromRoot` gives a new map with the node and its ancestors. Use it to run only the work that one node needs.

```ts
import assert from "node:assert/strict";
import { buildLeveledDAG, buildNodeMap, createNode, filterDAGFromRoot, getAncestors, getDescendants } from "@mark1russell7/collections/dag";

const nodes = buildNodeMap([
  createNode("app", ["api", "ui"]),
  createNode("api", ["core"]),
  createNode("ui", ["core"]),
  createNode("core"),
  createNode("docs"),
]);

assert.deepEqual([...getAncestors(nodes, "api")], ["core"]);
assert.deepEqual([...getDescendants(nodes, "core")].sort(), ["api", "app", "ui"]);

const forApi = filterDAGFromRoot(nodes, "api");
assert.deepEqual([...forApi.keys()], ["api", "core"]);
assert.deepEqual(buildLeveledDAG(forApi).levels.map((level) => level.map((node) => node.id)), [["core"], ["api"]]);
```

## A run of the graph

`executeDAG` runs a processor on each node. It runs the levels one after the other, and the nodes of one level at the same time. The option `concurrency` sets the maximum number of nodes that run at the same time. The default is 4. `executeDAGSequential` runs one node at a time.

`createProcessor` makes a processor from an `async` function. A function that throws gives a failed result.

```ts
import assert from "node:assert/strict";
import { buildLeveledDAG, buildNodeMap, createNode, createProcessor, executeDAG } from "@mark1russell7/collections/dag";

const dag = buildLeveledDAG(buildNodeMap([
  createNode("app", ["api", "ui"]),
  createNode("api", ["core"]),
  createNode("ui", ["core"]),
  createNode("core"),
]));

const built: string[] = [];
let running = 0;
let most = 0;
const result = await executeDAG(dag, createProcessor(async (node) => {
  running += 1;
  most = Math.max(most, running);
  await new Promise((resolve) => setTimeout(resolve, 5));
  built.push(node.id);
  running -= 1;
}), { concurrency: 2 });

assert.equal(result.success, true);
assert.equal(built[0], "core");
assert.equal(built[3], "app");
assert.equal(most, 2);
assert.deepEqual(result.results.get("app")!.logs, ["Starting app", "Completed app"]);
```

## Failures

A processor that throws does not reject the run. The run records a failed result for the node, with the error.

With `skipDependents` (the default is `true`), a node does not start when one of its dependencies failed or did not start. Its result has `skipped: true`. `failedNodes` has the nodes whose processor failed, and `skippedNodes` has the nodes that did not start. The run has `success: false` when one of the two lists is not empty.

With `failFast` (the default is `true`), no level starts after a level with a failure. Each node of the level with the failure runs, also a node that did not start before the failure. Thus `failFast` stops the run at the end of a level, not at the failed node.

```ts
import assert from "node:assert/strict";
import { buildLeveledDAG, buildNodeMap, createNode, createProcessor, executeDAG } from "@mark1russell7/collections/dag";

const dag = buildLeveledDAG(buildNodeMap([
  createNode("a"),
  createNode("b"),
  createNode("c"),
  createNode("top", ["a"]),
]));
const started: string[] = [];
const processor = createProcessor(async (node) => {
  started.push(node.id);
  if (node.id === "a") throw new Error("a broke");
});

const stopped = await executeDAG(dag, processor, { concurrency: 1 });
assert.deepEqual(started, ["a", "b", "c"]);
assert.deepEqual(stopped.failedNodes, ["a"]);
assert.equal(stopped.results.get("a")!.error!.message, "a broke");
assert.equal(stopped.results.has("top"), false);

started.length = 0;
const continued = await executeDAG(dag, processor, { concurrency: 1, failFast: false });
assert.deepEqual(started, ["a", "b", "c"]);
assert.deepEqual(continued.skippedNodes, ["top"]);
assert.equal(continued.results.get("top")!.skipped, true);
assert.equal(continued.success, false);
```

## Progress

`onNodeStart` and `onNodeComplete` tell the progress of a run. A listener that throws does not stop the run: the result of the node gets a log line with the error. A node that did not start (`skipped: true`) calls neither listener.

```ts
import assert from "node:assert/strict";
import { buildLeveledDAG, buildNodeMap, createNode, createProcessor, executeDAG } from "@mark1russell7/collections/dag";

const dag = buildLeveledDAG(buildNodeMap([createNode("a"), createNode("b", ["a"])]));
const events: string[] = [];
const result = await executeDAG(dag, createProcessor(async (node) => {
  if (node.id === "a") throw new Error("no");
}), {
  failFast: false,
  onNodeStart: (node) => events.push(`start ${node.id}`),
  onNodeComplete: (done) => {
    events.push(`end ${done.node.id}`);
    throw new Error("the listener broke");
  },
});

assert.deepEqual(events, ["start a", "end a"]);
assert.ok(result.results.get("a")!.logs.includes("onNodeComplete threw: the listener broke"));
assert.equal(result.results.get("b")!.skipped, true);
```
