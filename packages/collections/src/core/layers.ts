/**
 * This module holds the one fold of a stack of layers. A layer wraps the next thing, so a stack
 * of layers wraps a base. The next thing can be a collection, a function or any other value.
 *
 * This file has no imports. A package that needs only the fold loads this one file.
 *
 * @example
 * const parse = compose(
 *   (next: (text: string) => number) => (text: string) => next(text.trim()),
 *   (next: (text: string) => number) => (text: string) => next(text) * 2
 * )(Number);
 * parse(" 21 "); // 42
 */

/**
 * A layer takes the next thing and gives a wrapped thing.
 *
 * @template Inner The type that the layer wraps
 * @template Outer The type that the layer gives
 */
export type Layer<Inner = any, Outer = Inner> = (next: Inner) => Outer;

/** This type gives the type that a layer wraps. */
export type InnerOf<L> = L extends (next: infer I) => any ? I : never;

/** This type gives the type that a layer gives. */
export type OuterOf<L> = L extends (next: any) => infer O ? O : never;

/**
 * This type checks each neighbor pair of a list of layers. The result of the inner neighbor must
 * fit the input of the outer neighbor. At the first bad pair, the compiler marks that argument.
 *
 * The type is tail recursive, so the compiler accepts a chain of 100 layers.
 */
export type Chain<L extends readonly unknown[], Done extends readonly unknown[] = readonly []> =
  L extends readonly [infer A, infer B, ...infer R]
    ? [OuterOf<B>] extends [InnerOf<A>]
      ? Chain<readonly [B, ...R], readonly [...Done, A]>
      : readonly [...Done, A, Layer<any, InnerOf<A>>, ...R]
    : readonly [...Done, ...L];

/**
 * This type gives the function that {@link compose} returns. Its input is the input of the last
 * layer, and its result is the result of the first layer. No layers give the identity function.
 * A list that the compiler cannot see as a tuple gives the types of one element.
 */
export type Composed<L extends readonly unknown[]> =
  L extends readonly []
    ? <B>(base: B) => B
    : L extends readonly [infer First, ...unknown[]]
      ? L extends readonly [...unknown[], infer Last]
        ? (base: InnerOf<Last>) => OuterOf<First>
        : never
      : L extends readonly (infer E)[]
        ? (base: InnerOf<E>) => OuterOf<E>
        : never;

/** This type gives the intersection of the results of a list of layers. */
export type Outers<L extends readonly unknown[], Sum = unknown> =
  L extends readonly [infer First, ...infer Rest] ? Outers<Rest, Sum & OuterOf<First>> : Sum;

/**
 * This type gives the function for layers that keep each capability of the layers under them.
 * Its result has the result of each layer and the base. Use it only when that law holds.
 */
export type Stacked<L extends readonly unknown[]> =
  L extends readonly [...unknown[], infer Last]
    ? (base: InnerOf<Last>) => Outers<L> & InnerOf<Last>
    : Composed<L>;

/**
 * This function folds layers into one function that wraps a base. The first layer is the outermost.
 *
 * The fold holds four laws:
 * - Identity: `compose()(b)` is `b`.
 * - One layer: `compose(f)(b)` is `f(b)`.
 * - Associativity: `compose(f, compose(g, h))` equals `compose(compose(f, g), h)`.
 * - Order: `compose(f, g)(b)` is `f(g(b))`.
 *
 * @param layers The layers, from the outermost to the innermost
 * @returns A function that wraps a base in the layers
 */
export function compose<const L extends readonly Layer[]>(...layers: L & Chain<L>): Composed<L> {
  const list: readonly Layer[] = layers;
  return ((base: unknown) => list.reduceRight((acc, layer) => layer(acc), base)) as Composed<L>;
}
