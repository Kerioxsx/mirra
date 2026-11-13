import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests run the real static export (served like a CDN would) against the real
 * FastAPI backend and PostgreSQL. Build first: `pnpm --filter @mirra/web build`.
 */
const CI = !!process.env.CI;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: CI ? 1 : 0,
  reporter: CI ? [["github"], ["list"]] : "list",
  timeout: 45_000,
  use: {
    baseURL: "http://localhost:3000",
    trace: "off",
    viewport: { width: 1440, height: 900 },
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
        launchOptions: {
          args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
        },
      },
    },
  ],
  webServer: [
    {
      command: "uv run --project ../backend uvicorn mirra.main:app --port 8000",
      cwd: "../backend",
      url: "http://localhost:8000/health",
      reuseExistingServer: !CI,
      timeout: 60_000,
    },
    {
      command: "node scripts/serve-static.mjs",
      url: "http://localhost:3000/",
      reuseExistingServer: !CI,
      timeout: 30_000,
    },
  ],
});
