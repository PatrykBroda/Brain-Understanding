/**
 * Turns an ALL-CAPS multi-line aphorism into sentence case for display in the
 * italic serif: only the first word of each sentence keeps its capital, even
 * when a sentence is split across lines. Pure presentation.
 */
export function softCaseLines(lines: readonly string[]): string[] {
  let atStart = true;
  return lines.map((line) => {
    const lower = line.toLowerCase();
    let out = "";
    for (const ch of lower) {
      if (atStart && /[a-z]/.test(ch)) {
        out += ch.toUpperCase();
        atStart = false;
      } else {
        out += ch;
      }
    }
    if (/[.!?]\s*$/.test(line)) atStart = true;
    return out;
  });
}
