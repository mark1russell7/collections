/**
 * The entry `./layers` reads as text: no imports, no work at load, and its own line in the exports.
 * The mutation lane does not start this file, because Stryker changes the text of the source that it reads.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("the entry of the core", () => {
  const source = readFileSync(new URL("./layers.ts", import.meta.url), "utf8");
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "");
  const manifest = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));

  it("has no imports", () => {
    expect(code).not.toMatch(/^\s*import\b/m);
    expect(code).not.toMatch(/^\s*export\s[^\n]*\bfrom\b/m);
    expect(code).not.toMatch(/\b(require|import)\(/);
  });

  it("does no work at load", () => {
    const top = code.split("\n").filter((line) => /^\S/.test(line));
    for (const line of top) expect(line).toMatch(/^(export type |export function |\}$)/);
    expect(manifest.sideEffects).toBe(false);
  });

  it("has its own line in the exports", () => {
    expect(manifest.exports["./layers"]).toBe("./src/core/layers.ts");
    expect(manifest.publishConfig.exports["./layers"].default).toBe("./build/core/layers.js");
  });
});
