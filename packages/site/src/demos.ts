/** The page code of the three demos. `model.ts` has their state. */
import { createProcessor, executeDAG } from "@mark1russell7/collections/dag";
import { byId } from "@mark1russell7/site-pages/chrome";
import { CacheModel, nextValue, planOf, startNeeds, TreeModel, type Plan } from "./model.ts";

const KEYS = ["A", "B", "C", "D", "E", "F"];
const MIN_CAPACITY = 2;
const MAX_CAPACITY = 6;
const START_KEYS = ["A", "B", "C"];
const START_LEAVES = [3, 1, 4, 1, 5, 9, 2, 6];
const NEW_LEAVES = [5, 3, 8, 7];
const MAX_LEAVES = 12;
const TASK_MS = 500;

/** This function makes a button. */
function button(text: string, onClick: () => void, label?: string): HTMLButtonElement {
  const item = document.createElement("button");
  item.type = "button";
  item.textContent = text;
  if (label !== undefined) item.setAttribute("aria-label", label);
  item.addEventListener("click", onClick);
  return item;
}

/** This function starts the cache demo. */
export function mountCache(): void {
  const model = new CacheModel(START_KEYS.length, START_KEYS);
  const slots = byId("cache-slots");
  const log = byId("cache-log");
  const capacity = byId("cache-capacity");
  const fewer = byId<HTMLButtonElement>("cache-fewer");
  const more = byId<HTMLButtonElement>("cache-more");

  const draw = (): void => {
    const keys = model.keys();
    slots.style.setProperty("--slots", String(model.capacity));
    slots.replaceChildren(
      ...Array.from({ length: model.capacity }, (_, index) => {
        const slot = document.createElement("li");
        slot.textContent = keys[index] ?? "";
        slot.dataset["state"] = keys[index] === undefined ? "empty" : index === keys.length - 1 && keys.length === model.capacity ? "next" : "held";
        return slot;
      }),
    );
    capacity.textContent = String(model.capacity);
    fewer.disabled = model.capacity <= MIN_CAPACITY;
    more.disabled = model.capacity >= MAX_CAPACITY;
    byId("cache-hits").textContent = String(model.hits);
    byId("cache-misses").textContent = String(model.misses);
  };

  const resize = (size: number): void => {
    const left = model.resize(size);
    log.textContent = left.length > 0 ? `The cache now holds ${String(size)}. It dropped ${left.join(", ")}.` : `The cache now holds ${String(size)}.`;
    draw();
  };

  byId("cache-keys").replaceChildren(
    ...KEYS.map((key) => {
      const item = button(key, () => {
        const { hit, left } = model.read(key);
        const first = hit ? `${key} was in the cache, so it is the newest now.` : `${key} was not in the cache, so the cache loaded it.`;
        log.textContent = left === undefined ? first : `${first} ${left} waited longest, so it left.`;
        draw();
      });
      item.dataset["key"] = key;
      return item;
    }),
  );
  fewer.addEventListener("click", () => {
    resize(model.capacity - 1);
  });
  more.addEventListener("click", () => {
    resize(model.capacity + 1);
  });
  draw();
}

/** This function starts the summary tree demo. */
export function mountTree(): void {
  const model = new TreeModel(START_LEAVES);
  const bars = byId("tree-bars");
  const older = byId<HTMLButtonElement>("tree-older");
  const newer = byId<HTMLButtonElement>("tree-newer");
  const add = byId<HTMLButtonElement>("tree-add");
  const remove = byId<HTMLButtonElement>("tree-remove");
  let added = 0;

  const draw = (): void => {
    const { tree, index, versions } = model;
    bars.replaceChildren(
      ...tree.toArray().map((value, leaf) => {
        const item = button(String(value), () => {
          model.edit((current) => current.set(leaf, nextValue(value)));
          draw();
        }, `Leaf ${String(leaf + 1)} has the value ${String(value)}. Change it.`);
        item.style.setProperty("--value", String(value));
        return item;
      }),
    );
    byId("tree-version").textContent = `Version ${String(index + 1)} of ${String(versions.length)}`;
    byId("tree-sum").textContent = String(tree.summary.sum);
    byId("tree-max").textContent = String(tree.summary.max);
    byId("tree-size").textContent = String(tree.size);
    older.disabled = index === 0;
    newer.disabled = index === versions.length - 1;
    add.disabled = tree.size >= MAX_LEAVES;
    remove.disabled = tree.size <= 1;
  };

  older.addEventListener("click", () => {
    model.index -= 1;
    draw();
  });
  newer.addEventListener("click", () => {
    model.index += 1;
    draw();
  });
  add.addEventListener("click", () => {
    const leaf = NEW_LEAVES[added % NEW_LEAVES.length] ?? 1;
    added += 1;
    model.edit((tree) => tree.append(leaf));
    draw();
  });
  remove.addEventListener("click", () => {
    model.edit((tree) => tree.remove(tree.size - 1));
    draw();
  });
  draw();
}

/** This function starts the dependency graph demo. */
export function mountGraph(): void {
  const needs = startNeeds();
  const states = new Map<string, string>();
  const levels = byId("graph-levels");
  const chips = byId("graph-needs");
  const log = byId("graph-log");
  const run = byId<HTMLButtonElement>("graph-run");
  const fewer = byId<HTMLButtonElement>("graph-fewer");
  const more = byId<HTMLButtonElement>("graph-more");
  let selected = "build";
  let limit = 2;
  let running = false;
  let plan: Plan = planOf(needs);

  const drawLevels = (): void => {
    if ("error" in plan) {
      levels.replaceChildren();
      return;
    }
    levels.replaceChildren(
      ...plan.dag.levels.map((level, index) => {
        const row = document.createElement("li");
        const label = document.createElement("span");
        label.className = "level-name";
        label.textContent = `Step ${String(index + 1)}`;
        const tasks = level.map((node) => {
          const item = button(node.id, () => {
            if (running) return;
            selected = node.id;
            draw();
          });
          item.dataset["task"] = node.id;
          item.dataset["state"] = states.get(node.id) ?? "wait";
          item.setAttribute("aria-pressed", String(node.id === selected));
          return item;
        });
        row.replaceChildren(label, ...tasks);
        return row;
      }),
    );
  };

  const draw = (): void => {
    plan = planOf(needs);
    drawLevels();
    byId("graph-selected").textContent = selected;
    const set = needs.get(selected) ?? new Set<string>();
    chips.replaceChildren(
      ...[...needs.keys()]
        .filter((task) => task !== selected)
        .map((task) => {
          const item = button(task, () => {
            if (set.has(task)) set.delete(task);
            else set.add(task);
            states.clear();
            log.textContent = "Press Run to start the tasks.";
            draw();
          });
          item.dataset["need"] = task;
          item.disabled = running;
          item.setAttribute("aria-pressed", String(set.has(task)));
          return item;
        }),
    );
    const error = byId("graph-error");
    error.textContent = "error" in plan ? plan.error : "";
    error.hidden = !("error" in plan);
    byId("graph-limit").textContent = String(limit);
    run.disabled = running || "error" in plan;
    fewer.disabled = running || limit <= 1;
    more.disabled = running || limit >= 4;
  };

  fewer.addEventListener("click", () => {
    limit -= 1;
    draw();
  });
  more.addEventListener("click", () => {
    limit += 1;
    draw();
  });
  run.addEventListener("click", () => {
    if ("error" in plan) return;
    const { dag } = plan;
    running = true;
    states.clear();
    log.textContent = "The tasks are running.";
    draw();
    const wait = createProcessor(() => new Promise<void>((done) => setTimeout(done, TASK_MS)));
    void executeDAG(dag, wait, {
      concurrency: limit,
      onNodeStart: (node) => {
        states.set(node.id, "run");
        drawLevels();
      },
      onNodeComplete: (result) => {
        states.set(result.node.id, "done");
        drawLevels();
      },
    }).then((result) => {
      running = false;
      log.textContent = `${String(result.results.size)} tasks of ${(TASK_MS / 1000).toFixed(1)} s took ${(result.totalDuration / 1000).toFixed(1)} s with ${String(limit)} at a time.`;
      draw();
    });
  });
  draw();
}
