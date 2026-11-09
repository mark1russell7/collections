/**
 * DAG Builder utilities
 */

import type { DAGNode } from "./types.js";

/**
 * This function filters a DAG to the nodes that a root can reach.
 */
export function filterDAGFromRoot<TNode extends DAGNode>(
  nodes: Map<string, TNode>,
  rootId: string
): Map<string, TNode> {
  const filtered = new Map<string, TNode>();
  const visited = new Set<string>();

  function visit(id: string): void {
    if (visited.has(id)) return;
    visited.add(id);

    const node = nodes.get(id);
    if (!node) return;

    filtered.set(id, node);

    for (const dep of node.dependencies) {
      visit(dep);
    }
  }

  visit(rootId);
  return filtered;
}

/**
 * This function gives all ancestors of a node: the nodes that this node depends on, transitively.
 */
export function getAncestors<TNode extends DAGNode>(
  nodes: Map<string, TNode>,
  id: string
): Set<string> {
  const ancestors = new Set<string>();
  const visited = new Set<string>();

  function visit(n: string): void {
    if (visited.has(n)) return;
    visited.add(n);

    const node = nodes.get(n);
    if (!node) return;

    for (const dep of node.dependencies) {
      if (nodes.has(dep)) {
        ancestors.add(dep);
        visit(dep);
      }
    }
  }

  visit(id);
  return ancestors;
}

/**
 * This function gives all descendants of a node: the nodes that depend on this node, transitively.
 */
export function getDescendants<TNode extends DAGNode>(
  nodes: Map<string, TNode>,
  id: string
): Set<string> {
  const descendants = new Set<string>();
  const visited = new Set<string>();

  // Build reverse dependency map
  const dependents = new Map<string, Set<string>>();
  for (const [nodeId, node] of nodes) {
    for (const dep of node.dependencies) {
      if (!dependents.has(dep)) {
        dependents.set(dep, new Set());
      }
      dependents.get(dep)!.add(nodeId);
    }
  }

  function visit(n: string): void {
    if (visited.has(n)) return;
    visited.add(n);

    const deps = dependents.get(n);
    if (!deps) return;

    for (const dep of deps) {
      descendants.add(dep);
      visit(dep);
    }
  }

  visit(id);
  return descendants;
}

/**
 * This function makes a DAG node from a minimal input.
 */
export function createNode<TData = unknown>(
  id: string,
  dependencies: string[] = [],
  data?: TData | undefined
): DAGNode<TData> {
  const node: DAGNode<TData> = { id, dependencies };
  if (data !== undefined) {
    node.data = data;
  }
  return node;
}

/**
 * This function builds a Map of nodes from an array.
 */
export function buildNodeMap<TNode extends DAGNode>(
  nodes: TNode[]
): Map<string, TNode> {
  return new Map(nodes.map((n) => [n.id, n]));
}
