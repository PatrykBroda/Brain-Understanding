import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["artifacts/frame-mobile/__tests__/**/*.test.ts"],
  },
});
