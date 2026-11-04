/**
 * One arm of the layers bench, in its own process: `--arm old|new --case <id>`. This child runs the
 * case, and prints the median time of a pass as the JSON line of `freshRun`.
 */

import { parseArgs } from "node:util";
import { median } from "@mark1russell7/rigor-statistics";
import { boundedList } from "../src/behaviors/bounded.js";
import { eventedList } from "../src/behaviors/evented.js";
import { safeList } from "../src/behaviors/safe.js";
import { compose as rootCompose } from "../src/core/middleware.js";
import { arrayList } from "../src/impl/array-list.js";

const WARM_PASSES = 40;
const TIMED_PASSES = 41;
const BUILDS = 2000;
const CALLS = 20_000;
const LIST_ELEMENTS = 1000;

type Run = (value: number) => number;
type Wrap = (next: never) => unknown;
type Fold = (...layers: readonly Wrap[]) => (base: never) => unknown;

/** The fold of version 0.3.0, as the base of the comparison. */
const oldCompose: Fold = (...layers) => (base) => layers.reduceRight((acc: never, layer) => layer(acc) as never, base);

const { values } = parseArgs({ options: { arm: { type: "string" }, case: { type: "string" } } });
const compose = values.arm === "old" ? oldCompose : values.arm === "new" ? (rootCompose as unknown as Fold) : undefined;
if (compose === undefined || values.case === undefined) throw new RangeError("this child needs --arm old|new and --case <id>");

const [kind, count] = values.case.split("-");
const size = Number(count);
const increment = (next: Run): Run => (value) => next(value) + 1;
const layers: readonly Wrap[] = Array.from({ length: size }, () => increment as unknown as Wrap);
const identity: Run = (value) => value;

const build = (): Run => compose(...layers)(identity as never) as Run;

/** One pass of each kind. The sum keeps the work of the pass, and it is the output of the arm. */
const passes: Readonly<Record<string, () => number>> = {
  build: () => {
    let sum = 0;
    for (let i = 0; i < BUILDS; i++) sum = (sum + build().length) | 0;
    return sum;
  },
  call: (() => {
    const run = build();
    return () => {
      let sum = 0;
      for (let i = 0; i < CALLS; i++) sum = (sum + run(i)) | 0;
      return sum;
    };
  })(),
  list: () => {
    const stack = [safeList<number>(), eventedList<number>(), boundedList<number>({ capacity: LIST_ELEMENTS })] as unknown as readonly Wrap[];
    const list = compose(...stack)(arrayList<number>() as never) as ReturnType<typeof arrayList<number>>;
    for (let i = 0; i < LIST_ELEMENTS; i++) list.add(i);
    return list.size;
  },
};

const pass = passes[kind ?? ""];
if (pass === undefined || !Number.isInteger(size)) throw new RangeError(`this child has no case ${values.case}`);

for (let i = 0; i < WARM_PASSES; i++) pass();

const times: number[] = [];
let sum = 0;
for (let i = 0; i < TIMED_PASSES; i++) {
  const start = performance.now();
  sum = pass();
  times.push(performance.now() - start);
}

console.log(JSON.stringify({ ms: median(times), hash: String(sum) }));
