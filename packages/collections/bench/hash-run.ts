/**
 * One job of the hash bench: `--job <n> --rounds <n> --out <file>`. Each arm of each case and round
 * runs in a fresh process. The job writes the records of the pair (old, new) and of its A/A pair.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { parseArgs } from "node:util";
import { benchEnv, freshRun } from "@mark1russell7/rigor-bench/fresh";
import { HASH_CASES } from "./hash-cases.js";

const { values } = parseArgs({ options: { job: { type: "string" }, rounds: { type: "string" }, out: { type: "string" } } });
const job = Number(values.job);
const rounds = Number(values.rounds);
if (!Number.isInteger(job) || !Number.isInteger(rounds) || values.out === undefined) throw new RangeError("this job needs --job, --rounds and --out");

const arm = (id: string): { id: string; command: string[] } => ({
  id,
  command: [process.execPath, "--import", "tsx", "bench/hash-arm.ts", "--arm", id],
});

const run = await freshRun({
  base: arm("old"),
  candidates: [arm("new")],
  cases: HASH_CASES,
  rounds,
  roundOffset: (job - 1) * rounds,
  job: String(job),
});

mkdirSync(dirname(values.out), { recursive: true });
writeFileSync(values.out, `${JSON.stringify({ job: String(job), env: benchEnv(), candidate: run.pairs["new"], aa: run.pairs["old~aa"] })}\n`);
