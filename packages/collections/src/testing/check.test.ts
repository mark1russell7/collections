/** These tests give the checks of a contract suite: each check passes or throws `ContractViolation`. */

import { describe, it, expect } from "vitest";
import { ContractViolation, deepEqual, holds, rejects, same, show } from "./check.js";

describe("the checks of the contract suite", () => {
  it("deepEqual compares JSON values, arrays, plain objects and maps", () => {
    expect(deepEqual({ a: [1, { b: null }] }, { a: [1, { b: null }] })).toBe(true);
    expect(deepEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    expect(deepEqual({ a: 1, c: 2 }, { a: 1, b: 2 })).toBe(false);
    expect(deepEqual([1, 2], [1, 2, 3])).toBe(false);
    expect(deepEqual(new Map([["a", 1], ["b", 2]]), new Map([["b", 2], ["a", 1]]))).toBe(true);
    expect(deepEqual(new Map([["a", 1]]), new Map([["a", 2]]))).toBe(false);
    expect(deepEqual(new Map([["a", 1]]), new Map([["b", 1]]))).toBe(false);
    expect(deepEqual(new Map(), new Map([["a", 1]]))).toBe(false);
    expect(deepEqual(null, undefined)).toBe(false);
    expect(deepEqual(NaN, NaN)).toBe(true);
    expect(deepEqual(new Date(0), new Date(0))).toBe(false);
  });

  it("show gives JSON, a map as its entries, and undefined", () => {
    expect(show(new Map([["a", 1]]))).toBe('{"Map":[["a",1]]}');
    expect(show(undefined)).toBe("undefined");
    expect(show({ a: undefined })).toBe('{"a":"<undefined>"}');
    const loop: Record<string, unknown> = {};
    loop["self"] = loop;
    expect(show(loop)).toBe("[object Object]");
  });

  it("same, holds and rejects throw ContractViolation", async () => {
    expect(() => same(1, 2, "one")).toThrow(new ContractViolation("one: expected 2, got 1"));
    expect(() => holds(false, "never")).toThrow(ContractViolation);
    await expect(rejects(() => { throw new Error("now"); }, "sync")).rejects.toThrow(/sync: the method threw at once/);
    await expect(rejects(() => 1 as unknown as Promise<unknown>, "value")).rejects.toThrow(/value: the method did not give a promise/);
    await expect(rejects(() => Promise.resolve(1), "resolved")).rejects.toThrow(/resolved: the promise did not reject/);
    const error = new Error("rejected");
    expect(await rejects(() => Promise.reject(error), "rejected")).toBe(error);
  });
});
