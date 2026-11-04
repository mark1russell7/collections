/**
 * The probe of the three demos. The site check of the Pages workflow starts it in a browser at each width,
 * before the deploy. A failed check stops the deploy.
 *
 * The site check reads this TypeScript file directly. It removes the types and the `export` line, and it starts the
 * result as the body of an async function.
 */

// The site check gives these helpers to the probe. Each element of this page is an HTML element.
declare const check: (name: string, ok: unknown, detail?: unknown) => boolean;
declare const until: <T>(fn: () => T | Promise<T>, ms?: number) => Promise<T>;
declare const $: (selector: string) => HTMLElement | null;
declare const $$: (selector: string) => HTMLElement[];
declare const click: (target: string | Element) => void;

const text = (selector: string): string => $(selector)?.textContent ?? "";
const slots = (): string => $$("#cache-slots li").map((slot) => slot.textContent).join();
const levels = (): string => $$("#graph-levels li").map((row) => $$(`#graph-levels li:nth-child(${String([...(row.parentElement?.children ?? [])].indexOf(row) + 1)}) [data-task]`).map((task) => task.dataset["task"]).join("+")).join(" > ");

// The cache
check("the cache starts with the newest key first", slots() === "C,B,A", slots());
click('#cache-keys [data-key="D"]');
check("a new key pushes out the key that waited longest", await until(() => slots() === "D,C,B"), slots());
check("the log names the key that left", text("#cache-log").includes("A waited longest"), text("#cache-log"));
click('#cache-keys [data-key="B"]');
check("a read moves a key to the front", await until(() => slots() === "B,D,C"), slots());
check("the counts show one hit and one miss", text("#cache-hits") === "1" && text("#cache-misses") === "1", `${text("#cache-hits")} ${text("#cache-misses")}`);
click("#cache-fewer");
check("a smaller cache drops the oldest key", await until(() => slots() === "B,D"), slots());

// The summary tree
check("the tree starts with the sum 31", text("#tree-sum") === "31", text("#tree-sum"));
click("#tree-bars button:nth-child(2)");
check("an edit changes the sum and adds a version", await until(() => text("#tree-sum") === "33"), text("#tree-sum"));
check("the page shows two versions", text("#tree-version") === "Version 2 of 2", text("#tree-version"));
click("#tree-older");
check("the old version is still whole", await until(() => text("#tree-sum") === "31"), text("#tree-sum"));
click("#tree-add");
check("an edit of an old version makes a third version", await until(() => text("#tree-version") === "Version 3 of 3"), text("#tree-version"));
check("the third version has one more leaf", text("#tree-size") === "9" && text("#tree-sum") === "36", `${text("#tree-size")} ${text("#tree-sum")}`);

// The dependency graph
const plan = "lint+types > test+build > docs+deploy";
check("the graph starts in three steps", levels() === plan, levels());
click('#graph-levels [data-task="lint"]');
await until(() => $("#graph-selected")?.textContent === "lint");
click('#graph-needs [data-need="deploy"]');
check("a cycle shows the message of the package", await until(() => text("#graph-error").includes("Circular dependency")), text("#graph-error"));
check("a cycle stops the run", ($("#graph-run") as HTMLButtonElement | null)?.disabled === true);
click('#graph-needs [data-need="deploy"]');
check("the graph comes back", await until(() => levels() === plan), levels());
click("#graph-run");
check("the run finishes each task", await until(() => $$('#graph-levels [data-state="done"]').length === 6, 8000), text("#graph-log"));
check("the log gives the time of the run", await until(() => text("#graph-log").includes("6 tasks")), text("#graph-log"));
