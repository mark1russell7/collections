/**
 * The arbitraries of the contract tests. `runModel` and `step` come from `@mark1russell7/rigor-testkit/model` (C22).
 */

import fc from "fast-check";

/** Small integers: many duplicates and collisions, so the edge cases come up often. */
export const smallInt: fc.Arbitrary<number> = fc.integer({ min: -20, max: 20 });
