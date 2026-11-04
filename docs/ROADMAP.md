# Roadmap

This file is the plan of collections. The Status page of the site reads it, and the tracker of the project mirrors it.

| ID | Item | Status | Summary |
| --- | --- | --- | --- |
| C1 | The first package | done | `@mark1russell7/collections` is on npm at 0.3.0: lists, deques, maps, trees, heaps and graphs of dependencies, with no runtime dependencies. |
| C3 | defaultHash on plain objects (0.3.1) | blocked | The client session owns this draft until it lands. It waits for a heavy runner slot, then for the two hash bench runs. The figures go in #14. The role takes the repo when it merges. |
| C2 | One meaning of deep equality | open | `deepEqual` in `testing/check.ts` and `deepEq` in `utils/defaults.ts` have near-identical names and different meanings. Remove one name. Lists, hash sets and hash maps also default to `===`, so they do not find NaN, and a native `Set` does. This item decides the default equality of each structure. It waits for C3 because C3 changes the same file. |
| C4 | Audit of Funk | done | Funk has no middleware. Of its 415 lines of library, 2 ideas are new for collections, and `Either` has no home in the family. Funk is public on GitHub with the MIT license, so the word private in the strategy is out of date. |
| C5 | Design of one middleware core | in progress | Both systems run the same fold: 4 copies in client, 1 here. TypeScript compiled the new types against the real source. Most of the gain lands here, because client stacks are lists at run time. Client reads the proposal next. |
| C6 | Ship the middleware core | open | Add the entry `./layers`, typed chains of 100 layers, a result that keeps each capability, 5 laws and corrected doc examples. Compare the cost of a layer against the two versions of today. |
| C7 | Client imports the core | open | Client decides from the shipped core. If it says yes, `bundle` and `compose` call the core. Client #424 corrected its documentation, so nothing there is false now. The client session owns the change. |
| C8 | A home for Option and Result | open | Three shapes exist: `_tag` here, `tag` in `@mark1russell7/optional`, and `Either` in Funk. `Result` has no home in the map. Propose one to the strategist, then remove the copy and keep the promise of no dependencies. |
| C9 | Finish the move from client | open | `@procedures/collections` and `@procedures/dag` already re-export this package. Their range `^0.1.0` cannot reach 0.3.0, so they do not get the `defaultHash` fix. Overlay, storage and undo stay in client, and each needs a decision. The client session owns the change. |
| C10 | Laws for every structure | open | Model-based property tests on `fast-check` for each list, set, map and queue, and for stacks of behaviors. A CI baseline of coverage and mutation score comes first, so the gain can be measured. |
| C11 | Benches of each structure | open | Time and memory of each structure against native types and the common libraries, through `@mark1russell7/rigor-bench` in CI. A speed gate follows after 5 runs give its limit. |
| C12 | Review of the public API | open | The API report has 2601 lines. Decide which exports stay, and find exports that belong in another home. |
| C13 | Guides for each entry | open | The package README has 79 lines for 15803 lines of source. Add a guide for each area, with examples that a test runs. |
| C14 | Reference from the doc comments | open | A generated reference on the site, with each public export documented. It follows the API review, so it does not document exports that go. |
| C15 | A site with live demos | open | The site has 3 demos: a cache, a tree and a graph. Bring it to the level of packing and highways, with explorers of the real library in the browser. Check screenshots at 1280 and 390 wide, light and dark. |
| C16 | Bench results on the site | open | CI rebuilds charts of the bench records on each merge, with the release and date of the data. |
| C17 | Two small ideas from Funk | open | An operation that requires exactly one element, and an intern table that gives one canonical object for equal values, on `defaultHash`. |
