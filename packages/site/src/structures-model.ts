/**
 * The state of the structures explorer, with no page code. Each structure is data: its maker, its start values and the
 * operations that the page offers. Each operation starts the real package. The test of this file starts each operation.
 */
import {
  arrayDeque,
  arrayList,
  hashMap,
  hashSet,
  linkedHashMap,
  linkedList,
  priorityQueue,
  summaryTree,
  treeMap,
  treeSet,
  type MapLike,
  type Set as CollectionSet,
  type SummarySpec,
} from "@mark1russell7/collections";

/** The input fields of an operation. */
export type Field = "value" | "index" | "key";

/** The values of the input fields. */
export interface Input {
  readonly value: number;
  readonly index: number;
  readonly key: string;
}

/** The result of an operation. A persistent structure gives its next version in `next`. */
export interface Outcome<S> {
  readonly result?: unknown;
  readonly next?: S;
}

/** One operation of a structure. */
export interface Operation<S> {
  /** The name of the method. */
  readonly name: string;
  /** The input fields that the operation reads, in the order of the arguments. */
  readonly fields: readonly Field[];
  /** The cost of the operation, with `n` the number of elements. */
  readonly cost: string;
  /** This function starts the operation on the structure. */
  readonly run: (structure: S, input: Input) => Outcome<S>;
}

/** The view of a structure: its elements in iteration order, and an optional line of facts. */
export interface View {
  readonly items: readonly string[];
  /** The view `heap` draws the items as the levels of a binary heap. */
  readonly shape: "row" | "heap";
  readonly facts: string;
}

/** A structure of the explorer. */
export interface Structure<S> {
  /** The name of the maker function, which is also the id. */
  readonly maker: string;
  /** The interface of the structure. */
  readonly kind: string;
  /** The name of the variable in the code of the log. */
  readonly variable: string;
  /** One sentence about the structure. */
  readonly summary: string;
  /** The code that makes the start state. */
  readonly start: string;
  /** This function makes the start state. */
  readonly make: () => S;
  readonly view: (structure: S) => View;
  readonly operations: readonly Operation<S>[];
}

/** The monoid of the summary tree of the explorer: the sum of the leaves. */
export const SUM: SummarySpec<number, number> = {
  monoid: { empty: 0, combine: (a, b) => a + b },
  measure: (leaf) => leaf,
};

const row = (items: Iterable<unknown>, facts = ""): View => ({ items: [...items].map(show), shape: "row", facts });
const at = (input: Input): number => input.index;

/** The operations of a list. The two lists differ only in their cost. */
function listOperations<S extends ReturnType<typeof arrayList<number>>>(costs: Readonly<Record<string, string>>): Operation<S>[] {
  const op = (name: string, fields: readonly Field[], run: Operation<S>["run"]): Operation<S> => ({ name, fields, cost: costs[name] ?? "O(n)", run });
  return [
    op("push", ["value"], (list, input) => ({ result: list.push(input.value) })),
    op("unshift", ["value"], (list, input) => ({ result: list.unshift(input.value) })),
    op("pop", [], (list) => ({ result: list.pop() })),
    op("shift", [], (list) => ({ result: list.shift() })),
    op("get", ["index"], (list, input) => ({ result: list.get(at(input)) })),
    op("set", ["index", "value"], (list, input) => ({ result: list.set(at(input), input.value) })),
    op("insert", ["index", "value"], (list, input) => ({ result: list.insert(at(input), input.value) })),
    op("removeAt", ["index"], (list, input) => ({ result: list.removeAt(at(input)) })),
    op("indexOf", ["value"], (list, input) => ({ result: list.indexOf(input.value) })),
    op("sort", [], (list) => ({ result: list.sort((a, b) => a - b) })),
  ];
}

type NumberList = ReturnType<typeof arrayList<number>>;
type NumberDeque = ReturnType<typeof arrayDeque<number>>;
type LetterMap = MapLike<string, number>;
type LetterTreeMap = ReturnType<typeof treeMap<string, number>>;
type NumberSet = CollectionSet<number>;
type NumberTreeSet = ReturnType<typeof treeSet<number>>;
type NumberHeap = ReturnType<typeof priorityQueue<number>>;
type SumTree = ReturnType<typeof summaryTree<number, number>>;

/** The operations of a map from letters to numbers. */
function mapOperations<S extends LetterMap>(cost: string): Operation<S>[] {
  return [
    { name: "set", fields: ["key", "value"], cost, run: (map, input) => ({ result: map.set(input.key, input.value) }) },
    { name: "get", fields: ["key"], cost, run: (map, input) => ({ result: map.get(input.key) }) },
    { name: "has", fields: ["key"], cost, run: (map, input) => ({ result: map.has(input.key) }) },
    { name: "delete", fields: ["key"], cost, run: (map, input) => ({ result: map.delete(input.key) }) },
  ];
}

/** The operations of a set of numbers. */
function setOperations<S extends NumberSet>(cost: string): Operation<S>[] {
  return [
    { name: "add", fields: ["value"], cost, run: (set, input) => ({ result: set.add(input.value) }) },
    { name: "contains", fields: ["value"], cost, run: (set, input) => ({ result: set.contains(input.value) }) },
    { name: "remove", fields: ["value"], cost, run: (set, input) => ({ result: set.remove(input.value) }) },
  ];
}

const START = [3, 1, 4];
const START_ENTRIES: [string, number][] = [["C", 3], ["A", 1], ["D", 4]];
/** The view of a map: one item `key: value` for each entry, in the order of the map. */
const entries = (map: LetterMap, facts = ""): View => ({ items: [...map.entries()].map(({ key, value }) => `${key}: ${String(value)}`), shape: "row", facts });

const list: Structure<NumberList> = {
  maker: "arrayList",
  kind: "List",
  variable: "list",
  summary: "An array. A get by index is fast. An add or a remove at the front moves each element.",
  start: "arrayList([3, 1, 4])",
  make: () => arrayList(START),
  view: (structure) => row(structure),
  operations: listOperations({ push: "O(1)", pop: "O(1)", get: "O(1)", set: "O(1)", sort: "O(n log n)" }),
};

const linked: Structure<NumberList> = {
  maker: "linkedList",
  kind: "List",
  variable: "list",
  summary: "A doubly linked list. An add or a remove at each end is fast. A get by index walks the nodes.",
  start: "linkedList([3, 1, 4])",
  make: () => linkedList(START) as unknown as NumberList,
  view: (structure) => row(structure),
  operations: listOperations({ push: "O(1)", unshift: "O(1)", pop: "O(1)", shift: "O(1)", sort: "O(n log n)" }),
};

const deque: Structure<NumberDeque> = {
  maker: "arrayDeque",
  kind: "Deque",
  variable: "deque",
  summary: "A ring buffer. An add and a remove at each end are fast, and no element moves.",
  start: "arrayDeque([3, 1, 4])",
  make: () => arrayDeque(START),
  view: (structure) => row(structure),
  operations: [
    { name: "addFirst", fields: ["value"], cost: "O(1)", run: (d, input) => ({ result: d.addFirst(input.value) }) },
    { name: "addLast", fields: ["value"], cost: "O(1)", run: (d, input) => ({ result: d.addLast(input.value) }) },
    { name: "pollFirst", fields: [], cost: "O(1)", run: (d) => ({ result: d.pollFirst() }) },
    { name: "pollLast", fields: [], cost: "O(1)", run: (d) => ({ result: d.pollLast() }) },
    { name: "peekFirst", fields: [], cost: "O(1)", run: (d) => ({ result: d.peekFirst() }) },
    { name: "peekLast", fields: [], cost: "O(1)", run: (d) => ({ result: d.peekLast() }) },
  ],
};

const map: Structure<LetterMap> = {
  maker: "hashMap",
  kind: "Map",
  variable: "map",
  summary: "A hash table. A get, a set and a delete take constant time on average. The keys are equal by ===.",
  start: 'hashMap([["C", 3], ["A", 1], ["D", 4]])',
  make: () => hashMap(START_ENTRIES),
  view: (structure) => entries(structure),
  operations: mapOperations("O(1) on average"),
};

const linkedMap: Structure<LetterMap> = {
  maker: "linkedHashMap",
  kind: "Map",
  variable: "map",
  summary: "A hash map that keeps an order. With accessOrder, a get moves its key to the end, so the first key is the oldest use.",
  start: 'linkedHashMap({ accessOrder: true }), then a set of C, A and D',
  make: () => {
    const made = linkedHashMap<string, number>({ accessOrder: true });
    for (const [key, value] of START_ENTRIES) made.set(key, value);
    return made as unknown as LetterMap;
  },
  view: (structure) => entries(structure, "The first key is the oldest use."),
  operations: mapOperations("O(1) on average"),
};

const sortedMap: Structure<LetterTreeMap> = {
  maker: "treeMap",
  kind: "Sorted map",
  variable: "map",
  summary: "A red-black tree. The keys stay in order, and a search finds the nearest key below or above a key.",
  start: 'treeMap([["C", 3], ["A", 1], ["D", 4]])',
  make: () => treeMap(START_ENTRIES),
  view: (structure) => entries(structure),
  operations: [
    ...mapOperations<LetterTreeMap>("O(log n)"),
    { name: "floorKey", fields: ["key"], cost: "O(log n)", run: (m, input) => ({ result: m.floorKey(input.key) }) },
    { name: "ceilingKey", fields: ["key"], cost: "O(log n)", run: (m, input) => ({ result: m.ceilingKey(input.key) }) },
    { name: "firstKey", fields: [], cost: "O(log n)", run: (m) => ({ result: m.firstKey() }) },
    { name: "pollFirstEntry", fields: [], cost: "O(log n)", run: (m) => ({ result: m.pollFirstEntry() }) },
  ],
};

const set: Structure<NumberSet> = {
  maker: "hashSet",
  kind: "Set",
  variable: "set",
  summary: "The keys of a hash map. An add, a test and a remove take constant time on average.",
  start: "hashSet([3, 1, 4])",
  make: () => hashSet(START),
  view: (structure) => row(structure),
  operations: setOperations("O(1) on average"),
};

const sortedSet: Structure<NumberTreeSet> = {
  maker: "treeSet",
  kind: "Sorted set",
  variable: "set",
  summary: "The keys of a tree map. The values stay in order, and a search finds the nearest value below or above a value.",
  start: "treeSet([3, 1, 4])",
  make: () => treeSet(START),
  view: (structure) => row(structure),
  operations: [
    ...setOperations<NumberTreeSet>("O(log n)"),
    { name: "floor", fields: ["value"], cost: "O(log n)", run: (s, input) => ({ result: s.floor(input.value) }) },
    { name: "ceiling", fields: ["value"], cost: "O(log n)", run: (s, input) => ({ result: s.ceiling(input.value) }) },
    { name: "first", fields: [], cost: "O(log n)", run: (s) => ({ result: s.first() }) },
    { name: "pollFirst", fields: [], cost: "O(log n)", run: (s) => ({ result: s.pollFirst() }) },
  ],
};

const heap: Structure<NumberHeap> = {
  maker: "priorityQueue",
  kind: "Queue",
  variable: "queue",
  summary: "A binary heap. A poll gives the smallest value. Each parent is not larger than its children.",
  start: "priorityQueue([5, 3, 8, 1])",
  make: () => priorityQueue([5, 3, 8, 1]),
  view: (structure) => ({ items: structure.toArray().map(show), shape: "heap", facts: "The array of the heap, drawn by levels." }),
  operations: [
    { name: "offer", fields: ["value"], cost: "O(log n)", run: (q, input) => ({ result: q.offer(input.value) }) },
    { name: "poll", fields: [], cost: "O(log n)", run: (q) => ({ result: q.poll() }) },
    { name: "peek", fields: [], cost: "O(1)", run: (q) => ({ result: q.peek() }) },
  ],
};

const tree: Structure<SumTree> = {
  maker: "summaryTree",
  kind: "Sequence",
  variable: "tree",
  summary: "A persistent sequence. Each node keeps the sum of its leaves. An edit gives a new tree, and the old tree stays.",
  start: "summaryTree(SUM, [3, 1, 4])",
  make: () => summaryTree(SUM, START),
  view: (structure) => row(structure.toArray(), `summary ${String(structure.summary)}, height ${String(structure.height)}`),
  operations: [
    { name: "append", fields: ["value"], cost: "O(log n)", run: (t, input) => ({ next: t.append(input.value) }) },
    { name: "set", fields: ["index", "value"], cost: "O(log n)", run: (t, input) => ({ next: t.set(at(input), input.value) }) },
    { name: "insert", fields: ["index", "value"], cost: "O(log n)", run: (t, input) => ({ next: t.insert(at(input), [input.value]) }) },
    { name: "remove", fields: ["index"], cost: "O(log n)", run: (t, input) => ({ next: t.remove(at(input), at(input) + 1) }) },
  ],
};

/** The structures of the explorer, in the order of the page. */
export const STRUCTURES: readonly Structure<never>[] = [list, linked, deque, map, linkedMap, sortedMap, set, sortedSet, heap, tree] as unknown as readonly Structure<never>[];

/** This function gives the text of a value for the log and the view. */
export function show(value: unknown): string {
  if (value === undefined) return "undefined";
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(show).join(", ")}]`;
  if (typeof value === "object" && value !== null) {
    return `{ ${Object.entries(value).map(([key, item]) => `${key}: ${show(item)}`).join(", ")} }`;
  }
  return String(value);
}

/** One line of the log. */
export interface LogLine {
  /** The call as code, for example `list.push(7)`. */
  readonly code: string;
  /** The result as text, or the error. */
  readonly result: string;
  readonly threw: boolean;
  /** The version of a persistent structure after the call, from 1. */
  readonly version?: number;
}

/** This class keeps one structure, its versions and the log of its calls. */
export class Explorer {
  readonly structure: Structure<never>;
  /** Each version of the structure. A mutable structure has one version. */
  readonly versions: unknown[];
  readonly log: LogLine[] = [];

  constructor(structure: Structure<never>) {
    this.structure = structure;
    this.versions = [structure.make()];
  }

  /** The current version of the structure. */
  get current(): unknown {
    return this.versions[this.versions.length - 1];
  }

  /** This method gives the view of the current version. */
  view(): View {
    return this.structure.view(this.current as never);
  }

  /** This method gives the operation with the name. */
  operation(name: string): Operation<never> {
    const found = this.structure.operations.find((item) => item.name === name);
    if (found === undefined) throw new RangeError(`${this.structure.maker} has no operation ${name}`);
    return found;
  }

  /** This method starts an operation, and gives the line of the log. An error of the package goes into the line. */
  apply(name: string, input: Input): LogLine {
    const operation = this.operation(name);
    const args = operation.fields.map((field) => (field === "key" ? show(input.key) : String(input[field])));
    const code = `${this.structure.variable}.${name}(${args.join(", ")})`;
    let line: LogLine;
    try {
      const outcome = (operation.run as unknown as (structure: unknown, input: Input) => Outcome<unknown>)(this.current, input);
      if (outcome.next !== undefined) {
        this.versions.push(outcome.next);
        line = { code: `${this.structure.variable} = ${code}`, result: `version ${String(this.versions.length)}`, threw: false, version: this.versions.length };
      } else line = { code, result: show(outcome.result), threw: false };
    } catch (error) {
      const text = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
      line = { code, result: `throws ${text}`, threw: true };
    }
    this.log.push(line);
    return line;
  }
}
