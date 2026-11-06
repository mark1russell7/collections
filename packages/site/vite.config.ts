import { fileURLToPath } from "node:url";
import { commitTime, siteKpi } from "@mark1russell7/site-pages/vite";
import { defineConfig } from "vite";
import { KPI_PROJECT, siteMeasures } from "./src/kpi.ts";

// The Pages workflow sets SITE_BASE to "/collections". A local build uses the root.
const site = process.env["SITE_BASE"];

const siteDir = fileURLToPath(new URL(".", import.meta.url));
const packageDir = fileURLToPath(new URL("../collections", import.meta.url));

export default defineConfig({
  base: site ? `${site.replace(/\/$/, "")}/` : "/",
  build: {
    target: "es2022",
    // The site has two pages of its own: the home page and the structures explorer.
    rollupOptions: { input: { main: `${siteDir}index.html`, structures: `${siteDir}structures/index.html` } },
  },
  // The measures come from the source, so the time of the data is the time of the commit.
  plugins: [siteKpi(() => ({ project: KPI_PROJECT, at: commitTime(process.env, siteDir), measures: siteMeasures(siteDir, packageDir) }))],
});
