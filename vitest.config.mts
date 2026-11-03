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
    // One worker per core (31 on a 32-thread machine) starting jsdom/PGlite at once made some workers
    // miss Vitest's start-up timeout ("Timeout waiting for worker to respond"), so cap it.
    maxWorkers: 8,
  },
});
