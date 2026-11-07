import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CacheModel, nextValue, planOf, startNeeds, TreeModel } from "./model.ts";

const page = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const structuresPage = readFileSync(new URL("../structures/index.html", import.meta.url), "utf8");
const structuresCode = readFileSync(new URL("./structures.ts", import.meta.url), "utf8");

describe("the home page", () => {
  it("names the package and gives the install command", () => {
    expect(page).toContain("<title>collections</title>");
    expect(page).toContain("pnpm add @mark1russell7/collections");
    expect(page).toContain("https://www.npmjs.com/package/@mark1russell7/collections");
    expect(page).not.toContain("no release on npm");
  });

  it("links to the pages of site-pages and to the repository", () => {
    expect(page).toContain('href="./structures/"');
    expect(page).toContain('href="./releases/"');
    expect(page).toContain('href="./status/"');
    expect(page).toContain('href="https://github.com/mark1russell7/collections"');
  });
});

describe("the structures page", () => {
  it("has its own title, and links back to the home page and the pages of site-pages", () => {
    expect(structuresPage).toContain("<title>Structures · collections</title>");
    expect(structuresPage).toContain('href="../"');
    expect(structuresPage).toContain('href="../releases/"');
    expect(structuresPage).toContain('href="../status/"');
    expect(structuresPage).toContain('<script type="module" src="../src/structures.ts"></script>');
  });

  it("has an element for each id that the page code finds", () => {
    const ids = [...structuresCode.matchAll(/byId(?:<[^>]+>)?\("([^"]+)"\)/g)].map((match) => match[1]);
    expect(ids.length).toBeGreaterThan(10);
    for (const id of ids) expect(structuresPage, id).toContain(`id="${String(id)}"`);
  });
});

describe("the state of the demos", () => {
  it("reads through the real cache, and the oldest key leaves", () => {
    const model = new CacheModel(3, ["A", "B", "C"]);
    expect(model.keys()).toEqual(["C", "B", "A"]);
    expect(model.read("D")).toEqual({ hit: false, left: "A" });
    expect(model.read("B")).toEqual({ hit: true, left: undefined });
    expect(model.keys()).toEqual(["B", "D", "C"]);
    expect(model.resize(2)).toEqual(["C"]);
    expect(model.keys()).toEqual(["B", "D"]);
  });

  it("keeps each old version of the tree whole", () => {
    const model = new TreeModel([3, 1, 4]);
    model.edit((tree) => tree.set(1, 9));
    expect(model.tree.summary).toEqual({ count: 3, sum: 16, max: 9 });
    model.index = 0;
    expect(model.tree.toArray()).toEqual([3, 1, 4]);
    model.edit((tree) => tree.append(2));
    expect(model.versions.map((tree) => tree.summary.sum)).toEqual([8, 16, 10]);
  });

  it("gives each next value from 1 to 9", () => {
    expect([1, 2, 7, 8, 9].map(nextValue)).toEqual([3, 4, 9, 1, 2]);
  });

  it("gives the steps of the tasks, and the message of the package for a cycle", () => {
    const needs = startNeeds();
    const plan = planOf(needs);
    expect("dag" in plan && plan.dag.levels.map((level) => level.map((node) => node.id).sort())).toEqual([["lint", "types"], ["build", "test"], ["deploy", "docs"]]);
    needs.get("lint")?.add("deploy");
    const broken = planOf(needs);
    expect("error" in broken && broken.error).toContain("Circular dependency");
  });
});
