---
name: frame-mobile e.filter crash
description: The e.filter is not a function crash in the Expo static export — cause and fix.
---

# frame-mobile e.filter crash

## The crash
`TypeError: e.filter is not a function` in the minified bundle.

## Root cause
TanStack Query's destructuring default `= []` only guards against `undefined`:
```js
// If data resolves to null or a non-array object, facts = null — NOT []
const { data: facts = [] } = useQuery<Fact[]>({ ... });
```

When the queryFn returned something non-array (e.g. when the API returned
unexpected shape or the in-browser fetch resolved to HTML/SPA-fallback that
parsed into something wrong), `facts` became that non-array, and
`facts.filter(...)` threw.

## Fix
In both `home.tsx` and `profile.tsx`:

```ts
// In queryFn — defensive at the data layer
queryFn: () =>
  apiGet<{ facts: Fact[] }>("/memory").then((r) => {
    const f = r?.facts;
    return Array.isArray(f) ? f : [];
  }),

// At the consumer — second line of defence
const { data: rawFacts } = useQuery<Fact[]>({ ... });
const facts: Fact[] = Array.isArray(rawFacts) ? rawFacts : [];
```

**Why:** Two guards: one at the queryFn (API response validation) and one at
the consumer (protects against any future mismatch between type annotation and
runtime value). The destructuring default `= []` is NOT sufficient.

## How to apply
Any `useQuery` that returns an array and calls `.filter()` downstream should
use `Array.isArray(data) ? data : []` rather than relying on `= []`.
