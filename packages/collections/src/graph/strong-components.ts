/** The strongly connected components of a directed graph, by the algorithm of Tarjan with its own stack. */
export interface StrongComponents {
  /** The index of the component of each node. */
  readonly of: Int32Array;
  /**
   * The nodes of each component, in increasing order. Each component comes after each component that its nodes
   * reach, so the deepest component is first.
   */
  readonly list: readonly (readonly number[])[];
}

/**
 * This function gives the strongly connected components of the directed graph of the nodes `0` to `n - 1`, in its
 * compact form. The edges of the node `v` go to the items of `targets` from `start[v]` up to `start[v + 1]`.
 *
 * - Each component comes after each component that its nodes reach: the deepest component is first, as Tarjan gives them.
 * - The nodes of a component are in increasing order. A node on no cycle is a component of one node.
 * - The search keeps its own stack in arrays, so a chain of 100000 nodes does not overflow the stack of the host.
 * - A bad `n`, a bad `start`, or a target outside the nodes, throws a `RangeError`.
 *
 * The function is pure. It keeps no state, and it does not change its arguments.
 */
export function strongComponentsCompact(n: number, start: ArrayLike<number>, targets: ArrayLike<number>): StrongComponents {
  if (!Number.isInteger(n) || n < 0) throw new RangeError(`The count of the nodes is a whole number from 0, not ${n}.`);
  if (start.length < n + 1) throw new RangeError(`The array start has ${n + 1} items or more, not ${start.length}.`);
  for (let v = 0; v < n; v += 1) {
    const from = start[v]!;
    const to = start[v + 1]!;
    if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < from || to > targets.length) {
      throw new RangeError(`The edges of the node ${v} go from ${from} up to ${to}, outside the ${targets.length} targets.`);
    }
    for (let e = from; e < to; e += 1) {
      const t = targets[e]!;
      if (!Number.isInteger(t) || t < 0 || t >= n) {
        throw new RangeError(`An edge of the node ${v} goes to ${t}, but the nodes go from 0 to ${n - 1}.`);
      }
    }
  }
  const order = new Int32Array(n).fill(-1);
  const low = new Int32Array(n);
  const of = new Int32Array(n).fill(-1);
  // The nodes of the components that are still open, and a mark for each of them.
  const open = new Int32Array(n);
  const onOpen = new Uint8Array(n);
  // The stack of the search: a node, and the position of its next edge.
  const calls = new Int32Array(n);
  const next = new Int32Array(n);
  const list: number[][] = [];
  let top = 0;
  let count = 0;
  const enter = (node: number, depth: number): void => {
    order[node] = count;
    low[node] = count;
    count += 1;
    open[top] = node;
    top += 1;
    onOpen[node] = 1;
    calls[depth] = node;
    next[depth] = start[node]!;
  };
  for (let root = 0; root < n; root += 1) {
    if (order[root] !== -1) continue;
    enter(root, 0);
    let depth = 1;
    while (depth > 0) {
      const node = calls[depth - 1]!;
      const edge = next[depth - 1]!;
      if (edge < start[node + 1]!) {
        next[depth - 1] = edge + 1;
        const to = targets[edge]!;
        if (order[to] === -1) {
          enter(to, depth);
          depth += 1;
        } else if (onOpen[to] === 1 && order[to]! < low[node]!) {
          low[node] = order[to]!;
        }
        continue;
      }
      depth -= 1;
      if (low[node] === order[node]) {
        const members: number[] = [];
        let member: number;
        do {
          top -= 1;
          member = open[top]!;
          onOpen[member] = 0;
          of[member] = list.length;
          members.push(member);
        } while (member !== node);
        list.push(members.sort((a, b) => a - b));
      }
      if (depth > 0) {
        const parent = calls[depth - 1]!;
        if (low[node]! < low[parent]!) low[parent] = low[node]!;
      }
    }
  }
  return { of, list };
}

/**
 * This function gives the strongly connected components of a directed graph, with the nodes and a function that gives
 * the successors of a node. It uses `strongComponentsCompact`, so it keeps its own stack too.
 *
 * - Each component comes after each component that its nodes reach: the deepest component is first.
 * - The nodes of a component are in the order of `nodes`. A node on no cycle is a component of one node.
 * - A successor that is not in `nodes` is not an edge. A node that comes two times in `nodes` counts one time.
 * - The function compares the nodes as a `Map` compares its keys.
 *
 * @param nodes - The nodes. Their order gives the order of the search, and the order in each component.
 * @param successors - The function that gives the nodes that an edge from a node reaches.
 * @returns The components, deepest first.
 */
export function stronglyConnectedComponents<Id>(nodes: Iterable<Id>, successors: (node: Id) => Iterable<Id>): Id[][] {
  const ids: Id[] = [];
  const index = new Map<Id, number>();
  for (const id of nodes) {
    if (index.has(id)) continue;
    index.set(id, ids.length);
    ids.push(id);
  }
  const start = new Int32Array(ids.length + 1);
  const targets: number[] = [];
  ids.forEach((id, v) => {
    start[v] = targets.length;
    for (const to of successors(id)) {
      const t = index.get(to);
      if (t !== undefined) targets.push(t);
    }
  });
  start[ids.length] = targets.length;
  return strongComponentsCompact(ids.length, start, targets).list.map((members) => members.map((v) => ids[v]!));
}
