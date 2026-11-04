# Roadmap

This file is the plan of collections. The Status page of the site reads it, and the tracker of the project mirrors it.

| ID | Item | Status | Summary |
| --- | --- | --- | --- |
| C1 | The first package | done | `@mark1russell7/collections` is on npm at 0.3.0: lists, deques, maps, trees, heaps and graphs of dependencies, with no runtime dependencies. |
| C3 | defaultHash on plain objects (0.3.1) | blocked | The client session owns this draft until it lands. It waits for a heavy runner slot, then for the two hash bench runs. The figures go in #14. The role takes the repo when it merges. |
| C2 | One meaning of deep equality | open | `deepEqual` in `testing/check.ts` and `deepEq` in `utils/defaults.ts` have near-identical names and different meanings. Remove one name. It waits for C3 because C3 changes the same file. |
| C4 | Audit of Funk | open | Read Funk, a 2025 experiment in functional helpers. For each idea, record keep, move to a home, or drop, with the reason. The strategy calls Funk private, but GitHub shows it public, so the audit checks that too. |
| C5 | Design of one middleware core | open | Collections has `(next: In) => Out` over an object. Client has typed context with sync and async runners. Write a proposal for the smallest shared core with no dependencies. Client's roadmap chose no dependency, so client must agree. |
| C6 | Ship the middleware core | open | The core goes in `@mark1russell7/collections`, with its laws and a bench of the cost of a layer against the two versions of today. |
| C7 | Client imports the core | open | Client replaces its `compose` with the core. Client's documentation says that they share it. That text is false until this ships. The client session owns the change. |
| C8 | Option and Result in one home | open | This package exports its own `Option` and `Result` beside `@mark1russell7/optional`. Choose how to remove the copy and keep the promise of no dependencies. |
| C9 | Retire the copy in client | open | `@procedures/collections` and `@procedures/dag` hold the same code. They become thin users of this package. The client session owns the change. |
| C10 | Laws for every structure | open | Model-based property tests on `fast-check` for each list, set, map and queue, and for stacks of behaviors. A CI baseline of coverage and mutation score comes first, so the gain can be measured. |
| C11 | Benches of each structure | open | Time and memory of each structure against native types and the common libraries, through `@mark1russell7/rigor-bench` in CI. A speed gate follows after 5 runs give its limit. |
| C12 | Review of the public API | open | The API report has 2601 lines. Decide which exports stay, and find exports that belong in another home. |
| C13 | Guides for each entry | open | The package README has 79 lines for 15803 lines of source. Add a guide for each area, with examples that a test runs. |
| C14 | Reference from the doc comments | open | A generated reference on the site, with each public export documented. It follows the API review, so it does not document exports that go. |
| C15 | A site with live demos | open | The site has 3 demos: a cache, a tree and a graph. Bring it to the level of packing and highways, with explorers of the real library in the browser. Check screenshots at 1280 and 390 wide, light and dark. |
| C16 | Bench results on the site | open | CI rebuilds charts of the bench records on each merge, with the release and date of the data. |
