/** The options of `minimumHittingSet`. */
export interface HittingSetOptions<T> {
  /** This function gives the weight of an element: a finite number above 0. The default weight is 1. */
  readonly weight?: ((element: T) => number) | undefined;
  /** The largest count of steps of the search. A step is one choice of an element. The default is 1000000. */
  readonly maxSteps?: number | undefined;
}

/** A set of elements that hits each set of a family, with the sum of the weights of its elements. */
export interface HittingSetChoice<T> {
  /** The elements, in the order of their first occurrence in the family. */
  readonly elements: readonly T[];
  readonly weight: number;
}

/**
 * The result of `minimumHittingSet`.
 *
 * - `exact`: the search ended, and no hitting set has a smaller weight.
 * - `budget`: the search passed `maxSteps` before its end. `best` hits each set, but a smaller one can exist.
 * - `none`: the set at the index `empty` has no element, so no set hits it.
 */
export type HittingSet<T> =
  | (HittingSetChoice<T> & { readonly kind: "exact"; readonly steps: number })
  | { readonly kind: "budget"; readonly best: HittingSetChoice<T>; readonly steps: number }
  | { readonly kind: "none"; readonly empty: number };

/**
 * This function gives a hitting set of a family of sets with the smallest sum of weights. A hitting set has one
 * or more elements of each set of the family. It is the vertex cover of a hypergraph.
 *
 * - The search is exact. It is a branch and bound on the elements of the smallest set that is not hit. A
 *   packing of disjoint sets gives a lower bound of the weight of each branch.
 * - A greedy pass gives the first bound, so the result `budget` always has a hitting set.
 * - Two equal elements are one element, by the rule of `Map`. Each set can repeat an element.
 * - The same family in the same order gives the same result. An empty family gives the empty set.
 * - A bad `maxSteps` throws a `RangeError`. Then a family with an empty set gives `none` before the function reads
 *   a weight. Else a weight that is not a finite number above 0 throws a `RangeError`.
 * - A sum of weights that are not whole numbers has rounding errors. The search is then exact to that rounding.
 *
 * The function is pure. It keeps no state, and it does not change its arguments.
 */
export function minimumHittingSet<T>(sets: Iterable<Iterable<T>>, options: HittingSetOptions<T> = {}): HittingSet<T> {
  const maxSteps = options.maxSteps ?? 1_000_000;
  if (!(Number.isInteger(maxSteps) || maxSteps === Number.POSITIVE_INFINITY) || maxSteps < 0) {
    throw new RangeError(`The count maxSteps is a whole number from 0, or Infinity, not ${maxSteps}.`);
  }
  const index = new Map<T, number>();
  const elements: T[] = [];
  const family: number[][] = [];
  for (const set of sets) {
    const members = new Set<number>();
    for (const element of set) {
      let at = index.get(element);
      if (at === undefined) {
        at = elements.length;
        index.set(element, at);
        elements.push(element);
      }
      members.add(at);
    }
    if (members.size === 0) return { kind: "none", empty: family.length };
    family.push([...members]);
  }
  const weights = elements.map((element) => {
    const w = options.weight === undefined ? 1 : options.weight(element);
    if (!Number.isFinite(w) || w <= 0) throw new RangeError(`The weight of an element is a finite number above 0, not ${w}.`);
    return w;
  });
  return new Search(family, weights, maxSteps).run(elements);
}

// One level of the search: the elements of one set that is not hit, in the order to try them.
interface Frame {
  readonly options: readonly number[];
  next: number;
  picked: number;
  // The cost before the choice of picked. The undo restores it, so the cost carries no rounding of a subtraction.
  cost: number;
  readonly banned: number[];
}

class Search {
  private readonly family: readonly (readonly number[])[];
  private readonly weights: readonly number[];
  private readonly maxSteps: number;
  private readonly m: number;
  private readonly setsOf: number[][];
  private readonly hits: Int32Array;
  private readonly chosen: Uint8Array;
  private readonly banned: Uint8Array;
  private readonly mark: Uint32Array;
  private stamp = 0;
  private cost = 0;
  private bestWeight = Number.POSITIVE_INFINITY;
  private best: number[] = [];
  steps = 0;

  constructor(family: readonly (readonly number[])[], weights: readonly number[], maxSteps: number) {
    this.family = family;
    this.weights = weights;
    this.maxSteps = maxSteps;
    this.m = weights.length;
    this.setsOf = Array.from({ length: this.m }, () => []);
    family.forEach((set, s) => {
      for (const e of set) this.setsOf[e]!.push(s);
    });
    this.hits = new Int32Array(family.length);
    this.chosen = new Uint8Array(this.m);
    this.banned = new Uint8Array(this.m);
    this.mark = new Uint32Array(this.m);
  }

  run<T>(elements: readonly T[]): HittingSet<T> {
    this.greedy();
    const done = this.solve();
    const picked = [...this.best].sort((a, b) => a - b).map((e) => elements[e]!);
    const choice = { elements: picked, weight: this.bestWeight };
    return done ? { kind: "exact", ...choice, steps: this.steps } : { kind: "budget", best: choice, steps: this.steps };
  }

  // The first bound: take the element with the most new hits for its weight, until each set is hit.
  private greedy(): void {
    const picked: number[] = [];
    let open = this.family.length;
    while (open > 0) {
      let top = -1;
      let topScore = 0;
      for (let e = 0; e < this.m; e += 1) {
        if (this.chosen[e] === 1) continue;
        const score = this.newHits(e) / this.weights[e]!;
        if (score > topScore) [top, topScore] = [e, score];
      }
      this.choose(top);
      picked.push(top);
      open -= this.newHitsWhenChosen(top);
    }
    this.record();
    for (const e of picked) this.unchoose(e);
    this.cost = 0;
  }

  // The branch and bound, with its own stack. It gives false when it passes maxSteps.
  private solve(): boolean {
    const first = this.frame();
    if (first === undefined) return true;
    const stack: Frame[] = [first];
    while (stack.length > 0) {
      const frame = stack.at(-1)!;
      if (frame.picked >= 0) {
        this.unchoose(frame.picked);
        this.cost = frame.cost;
        this.banned[frame.picked] = 1;
        frame.banned.push(frame.picked);
        frame.picked = -1;
      }
      if (frame.next >= frame.options.length) {
        for (const e of frame.banned) this.banned[e] = 0;
        stack.pop();
        continue;
      }
      const e = frame.options[frame.next]!;
      frame.next += 1;
      if (this.steps >= this.maxSteps) {
        for (const level of stack) for (const b of level.banned) this.banned[b] = 0;
        return false;
      }
      this.steps += 1;
      frame.cost = this.cost;
      this.choose(e);
      frame.picked = e;
      const next = this.frame();
      if (next === undefined) {
        if (this.open() === 0 && this.cost < this.bestWeight) this.record();
        continue;
      }
      stack.push(next);
    }
    return true;
  }

  // The next level: undefined when each set is hit, or when the bound cuts the branch.
  private frame(): Frame | undefined {
    if (this.open() === 0) return undefined;
    const bound = this.lowerBound();
    if (this.cost + bound >= this.bestWeight) return undefined;
    let smallest: number[] | undefined;
    for (let s = 0; s < this.family.length; s += 1) {
      if (this.hits[s]! > 0) continue;
      const free = this.family[s]!.filter((e) => this.banned[e] === 0);
      if (smallest === undefined || free.length < smallest.length) smallest = free;
    }
    const options = smallest!.sort((a, b) => this.newHits(b) / this.weights[b]! - this.newHits(a) / this.weights[a]! || a - b);
    return { options, next: 0, picked: -1, cost: this.cost, banned: [] };
  }

  // A packing of sets that are not hit and share no free element. Each one needs its own element, so the sum of
  // their lightest free elements is a lower bound. A set with no free element makes the bound infinite.
  private lowerBound(): number {
    this.stamp += 1;
    let bound = 0;
    for (let s = 0; s < this.family.length; s += 1) {
      if (this.hits[s]! > 0) continue;
      let lightest = Number.POSITIVE_INFINITY;
      let shared = false;
      for (const e of this.family[s]!) {
        if (this.banned[e] === 1) continue;
        if (this.mark[e] === this.stamp) shared = true;
        lightest = Math.min(lightest, this.weights[e]!);
      }
      if (lightest === Number.POSITIVE_INFINITY) return lightest;
      if (shared) continue;
      for (const e of this.family[s]!) this.mark[e] = this.stamp;
      bound += lightest;
    }
    return bound;
  }

  private open(): number {
    let count = 0;
    for (let s = 0; s < this.family.length; s += 1) if (this.hits[s] === 0) count += 1;
    return count;
  }

  private newHits(e: number): number {
    let count = 0;
    for (const s of this.setsOf[e]!) if (this.hits[s] === 0) count += 1;
    return count;
  }

  private newHitsWhenChosen(e: number): number {
    let count = 0;
    for (const s of this.setsOf[e]!) if (this.hits[s] === 1) count += 1;
    return count;
  }

  private choose(e: number): void {
    this.chosen[e] = 1;
    this.cost += this.weights[e]!;
    for (const s of this.setsOf[e]!) this.hits[s] = this.hits[s]! + 1;
  }

  // The caller restores the cost.
  private unchoose(e: number): void {
    this.chosen[e] = 0;
    for (const s of this.setsOf[e]!) this.hits[s] = this.hits[s]! - 1;
  }

  // The cost is a sum in the order of the choices. The weight of a record is a sum in the order of the result, so
  // the weight of the result is the sum of its elements.
  private record(): void {
    this.best = [];
    let weight = 0;
    for (let e = 0; e < this.m; e += 1) {
      if (this.chosen[e] === 1) {
        this.best.push(e);
        weight += this.weights[e]!;
      }
    }
    this.bestWeight = weight;
  }
}
