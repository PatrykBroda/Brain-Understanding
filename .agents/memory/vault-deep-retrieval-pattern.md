---
name: Vault deep retrieval pattern
description: RAG-lite for a bounded markdown knowledge base too big for the context window — lexical scoring, wiki-link forcing, per-turn injection into the dynamic (uncached) system block.
---

When a baked-in knowledge vault is bigger than the context window allows to send verbatim every turn, split it: send the authoritative narrative layers verbatim in the CACHED static system block, and send the long-tail of concept nodes as a title+blurb INDEX only. Then, per turn, lexically score the index against recent conversation and inject the full text of the top-K nodes into the DYNAMIC (uncached) system block.

**Why:** Anthropic's prompt caching collapses repeated static prefixes to a fraction of the cost, but only if the static block doesn't change. The dynamic block can shift turn to turn without breaking the cache. So the cache holds the constants (laws, identity, protocols, voice) and the dynamic block holds what changed: per-fighter context + retrieval results.

**How to apply:**
- Build script emits TWO exports: the verbatim vault string (goes into cached prompt) and a `Record<folder, Record<title, body>>` deep map (loaded by the retrieval module at runtime).
- Scoring is plain lexical, no embeddings — for ~300 well-titled docs it's plenty:
  - Explicit `[[Title]]` mentions in the query → forced inclusion (score 1000+).
  - Title literal substring in query (only if title has ≥2 tokens, else stopword titles like "Arousal" match noise) → +60.
  - Title token overlap with query tokens (after stopwording, len≥3) → ×8 per hit.
  - Body word-boundary occurrences for tokens of len≥4, capped per token to avoid one keyword dominating → ×1 per hit.
- Build the retrieval query from: profile signals (goals, weaknesses) + last 6 turns of text + the new user message repeated 2-3× so the latest message dominates ranking. Without the repetition, "tell me more about that" yields nothing useful — long history drowns the actual intent.
- Tell the model the loop exists in the static prompt: "if you want a node next turn, reference it as [[Title]] and the retrieval layer will surface its full text." This makes [[wiki-links]] a control surface for the model itself, not just a UI tag for the user. Forced wiki-link inclusion in the scorer is what makes that promise true.
- Cache the tokenized nodes in module scope. Lazy-init on first call, not at import (avoids slowing process startup).
- Log `deepTitles` per request — invisible retrieval is impossible to debug without it.

**Pitfalls:**
- Stopword list must include casual-chat fillers ("yeah", "okay", "stuff", "kinda") or banter turns yield garbage retrieval.
- Single-token titles ("Arousal", "Containment") will match on any body that contains the word — gate the literal-substring boost on token count.
- The deep block must NOT go in the cached static prompt — it changes every turn and would bust the cache. Keep it in the per-request dynamic block.
