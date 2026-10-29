import { defineConfig, devices } from "@playwright/test";

/**
 * Live E2E: runs against the real Supabase project in .env.local (needs the service-role key
 * to create and delete a throwaway user). Not part of CI, which has no Supabase.
 *
 *   npm run test:e2e:live
 */
try {
  process.loadEnvFile(".env.local");
} catch {
  // Missing file: the spec skips itself with a clear message.
}

const PORT = 3200;

export default defineConfig({
  testDir: "tests/e2e-live",
  // One throwaway user shared across the file; tests run in order.
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  timeout: 60_000,
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [{ name: "desktop", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // next start reads .env.local itself; mock AI keeps Studio deterministic.
    command: `npm run build && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    timeout: 300_000,
    env: { AI_PROVIDER: "mock" },
  },
});
