import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { FREE_TEXT, LABEL_TEXT, NAME_TEXT, RAW_TEXT } from "../lib/textInputProps";

const ROOT = join(__dirname, "..");

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (n === "node_modules" || n.startsWith("dist") || n === "__tests__") return [];
    return statSync(p).isDirectory() ? sources(p) : /\.tsx$/.test(n) ? [p] : [];
  });
}

describe("keyboard settings", () => {
  it("free-text kinds turn autocorrect and spellcheck on and capitalise", () => {
    expect(FREE_TEXT).toEqual({ autoCorrect: true, spellCheck: true, autoCapitalize: "sentences" });
    expect(LABEL_TEXT.autoCorrect).toBe(true);
    expect(LABEL_TEXT.spellCheck).toBe(true);
  });
  it("names and raw fields stay off", () => {
    expect(NAME_TEXT.autoCorrect).toBe(false);
    expect(RAW_TEXT).toEqual({ autoCorrect: false, spellCheck: false, autoCapitalize: "none" });
  });
  it("every TextInput declares its keyboard kind explicitly (the shared Field and the auth screens aside)", () => {
    const missing: string[] = [];
    for (const file of [...sources(join(ROOT, "app")), ...sources(join(ROOT, "components"))]) {
      if (/entry.Field.tsx$/.test(file)) continue;
      const src = readFileSync(file, "utf8");
      for (const m of src.matchAll(/^\s*<TextInput\s([\s\S]*?)\/>/gm)) {
        if (!/\{\.\.\.(FREE|LABEL|NAME|RAW)_TEXT\}/.test(m[1]!)) missing.push(`${file}: ${m[1]!.trim().slice(0, 60)}`);
      }
    }
    expect(missing).toEqual([]);
  });
});
