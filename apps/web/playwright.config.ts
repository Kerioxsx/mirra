import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests run the real static export (served like a CDN would) against the real
 * FastAPI backend and PostgreSQL. Build first: `pnpm --filter @mirra/web build`.
 */
const CI = !!process.env.CI;
// Keep PATH, MIRRA_DATABASE_URL etc. for the API server, whatever Playwright's merge behaviour.
const inheritedEnv = Object.fromEntries(
  Object.entries(process.env).filter((e): e is [string, string] => typeof e[1] === "string"),
);

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
      command: "node e2e/mock-top-gateway.mjs",
      url: "http://127.0.0.1:8765/health",
      reuseExistingServer: !CI,
      timeout: 15_000,
    },
    {
      command: "uv run --project ../backend uvicorn mirra.main:app --port 8000",
      cwd: "../backend",
      url: "http://localhost:8000/health",
      reuseExistingServer: !CI,
      timeout: 60_000,
      // Taobao connector pointed at the local mock gateway; no FX so tests never need the network.
      env: {
        ...inheritedEnv,
        MIRRA_TAOBAO_APP_KEY: "e2e-key",
        MIRRA_TAOBAO_APP_SECRET: "e2e-secret",
        MIRRA_TAOBAO_ADZONE_ID: "1",
        MIRRA_TAOBAO_GATEWAY: "http://127.0.0.1:8765",
        MIRRA_FX_SOURCE: "none",
      },
    },
    {
      command: "node scripts/serve-static.mjs",
      url: "http://localhost:3000/",
      reuseExistingServer: !CI,
      timeout: 30_000,
    },
  ],
});
