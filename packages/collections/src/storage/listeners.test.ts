import { afterEach, describe, expect, it, vi } from "vitest";
import { reportListenerError, StorageListeners } from "./listeners.js";

// C10: the first full mutation run found no test for this file.
describe("StorageListeners", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("gives each event to the listeners in the order of add, until their remove", () => {
    const listeners = new StorageListeners<number>();
    const got: string[] = [];
    const removeA = listeners.add((n) => got.push(`a${String(n)}`));
    listeners.add((n) => got.push(`b${String(n)}`));
    expect(listeners.size).toBe(2);
    listeners.emit(1);
    removeA();
    removeA();
    listeners.emit(2);
    expect(got).toEqual(["a1", "b1", "b2"]);
    expect(listeners.size).toBe(1);
    listeners.clear();
    listeners.emit(3);
    expect(listeners.size).toBe(0);
    expect(got).toHaveLength(3);
  });

  it("keeps each add of the same function as its own listener", () => {
    const listeners = new StorageListeners<number>();
    const got: number[] = [];
    const listener = (n: number): void => {
      got.push(n);
    };
    const first = listeners.add(listener);
    listeners.add(listener);
    listeners.emit(1);
    first();
    listeners.emit(2);
    expect(got).toEqual([1, 1, 2]);
  });

  it("gives no event to a listener that an earlier listener removes, or to one that it adds", () => {
    const listeners = new StorageListeners<number>();
    const got: string[] = [];
    let removeB: () => void = () => {};
    listeners.add(() => {
      got.push("a");
      removeB();
      listeners.add(() => got.push("added"));
    });
    removeB = listeners.add(() => got.push("b"));
    listeners.emit(1);
    expect(got).toEqual(["a"]);
  });

  it("gives the error of a listener to the handler and calls the next listeners", () => {
    const errors: unknown[] = [];
    const listeners = new StorageListeners<number>((error) => errors.push(error));
    const boom = new Error("boom");
    const got: number[] = [];
    listeners.add(() => {
      throw boom;
    });
    listeners.add((n) => got.push(n));
    listeners.emit(4);
    expect(errors).toEqual([boom]);
    expect(got).toEqual([4]);
  });

  it("throws the error again in a microtask by default, so the emit does not stop", () => {
    const tasks: (() => void)[] = [];
    vi.stubGlobal("queueMicrotask", (task: () => void) => tasks.push(task));
    const boom = new Error("boom");
    reportListenerError(boom);
    expect(tasks).toHaveLength(1);
    expect(() => tasks[0]?.()).toThrow(boom);
  });
});
