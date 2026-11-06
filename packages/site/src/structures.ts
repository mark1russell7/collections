/** The page code of the structures explorer. `structures-model.ts` has the state. */
import { byId, setupTheme } from "@mark1russell7/site-pages/chrome";
import { Explorer, STRUCTURES, type Field, type Input, type View } from "./structures-model.ts";

/** The number of calls that the log shows. */
const LOG_LINES = 8;

setupTheme(byId<HTMLButtonElement>("theme"), "theme");

const fields: Readonly<Record<Field, HTMLElement>> = { value: byId("field-value"), index: byId("field-index"), key: byId("field-key") };
let explorer = new Explorer(STRUCTURES[0]!);

/** This function makes an element with a class and a text. */
function element<K extends keyof HTMLElementTagNameMap>(tag: K, text = "", className = ""): HTMLElementTagNameMap[K] {
  const made = document.createElement(tag);
  made.textContent = text;
  if (className !== "") made.className = className;
  return made;
}

/** This function reads the input fields. An empty or a wrong number gives 0. */
function input(): Input {
  const number = (id: string): number => {
    const value = Math.trunc(Number(byId<HTMLInputElement>(id).value));
    return Number.isFinite(value) ? value : 0;
  };
  return { value: number("input-value"), index: number("input-index"), key: byId<HTMLSelectElement>("input-key").value };
}

/** This function draws the items in a row, or as the levels of a binary heap. */
function drawItems(list: HTMLElement, view: View): void {
  list.dataset["shape"] = view.shape;
  if (view.items.length === 0) {
    list.replaceChildren(element("li", "empty", "empty"));
    return;
  }
  if (view.shape === "row") {
    list.replaceChildren(...view.items.map((item) => element("li", item)));
    return;
  }
  // Level k of a heap holds the indexes 2^k - 1 to 2^(k+1) - 2
  const levels: HTMLElement[] = [];
  for (let start = 0, width = 1; start < view.items.length; start += width, width *= 2) {
    const level = element("li", "", "level");
    const cells = element("ol");
    cells.replaceChildren(...view.items.slice(start, start + width).map((item) => element("li", item)));
    level.append(cells);
    levels.push(level);
  }
  list.replaceChildren(...levels);
}

/** This function draws the state of the explorer. */
function draw(): void {
  const { structure } = explorer;
  const view = explorer.view();
  byId("explore-maker").textContent = structure.maker;
  byId("explore-kind").textContent = structure.kind;
  byId("explore-summary").textContent = structure.summary;
  byId("explore-start").textContent = `const ${structure.variable} = ${structure.start}`;
  drawItems(byId("explore-items"), view);
  byId("explore-facts").textContent = view.facts;

  const used = new Set(structure.operations.flatMap((op) => op.fields));
  for (const [field, label] of Object.entries(fields)) label.hidden = !used.has(field as Field);

  const lines = explorer.log.slice(-LOG_LINES).reverse();
  byId("explore-log").replaceChildren(
    ...lines.map((line) => {
      const item = element("li", "", line.threw ? "threw" : "");
      item.append(element("code", line.code), element("span", " → ", "arrow"), element("code", line.result, "result"));
      return item;
    }),
  );
  byId("explore-empty").hidden = lines.length > 0;

  const persistent = explorer.versions.length > 1;
  byId("explore-version").textContent = persistent ? `Version ${String(explorer.versions.length)}. Each earlier version stays whole.` : "";
  byId("explore-versions").hidden = !persistent;
  byId("explore-version-list").replaceChildren(
    ...explorer.versions.slice(0, -1).map((version, index) => {
      const item = element("li");
      item.append(element("span", `Version ${String(index + 1)}: `), element("code", structure.view(version as never).items.join(", ")));
      return item;
    }),
  );
}

/** This function makes the buttons of the operations of the current structure. */
function drawOperations(): void {
  byId("explore-ops").replaceChildren(
    ...explorer.structure.operations.map((op) => {
      const button = element("button");
      button.type = "button";
      button.dataset["op"] = op.name;
      button.setAttribute("aria-label", `${op.name}, cost ${op.cost}`);
      button.append(element("code", op.name), element("span", op.cost, "cost"));
      button.addEventListener("click", () => {
        explorer.apply(op.name, input());
        draw();
      });
      return button;
    }),
  );
}

/** This function selects a structure by the name of its maker. An unknown name selects the first structure. */
function select(maker: string): void {
  const structure = STRUCTURES.find((item) => item.maker === maker) ?? STRUCTURES[0]!;
  explorer = new Explorer(structure);
  for (const button of byId("pick").querySelectorAll<HTMLButtonElement>("button")) {
    button.setAttribute("aria-pressed", String(button.dataset["maker"] === structure.maker));
  }
  drawOperations();
  draw();
}

byId("pick").replaceChildren(
  ...STRUCTURES.map((structure) => {
    const button = element("button");
    button.type = "button";
    button.dataset["maker"] = structure.maker;
    button.append(element("code", structure.maker));
    button.addEventListener("click", () => {
      history.replaceState(null, "", `#${structure.maker}`);
      select(structure.maker);
    });
    return button;
  }),
);

byId("explore-reset").addEventListener("click", () => {
  select(explorer.structure.maker);
});

byId("cost-rows").replaceChildren(
  ...STRUCTURES.map((structure) => {
    const row = element("tr");
    const name = element("th");
    name.scope = "row";
    name.append(element("code", structure.maker));
    const costs = element("td");
    const list = element("ul", "", "cost-list");
    list.replaceChildren(
      ...structure.operations.map((op) => {
        const item = element("li");
        item.append(element("code", op.name), element("span", ` ${op.cost}`));
        return item;
      }),
    );
    costs.append(list);
    row.append(name, costs);
    return row;
  }),
);

window.addEventListener("hashchange", () => {
  select(location.hash.slice(1));
});
select(location.hash.slice(1));
