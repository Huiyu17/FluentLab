import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: { tsconfigPaths: true },
  test: {
    include: ["tests/unit/**/*.test.{ts,tsx}", "tests/db/**/*.test.ts"],
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
    // PGlite boots a Postgres instance per suite.
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
