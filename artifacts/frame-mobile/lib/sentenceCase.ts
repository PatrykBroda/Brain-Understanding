// Observation titles are shown in sentence case: only the first letter of the line is
// capitalised. Older stored titles are Title Cased by the generator ("sparring: Shoulder
// Brace — Tension Carried Into Every Exchange"), so this is applied when rendering.
// Mirrors artifacts/coach/src/lib/sentence-case.ts.

const KEEP = new Set([
  "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun",
  "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday",
  "Jan", "Feb", "Mar", "Apr", "Jun", "Jul", "Aug", "Sep", "Sept", "Oct", "Nov", "Dec",
  "January", "February", "March", "April", "June", "July", "August", "September", "October", "November", "December",
]);

const WORD = /^[A-Z][a-z]+$/;

export function sentenceCase(text: string): string {
  const s = text.trim();
  if (!s) return s;
  const parts = s.split(/(\s+)/);
  const words = parts.filter((p) => p && !/^\s+$/.test(p));
  // Only de-capitalise lines that are actually Title Cased (two or more capitalised
  // words after the first); a lone proper noun in a normal sentence is left alone.
  const titleCased = words.slice(1).filter((w) => WORD.test(w.replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, ""))).length >= 2;
  let seen = false;
  const out = parts.map((p) => {
    if (!p || /^\s+$/.test(p)) return p;
    const first = !seen;
    seen = true;
    if (first || !titleCased) return p;
    const core = p.replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, "");
    if (!WORD.test(core) || KEEP.has(core)) return p;
    return p.replace(core, core.toLowerCase());
  });
  const joined = out.join("");
  return joined.replace(/^[^A-Za-z]*[a-z]/, (m) => m.toUpperCase());
}
