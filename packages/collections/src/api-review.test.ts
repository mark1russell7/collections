/**
 * The review of the public API (C12) has a verdict for each name of the API report.
 * A new export without a row in `docs/API-REVIEW.md` fails here, so the review stays current.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const review = readFileSync(join(root, "docs/API-REVIEW.md"), "utf8");
const report = readFileSync(join(root, "packages/collections/test/api/public-api.txt"), "utf8");
const verdicts = ["keep", "change", "remove", "move", "ask"];

/** This function gives the names of each entry of the API report. */
function reportNames(text: string): string[] {
  const names: string[] = [];
  let inEntry = false;
  for (const line of text.split("\n")) {
    if (line.startsWith("## Declarations")) break;
    if (line.startsWith("## ")) inEntry = true;
    const match = inEntry ? /^(?:type )?([A-Za-z_$][\w$]*): build\//.exec(line) : null;
    if (match?.[1] !== undefined) names.push(match[1]);
  }
  return names;
}

/** This function gives each name of a row of the review, with the verdict of the row. */
function reviewRows(text: string): { name: string; verdict: string }[] {
  const rows: { name: string; verdict: string }[] = [];
  for (const line of text.split("\n")) {
    if (!line.startsWith("| `")) continue;
    const [, names = "", verdict = ""] = line.split("|").map((cell) => cell.trim());
    for (const match of names.matchAll(/`([A-Za-z_$][\w$]*)`/g)) rows.push({ name: match[1] ?? "", verdict });
  }
  return rows;
}

describe("the review of the public API", () => {
  const names = reportNames(report);
  const rows = reviewRows(review);

  it("reads the names of the API report", () => {
    expect(names.length).toBeGreaterThan(300);
  });

  it("has a row for each name of the API report", () => {
    const reviewed = new Set(rows.map((row) => row.name));
    expect(names.filter((name) => !reviewed.has(name))).toEqual([]);
  });

  it("gives one of the five verdicts in each row", () => {
    expect(rows.filter((row) => !verdicts.includes(row.verdict))).toEqual([]);
  });

  it("gives the count of each verdict in its table", () => {
    // The table counts the names of main at the review. The names of the removals (C23) have their own table after it.
    const reviewed = reviewRows(review.slice(0, review.indexOf("## The names of the removals")));
    for (const verdict of verdicts) {
      const count = reviewed.filter((row) => row.verdict === verdict).length;
      const stated = new RegExp(String.raw`^\| ${verdict} \|[^\n]*\| (\d+) \|$`, "m").exec(review)?.[1];
      expect({ verdict, count }).toEqual({ verdict, count: Number(stated) });
    }
  });
});
