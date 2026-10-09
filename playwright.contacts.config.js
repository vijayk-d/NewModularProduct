import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/ui",
  testMatch: "contact-regression.spec.js",
  timeout: 30000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  use: {
    browserName: "chromium",
    headless: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure"
  }
});
