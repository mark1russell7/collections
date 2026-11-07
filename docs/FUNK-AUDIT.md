# The audit of Funk

Funk is a 2025 experiment in functional helpers: 415 lines of library source and a site. This audit reads each module and gives each idea one result. The audit used commit `main` of 2026-11-04.

- **Keep:** the idea goes into the roadmap of collections.
- **Have:** collections has the idea already.
- **Home:** the idea belongs in another package.
- **Drop:** the idea has no value for a library.

## Results

| Funk module | Result | Reason |
| --- | --- | --- |
| `optional/optional.ts`, `Optional` | Home | `@mark1russell7/optional` is the home. Funk makes `Optional` from `Either`, with the symbol `NotFound` on the left. |
| `optional/either.ts`, `Either` | Home | No package of the family has this type. `Result` of collections is the same type. Item C8 decides its home. |
| `collections/collection.ts`, `map`, `filter`, `reduce` | Have | The lazy operations in `fx/iter.ts` do this, and they keep the order and the duplicates. Funk always gives a `Set`, so it removes duplicates. |
| `collections/collection.ts`, `getOnlyElement` | Keep | Collections has `first` and `last`, but no operation that accepts exactly one element and refuses other counts. Item C17 adds it. |
| `collections/collection.ts`, `pour`, `without`, `flatten` | Have | `flatten`, `filter` and the collectors do this work. |
| `cache.ts`, `aside` | Have | `computeIfAbsent` is the same idea, and it calls its function only on a miss. Funk computes the value first. |
| `optional/collections/optional.map.ts`, `OptionalMap` | Have | `safeMap` gives the same lookup, and it does not change the base map. |
| `collections/map.unital.ts`, `UnitalMap` | Drop | The word names a total `get`. `safeMap` has this behavior. |
| `monads/box.ts`, `monads/box.canonicalizer.ts` | Keep | One canonical object for equal values is a real structure, an intern table. Funk compares objects by identity, so its version gives no gain. Item C17 tries the general form on `defaultHash`. |
| `memo.ts` | Drop | The file holds only comments. Its key is `JSON.stringify`, which C3 removed from the hash of collections. |
| `functional/sponge.ts` | Drop | The function collects named arguments in steps. No package uses it, and no area of the map fits it. |
| `references/entangler.ts` | Drop | The abstract class has two abstract methods and no behavior of its own. |
| `monads/top.ts` | Drop | The class is a stub. |
| `functional/self.ts`, `guards/object.guard.ts` | Drop | Each function has one line, and no other package needs a shared copy. |

## What this changes in the plan

1. **The middleware design does not wait for Funk.** Funk has no middleware. The call to put item C4 before item C5 had a wrong reason, so item C5 can start.
2. **`Result` has no home.** The map of homes gives `@mark1russell7/optional` to optional values only. Item C8 must decide this, not only remove a copy.
3. **Three shapes of an optional value exist.** Collections uses `_tag: "None"`, `@mark1russell7/optional` uses `tag: "none"`, and Funk uses `Either`.
4. **Funk found a defect that collections has in another form.** Funk item F6 is about NaN in an array. The lists, hash sets and hash maps of collections default to `===`, so they do not find NaN. A native `Set` finds it. Item C2 also includes the default equality of each structure.

## The status of Funk

The strategy calls Funk private. GitHub shows the repository as public, with the MIT license and a site. The field `private` in its `package.json` only stops a publish to npm. Funk stays as a public experiment, and collections takes no code from it.
