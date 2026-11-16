/**
 * Schedules of tasks with dependencies:
 *
 * - the critical path,
 * - a list schedule on resources with a count of units,
 * - a schedule by periods, with a capacity for each resource and period.
 */

import { PriorityQueue } from "../impl/priority-queue.js";

/** A task of a schedule. */
export interface ScheduleTask<K> {
  /** The id of the task. The functions compare the ids as a `Map` compares its keys. */
  readonly id: K;
  /**
   * The length of the task, a finite number from 0. In `periodSchedule` it is the work of the task, in units of the
   * capacity of its resource.
   */
  readonly duration: number;
  /** The ids of the tasks that end before this task starts. An id that comes two times counts one time. */
  readonly after?: Iterable<K> | undefined;
}

/** A problem in the tasks that stops each schedule. */
export type ScheduleProblem<K> =
  /** Two tasks have the id `task`. */
  | { readonly kind: "duplicate"; readonly task: K }
  /** The task `task` comes after `dependency`, but no task has that id. */
  | { readonly kind: "missing"; readonly task: K; readonly dependency: K }
  /** Each task of `cycle` comes after the task before it, and the first task comes after the last. */
  | { readonly kind: "cycle"; readonly cycle: readonly K[] };

/** The times of a task in the critical path method. */
export interface TaskTimes {
  /** The earliest time at which the task can start: the latest end of its dependencies, or 0. */
  readonly earliestStart: number;
  /** `earliestStart` plus the duration. */
  readonly earliestEnd: number;
  /** The latest start that does not make the schedule longer. */
  readonly latestStart: number;
  /** `latestStart` plus the duration. */
  readonly latestEnd: number;
  /** `latestStart` minus `earliestStart`, from 0. A task with slack 0 is on a critical path. */
  readonly slack: number;
  /** The length of the longest chain of tasks that starts with this task: its duration plus the longest tail after it. */
  readonly tail: number;
}

/** The result of `criticalPath`. */
export type CriticalPath<K> =
  | {
      readonly kind: "ok";
      /** The length of the schedule: the longest tail of a task, or 0 for no task. */
      readonly length: number;
      /** The ids in a topological order: each task after its dependencies, and else in the input order. */
      readonly order: readonly K[];
      /** The times of each task. */
      readonly times: ReadonlyMap<K, TaskTimes>;
      /** One critical path: a chain of tasks, each after the one before it, whose durations add up to `length`. */
      readonly path: readonly K[];
    }
  | ScheduleProblem<K>;

/** The options of `listSchedule`. */
export interface ListScheduleOptions<K, R> {
  /** The resource of a task. The default puts each task on one shared resource, `undefined`. */
  readonly resource?: ((task: K) => R) | undefined;
  /** The count of units of a resource: a whole number from 1, or `Infinity`. The default is 1. */
  readonly capacity?: ((resource: R) => number) | undefined;
  /** The priority of a task: a ready task with a higher priority starts first. The default is the tail of the task. */
  readonly priority?: ((task: K) => number) | undefined;
  /** The earliest start of a task, a finite number from 0. The default is 0. */
  readonly release?: ((task: K) => number) | undefined;
}

/** A task in a list schedule. */
export interface ScheduledTask<K, R> {
  readonly id: K;
  readonly resource: R;
  /** The unit of the resource that does the task, from 0. Each unit does one task at a time. */
  readonly unit: number;
  readonly start: number;
  readonly end: number;
  /** The time that the task waited for a free unit: `start` minus the time at which it was ready. */
  readonly wait: number;
}

/** The result of `listSchedule`. */
export type ListSchedule<K, R> =
  | {
      readonly kind: "ok";
      /** The latest end of a task, or 0 for no task. */
      readonly makespan: number;
      /** The tasks by start, and else in the input order. */
      readonly tasks: readonly ScheduledTask<K, R>[];
      readonly byId: ReadonlyMap<K, ScheduledTask<K, R>>;
    }
  | ScheduleProblem<K>;

/** The options of `periodSchedule`. */
export interface PeriodScheduleOptions<K, R> {
  /** The resource of a task. The default puts each task on one shared resource, `undefined`. */
  readonly resource?: ((task: K) => R) | undefined;
  /**
   * The capacity of a resource in a period, a finite number from 0. The default is 1. The schedule uses the function
   * for each period from 0 up to its last period. In each period, it uses the function one time for each resource, in
   * the order in which the tasks name the resources. So a seeded stream of draws gives the same schedule each time.
   * Two plans on the same resources get the same draws.
   */
  readonly capacity?: ((resource: R, period: number) => number) | undefined;
  /** The priority of a task: a ready task with a higher priority gets the capacity first. The default is its tail. */
  readonly priority?: ((task: K) => number) | undefined;
  /** The earliest period of a task, a whole number from 0. The default is 0. */
  readonly release?: ((task: K) => number) | undefined;
  /**
   * The count of periods from the end period of the last dependency of a task to its earliest period, a whole number
   * from 1. The default is 1: a task can start in the period after its dependencies end.
   */
  readonly gap?: number | undefined;
  /** The count of periods after which the schedule stops, a whole number from 0. The default is 100000. */
  readonly horizon?: number | undefined;
}

/** A task in a schedule by periods. */
export interface PeriodTask<K, R> {
  readonly id: K;
  readonly resource: R;
  /** The first period in which the task got capacity, or its ready period for a task with no work. */
  readonly start: number;
  /** The period in which the work of the task ended. */
  readonly end: number;
  /** The count of periods that the task waited for capacity: `start` minus its ready period. */
  readonly wait: number;
}

/** The result of `periodSchedule`. */
export type PeriodSchedule<K, R> =
  | {
      readonly kind: "ok";
      /** The count of periods up to the end of the last task: its end period plus 1, or 0 for no task. */
      readonly periods: number;
      /** The tasks that ended, by start, and else in the input order. */
      readonly tasks: readonly PeriodTask<K, R>[];
      readonly byId: ReadonlyMap<K, PeriodTask<K, R>>;
      /** The tasks that did not end before the horizon, in the input order. Empty when each task ended. */
      readonly unfinished: readonly K[];
    }
  | ScheduleProblem<K>;

/** The tasks as indexes, in a topological order, with the earliest start and the tail of each task. */
interface Plan<K> {
  readonly ids: readonly K[];
  readonly duration: Float64Array;
  readonly predecessors: readonly (readonly number[])[];
  readonly successors: readonly (readonly number[])[];
  readonly order: Int32Array;
  readonly head: Float64Array;
  readonly tail: Float64Array;
}

/** A min heap of numbers, for the indexes of the tasks and the units. */
function numberHeap(): PriorityQueue<number> {
  return new PriorityQueue<number>({ compare: (a, b) => a - b });
}

function prepare<K>(tasks: Iterable<ScheduleTask<K>>): Plan<K> | ScheduleProblem<K> {
  const list = [...tasks];
  const n = list.length;
  const index = new Map<K, number>();
  const duration = new Float64Array(n);
  for (let v = 0; v < n; v += 1) {
    const task = list[v]!;
    if (index.has(task.id)) return { kind: "duplicate", task: task.id };
    if (!Number.isFinite(task.duration) || task.duration < 0) {
      throw new RangeError(`The duration of a task is a finite number from 0, not ${task.duration}.`);
    }
    index.set(task.id, v);
    duration[v] = task.duration;
  }
  const predecessors: number[][] = [];
  const successors: number[][] = Array.from({ length: n }, () => []);
  for (let v = 0; v < n; v += 1) {
    const task = list[v]!;
    const own = new Set<number>();
    for (const dependency of task.after ?? []) {
      const p = index.get(dependency);
      if (p === undefined) return { kind: "missing", task: task.id, dependency };
      own.add(p);
    }
    const sorted = [...own].sort((a, b) => a - b);
    predecessors.push(sorted);
    for (const p of sorted) successors[p]!.push(v);
  }
  // The order of Kahn, with the smallest index first among the ready tasks.
  const count = new Int32Array(n);
  const ready = numberHeap();
  for (let v = 0; v < n; v += 1) {
    count[v] = predecessors[v]!.length;
    if (count[v] === 0) ready.offer(v);
  }
  const order = new Int32Array(n);
  let placed = 0;
  while (ready.size > 0) {
    const v = ready.poll();
    order[placed] = v;
    placed += 1;
    for (const s of successors[v]!) {
      count[s] = count[s]! - 1;
      if (count[s] === 0) ready.offer(s);
    }
  }
  if (placed < n) {
    // Each task that is not placed has a predecessor that is not placed. A walk back along them closes a cycle.
    let v = 0;
    while (count[v] === 0) v += 1;
    const seen = new Map<number, number>();
    const walk: number[] = [];
    while (!seen.has(v)) {
      seen.set(v, walk.length);
      walk.push(v);
      v = predecessors[v]!.find((p) => count[p]! > 0)!;
    }
    const cycle = walk.slice(seen.get(v)).reverse();
    return { kind: "cycle", cycle: cycle.map((c) => list[c]!.id) };
  }
  const head = new Float64Array(n);
  for (let i = 0; i < n; i += 1) {
    const v = order[i]!;
    let start = 0;
    for (const p of predecessors[v]!) start = Math.max(start, head[p]! + duration[p]!);
    head[v] = start;
  }
  const tail = new Float64Array(n);
  for (let i = n - 1; i >= 0; i -= 1) {
    const v = order[i]!;
    let after = 0;
    for (const s of successors[v]!) after = Math.max(after, tail[s]!);
    tail[v] = duration[v]! + after;
  }
  return { ids: list.map((task) => task.id), duration, predecessors, successors, order, head, tail };
}

function isProblem<K>(plan: Plan<K> | ScheduleProblem<K>): plan is ScheduleProblem<K> {
  return "kind" in plan;
}

/** The priority of each task, from the option or from the tail. */
function priorities<K>(plan: Plan<K>, priority: ((task: K) => number) | undefined): Float64Array {
  if (priority === undefined) return plan.tail;
  const values = new Float64Array(plan.ids.length);
  plan.ids.forEach((id, v) => {
    const value = priority(id);
    if (!Number.isFinite(value)) throw new RangeError(`The priority of a task is a finite number, not ${value}.`);
    values[v] = value;
  });
  return values;
}

/** A max heap of the indexes of the tasks by priority, and else by the smallest index. */
function taskHeap(priority: Float64Array): PriorityQueue<number> {
  return new PriorityQueue<number>({ compare: (a, b) => priority[b]! - priority[a]! || a - b });
}

/** The resource of each task, and the resources in the order in which the tasks name them. */
function resources<K, R>(plan: Plan<K>, resource: ((task: K) => R) | undefined): { of: R[]; list: R[]; at: Int32Array } {
  const of = plan.ids.map((id) => (resource === undefined ? (undefined as R) : resource(id)));
  const position = new Map<R, number>();
  const list: R[] = [];
  const at = new Int32Array(of.length);
  of.forEach((r, v) => {
    let p = position.get(r);
    if (p === undefined) {
      p = list.length;
      position.set(r, p);
      list.push(r);
    }
    at[v] = p;
  });
  return { of, list, at };
}

/**
 * This function gives the critical path of the tasks. It gives the earliest and the latest times of each task and its
 * slack. It also gives one chain of tasks whose durations give the length of the schedule. The schedule has no limit of
 * resources.
 *
 * - The order is topological, with the input order among the ready tasks.
 * - The path starts at the first task in the order whose tail is the length. Then it goes to the successor with the
 *   longest tail, the first in the input order on a tie. So the sum of its durations is the length, with no rounding.
 * - Two tasks with one id, a dependency that is not a task, or a cycle, give a problem in place of a result.
 * - A duration that is not a finite number from 0 throws a `RangeError`.
 *
 * The function is pure. The work is linear in the count of the tasks and dependencies, plus a heap for the order.
 */
export function criticalPath<K>(tasks: Iterable<ScheduleTask<K>>): CriticalPath<K> {
  const plan = prepare(tasks);
  if (isProblem(plan)) return plan;
  const { ids, duration, successors, order, head, tail } = plan;
  const n = ids.length;
  let length = 0;
  for (let v = 0; v < n; v += 1) length = Math.max(length, tail[v]!);
  const times = new Map<K, TaskTimes>();
  for (let i = 0; i < n; i += 1) {
    const v = order[i]!;
    const latestStart = length - tail[v]!;
    times.set(ids[v]!, {
      earliestStart: head[v]!,
      earliestEnd: head[v]! + duration[v]!,
      latestStart,
      latestEnd: latestStart + duration[v]!,
      slack: Math.max(0, latestStart - head[v]!),
      tail: tail[v]!,
    });
  }
  const path: K[] = [];
  if (n > 0) {
    let v = -1;
    for (let i = 0; i < n && v === -1; i += 1) if (tail[order[i]!] === length) v = order[i]!;
    while (v !== -1) {
      path.push(ids[v]!);
      let next = -1;
      for (const s of successors[v]!) if (next === -1 || tail[s]! > tail[next]!) next = s;
      v = next;
    }
  }
  return { kind: "ok", length, order: Array.from(order, (v) => ids[v]!), times, path };
}

/**
 * This function gives a list schedule of the tasks on resources with a count of units. At each time, each free unit
 * starts the ready task of its resource with the highest priority. A task is ready when its dependencies end and its
 * release time comes. A task keeps its unit from its start to its end.
 *
 * - The default priority is the tail of the task, so the longest chain goes first (the rule of the critical path).
 * - Ties in the priority go to the first task in the input order. A task takes the free unit with the smallest number.
 * - With an infinite capacity, each task starts when it is ready, so the schedule is the earliest start of
 *   `criticalPath`.
 * - Two tasks with one id, a dependency that is not a task, or a cycle, give a problem in place of a result.
 * - A bad duration, capacity, priority or release throws a `RangeError`.
 *
 * The function is pure if its options are pure. It calls `capacity` one time for each resource.
 */
export function listSchedule<K, R = undefined>(
  tasks: Iterable<ScheduleTask<K>>,
  options: ListScheduleOptions<K, R> = {},
): ListSchedule<K, R> {
  const plan = prepare(tasks);
  if (isProblem(plan)) return plan;
  const { ids, duration, predecessors, successors } = plan;
  const n = ids.length;
  const priority = priorities(plan, options.priority);
  const { of, list, at } = resources(plan, options.resource);
  const capacity = list.map((r) => {
    const value = options.capacity === undefined ? 1 : options.capacity(r);
    if (value !== Number.POSITIVE_INFINITY && (!Number.isInteger(value) || value < 1)) {
      throw new RangeError(`The capacity of a resource is a whole number from 1, or Infinity, not ${value}.`);
    }
    return value;
  });
  const release = new Float64Array(n);
  if (options.release !== undefined) {
    for (let v = 0; v < n; v += 1) {
      const value = options.release(ids[v]!);
      if (!Number.isFinite(value) || value < 0) throw new RangeError(`The release of a task is a finite number from 0, not ${value}.`);
      release[v] = value;
    }
  }
  // The events: a task that ends, or a task that becomes ready, by time and then by the order of their entry.
  interface TimeEvent {
    readonly time: number;
    readonly task: number;
    readonly end: boolean;
    readonly entry: number;
  }
  const events = new PriorityQueue<TimeEvent>({ compare: (a, b) => a.time - b.time || a.entry - b.entry });
  let entry = 0;
  const push = (time: number, task: number, end: boolean): void => {
    events.offer({ time, task, end, entry });
    entry += 1;
  };
  const waiting = list.map(() => taskHeap(priority));
  const free = list.map(() => numberHeap());
  const opened = new Float64Array(list.length);
  const count = new Int32Array(n);
  const readyAt = new Float64Array(n);
  const start = new Float64Array(n);
  const unit = new Int32Array(n);
  for (let v = 0; v < n; v += 1) {
    count[v] = predecessors[v]!.length;
    if (count[v] === 0) push(release[v]!, v, false);
  }
  let makespan = 0;
  while (events.size > 0) {
    const time = events.peek().time;
    const touched = new Set<number>();
    while (events.size > 0 && events.peek().time === time) {
      const event = events.poll();
      const v = event.task;
      if (event.end) {
        free[at[v]!]!.offer(unit[v]!);
        touched.add(at[v]!);
        makespan = Math.max(makespan, time);
        for (const s of successors[v]!) {
          count[s] = count[s]! - 1;
          if (count[s] === 0) push(Math.max(time, release[s]!), s, false);
        }
      } else {
        readyAt[v] = time;
        waiting[at[v]!]!.offer(v);
        touched.add(at[v]!);
      }
    }
    for (const r of [...touched].sort((a, b) => a - b)) {
      const queue = waiting[r]!;
      while (queue.size > 0) {
        let u: number;
        if (free[r]!.size > 0) u = free[r]!.poll();
        else if (opened[r]! < capacity[r]!) {
          u = opened[r]!;
          opened[r] = u + 1;
        } else break;
        const v = queue.poll();
        start[v] = time;
        unit[v] = u;
        push(time + duration[v]!, v, true);
      }
    }
  }
  const scheduled = Array.from({ length: n }, (_, v): ScheduledTask<K, R> => ({
    id: ids[v]!,
    resource: of[v]!,
    unit: unit[v]!,
    start: start[v]!,
    end: start[v]! + duration[v]!,
    wait: start[v]! - readyAt[v]!,
  }));
  const byId = new Map(scheduled.map((task) => [task.id, task] as const));
  const sorted = scheduled.map((task, v) => ({ task, v })).sort((a, b) => a.task.start - b.task.start || a.v - b.v);
  return { kind: "ok", makespan, tasks: sorted.map((item) => item.task), byId };
}

/**
 * This function gives a schedule of the tasks by periods, for example by days. Each resource has a capacity in each
 * period, for example the count of items that a team ends on a day, drawn by a seed. In each period, the capacity of a
 * resource goes first to its started tasks, in the order of their start. Then it goes to its ready tasks by priority. A task ends in the period in which it gets the last part of its work.
 *
 * - A task is ready in the period `gap` after the end period of its last dependency, and not before its release.
 * - A task with no work ends in its ready period, with no capacity.
 * - A task can get capacity in more than one period, and more than one task can share the capacity of a period.
 * - The schedule stops after `horizon` periods. The tasks that did not end are in `unfinished`.
 * - Two tasks with one id, a dependency that is not a task, or a cycle, give a problem in place of a result.
 * - A bad duration, capacity, priority, release, gap or horizon throws a `RangeError`.
 *
 * The function is pure if its options are pure. The order of its calls of `capacity` is in `PeriodScheduleOptions`.
 */
export function periodSchedule<K, R = undefined>(
  tasks: Iterable<ScheduleTask<K>>,
  options: PeriodScheduleOptions<K, R> = {},
): PeriodSchedule<K, R> {
  const gap = options.gap ?? 1;
  if (!Number.isInteger(gap) || gap < 1) throw new RangeError(`The gap is a whole number from 1, not ${gap}.`);
  const horizon = options.horizon ?? 100_000;
  if (!Number.isInteger(horizon) || horizon < 0) throw new RangeError(`The horizon is a whole number from 0, not ${horizon}.`);
  const plan = prepare(tasks);
  if (isProblem(plan)) return plan;
  const { ids, duration, predecessors, successors } = plan;
  const n = ids.length;
  const priority = priorities(plan, options.priority);
  const { of, list, at } = resources(plan, options.resource);
  const readyAt = new Float64Array(n);
  for (let v = 0; v < n; v += 1) {
    const value = options.release === undefined ? 0 : options.release(ids[v]!);
    if (!Number.isInteger(value) || value < 0) throw new RangeError(`The release of a task is a whole number from 0, not ${value}.`);
    readyAt[v] = value;
  }
  // The tasks whose dependencies ended, by ready period and then by index.
  const pending = new PriorityQueue<number>({ compare: (a, b) => readyAt[a]! - readyAt[b]! || a - b });
  const count = new Int32Array(n);
  for (let v = 0; v < n; v += 1) {
    count[v] = predecessors[v]!.length;
    if (count[v] === 0) pending.offer(v);
  }
  const waiting = list.map(() => taskHeap(priority));
  const started: number[][] = list.map(() => []);
  const left = Float64Array.from(duration);
  const start = new Float64Array(n).fill(-1);
  const end = new Float64Array(n).fill(-1);
  let ended = 0;
  let periods = 0;
  const finish = (v: number, period: number): void => {
    end[v] = period;
    ended += 1;
    periods = period + 1;
    for (const s of successors[v]!) {
      count[s] = count[s]! - 1;
      if (count[s] === 0) {
        readyAt[s] = Math.max(readyAt[s]!, period + gap);
        pending.offer(s);
      }
    }
  };
  for (let period = 0; period < horizon && ended < n; period += 1) {
    while (pending.size > 0 && readyAt[pending.peek()]! <= period) {
      const v = pending.poll();
      if (left[v] === 0) {
        start[v] = period;
        finish(v, period);
      } else waiting[at[v]!]!.offer(v);
    }
    for (let r = 0; r < list.length; r += 1) {
      let free = options.capacity === undefined ? 1 : options.capacity(list[r]!, period);
      if (!Number.isFinite(free) || free < 0) throw new RangeError(`The capacity of a resource in a period is a finite number from 0, not ${free}.`);
      const own = started[r]!;
      while (free > 0 && (own.length > 0 || waiting[r]!.size > 0)) {
        let v: number;
        if (own.length > 0) v = own[0]!;
        else {
          v = waiting[r]!.poll();
          start[v] = period;
          own.push(v);
        }
        const used = Math.min(left[v]!, free);
        left[v] = left[v]! - used;
        free -= used;
        if (left[v] === 0) {
          own.shift();
          finish(v, period);
        }
      }
    }
  }
  const done: { task: PeriodTask<K, R>; v: number }[] = [];
  const unfinished: K[] = [];
  for (let v = 0; v < n; v += 1) {
    if (end[v]! < 0) {
      unfinished.push(ids[v]!);
      continue;
    }
    done.push({ task: { id: ids[v]!, resource: of[v]!, start: start[v]!, end: end[v]!, wait: start[v]! - readyAt[v]! }, v });
  }
  done.sort((a, b) => a.task.start - b.task.start || a.v - b.v);
  const sorted = done.map((item) => item.task);
  return { kind: "ok", periods, tasks: sorted, byId: new Map(sorted.map((task) => [task.id, task] as const)), unfinished };
}
