import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "artifacts/frame-mobile/__tests__/**/*.test.ts",
      "artifacts/api-server/src/__tests__/**/*.test.ts",
      "artifacts/coach/__tests__/**/*.test.ts",
    ],
    env: {
      AI_INTEGRATIONS_ANTHROPIC_BASE_URL: "https://mock.example.com",
      AI_INTEGRATIONS_ANTHROPIC_API_KEY: "test-key",
    },
  },
});
