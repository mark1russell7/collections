import { configDefaults, defineConfig, mergeConfig } from "vitest/config";
import base from "./vitest.config.ts";

/**
 * The Vitest config of the mutation lane (`mutation.json` at the root). Stryker starts the tests in a copy of this
 * folder, and it changes the text of each source file that it mutates. The lane does not start the tests that read
 * the source as text or that read files outside this folder. The field `notRead` of the lane gives the reason of
 * each one.
 */
const notRead: readonly string[] = [
  "src/api-review.test.ts",
  "src/contracts/docs.test.ts",
  "src/contracts/bundle-weight.test.ts",
  "src/async/channels-deprecation.test.ts",
  "src/core/layers-entry.test.ts",
];

export default mergeConfig(
  base,
  defineConfig({
    test: { exclude: [...configDefaults.exclude, ...notRead] },
  }),
);
