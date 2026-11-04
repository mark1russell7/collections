/**
 * One arm of the hash bench, in its own process: `--arm old|new --case <id>`. This child hashes the
 * pool of the case, and prints the median time of a pass as the JSON line of `freshRun`.
 */

import { parseArgs } from "node:util";
import { median } from "@mark1russell7/rigor-statistics";
import { defaultHash, hashString } from "../src/utils/defaults.js";
import { hashPool } from "./hash-cases.js";

const WARM_PASSES = 40;
const TIMED_PASSES = 41;

/** The hash of an object in versions 0.2.0 and earlier, as the base of the comparison. */
const oldHash = (value: object): number => {
  try {
    return hashString(JSON.stringify(value));
  } catch {
    return hashString(String(value));
  }
};

const { values } = parseArgs({ options: { arm: { type: "string" }, case: { type: "string" } } });
const hash = values.arm === "old" ? oldHash : values.arm === "new" ? defaultHash : undefined;
if (hash === undefined || values.case === undefined) throw new RangeError("this child needs --arm old|new and --case <id>");

const pool = hashPool(values.case) as readonly object[];

/** One pass. The sum keeps the work of each call, and it is the hash of the output of the arm. */
const pass = (): number => {
  let sum = 0;
  for (const key of pool) sum = (sum + hash(key)) | 0;
  return sum;
};

for (let i = 0; i < WARM_PASSES; i++) pass();

const times: number[] = [];
let sum = 0;
for (let i = 0; i < TIMED_PASSES; i++) {
  const start = performance.now();
  sum = pass();
  times.push(performance.now() - start);
}

console.log(JSON.stringify({ ms: median(times), hash: String(sum) }));
