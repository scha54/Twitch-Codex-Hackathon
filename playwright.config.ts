import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  use: {
    baseURL: "http://127.0.0.1:3000",
    viewport: { width: 1440, height: 1100 },
    launchOptions: {
      executablePath:
        process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
      args: ["--no-sandbox"],
    },
  },
  webServer: {
    command: process.env.E2E_DEV
      ? "npm run dev -- --demo"
      : "npm start -- --demo",
    url: "http://127.0.0.1:3000/healthz",
    env: { ADMIN_SECRET: "e2e-test-key" },
    reuseExistingServer: false,
  },
  reporter: "list",
});
