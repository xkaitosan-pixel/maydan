import { defineConfig } from "@playwright/test";

const port = 4178;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 45_000,
  use: {
    baseURL: `http://127.0.0.1:${port}/release-check/`,
    serviceWorkers: "allow",
  },
  webServer: {
    command: [
      "BASE_PATH=/release-check/",
      "VITE_E2E_TIMING=1",
      "VITE_SUPABASE_URL=https://placeholder.supabase.co",
      "VITE_SUPABASE_ANON_KEY=placeholder",
      "pnpm run build",
      `&& PORT=${port} node tests/serve-subpath.mjs`,
    ].join(" "),
    url: `http://127.0.0.1:${port}/release-check/`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});