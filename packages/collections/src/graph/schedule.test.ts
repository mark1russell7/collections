import { random, seedsFrom, type Random } from "@mark1russell7/rigor-generators";
import { describe, expect, it } from "vitest";
import { criticalPath, listSchedule, periodSchedule, type ScheduleTask } from "./index.js";

const SEEDS = seedsFrom(process.env["SEED"], [1, 2, 3, 4, 5, 6, 7, 8]);

/** A random graph with no cycle: each task comes only after tasks with a smaller number. Durations are whole numbers. */
function randomTasks(r: Random, maxCount = 12): ScheduleTask<string>[] {
  const n = r.int(0, maxCount);
  return Array.from({ length: n }, (_, v) => ({
    id: `t${v}`,
    duration: r.int(0, 5),
    after: v === 0 ? [] : Array.from({ length: r.int(0, 3) }, () => `t${r.int(0, v - 1)}`),
  }));
}

/** The tasks in a random order, so that the input order is not a topological order. */
function shuffled<T>(r: Random, items: readonly T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = r.int(0, i);
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

function ok<T extends { kind: string }>(result: T): Extract<T, { kind: "ok" }> {
  if (result.kind !== "ok") throw new Error(`The result is ${result.kind}, not ok.`);
  return result as Extract<T, { kind: "ok" }>;
}

const DIAMOND: ScheduleTask<string>[] = [
  { id: "design", duration: 2 },
  { id: "build", duration: 5, after: ["design"] },
  { id: "docs", duration: 1, after: ["design"] },
  { id: "release", duration: 1, after: ["build", "docs"] },
];

describe("criticalPath", () => {
  it("gives length 0 and no path for no task", () => {
    expect(criticalPath([])).toEqual({ kind: "ok", length: 0, order: [], times: new Map(), path: [] });
  });

  it("gives the times, the slack and the path of a diamond", () => {
    const result = ok(criticalPath(DIAMOND));
    expect(result.length).toBe(8);
    expect(result.path).toEqual(["design", "build", "release"]);
    expect(result.order).toEqual(["design", "build", "docs", "release"]);
    expect(result.times.get("docs")).toEqual({ earliestStart: 2, earliestEnd: 3, latestStart: 6, latestEnd: 7, slack: 4, tail: 2 });
    expect(result.times.get("build")).toMatchObject({ earliestStart: 2, latestStart: 2, slack: 0, tail: 6 });
  });

  it("gives the problems of the tasks in place of a result", () => {
    expect(criticalPath([{ id: "a", duration: 1 }, { id: "a", duration: 2 }])).toEqual({ kind: "duplicate", task: "a" });
    expect(criticalPath([{ id: "a", duration: 1, after: ["z"] }])).toEqual({ kind: "missing", task: "a", dependency: "z" });
    expect(criticalPath([{ id: "a", duration: 1, after: ["a"] }])).toEqual({ kind: "cycle", cycle: ["a"] });
    const cycle = criticalPath([
      { id: "x", duration: 1 },
      { id: "a", duration: 1, after: ["c", "x"] },
      { id: "b", duration: 1, after: ["a"] },
      { id: "c", duration: 1, after: ["b"] },
    ]);
    expect(cycle.kind).toBe("cycle");
    // Each task of the cycle comes after the task before it, and the first comes after the last.
    const ids = (cycle as { cycle: readonly string[] }).cycle;
    expect([...ids].sort()).toEqual(["a", "b", "c"]);
    const after: Record<string, string> = { a: "c", b: "a", c: "b" };
    ids.forEach((id, i) => expect(after[id]).toBe(ids[(i - 1 + ids.length) % ids.length]));
  });

  it("throws a RangeError for a bad duration", () => {
    expect(() => criticalPath([{ id: "a", duration: -1 }])).toThrow(RangeError);
    expect(() => criticalPath([{ id: "a", duration: Number.NaN }])).toThrow(RangeError);
  });

  it("counts a dependency that comes two times one time", () => {
    expect(ok(criticalPath([{ id: "a", duration: 3 }, { id: "b", duration: 1, after: ["a", "a"] }])).length).toBe(4);
  });

  it.each(SEEDS)("gives a topological order, earliest times and an exact critical path (seed %i)", (seed) => {
    const r = random(seed);
    for (let round = 0; round < 40; round += 1) {
      const tasks = shuffled(r, randomTasks(r));
      const result = ok(criticalPath(tasks));
      const byId = new Map(tasks.map((task) => [task.id, task]));
      const position = new Map(result.order.map((id, i) => [id, i]));
      expect(result.order.length).toBe(tasks.length);
      let latestEnd = 0;
      for (const task of tasks) {
        const times = result.times.get(task.id)!;
        let start = 0;
        for (const dependency of task.after ?? []) {
          expect(position.get(dependency)!).toBeLessThan(position.get(task.id)!);
          start = Math.max(start, result.times.get(dependency)!.earliestEnd);
          // A task ends at the latest before the latest start of each task after it.
          expect(result.times.get(dependency)!.latestEnd).toBeLessThanOrEqual(times.latestStart);
        }
        expect(times.earliestStart).toBe(start);
        expect(times.slack).toBeGreaterThanOrEqual(0);
        expect(times.latestEnd).toBeLessThanOrEqual(result.length);
        latestEnd = Math.max(latestEnd, times.earliestEnd);
      }
      expect(result.length).toBe(latestEnd);
      let sum = 0;
      result.path.forEach((id, i) => {
        sum += byId.get(id)!.duration;
        expect(result.times.get(id)!.slack).toBe(0);
        if (i > 0) expect([...(byId.get(id)!.after ?? [])]).toContain(result.path[i - 1]);
      });
      expect(sum).toBe(result.length);
      if (tasks.length > 0) expect(byId.get(result.path[0]!)!.after ?? []).toHaveLength(0);
    }
  });
});

describe("listSchedule", () => {
  it("runs the diamond on one unit in the order of the tails", () => {
    const result = ok(listSchedule(DIAMOND));
    expect(result.makespan).toBe(9);
    expect(result.tasks.map((task) => [task.id, task.start, task.end, task.wait])).toEqual([
      ["design", 0, 2, 0],
      ["build", 2, 7, 0],
      ["docs", 7, 8, 5],
      ["release", 8, 9, 0],
    ]);
  });

  it("gives the earliest start of each task with an infinite capacity", () => {
    const result = ok(listSchedule(DIAMOND, { capacity: () => Number.POSITIVE_INFINITY }));
    expect(result.makespan).toBe(8);
    expect(result.byId.get("docs")).toMatchObject({ start: 2, end: 3, unit: 1, wait: 0 });
  });

  it("keeps each resource to its own units, and holds the release times", () => {
    const tasks: ScheduleTask<string>[] = [
      { id: "a", duration: 3 },
      { id: "b", duration: 3 },
      { id: "c", duration: 1 },
    ];
    const result = ok(
      listSchedule(tasks, {
        resource: (id) => (id === "c" ? "docs" : "code"),
        release: (id) => (id === "c" ? 4 : 0),
        priority: (id) => (id === "b" ? 2 : 1),
      }),
    );
    expect(result.tasks.map((task) => [task.id, task.resource, task.start, task.end])).toEqual([
      ["b", "code", 0, 3],
      ["a", "code", 3, 6],
      ["c", "docs", 4, 5],
    ]);
    expect(result.byId.get("a")!.wait).toBe(3);
  });

  it("ends a task with no work at its ready time, and starts its successors at once", () => {
    const result = ok(listSchedule([{ id: "gate", duration: 0 }, { id: "work", duration: 2, after: ["gate"] }]));
    expect(result.tasks.map((task) => [task.id, task.start, task.end])).toEqual([
      ["gate", 0, 0],
      ["work", 0, 2],
    ]);
  });

  it("throws a RangeError for a bad capacity, priority or release", () => {
    expect(() => listSchedule(DIAMOND, { capacity: () => 0 })).toThrow(RangeError);
    expect(() => listSchedule(DIAMOND, { capacity: () => 1.5 })).toThrow(RangeError);
    expect(() => listSchedule(DIAMOND, { priority: () => Number.NaN })).toThrow(RangeError);
    expect(() => listSchedule(DIAMOND, { release: () => -1 })).toThrow(RangeError);
  });

  it("gives the problems of the tasks in place of a result", () => {
    expect(listSchedule([{ id: "a", duration: 1, after: ["b"] }, { id: "b", duration: 1, after: ["a"] }]).kind).toBe("cycle");
  });

  it.each(SEEDS)("holds each dependency, each release and each unit, inside the bound of Graham (seed %i)", (seed) => {
    const r = random(seed);
    for (let round = 0; round < 40; round += 1) {
      const tasks = shuffled(r, randomTasks(r));
      const units = r.int(1, 4);
      const release = new Map(tasks.map((task) => [task.id, r.chance(0.3) ? r.int(0, 6) : 0]));
      const result = ok(listSchedule(tasks, { capacity: () => units, release: (id) => release.get(id)! }));
      const plain = ok(listSchedule(tasks, { capacity: () => units }));
      const cpm = ok(criticalPath(tasks));
      for (const task of tasks) {
        const done = result.byId.get(task.id)!;
        expect(done.end - done.start).toBe(task.duration);
        expect(done.start).toBeGreaterThanOrEqual(release.get(task.id)!);
        expect(done.wait).toBeGreaterThanOrEqual(0);
        expect(done.unit).toBeLessThan(units);
        for (const dependency of task.after ?? []) expect(done.start).toBeGreaterThanOrEqual(result.byId.get(dependency)!.end);
      }
      // Two tasks on one unit do not overlap.
      for (const a of result.tasks) {
        for (const b of result.tasks) {
          if (a === b || a.unit !== b.unit || a.start === a.end || b.start === b.end) continue;
          expect(a.end <= b.start || b.end <= a.start).toBe(true);
        }
      }
      expect(result.tasks.map((task) => task.start)).toEqual([...result.tasks.map((task) => task.start)].sort((a, b) => a - b));
      // The bound of Graham for a list schedule on identical units: W / m + (1 - 1 / m) L.
      const work = tasks.reduce((sum, task) => sum + task.duration, 0);
      expect(plain.makespan).toBeGreaterThanOrEqual(cpm.length);
      expect(plain.makespan).toBeLessThanOrEqual(work / units + (1 - 1 / units) * cpm.length + 1e-9);
      // With an infinite capacity the list schedule is the earliest schedule.
      const free = ok(listSchedule(tasks, { capacity: () => Number.POSITIVE_INFINITY }));
      for (const task of tasks) expect(free.byId.get(task.id)!.start).toBe(cpm.times.get(task.id)!.earliestStart);
    }
  });
});

describe("periodSchedule", () => {
  it("shares the capacity of each day in the order of priority, and goes on with a started task first", () => {
    const tasks: ScheduleTask<string>[] = [
      { id: "small", duration: 1 },
      { id: "big", duration: 3 },
      { id: "next", duration: 1, after: ["small"] },
    ];
    const result = ok(periodSchedule(tasks, { capacity: () => 2 }));
    // Day 0: big gets 2 (the longest tail), small gets 0. Day 1: big ends with 1, small ends with 1. Day 2: next.
    expect(result.tasks.map((task) => [task.id, task.start, task.end, task.wait])).toEqual([
      ["big", 0, 1, 0],
      ["small", 1, 1, 1],
      ["next", 2, 2, 0],
    ]);
    expect(result.periods).toBe(3);
    expect(result.unfinished).toEqual([]);
  });

  it("calls the capacity for each period and each resource in a fixed order", () => {
    const calls: string[] = [];
    const tasks: ScheduleTask<string>[] = [
      { id: "a", duration: 2 },
      { id: "b", duration: 1, after: ["a"] },
    ];
    const result = ok(
      periodSchedule(tasks, {
        resource: (id) => (id === "a" ? "code" : "docs"),
        capacity: (resource, period) => {
          calls.push(`${period}:${resource}`);
          return 1;
        },
      }),
    );
    expect(result.periods).toBe(3);
    expect(calls).toEqual(["0:code", "0:docs", "1:code", "1:docs", "2:code", "2:docs"]);
  });

  it("holds the gap and the release, and ends a task with no work with no capacity", () => {
    const tasks: ScheduleTask<string>[] = [
      { id: "a", duration: 1 },
      { id: "gate", duration: 0, after: ["a"] },
      { id: "b", duration: 1, after: ["gate"] },
    ];
    const result = ok(periodSchedule(tasks, { gap: 2, release: (id) => (id === "a" ? 1 : 0) }));
    expect(result.tasks.map((task) => [task.id, task.start, task.end])).toEqual([
      ["a", 1, 1],
      ["gate", 3, 3],
      ["b", 5, 5],
    ]);
  });

  it("stops at the horizon and names the tasks that did not end", () => {
    const result = ok(periodSchedule(DIAMOND, { capacity: () => 0, horizon: 10 }));
    expect(result.tasks).toEqual([]);
    expect(result.periods).toBe(0);
    expect(result.unfinished).toEqual(["design", "build", "docs", "release"]);
  });

  it("throws a RangeError for a bad capacity, release, gap or horizon", () => {
    expect(() => periodSchedule(DIAMOND, { capacity: () => -1 })).toThrow(RangeError);
    expect(() => periodSchedule(DIAMOND, { release: () => 0.5 })).toThrow(RangeError);
    expect(() => periodSchedule(DIAMOND, { gap: 0 })).toThrow(RangeError);
    expect(() => periodSchedule(DIAMOND, { horizon: -1 })).toThrow(RangeError);
  });

  it.each(SEEDS)("holds each dependency and each cumulative capacity, with the same draws each time (seed %i)", (seed) => {
    const r = random(seed);
    for (let round = 0; round < 40; round += 1) {
      const tasks = shuffled(r, randomTasks(r));
      const gap = r.int(1, 2);
      const teams = ["a", "b", "c"].slice(0, r.int(1, 3));
      const team = new Map(tasks.map((task) => [task.id, teams[r.int(0, teams.length - 1)]!]));
      const drawSeed = r.int(0, 1_000_000);
      const run = () => {
        const draws = random(drawSeed);
        const capacities = new Map<string, number>();
        const result = ok(
          periodSchedule(tasks, {
            gap,
            resource: (id) => team.get(id)!,
            capacity: (resource, period) => {
              const value = draws.int(0, 3);
              capacities.set(`${resource}:${period}`, value);
              return value;
            },
          }),
        );
        return { result, capacities };
      };
      const { result, capacities } = run();
      expect(run().result).toEqual(result);
      expect(result.unfinished).toEqual([]);
      for (const task of tasks) {
        const done = result.byId.get(task.id)!;
        expect(done.wait).toBeGreaterThanOrEqual(0);
        expect(done.end).toBeGreaterThanOrEqual(done.start);
        for (const dependency of task.after ?? []) expect(done.start).toBeGreaterThanOrEqual(result.byId.get(dependency)!.end + gap);
      }
      // The work that ends on a resource by a period is at most its capacity up to that period.
      for (const name of teams) {
        const own = tasks.filter((task) => team.get(task.id) === name);
        for (let period = 0; period < result.periods; period += 1) {
          let supply = 0;
          for (let p = 0; p <= period; p += 1) supply += capacities.get(`${name}:${p}`) ?? 0;
          const work = own.filter((task) => result.byId.get(task.id)!.end <= period).reduce((sum, task) => sum + task.duration, 0);
          expect(work).toBeLessThanOrEqual(supply);
        }
      }
      // With a large capacity each task ends in its ready period.
      const fast = ok(periodSchedule(tasks, { gap, capacity: () => 1_000 }));
      const cpm = ok(criticalPath(tasks));
      for (const id of cpm.order) {
        const task = tasks.find((item) => item.id === id)!;
        let ready = 0;
        for (const dependency of task.after ?? []) ready = Math.max(ready, fast.byId.get(dependency)!.end + gap);
        expect(fast.byId.get(id)).toMatchObject({ start: ready, end: ready, wait: 0 });
      }
    }
  });
});
