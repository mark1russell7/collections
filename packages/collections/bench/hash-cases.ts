/**
 * The key shapes of the hash bench. Each case gives a pool of keys, and one pass hashes each key of
 * the pool. The sizes keep one pass above the resolution of the clock.
 */

import { random } from "@mark1russell7/rigor-generators";

const SEED = "collections hash bench";

type Draw = ReturnType<typeof random>;

const word = (draw: Draw, length: number): string => {
  let text = "";
  for (let i = 0; i < length; i++) text += String.fromCharCode(97 + draw.below(26));
  return text;
};

const flatRecord = (draw: Draw): object => ({ id: draw.below(1_000_000), name: word(draw, 8), active: draw.chance(0.5) });

const tree = (draw: Draw, depth: number, width: number): object =>
  depth === 0 ? { leaf: draw.below(1000) } : { children: Array.from({ length: width }, () => tree(draw, depth - 1, width)) };

/** The builders of the pools, by case. A small key has a pool of 1000. A large key has a pool of 1. */
const builders: Readonly<Record<string, (draw: Draw) => readonly unknown[]>> = {
  "small-record": (draw) => Array.from({ length: 1000 }, () => flatRecord(draw)),
  "small-nested": (draw) => Array.from({ length: 1000 }, () => ({ id: draw.below(1000), at: { x: draw.below(1000), y: draw.below(1000) } })),
  "small-pair": (draw) => Array.from({ length: 1000 }, () => [draw.below(1000), draw.below(1000)]),
  "large-wide-1000": (draw) => [Object.fromEntries(Array.from({ length: 1000 }, (_, i) => [`field${i}`, draw.below(1000)]))],
  "large-list-10000": (draw) => [Array.from({ length: 10_000 }, () => draw.below(1_000_000))],
  "large-records-1000": (draw) => [Array.from({ length: 1000 }, () => flatRecord(draw))],
  "large-text-100": (draw) => [Object.fromEntries(Array.from({ length: 100 }, (_, i) => [`field${i}`, word(draw, 100)]))],
  "large-tree-5461": (draw) => [tree(draw, 6, 4)],
};

/** The ids of the cases. */
export const HASH_CASES: readonly string[] = Object.keys(builders);

/** This function gives the pool of one case. The same case gives the same pool in each process. */
export function hashPool(id: string): readonly unknown[] {
  const build = builders[id];
  if (build === undefined) throw new RangeError(`no hash case ${id}`);
  return build(random(`${SEED} ${id}`));
}
