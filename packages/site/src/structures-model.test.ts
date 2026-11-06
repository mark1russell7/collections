import { describe, expect, it } from "vitest";
import { Explorer, show, STRUCTURES, type Input } from "./structures-model.ts";

const INPUT: Input = { value: 7, index: 1, key: "B" };

/** The expected result and items of each operation, from the start state, with `INPUT`. A `null` result means a throw. */
type Expected = Readonly<Record<string, readonly [result: string | null, items?: readonly string[]]>>;

const LIST: Expected = {
  push: ["undefined", ["3", "1", "4", "7"]],
  unshift: ["undefined", ["7", "3", "1", "4"]],
  pop: ["4", ["3", "1"]],
  shift: ["3", ["1", "4"]],
  get: ["1", ["3", "1", "4"]],
  set: ["1", ["3", "7", "4"]],
  insert: ["undefined", ["3", "7", "1", "4"]],
  removeAt: ["1", ["3", "4"]],
  indexOf: ["-1"],
  sort: ["undefined", ["1", "3", "4"]],
};

const HASH_MAP: Expected = {
  set: ["undefined"],
  get: [null],
  has: ["false"],
  // A hash map gives the hash order, so these rows do not check the items. Only the linked map and the tree map promise an order.
  delete: ["undefined"],
};

const EXPECTED: Readonly<Record<string, Expected>> = {
  arrayList: LIST,
  linkedList: LIST,
  arrayDeque: {
    addFirst: ["undefined", ["7", "3", "1", "4"]],
    addLast: ["undefined", ["3", "1", "4", "7"]],
    pollFirst: ["3", ["1", "4"]],
    pollLast: ["4", ["3", "1"]],
    peekFirst: ["3", ["3", "1", "4"]],
    peekLast: ["4", ["3", "1", "4"]],
  },
  hashMap: HASH_MAP,
  linkedHashMap: { ...HASH_MAP, set: ["undefined", ["C: 3", "A: 1", "D: 4", "B: 7"]], delete: ["undefined", ["C: 3", "A: 1", "D: 4"]] },
  treeMap: {
    set: ["undefined", ["A: 1", "B: 7", "C: 3", "D: 4"]],
    get: [null],
    has: ["false"],
    delete: ["undefined", ["A: 1", "C: 3", "D: 4"]],
    floorKey: ['"A"'],
    ceilingKey: ['"C"'],
    firstKey: ['"A"'],
    pollFirstEntry: ['{ key: "A", value: 1 }', ["C: 3", "D: 4"]],
  },
  hashSet: { add: ["true"], contains: ["false"], remove: ["false"] },
  treeSet: {
    add: ["true", ["1", "3", "4", "7"]],
    contains: ["false"],
    remove: ["false", ["1", "3", "4"]],
    floor: ["4"],
    ceiling: ["undefined"],
    first: ["1"],
    pollFirst: ["1", ["3", "4"]],
  },
  priorityQueue: {
    offer: ["true", ["1", "3", "8", "5", "7"]],
    poll: ["1", ["3", "5", "8"]],
    peek: ["1", ["1", "3", "8", "5"]],
  },
  summaryTree: {
    append: ["version 2", ["3", "1", "4", "7"]],
    set: ["version 2", ["3", "7", "4"]],
    insert: ["version 2", ["3", "7", "1", "4"]],
    remove: ["version 2", ["3", "4"]],
  },
};

describe("the structures of the explorer", () => {
  it("has the 10 structures of src/impl", () => {
    expect(STRUCTURES.map((structure) => structure.maker)).toEqual([
      "arrayList",
      "linkedList",
      "arrayDeque",
      "hashMap",
      "linkedHashMap",
      "treeMap",
      "hashSet",
      "treeSet",
      "priorityQueue",
      "summaryTree",
    ]);
  });

  it("has an expected result for each operation that the page offers, and no other", () => {
    for (const structure of STRUCTURES) {
      expect(Object.keys(EXPECTED[structure.maker] ?? {}).sort(), structure.maker).toEqual(structure.operations.map((op) => op.name).sort());
    }
  });

  for (const structure of STRUCTURES) {
    describe(structure.maker, () => {
      for (const operation of structure.operations) {
        it(`${operation.name} starts the real package`, () => {
          const [result, items] = EXPECTED[structure.maker]?.[operation.name] ?? [];
          const explorer = new Explorer(structure);
          const line = explorer.apply(operation.name, INPUT);
          if (result === null) expect(line.threw, line.result).toBe(true);
          else expect(line, line.code).toMatchObject({ result, threw: false });
          if (items !== undefined) expect(explorer.view().items).toEqual(items);
        });
      }
    });
  }
});

describe("the explorer", () => {
  it("writes each call as code", () => {
    const explorer = new Explorer(STRUCTURES[0]!);
    expect(explorer.apply("set", INPUT).code).toBe("list.set(1, 7)");
    const map = new Explorer(STRUCTURES.find((s) => s.maker === "treeMap")!);
    expect(map.apply("floorKey", INPUT).code).toBe('map.floorKey("B")');
  });

  it("keeps an error of the package in the log, and the structure stays", () => {
    const explorer = new Explorer(STRUCTURES[0]!);
    const line = explorer.apply("get", { ...INPUT, index: 9 });
    expect(line.threw).toBe(true);
    expect(line.result).toMatch(/^throws \w*Error: /);
    expect(explorer.view().items).toEqual(["3", "1", "4"]);
    expect(explorer.log).toHaveLength(1);
  });

  it("moves a key to the end of a linked hash map on a get", () => {
    const explorer = new Explorer(STRUCTURES.find((s) => s.maker === "linkedHashMap")!);
    expect(explorer.apply("get", { ...INPUT, key: "C" }).result).toBe("3");
    expect(explorer.view().items).toEqual(["A: 1", "D: 4", "C: 3"]);
  });

  it("keeps each version of the summary tree whole", () => {
    const explorer = new Explorer(STRUCTURES.find((s) => s.maker === "summaryTree")!);
    explorer.apply("append", INPUT);
    explorer.apply("remove", { ...INPUT, index: 0 });
    expect(explorer.versions).toHaveLength(3);
    expect(explorer.view().items).toEqual(["1", "4", "7"]);
    expect(explorer.view().facts).toMatch(/^summary 12, height \d+$/);
    const first = explorer.structure.view(explorer.versions[0] as never);
    expect(first.items).toEqual(["3", "1", "4"]);
  });

  it("gives the text of each kind of value", () => {
    expect([undefined, "A", [1, "B"], { key: "A", value: 1 }, 3].map(show)).toEqual(["undefined", '"A"', '[1, "B"]', '{ key: "A", value: 1 }', "3"]);
  });

  it("refuses an operation that the structure does not have", () => {
    expect(() => new Explorer(STRUCTURES[0]!).apply("fly", INPUT)).toThrow(/arrayList has no operation fly/);
  });
});
