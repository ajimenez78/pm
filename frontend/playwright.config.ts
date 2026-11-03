import { defineConfig, devices } from "@playwright/test";

// By default the tests build the static export and serve it with the real
// FastAPI backend on a fresh temporary SQLite database. Set
// PLAYWRIGHT_BASE_URL to run against an already running app (e.g. Docker).
const port = 3100;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${port}`,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  ...(process.env.PLAYWRIGHT_BASE_URL
    ? {}
    : {
        webServer: {
          command: [
            "npm run build",
            "cd ../backend",
            `DATABASE_PATH="$(mktemp -d)/pm.sqlite3" FRONTEND_BUILD_DIR=../frontend/out uv run uvicorn app.main:app --host 127.0.0.1 --port ${port}`,
          ].join(" && "),
          url: `http://127.0.0.1:${port}/api/health`,
          reuseExistingServer: false,
          timeout: 180_000,
        },
      }),
});
