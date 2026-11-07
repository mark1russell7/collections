import { readFileSync } from "node:fs";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { boundedList, boundedMap } from "../behaviors/bounded.js";
import { eventedList } from "../behaviors/evented.js";
import { lruMap } from "../behaviors/lru.js";
import { safeList, safeMap } from "../behaviors/safe.js";
import { ttlMap } from "../behaviors/ttl.js";
import { arrayList } from "../impl/array-list.js";
import { hashMap } from "../impl/hash-map.js";
import { compose as stack, bundle } from "./middleware.js";
import { compose, type Layer } from "./layers.js";

const add: Layer<number> = (n) => n + 1;
const double: Layer<number> = (n) => n * 2;
const square: Layer<number> = (n) => n * n;
const layer = fc.constantFrom(add, double, square);
const value = fc.integer({ min: -1000, max: 1000 });

describe("the entry of the core", () => {
  const source = readFileSync(new URL("./layers.ts", import.meta.url), "utf8");
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "");
  const manifest = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));

  it("has no imports", () => {
    expect(code).not.toMatch(/^\s*import\b/m);
    expect(code).not.toMatch(/^\s*export\s[^\n]*\bfrom\b/m);
    expect(code).not.toMatch(/\b(require|import)\(/);
  });

  it("does no work at load", () => {
    const top = code.split("\n").filter((line) => /^\S/.test(line));
    for (const line of top) expect(line).toMatch(/^(export type |export function |\}$)/);
    expect(manifest.sideEffects).toBe(false);
  });

  it("has its own line in the exports", () => {
    expect(manifest.exports["./layers"]).toBe("./src/core/layers.ts");
    expect(manifest.publishConfig.exports["./layers"].default).toBe("./build/core/layers.js");
  });
});

describe("the laws of compose", () => {
  it("keeps the base with no layers", () => {
    const base = { id: 1 };
    expect(compose()(base)).toBe(base);
  });

  it("is the layer with one layer", () => {
    fc.assert(fc.property(layer, value, (f, b) => compose(f)(b) === f(b)));
  });

  it("is associative", () => {
    fc.assert(
      fc.property(layer, layer, layer, value, (f, g, h, b) => {
        const left = compose(f, compose(g, h));
        const right = compose(compose(f, g), h);
        return left(b) === right(b);
      })
    );
  });

  it("puts the first layer on the outside", () => {
    fc.assert(fc.property(layer, layer, value, (f, g, b) => compose(f, g)(b) === f(g(b))));
  });

  it("folds a list that the compiler sees as an array", () => {
    fc.assert(
      fc.property(fc.array(layer, { maxLength: 30 }), value, (list, b) => {
        const expected = list.reduceRight((acc, f) => f(acc), b);
        return compose(...list)(b) === expected;
      })
    );
  });

  it("keeps the order of the calls of a runner", () => {
    const log: string[] = [];
    type Run = (text: string) => string;
    const trace = (name: string) => (next: Run): Run => (text) => {
      log.push(`${name} in`);
      const out = next(text);
      log.push(`${name} out`);
      return out;
    };
    compose(trace("a"), trace("b"))((text) => text)("x");
    expect(log).toEqual(["a in", "b in", "b out", "a out"]);
  });
});

describe("the types of compose", () => {
  it("keeps types at each length", () => {
    const six: number = compose(add, add, add, add, add, add)(0);
    const toText: Layer<number, string> = String;
    const end: string = compose(toText, add, add, add, add, add, add, add)(0);
    expect([six, end]).toEqual([6, "7"]);
    // @ts-expect-error The layer next to `add` gives text, and `add` needs a number.
    expect(() => compose(add, add, add, add, add, add, add, toText)).not.toThrow();
    // @ts-expect-error The base is not the input of the last layer.
    expect(compose(add)("x")).toBe("x1");
  });

  it("types a chain of 100 layers", () => {
    const hundred: number = compose(
      add, add, add, add, add, add, add, add, add, add, add, add, add, add, add, add, add, add, add, add,
      add, add, add, add, add, add, add, add, add, add, add, add, add, add, add, add, add, add, add, add,
      add, add, add, add, add, add, add, add, add, add, add, add, add, add, add, add, add, add, add, add,
      add, add, add, add, add, add, add, add, add, add, add, add, add, add, add, add, add, add, add, add,
      add, add, add, add, add, add, add, add, add, add, add, add, add, add, add, add, add, add, add, add
    )(0);
    expect(hundred).toBe(100);
  });

  it("checks layers that add and need a context", () => {
    type Run<C> = (context: C) => string;
    const provide = (next: Run<{ user: string }>): Run<object> => () => next({ user: "ada" });
    const need = (next: Run<{ user: string }>): Run<{ user: string }> => (context) => next(context);
    const other = (next: Run<{ trace: string }>): Run<{ trace: string }> => (context) => next(context);
    expect(compose(provide, need)((context) => context.user)({})).toBe("ada");
    // @ts-expect-error No outer layer gives `trace`.
    expect(() => compose(provide, other)).not.toThrow();
  });
});

describe("the capability law of collection layers", () => {
  it("keeps each capability of a list stack", () => {
    const list = stack(
      safeList<number>(),
      eventedList<number>(),
      boundedList<number>({ capacity: 2 })
    )(arrayList<number>());
    const seen: number[] = [];
    list.on("add", ({ value }) => seen.push(value));
    list.add(1);
    expect(seen).toEqual([1]);
    expect(list.capacity).toBe(2);
    expect(list.safe.get(0)).toEqual({ tag: "some", value: 1 });
  });

  it("keeps each capability in every order of a list stack", () => {
    const bounded = () => boundedList<number>({ capacity: 2 });
    const stacks = [
      stack(eventedList<number>(), safeList<number>(), bounded())(arrayList<number>()),
      stack(safeList<number>(), bounded(), eventedList<number>())(arrayList<number>()),
      stack(bounded(), safeList<number>(), eventedList<number>())(arrayList<number>()),
      stack(bounded(), eventedList<number>(), safeList<number>())(arrayList<number>()),
      stack(eventedList<number>(), bounded(), safeList<number>())(arrayList<number>()),
    ];
    for (const list of stacks) {
      expect(typeof list.on).toBe("function");
      expect(list.capacity).toBe(2);
      expect(typeof list.safe.get).toBe("function");
    }
  });

  it("keeps each capability of a map stack", () => {
    const map = stack(
      safeMap<string, number>(),
      lruMap<string, number>({ capacity: 2 }),
      ttlMap<string, number>({ ttl: 1000 })
    )(hashMap<string, number>());
    expect(map.isFull).toBe(false);
    expect(typeof map.safe.get).toBe("function");
    map.dispose();
  });

  it("keeps each capability of a bounded map under a safe map", () => {
    const map = stack(safeMap<string, number>(), boundedMap<string, number>({ capacity: 1 }))(hashMap<string, number>());
    map.set("a", 1);
    expect(map.isFull).toBe(true);
    expect(typeof map.safe.get).toBe("function");
  });

  it("gives the same stack by bundle", () => {
    const made = bundle(safeList<number>(), eventedList<number>())(arrayList<number>());
    expect(typeof made.on).toBe("function");
    expect(typeof made.safe.get).toBe("function");
  });
});
