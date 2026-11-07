/**
 * The channels moved to `@mark1russell7/service/channel` (C26). This test makes sure that each
 * exported name of `channels.ts` has a `@deprecated` tag that names the new home.
 * Collections does not depend on service, and it does not re-export the channels.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, "channels.ts"), "utf8");
const manifest = JSON.parse(readFileSync(join(here, "../../package.json"), "utf8")) as Record<string, Record<string, string> | undefined>;
const moved = ["Channel", "SelectCase", "select", "timeout", "ticker", "pipeline", "fanOut", "fanIn", "merge", "buffered", "unbuffered", "channel", "workerPool"];

/** This function gives each exported name of the source, with the doc comment just above it. */
function exportsWithDocs(text: string): { name: string; doc: string }[] {
  const found: { name: string; doc: string }[] = [];
  for (const match of text.matchAll(/(\/\*\*(?:(?!\*\/)[\s\S])*\*\/)\s*\nexport (?:async )?(?:class|interface|function) ([A-Za-z]+)/g)) {
    found.push({ name: match[2] ?? "", doc: match[1] ?? "" });
  }
  return found;
}

describe("the deprecation of the channels (C26)", () => {
  const found = exportsWithDocs(source);

  it("finds the 13 moved names, and no other export", () => {
    expect(found.map((entry) => entry.name).sort()).toEqual([...moved].sort());
    expect(source.match(/^export /gm)?.length).toBe(moved.length);
  });

  it.each(moved)("marks %s as deprecated, with its new home", (name) => {
    const doc = found.find((entry) => entry.name === name)?.doc ?? "";
    expect(doc).toContain(`@deprecated Import \`${name}\` from \`@mark1russell7/service/channel\`.`);
  });

  it("does not depend on service", () => {
    for (const field of ["dependencies", "peerDependencies", "optionalDependencies", "devDependencies"]) {
      expect(Object.keys(manifest[field] ?? {})).not.toContain("@mark1russell7/service");
    }
  });
});
