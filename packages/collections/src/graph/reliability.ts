/**
 * The arithmetic of `twoTerminalReliability`: a commutative ring with one, and an order. The rationals and the floats
 * are examples. The function uses only these operations, so a ring of exact fractions gives an exact result.
 */
export interface OrderedRing<N> {
  readonly zero: N;
  readonly one: N;
  readonly add: (a: N, b: N) => N;
  readonly sub: (a: N, b: N) => N;
  readonly mul: (a: N, b: N) => N;
  /**
   * This function gives the order of `a` and `b`. The number is below 0 when `a` is less, and above 0 when `a` is more.
   * It is 0 when they are equal, and `NaN` when they have no order.
   */
  readonly compare: (a: N, b: N) => number;
}

/** The ring of the JavaScript numbers. Each operation rounds to the nearest float. `NaN` has no order. */
export const NUMBER_RING: OrderedRing<number> = {
  zero: 0,
  one: 1,
  add: (a, b) => a + b,
  sub: (a, b) => a - b,
  mul: (a, b) => a * b,
  compare: (a, b) => (a < b ? -1 : a > b ? 1 : a === b ? 0 : Number.NaN),
};

/** A directed edge of `twoTerminalReliability`. It works with the chance `chance`, and it fails else. */
export interface ReliabilityEdge<Node, N> {
  readonly from: Node;
  readonly to: Node;
  /** The chance that the edge works, from zero to one of the ring. */
  readonly chance: N;
}

/** The options of `twoTerminalReliability`. */
export interface ReliabilityOptions {
  /** The most edges of a path. A longer path does not count. A whole number from 0, or `Infinity`, the default. */
  readonly hopCap?: number | undefined;
  /** The largest count of steps. A step is one edge of the path search, or one state of the expansion. The default is 1000000. */
  readonly maxSteps?: number | undefined;
}

/** A path from the source to the target. It goes through no node two times. */
export interface ReliabilityPath<N> {
  /** The indices of the edges of the path, in the order from the source to the target. */
  readonly edges: readonly number[];
  /** The product of the chances of the edges of the path. */
  readonly chance: N;
}

/**
 * The result of `twoTerminalReliability`. The paths are each path of `hopCap` edges or fewer that goes through no
 * node two times. They come from the largest chance to the smallest. Two paths with the same chance are in the order of their edge indices.
 *
 * - `exact`: `value` is the chance that one path or more works. `importance` gives the Birnbaum importance of each
 *   edge, by index: the value when the edge works, minus the value when it fails.
 * - `bounds`: the expansion passed `maxSteps`. `best` and `noisyOr` hold the value.
 * - `partial`: the path search passed `maxSteps`. `best` is the largest chance of the paths that it found. It is a
 *   lower bound of the value, and 1 is the only upper bound.
 *
 * `best` is the chance of the first path, a lower bound of the value. `noisyOr` is one minus the product of the
 * chances that each path fails. It is an upper bound of the value (Esary and Proschan, 1963). With no path, each is 0.
 */
export type TwoTerminalReliability<N> =
  | {
      readonly kind: "exact";
      readonly value: N;
      readonly best: N;
      readonly noisyOr: N;
      readonly importance: readonly N[];
      readonly paths: readonly ReliabilityPath<N>[];
      readonly steps: number;
    }
  | {
      readonly kind: "bounds";
      readonly best: N;
      readonly noisyOr: N;
      readonly paths: readonly ReliabilityPath<N>[];
      readonly steps: number;
    }
  | { readonly kind: "partial"; readonly best: N; readonly paths: readonly ReliabilityPath<N>[]; readonly steps: number };

/**
 * This function gives the chance that the target gets a signal from the source. Each edge works or fails alone, with
 * its chance. The signal goes along a path of `hopCap` edges or fewer, with each edge of the path working. A path
 * goes through no node two times.
 *
 * - The value is exact in the arithmetic of `ring`. A Shannon expansion takes the edges in the order of their indices.
 *   It merges two states with the same paths left, so a graph with few shared edges gives a small expansion.
 * - The same edges in the same order give the same result, bit for bit, with any ring.
 * - Two equal nodes are one node, by the rule of `Map`. An edge from a node to the same node is in no path.
 * - When the source is the target, the one path has no edges, and the value is 1.
 * - A bad `hopCap` or `maxSteps` throws a `RangeError`. A chance out of the range from zero to one also throws a
 *   `RangeError`.
 * - The expansion is exponential in the worst case. `maxSteps` holds the work, and the result tells which part ended.
 *
 * The function is pure. It keeps no state, and it does not change its arguments.
 */
export function twoTerminalReliability<Node, N>(
  edges: readonly ReliabilityEdge<Node, N>[],
  source: Node,
  target: Node,
  ring: OrderedRing<N>,
  options: ReliabilityOptions = {},
): TwoTerminalReliability<N> {
  const hopCap = options.hopCap ?? Number.POSITIVE_INFINITY;
  const maxSteps = options.maxSteps ?? 1_000_000;
  checkCount("hopCap", hopCap);
  checkCount("maxSteps", maxSteps);
  for (const [index, edge] of edges.entries()) {
    if (!(ring.compare(ring.zero, edge.chance) <= 0 && ring.compare(edge.chance, ring.one) <= 0)) {
      throw new RangeError(`The chance of the edge ${index} is from zero to one of the ring.`);
    }
  }

  const search = findPaths(edges, source, target, hopCap, maxSteps);
  const paths = search.found.map((list) => ({ edges: list, chance: chanceOf(ring, edges, list) })).sort((a, b) => {
    const order = ring.compare(b.chance, a.chance);
    return order !== 0 ? order : compareLists(a.edges, b.edges);
  });
  const best = paths[0]?.chance ?? ring.zero;
  if (!search.complete) return { kind: "partial", best, paths, steps: search.steps };

  let fail = ring.one;
  for (const path of paths) fail = ring.mul(fail, ring.sub(ring.one, path.chance));
  const noisyOr = ring.sub(ring.one, fail);

  const diagram = expand(paths, maxSteps - search.steps);
  if (diagram === undefined) return { kind: "bounds", best, noisyOr, paths, steps: maxSteps };
  const { value, importance } = evaluate(diagram, edges, ring);
  return { kind: "exact", value, best, noisyOr, importance, paths, steps: search.steps + diagram.nodes.length };
}

function checkCount(name: string, count: number): void {
  if (!(Number.isInteger(count) || count === Number.POSITIVE_INFINITY) || count < 0) {
    throw new RangeError(`The count ${name} is a whole number from 0, or Infinity, not ${count}.`);
  }
}

/** The rule of `Map`: `NaN` equals `NaN`, and 0 equals -0. */
function same<T>(a: T, b: T): boolean {
  return a === b || (a !== a && b !== b);
}

function chanceOf<Node, N>(ring: OrderedRing<N>, edges: readonly ReliabilityEdge<Node, N>[], list: readonly number[]): N {
  let chance = ring.one;
  for (const index of list) chance = ring.mul(chance, edges[index]!.chance);
  return chance;
}

function compareLists(a: readonly number[], b: readonly number[]): number {
  const length = Math.min(a.length, b.length);
  for (let i = 0; i < length; i += 1) if (a[i] !== b[i]) return a[i]! - b[i]!;
  return a.length - b.length;
}

interface Search {
  readonly found: number[][];
  readonly steps: number;
  readonly complete: boolean;
}

// A depth-first search of the paths that go through no node two times, with an explicit stack, so a long path does not fill the call stack.
function findPaths<Node, N>(edges: readonly ReliabilityEdge<Node, N>[], source: Node, target: Node, hopCap: number, maxSteps: number): Search {
  if (same(source, target)) return { found: [[]], steps: 0, complete: true };
  const out = new Map<Node, number[]>();
  for (const [index, edge] of edges.entries()) {
    if (same(edge.from, edge.to)) continue;
    const list = out.get(edge.from);
    if (list === undefined) out.set(edge.from, [index]);
    else list.push(index);
  }
  const found: number[][] = [];
  const onPath = new Set<Node>([source]);
  const trail: number[] = [];
  const stack: { readonly node: Node; next: number }[] = [{ node: source, next: 0 }];
  let steps = 0;
  while (stack.length > 0) {
    const frame = stack[stack.length - 1]!;
    const list = out.get(frame.node) ?? [];
    if (frame.next >= list.length || trail.length >= hopCap) {
      stack.pop();
      onPath.delete(frame.node);
      if (stack.length > 0) trail.pop();
      continue;
    }
    const index = list[frame.next]!;
    frame.next += 1;
    const to = edges[index]!.to;
    if (onPath.has(to)) continue;
    if (steps >= maxSteps) return { found, steps, complete: false };
    steps += 1;
    if (same(to, target)) {
      found.push([...trail, index]);
      continue;
    }
    if (trail.length + 1 >= hopCap) continue;
    onPath.add(to);
    trail.push(index);
    stack.push({ node: to, next: 0 });
  }
  return { found, steps, complete: true };
}

// The two ends of the expansion. A state with a working path is ONE, and a state with no path left is ZERO.
const ZERO = -1;
const ONE = -2;

/** One state of the expansion: the first edge of its paths, and the states when that edge works and when it fails. */
interface Branch {
  readonly edge: number;
  readonly up: number;
  readonly down: number;
}

interface Diagram {
  readonly root: number;
  readonly nodes: readonly Branch[];
}

/** A path of a state: the index of the path, and the position of its first edge that has no state yet. */
interface Member {
  readonly path: number;
  readonly at: number;
}

// The Shannon expansion. Each state holds the paths that can still work, with the edges that have no state yet.
// The edges of each path are in the order of their indices, so the next edge of the expansion is the first edge of a path.
function expand<N>(paths: readonly ReliabilityPath<N>[], budget: number): Diagram | undefined {
  const sorted = paths.map((path) => [...path.edges].sort((a, b) => a - b));
  // Equal rests of two paths get one id. The ids make the key of a state short.
  const ids = new Map<string, number>();
  const rest = sorted.map((edges) => {
    const list = new Array<number>(edges.length + 1);
    list[edges.length] = 0;
    for (let at = edges.length - 1; at >= 0; at -= 1) {
      const key = `${edges[at]!}/${list[at + 1]!}`;
      let id = ids.get(key);
      if (id === undefined) {
        id = ids.size + 1;
        ids.set(key, id);
      }
      list[at] = id;
    }
    return list;
  });
  const first = (member: Member): number => sorted[member.path]![member.at]!;
  const restId = (member: Member): number => rest[member.path]![member.at]!;

  // The edges of the rest of `small` are each in the rest of `large`.
  const within = (small: Member, large: Member): boolean => {
    const a = sorted[small.path]!;
    const b = sorted[large.path]!;
    let j = large.at;
    for (let i = small.at; i < a.length; i += 1) {
      while (j < b.length && b[j]! < a[i]!) j += 1;
      if (j >= b.length || b[j] !== a[i]) return false;
      j += 1;
    }
    return true;
  };

  const states: Member[][] = [];
  const memo = new Map<string, number>();
  let over = false;
  const intern = (members: readonly Member[]): number => {
    if (members.length === 0) return ZERO;
    if (members.some((member) => member.at === sorted[member.path]!.length)) return ONE;
    const unique = new Map<number, Member>();
    for (const member of members) if (!unique.has(restId(member))) unique.set(restId(member), member);
    // A path whose rest holds the rest of another path adds nothing, so the state drops it.
    const list = [...unique.values()];
    const kept = list.filter((member) => !list.some((other) => other !== member && within(other, member)));
    kept.sort((a, b) => restId(a) - restId(b));
    const key = kept.map(restId).join(",");
    const known = memo.get(key);
    if (known !== undefined) return known;
    if (states.length >= budget) {
      over = true;
      return ZERO;
    }
    memo.set(key, states.length);
    states.push(kept);
    return states.length - 1;
  };

  const root = intern(sorted.map((_, path) => ({ path, at: 0 })));
  const nodes: Branch[] = [];
  for (let index = 0; index < states.length && !over; index += 1) {
    const members = states[index]!;
    let edge = Number.POSITIVE_INFINITY;
    for (const member of members) edge = Math.min(edge, first(member));
    const up = intern(members.map((member) => (first(member) === edge ? { path: member.path, at: member.at + 1 } : member)));
    const down = intern(members.filter((member) => first(member) !== edge));
    nodes.push({ edge, up, down });
  }
  return over ? undefined : { root, nodes };
}

// The value of each state, from the last edge to the first, then the chance to reach each state, from the first edge
// to the last. The importance of an edge is the sum over its states of the chance to reach the state, times the
// value when the edge works minus the value when it fails.
function evaluate<Node, N>(diagram: Diagram, edges: readonly ReliabilityEdge<Node, N>[], ring: OrderedRing<N>): { value: N; importance: N[] } {
  const { root, nodes } = diagram;
  const order = nodes.map((_, index) => index).sort((a, b) => nodes[a]!.edge - nodes[b]!.edge || a - b);
  const values = new Array<N>(nodes.length);
  const valueOf = (ref: number): N => (ref === ZERO ? ring.zero : ref === ONE ? ring.one : values[ref]!);
  for (let i = order.length - 1; i >= 0; i -= 1) {
    const index = order[i]!;
    const { edge, up, down } = nodes[index]!;
    const chance = edges[edge]!.chance;
    values[index] = ring.add(ring.mul(chance, valueOf(up)), ring.mul(ring.sub(ring.one, chance), valueOf(down)));
  }
  const importance = edges.map(() => ring.zero);
  const reach = nodes.map(() => ring.zero);
  if (root >= 0) reach[root] = ring.one;
  for (const index of order) {
    const { edge, up, down } = nodes[index]!;
    const chance = edges[edge]!.chance;
    const here = reach[index]!;
    if (up >= 0) reach[up] = ring.add(reach[up]!, ring.mul(here, chance));
    if (down >= 0) reach[down] = ring.add(reach[down]!, ring.mul(here, ring.sub(ring.one, chance)));
    importance[edge] = ring.add(importance[edge]!, ring.mul(here, ring.sub(valueOf(up), valueOf(down))));
  }
  return { value: valueOf(root), importance };
}
