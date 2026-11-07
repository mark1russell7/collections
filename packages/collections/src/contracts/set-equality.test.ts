/**
 * The set operations of HashSet and TreeSet use the equality of the set (C31, the s20 audit).
 * A HashSet keeps its custom hash in each copy, and a TreeSet compares with its comparator.
 * Each operation reads the other iterable one time, so a generator gives all of its elements.
 */

import { describe, expect, it } from "vitest";
import { hashSet, type HashSet } from "../impl/hash-set.js";
import { treeSet, type TreeSet } from "../impl/tree-set.js";

interface Card {
  id: number;
  label: string;
}

/** This function makes a card. Two cards with the same id are equal, and their labels can differ. */
const card = (id: number, label = `card ${id}`): Card => ({ id, label });

/** Each set of cards: equal by id, and with a hash or an order that do not use `===`. */
const cardSets: [string, (cards: Card[]) => HashSet<Card> | TreeSet<Card>][] = [
  [
    "hashSet with a custom hash",
    (cards) => {
      const set = hashSet<Card>({ eq: (a, b) => a.id === b.id, hash: (value) => value.id });
      set.addAll(cards);
      return set;
    },
  ],
  [
    "treeSet with a comparator",
    (cards) => {
      const set = treeSet<Card>({ compare: (a, b) => a.id - b.id, eq: (a, b) => a.id === b.id });
      set.addAll(cards);
      return set;
    },
  ],
];

/** This function gives the ids of a set of cards, in ascending order. */
const ids = (set: Iterable<Card>): number[] => [...set].map((value) => value.id).sort((a, b) => a - b);

/** This generator gives the cards one time. A second read gives nothing. */
function* once(cards: Card[]): Generator<Card> {
  yield* cards;
}

describe.each(cardSets)("%s: the set operations use the equality of the set", (_name, make) => {
  const others = () => [card(2, "copy"), card(3, "copy"), card(9, "copy")];

  it("union does not add an equal element again", () => {
    expect(ids(make([card(1), card(2)]).union(others()))).toEqual([1, 2, 3, 9]);
  });

  it("intersection keeps each element that the other set has", () => {
    const result = make([card(1), card(2), card(3)]).intersection(others());
    expect(ids(result)).toEqual([2, 3]);
    expect(result.contains(card(2, "another copy"))).toBe(true);
  });

  it("difference removes each element that the other set has", () => {
    expect(ids(make([card(1), card(2), card(3)]).difference(others()))).toEqual([1]);
  });

  it("symmetricDifference keeps the elements of one set only", () => {
    expect(ids(make([card(1), card(2), card(3)]).symmetricDifference(others()))).toEqual([1, 9]);
  });

  it("isSubsetOf and isSupersetOf compare with the equality of the set", () => {
    expect(make([card(2), card(3)]).isSubsetOf(others())).toBe(true);
    expect(make([card(1), card(2), card(3), card(9)]).isSupersetOf(others())).toBe(true);
  });

  it("retainAll keeps each element that the other set has", () => {
    const set = make([card(1), card(2), card(3)]);
    expect(set.retainAll(others())).toBe(true);
    expect(ids(set)).toEqual([2, 3]);
  });

  it("reads a generator one time and gives the same result", () => {
    const base = [card(1), card(2), card(3)];
    expect(ids(make(base).intersection(once(others())))).toEqual([2, 3]);
    expect(ids(make(base).difference(once(others())))).toEqual([1]);
    expect(ids(make(base).symmetricDifference(once(others())))).toEqual([1, 9]);
    expect(make([card(2), card(3)]).isSubsetOf(once(others()))).toBe(true);
    const retained = make(base);
    retained.retainAll(once(others()));
    expect(ids(retained)).toEqual([2, 3]);
  });

  it("symmetricDifference reads a repeated element one time", () => {
    expect(ids(make([card(1)]).symmetricDifference([card(2), card(2, "copy")]))).toEqual([1, 2]);
  });
});

describe("hashSet.clone with a custom hash", () => {
  it("finds an equal element", () => {
    const set = hashSet<Card>({ eq: (a, b) => a.id === b.id, hash: (value) => value.id });
    set.add(card(1));
    expect(set.clone().contains(card(1, "copy"))).toBe(true);
  });
});

describe("a set of numbers reads a generator one time", () => {
  function* twoAndThree(): Generator<number> {
    yield 2;
    yield 3;
  }

  it.each([
    ["hashSet", () => hashSet([1, 2, 3])],
    ["treeSet", () => treeSet([1, 2, 3])],
  ] as const)("%s.intersection gives each common element", (_name, make) => {
    expect([...make().intersection(twoAndThree())].sort()).toEqual([2, 3]);
  });
});
