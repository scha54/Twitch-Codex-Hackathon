import { test, expect } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
test("operator dashboard, live game, demo, pause/reset and private overlay", async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Welcome to the rift." }),
  ).toBeVisible();
  await page.getByLabel("Operator key").fill("e2e-test-key");
  await page.getByRole("button", { name: "Unlock →" }).click();
  await expect(
    page.getByRole("button", { name: "Start session" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Start session" }).click();
  await expect(
    page.getByRole("button", { name: "Pause session" }),
  ).toBeVisible();
  await page.getByLabel("Simulated chat command").fill("!glitch moon gravity");
  await page.getByRole("button", { name: "Send command" }).click();
  await expect(page.getByRole("status")).toContainText("accepted");
  await page.keyboard.down("d");
  await page.waitForTimeout(1000);
  await page.keyboard.up("d");
  await page.getByRole("button", { name: "Pause session" }).click();
  await expect(
    page.getByText("SIMULATION PAUSED", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Reset/ }).click();
  await expect(
    page.getByRole("button", { name: "Pause session" }),
  ).toBeVisible();
  await page.screenshot({ path: "test-results/dashboard.png", fullPage: true });
  const exported = await page.request.get("/api/admin/replay");
  expect(exported.ok()).toBe(true);
  writeFileSync("test-results/replay.json", await exported.text());
  const replay = spawnSync(
    process.execPath,
    ["--import", "tsx", "scripts/replay.ts", "test-results/replay.json"],
    { encoding: "utf8" },
  );
  expect(replay.status, replay.stdout + replay.stderr).toBe(0);

  await page.getByRole("button", { name: "Mutation library" }).click();
  await expect(page.locator(".mutation-card")).toHaveCount(12);
  await page.getByRole("button", { name: "Safety and connections" }).click();
  await page.getByLabel("Reduced motion").check();
  const obs = await context.newPage();
  await obs.setViewportSize({ width: 1920, height: 1080 });
  await obs.goto("/overlay");
  await expect(obs.locator("canvas")).toBeVisible();
  expect(
    await obs.evaluate(() => document.documentElement.scrollHeight),
  ).toBeLessThanOrEqual(1080);
  await expect(obs.locator(".overlay-footer")).toBeInViewport();
  await expect(obs.getByText("DEMO", { exact: false }).first()).toBeVisible();
  await expect(obs.getByRole("button")).toHaveCount(0);
  await expect(obs.getByLabel("Operator key")).toHaveCount(0);
  await obs.screenshot({ path: "test-results/overlay.png", fullPage: true });
  expect(errors).toEqual([]);
});
test("responsive dashboard fits a mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Welcome to the rift." }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
});
