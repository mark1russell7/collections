/**
 * The `has` trap of a layer proxy whose `get` trap adds members.
 *
 * @internal
 */

/**
 * This function gives the `has` trap of a layer proxy. The trap gives `true` for each member that the
 * `get` trap of the layer adds. Thus the operator `in` agrees with a read of the member (C41).
 */
export const hasMembers =
  (...members: readonly PropertyKey[]) =>
  <T extends object>(target: T, prop: PropertyKey): boolean =>
    members.includes(prop) || Reflect.has(target, prop);
