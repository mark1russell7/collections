// The numbers of the file `kpi.json` of the site. Each value comes from the source at the time of the build.
// So no reader copies a number from a page, and no number has a person as its source.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** The name of the project in the file. */
export const KPI_PROJECT = "collections";

/** The key of the LRU cache, which is a behavior and not a file of `src/impl`. */
const LRU_KEY = "lrucache";

/** The key of the DAG, which has its own entry point. */
const DAG_KEY = "dag";

/** This function gives the key of each structure: one for each file of `src/impl`, the LRU cache and the DAG. */
export function structureKeys(implFiles: readonly string[]): readonly string[] {
  return [...implFiles.map((file) => file.replace(/\.ts$/, "").replaceAll("-", "")), LRU_KEY, DAG_KEY];
}

/** This function gives the names that a source imports as values from the package, with the name of the entry point. */
export function importedValues(source: string): readonly { readonly name: string; readonly entry: string }[] {
  const found: { name: string; entry: string }[] = [];
  for (const match of source.matchAll(/import\s*\{([^}]*)\}\s*from\s*"@mark1russell7\/collections(\/[a-z]+)?"/g)) {
    for (const part of (match[1] ?? "").split(",")) {
      const name = part.trim().split(/\s+as\s+/)[0] ?? "";
      if (name !== "" && !name.startsWith("type ")) found.push({ name, entry: match[2] ?? "" });
    }
  }
  return found;
}

/**
 * This function gives the keys of the structures that the sources of the demos import. A name counts for the longest key that it holds.
 * So `linkedHashMap` counts for the linked hash map and not for the hash map. Each value of the entry point `/dag` counts for the DAG.
 */
export function structuresWithDemo(sources: readonly string[], keys: readonly string[]): readonly string[] {
  const longestFirst = [...keys].sort((a, b) => b.length - a.length);
  const seen = new Set<string>();
  for (const { name, entry } of sources.flatMap(importedValues)) {
    const key = entry === "/dag" ? DAG_KEY : longestFirst.find((item) => name.toLowerCase().includes(item));
    if (key !== undefined && keys.includes(key)) seen.add(key);
  }
  return [...seen].sort();
}

/** This function reads the source of each demo file of the site. A test or a probe is not a demo. */
export function demoSources(srcDir: string): readonly string[] {
  return readdirSync(srcDir)
    .filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts") && file !== "check-probe.ts" && file !== "kpi.ts")
    .map((file) => readFileSync(join(srcDir, file), "utf8"));
}

/** This function gives the measures of the file, from the folder of the site and the folder of the package. */
export function siteMeasures(siteDir: string, packageDir: string): { id: string; value: number; unit: string }[] {
  const keys = structureKeys(readdirSync(join(packageDir, "src", "impl")).filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts")));
  return [{ id: "structures-with-demo", value: structuresWithDemo(demoSources(join(siteDir, "src")), keys).length, unit: "structures" }];
}
