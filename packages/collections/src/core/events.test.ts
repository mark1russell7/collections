import fc from "fast-check";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AsyncEmitter, createEmitter, Emitter, EventBatcher, forwardEvent, onWhen, type Unsubscribe } from "./events.js";

// C10: the first full mutation run found no test for the emitters of this file (167 mutants with no coverage in core).

interface Events {
  a: number;
  b: number;
}
const EVENTS = ["a", "b"] as const;
type Name = (typeof EVENTS)[number];

/** A step of the model test of an emitter. An unsubscribe names a subscription by its order of creation, modulo the count. */
type Step =
  | { readonly kind: "on"; readonly event: Name }
  | { readonly kind: "once"; readonly event: Name }
  | { readonly kind: "unsubscribe"; readonly sub: number }
  | { readonly kind: "off"; readonly event: Name | undefined }
  | { readonly kind: "emit"; readonly event: Name; readonly payload: number };

const step: fc.Arbitrary<Step> = fc.oneof(
  fc.record({ kind: fc.constantFrom("on" as const, "once" as const), event: fc.constantFrom(...EVENTS) }),
  fc.record({ kind: fc.constant("unsubscribe" as const), sub: fc.nat({ max: 9 }) }),
  fc.record({ kind: fc.constant("off" as const), event: fc.option(fc.constantFrom(...EVENTS), { nil: undefined }) }),
  fc.record({ kind: fc.constant("emit" as const), event: fc.constantFrom(...EVENTS), payload: fc.integer() }),
);

/** A subscription of the model: its event, if it is once, and if it is still active. */
interface Sub {
  readonly event: Name;
  readonly once: boolean;
  active: boolean;
}

describe("Emitter", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // The model: each subscription is active until its unsubscribe, an off of its event, an off of all, or its first event (once).
  it("agrees with a model of subscriptions for each sequence of steps", () => {
    fc.assert(
      fc.property(fc.array(step, { maxLength: 40 }), (steps) => {
        const emitter = new Emitter<Events>();
        const subs: Sub[] = [];
        const unsubscribes: Unsubscribe[] = [];
        const got: [number, number][] = [];
        const want: [number, number][] = [];
        for (const s of steps) {
          if (s.kind === "on" || s.kind === "once") {
            const id = subs.length;
            subs.push({ event: s.event, once: s.kind === "once", active: true });
            unsubscribes.push(emitter[s.kind](s.event, (payload) => got.push([id, payload])));
          } else if (s.kind === "unsubscribe") {
            if (subs.length === 0) continue;
            const id = s.sub % subs.length;
            unsubscribes[id]?.();
            subs[id]!.active = false;
          } else if (s.kind === "off") {
            emitter.off(s.event);
            for (const sub of subs) if (s.event === undefined || sub.event === s.event) sub.active = false;
          } else {
            emitter.emit(s.event, s.payload);
            subs.forEach((sub, id) => {
              if (!sub.active || sub.event !== s.event) return;
              want.push([id, s.payload]);
              if (sub.once) sub.active = false;
            });
          }
          expect(got).toEqual(want);
          for (const event of EVENTS) {
            const count = subs.filter((sub) => sub.active && sub.event === event).length;
            expect(emitter.listenerCount(event)).toBe(count);
            expect(emitter.hasListeners(event)).toBe(count > 0);
          }
          expect([...emitter.eventNames()].sort()).toEqual(EVENTS.filter((e) => subs.some((sub) => sub.active && sub.event === e)));
        }
      }),
      { numRuns: 300 },
    );
  });

  // The fault that the model test finds: the unsubscribe of an old set removed the new set of its event.
  it("keeps a new listener when an unsubscribe from before an off runs", () => {
    const emitter = new Emitter<Events>();
    const old = emitter.on("a", () => {});
    emitter.off("a");
    const got: number[] = [];
    emitter.on("a", (n) => got.push(n));
    old();
    emitter.emit("a", 1);
    expect(got).toEqual([1]);
    expect(emitter.listenerCount("a")).toBe(1);
  });

  it("calls each listener of the emit, also one that an earlier listener removes", () => {
    const emitter = new Emitter<Events>();
    const got: string[] = [];
    let second: Unsubscribe = () => {};
    emitter.on("a", () => {
      got.push("first");
      second();
      emitter.on("a", () => got.push("added"));
    });
    second = emitter.on("a", () => got.push("second"));
    emitter.emit("a", 1);
    expect(got).toEqual(["first", "second"]);
    got.length = 0;
    emitter.emit("a", 2);
    expect(got).toEqual(["first", "added"]);
  });

  it("logs the error of a listener and calls the next listeners", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const emitter = new Emitter<Events>();
    const got: number[] = [];
    emitter.on("a", () => {
      throw new Error("boom");
    });
    emitter.on("a", (n) => got.push(n));
    emitter.emit("a", 7);
    expect(got).toEqual([7]);
    expect(log).toHaveBeenCalledOnce();
    expect(log.mock.calls[0]?.[0]).toBe("Error in event listener for 'a':");
  });

  it("adds a listener one time, so a second on of the same function changes nothing", () => {
    const emitter = createEmitter<Events>();
    const got: number[] = [];
    const listener = (n: number): void => {
      got.push(n);
    };
    emitter.on("a", listener);
    const unsubscribe = emitter.on("a", listener);
    emitter.emit("a", 1);
    expect(got).toEqual([1]);
    expect(emitter.listenerCount("a")).toBe(1);
    unsubscribe();
    expect(emitter.hasListeners("a")).toBe(false);
  });

  it("removes each listener with dispose", () => {
    const emitter = new Emitter<Events>();
    emitter.on("a", () => {});
    emitter.on("b", () => {});
    emitter.dispose();
    expect(emitter.eventNames()).toEqual([]);
  });
});

describe("AsyncEmitter", () => {
  it("starts each listener, and its emit waits for all of them", async () => {
    const emitter = new AsyncEmitter<Events>();
    const got: string[] = [];
    emitter.on("a", async (n) => {
      await Promise.resolve();
      got.push(`slow ${String(n)}`);
    });
    emitter.on("a", (n) => got.push(`fast ${String(n)}`));
    const done = emitter.emit("a", 1);
    expect(got).toEqual([]);
    await done;
    expect(got).toEqual(["fast 1", "slow 1"]);
    await emitter.emit("b", 2);
    expect(got).toHaveLength(2);
  });

  it("rejects with the error of a listener, after it starts each listener", async () => {
    const emitter = new AsyncEmitter<Events>();
    const got: number[] = [];
    emitter.on("a", () => {
      throw new Error("boom");
    });
    emitter.on("a", (n) => got.push(n));
    await expect(emitter.emit("a", 3)).rejects.toThrow("boom");
    expect(got).toEqual([3]);
  });

  it("counts and removes listeners as Emitter does", async () => {
    const emitter = new AsyncEmitter<Events>();
    const old = emitter.on("a", () => {});
    emitter.on("b", () => {});
    expect([emitter.listenerCount("a"), emitter.listenerCount("b")]).toEqual([1, 1]);
    expect(emitter.eventNames()).toEqual(["a", "b"]);
    emitter.off("a");
    const got: number[] = [];
    emitter.on("a", (n) => got.push(n));
    old();
    await emitter.emit("a", 5);
    expect(got).toEqual([5]);
    emitter.off();
    expect(emitter.eventNames()).toEqual([]);
    emitter.on("a", () => {});
    emitter.dispose();
    expect(emitter.listenerCount("a")).toBe(0);
  });
});

describe("EventBatcher", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  type Batched = Events & { "batch-a": number[] };

  it("sends the queued payloads as one batch event after the delay", () => {
    vi.useFakeTimers();
    const emitter = new Emitter<Batched>();
    const batches: number[][] = [];
    emitter.on("batch-a", (b) => batches.push(b));
    const batcher = new EventBatcher<Events, "a">(emitter, "a", 100);
    batcher.queue(1);
    vi.advanceTimersByTime(50);
    batcher.queue(2);
    expect(batches).toEqual([]);
    vi.advanceTimersByTime(50);
    expect(batches).toEqual([[1, 2]]);
    batcher.queue(3);
    vi.advanceTimersByTime(100);
    expect(batches).toEqual([[1, 2], [3]]);
  });

  it("sends the batch at once with flush or dispose, and sends no empty batch", () => {
    vi.useFakeTimers();
    const emitter = new Emitter<Batched>();
    const batches: number[][] = [];
    emitter.on("batch-a", (b) => batches.push(b));
    const batcher = new EventBatcher<Events, "a">(emitter, "a", 100);
    batcher.flush();
    expect(batches).toEqual([]);
    batcher.queue(1);
    batcher.flush();
    expect(batches).toEqual([[1]]);
    vi.advanceTimersByTime(200);
    expect(batches).toEqual([[1]]);
    batcher.queue(2);
    batcher.dispose();
    expect(batches).toEqual([[1], [2]]);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("forwardEvent and onWhen", () => {
  it("forwards each payload, with or without a transform, until the unsubscribe", () => {
    const source = new Emitter<Events>();
    const target = new Emitter<{ c: string; d: number }>();
    const got: (string | number)[] = [];
    target.on("c", (s) => got.push(s));
    target.on("d", (n) => got.push(n));
    const stop = forwardEvent(source, target, "a", "c", (n) => `#${String(n)}`);
    forwardEvent(source, target, "b", "d");
    source.emit("a", 1);
    source.emit("b", 2);
    stop();
    source.emit("a", 3);
    expect(got).toEqual(["#1", 2]);
  });

  it("calls the listener only for a payload that the predicate accepts", () => {
    const emitter = new Emitter<Events>();
    const got: number[] = [];
    const stop = onWhen(emitter, "a", (n) => n % 2 === 0, (n) => got.push(n));
    for (const n of [1, 2, 3, 4]) emitter.emit("a", n);
    stop();
    emitter.emit("a", 6);
    expect(got).toEqual([2, 4]);
  });
});
