---
name: Locking transient query data into UI state
description: How to freeze a single snapshot of a TanStack Query result inside a short-lived UI flow (e.g. entry overlay, modal) without being swapped mid-sequence by a background refetch.
---

When a short-lived UI flow (entry overlay, onboarding step, modal) needs to show ONE snapshot of query data and ignore later refetches, do NOT do this:

```tsx
// BAD: render-time ref mutation, not safe under concurrent React
const lockedRef = useRef<T | null>(null);
if (active && !lockedRef.current && query.data) {
  lockedRef.current = query.data;
}
```

A discarded concurrent render can still mutate the ref and lock the wrong value.

Do this instead:

```tsx
const [locked, setLocked] = useState<T | null>(null);
useEffect(() => {
  if (!active || locked) return;
  if (query.data) setLocked(query.data);
}, [active, locked, query.data]);
```

**Why:** ref writes are not transactional with commit; only state updates inside effects are commit-safe. The state-based version skips updates from speculative renders and is also easier to reset on identity change (`setLocked(null)` in an effect keyed by the parent id).

**How to apply:** any time an overlay or wizard step says "show me one frozen choice from a query and ignore the rest until I'm done." Also: scope the query key by the relevant identity (e.g. `["calibration","next",fighterId]`) so stale cache from a previous fighter/user can't be the thing you lock.
