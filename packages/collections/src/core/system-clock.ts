/**
 * The default clock of the behaviors that read a time: `ttl`, `lru` and `bounded`.
 */

import { realClock, type Clock } from "@mark1russell7/algebra/clock";

/**
 * This clock is the default of the behaviors that read a time. It reads `Date.now()`, as the behaviors did before
 * the option `clock`. Its timers are the timers of `realClock`, so they do not keep a Node.js process alive.
 */
export const systemClock: Clock = {
  now: () => Date.now(),
  after: (ms, run) => realClock.after(ms, run),
};
