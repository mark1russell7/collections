import { describe, expect, it } from "vitest";
import { arrayList } from "../impl/array-list.js";
import { blockMethods, compose, delegate, enhanceMethod, hasCapability, interceptMethods, type Middleware } from "./middleware.js";

// C10: the first full mutation run found no test for the helpers of this file.

/** A small target with a method, a field and a symbol method. */
class Counter {
  count = 0;
  add(n: number): number {
    this.count += n;
    return this.count;
  }
  get double(): number {
    return this.count * 2;
  }
  [Symbol.iterator](): Iterator<number> {
    return [this.count][Symbol.iterator]();
  }
}

describe("hasCapability", () => {
  it("is true only for a key that the collection has, also an inherited key", () => {
    const plain = arrayList<number>();
    const withOn = Object.assign(arrayList<number>(), { on: () => () => {} });
    expect(hasCapability(plain, "on")).toBe(false);
    expect(hasCapability(withOn, "on")).toBe(true);
    expect(hasCapability(plain, "add")).toBe(true);
  });
});

describe("interceptMethods", () => {
  it("gives each call of a string-keyed method to the interceptor, and returns its result", () => {
    const counter = new Counter();
    const calls: [string, unknown[]][] = [];
    const proxy = interceptMethods(counter, (target, method, args) => {
      calls.push([String(method), args]);
      return target === counter ? "intercepted" : "wrong target";
    });
    expect(proxy.add(5)).toBe("intercepted");
    expect(calls).toEqual([["add", [5]]]);
    expect(counter.count).toBe(0);
  });

  it("gives a field, a getter and a symbol method of the target with no change", () => {
    const counter = new Counter();
    counter.count = 3;
    const proxy = interceptMethods(counter, () => "intercepted");
    expect(proxy.count).toBe(3);
    expect(proxy.double).toBe(6);
    expect([...proxy]).toEqual([3]);
  });
});

describe("blockMethods", () => {
  it("throws for each blocked method, and keeps the other methods and the fields", () => {
    const counter = new Counter();
    const proxy = blockMethods(counter, new Set(["add"]), "read only");
    expect(() => proxy.add(1)).toThrow(new Error("read only"));
    expect(counter.count).toBe(0);
    expect(proxy.count).toBe(0);
    expect([...proxy]).toEqual([0]);
  });

  it("uses the default message, and blocks a symbol method", () => {
    const proxy = blockMethods(new Counter(), new Set<string | symbol>(["add", Symbol.iterator]));
    expect(() => proxy.add(1)).toThrow(new Error("Operation not allowed"));
    expect(() => [...proxy]).toThrow(new Error("Operation not allowed"));
  });

  it("keeps a field that has a blocked name, because only a function is blocked", () => {
    const proxy = blockMethods(new Counter(), new Set(["count"]));
    expect(proxy.count).toBe(0);
  });
});

describe("delegate", () => {
  // A getter of the target read the wrapper through the proxy, but a method read the target. Both read the target in 0.9.10.
  it("takes each key of the wrapper first, and runs each method and getter of the target on the target", () => {
    const counter = new Counter();
    const proxy = delegate<Counter, Counter>(counter, { count: 100 });
    expect(proxy.count).toBe(100);
    const add = proxy.add;
    expect(add(2)).toBe(2);
    expect(counter.count).toBe(2);
    expect(proxy.double).toBe(4);
  });

  it("calls a method of the wrapper with the proxy as this, so it reads the target through the proxy", () => {
    const counter = new Counter();
    const proxy = delegate<Counter, Counter>(counter, {
      add(this: Counter, n: number): number {
        return this.count + n * 10;
      },
    });
    counter.count = 1;
    expect(proxy.add(2)).toBe(21);
    expect(counter.count).toBe(1);
  });
});

describe("enhanceMethod", () => {
  it("gives the original method, bound to the target, and the arguments to the enhancer", () => {
    const counter = new Counter();
    const seen: unknown[][] = [];
    const twice = enhanceMethod<Counter, "add">("add", (original, args) => {
      seen.push(args);
      original(...args);
      return original(...args);
    });
    const proxy = twice(counter);
    expect(proxy.add(3)).toBe(6);
    expect(seen).toEqual([[3]]);
    expect(counter.count).toBe(6);
    expect(proxy.double).toBe(12);
  });

  it("composes with the other middleware: the first layer of compose is the outer layer", () => {
    const log: string[] = [];
    const tag =
      (name: string): Middleware<Counter> =>
      (next) =>
        enhanceMethod<Counter, "add">("add", (original, args) => {
          log.push(name);
          return original(...args);
        })(next);
    const proxy = compose(tag("outer"), tag("inner"))(new Counter());
    proxy.add(1);
    expect(log).toEqual(["outer", "inner"]);
  });
});
