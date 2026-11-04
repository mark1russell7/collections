/**
 * The report of the hash bench: `--jobs <folder> --out <file> [--run <id>]`. This script pools the
 * records of the jobs, and writes the ratio new/old of each case with the A/A band of the same run.
 *
 * The field `bound` is the factor to defend: the high end of the 95 % interval of the ratio, times
 * the high end of the A/A band. `limitVerdict` of rigor-bench uses the same bound.
 */

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { aaBand, caseIntervals, caseRatios, poolRecords, pooledVerdict, type PairedTime } from "@mark1russell7/rigor-bench";
import { median } from "@mark1russell7/rigor-statistics";

interface JobFile {
  readonly job: string;
  readonly env: unknown;
  readonly candidate: readonly PairedTime[];
  readonly aa: readonly PairedTime[];
}

const { values } = parseArgs({ options: { jobs: { type: "string" }, out: { type: "string" }, run: { type: "string" } } });
if (values.jobs === undefined || values.out === undefined) throw new RangeError("this report needs --jobs and --out");

const folder = values.jobs;
const jobs = readdirSync(folder)
  .filter((name) => name.endsWith(".json"))
  .map((name) => JSON.parse(readFileSync(join(folder, name), "utf8")) as JobFile);

const records = jobs.map(({ job, candidate, aa }) => ({ job, candidate, aa }));
const pool = poolRecords(records);
const verdict = pooledVerdict(records);
const band = aaBand(pool.aa);

const round = (value: number, digits: number): number => Number(value.toFixed(digits));

const microseconds = (id: string, arm: "a" | "b"): number =>
  round(median(pool.candidate.filter((record) => record.case === id).map((record) => record[arm])) * 1000, 1);

const jobRatios = jobs.map((job) => new Map(caseRatios(job.candidate).map((entry) => [entry.case, entry.ratio])));

const cases = caseIntervals(pool.candidate).map((entry) => {
  const byJob = jobRatios.map((ratios) => ratios.get(entry.case) ?? Number.NaN);
  return {
    case: entry.case,
    oldMicroseconds: microseconds(entry.case, "a"),
    newMicroseconds: microseconds(entry.case, "b"),
    ratio: round(entry.ratio, 3),
    low: round(entry.low, 3),
    high: round(entry.high, 3),
    bound: round(entry.high * band.high, 3),
    worstJobRatio: round(Math.max(...byJob), 3),
    bestJobRatio: round(Math.min(...byJob), 3),
    rounds: entry.rounds,
  };
});

const report = {
  schema: "hash-bench/1",
  run: values.run ?? "",
  aa: { noise: round(band.noise, 4), high: round(band.high, 3), median: round(band.median, 3), cases: band.cases },
  verdict: { outcome: verdict.outcome, reason: verdict.reason },
  cases,
  env: jobs.map(({ job, env }) => ({ job, env })),
};
writeFileSync(values.out, `${JSON.stringify(report, null, 2)}\n`);
