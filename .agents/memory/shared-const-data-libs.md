---
name: Shared literal-keyed data libs
description: How to declare shared constant-data arrays in a lib so literal key unions survive across packages.
---

When a shared lib exports an array of records whose `key` field needs to become a
literal union (for type predicates, `Record<Key, ...>` maps, or `.indexOf`/`.includes`
on a typed array), declare it with `as const satisfies readonly T[]`, NOT with a
`: readonly T[]` annotation.

**Why:** A `: readonly T[]` annotation (where `T.key: string`) widens every key to
`string`, so `(typeof ARR)[number]["key"]` collapses to `string`. That silently
erases compile-time guarantees — downstream `isX(v): v is Key` predicates become
`boolean`, and `Record<Key, V>` / typed-array `.indexOf(key)` calls either lose
safety or fail to compile when consumers DO type their keys. `as const satisfies`
keeps the literal tuple AND still validates each element against `T`.

**How to apply:** For libs like `lib/archetypes` (ARCHETYPES, BELT_PSYCHOLOGY):
`export const ARR = [ ... ] as const satisfies readonly T[];` then
`export type Key = (typeof ARR)[number]["key"];`. Build a lookup with
`new Map<string, T>(...)` and expose `isKey(v: string): v is Key`. Consumers
(e.g. a coach `Record<BeltKey, Color>` or `BELT_ORDER.indexOf(key)`) then typecheck.
Caught in code review after the annotated version passed an initial typecheck but
broke literal typing.
