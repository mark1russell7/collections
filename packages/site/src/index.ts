import { byId, copyText, setupTheme } from "@mark1russell7/site-pages/chrome";
import { mountCache, mountGraph, mountTree } from "./demos.ts";

setupTheme(byId<HTMLButtonElement>("theme"), "theme");

const copy = byId<HTMLButtonElement>("copy");
copy.addEventListener("click", () => {
  void copyText(copy, byId("install").textContent ?? "");
});

mountCache();
mountTree();
mountGraph();
