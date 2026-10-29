import { defineConfig } from "vitest/config";

/**
 * Live AI smoke test against the provider in .env.local (`npm run test:ai`).
 * Not part of `npm test` or CI: it uses real quota. With AI_PROVIDER=gemini on the free tier
 * that is free-tier quota, never paid usage.
 */
try {
  process.loadEnvFile(".env.local");
} catch {
  // No .env.local: the test skips itself.
}

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    include: ["tests/ai-live/**/*.test.ts"],
    environment: "node",
    testTimeout: 90_000,
  },
});
