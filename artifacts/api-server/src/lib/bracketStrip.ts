// New athletes (vocabulary tier 0) haven't met the framework's vocabulary, so a
// reply must not carry [[Node Name]] notation. The prompt says so; this is the
// backstop for when the model does it anyway. It works on a stream: text that
// might be the start of a `[[...]]` is held back until it closes (or is clearly
// not one), so no bracket ever reaches the athlete mid-token.

const MAX_HOLD = 160;

/** `[[Title]]` -> `Title`; `[[Title|alias]]` -> `alias`. */
function unwrap(inner: string): string {
  const bar = inner.lastIndexOf("|");
  return (bar >= 0 ? inner.slice(bar + 1) : inner).trim();
}

export function stripBracketNodes(text: string): string {
  return text.replace(/\[\[([^\[\]\n]*)\]\]/g, (_m, inner: string) => unwrap(inner)).replace(/\[\[|\]\]/g, "");
}

export type BracketStripper = {
  push(delta: string): string;
  flush(): string;
};

export function createBracketStripper(): BracketStripper {
  let held = "";
  return {
    push(delta) {
      const text = held + delta;
      held = "";
      // Hold back from the last "[[" (or a trailing lone "[") that hasn't closed yet.
      let cut = text.lastIndexOf("[[");
      if (cut >= 0 && text.indexOf("]]", cut) >= 0) cut = -1;
      if (cut < 0 && text.endsWith("[")) cut = text.length - 1;
      if (cut >= 0 && text.length - cut <= MAX_HOLD) {
        held = text.slice(cut);
        return stripBracketNodes(text.slice(0, cut));
      }
      return stripBracketNodes(text);
    },
    flush() {
      const rest = held;
      held = "";
      return stripBracketNodes(rest);
    },
  };
}
