import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test("mobile shell, offline indicator and PWA assets", async ({ page, context }) => {
  await login(page, "tech1");
  await expect(page.getByRole("button", { name: "menu" })).toBeVisible(); // burger on small screens
  await expect(page.getByTestId("net-status")).toBeVisible();
  // bottom bar: the technician's shortcuts, one tap away
  const bar = page.getByTestId("bottom-nav");
  await expect(bar.getByRole("link", { name: "My work" })).toBeVisible();
  await expect(bar.getByRole("link", { name: "New work request" })).toBeVisible();
  await bar.getByRole("link", { name: "Scan QR" }).click();
  await expect(page).toHaveURL(/\/scan/);
  await context.setOffline(true);
  await expect(page.getByTestId("net-status")).toHaveAttribute("data-variant", "light");
  await page.getByTestId("net-status").hover();
  await expect(page.getByRole("tooltip", { name: /open the field round/ })).toBeVisible();
  await context.setOffline(false);
  const manifest = await page.request.get("/manifest.webmanifest");
  expect(manifest.ok()).toBeTruthy();
  expect((await manifest.json()).display).toBe("standalone");
  expect((await page.request.get("/sw.js")).ok()).toBeTruthy();
  await page.goto("/my-work");
  await expect(page.getByRole("heading", { name: "My work" })).toBeVisible();
});

test("condition monitoring point opens full screen on a phone to record a reading", async ({ page }) => {
  await login(page, "reliability");
  await page.goto("/pdm");
  // tables are cards on a phone
  await page.getByTestId("table-cards").getByText("TMP-DR1-DS", { exact: true }).click();
  const dlg = page.getByRole("dialog");
  await expect(dlg.getByTestId("reading-input")).toBeInViewport();
  await dlg.getByTestId("reading-input").fill("60");
  await dlg.getByRole("button", { name: "Save" }).click();
  await expect(dlg.getByTestId("reading-result")).toBeVisible();
});

test("field round: equipment card from search and a work request sent from the phone's outbox", async ({ page }) => {
  await login(page, "tech1");
  await page.goto("/field");
  const prepare = page.getByTestId("field-prepare");
  if (await prepare.isVisible().catch(() => false)) await prepare.click();
  await expect(page.getByTestId("field-scan")).toBeVisible();
  await page.getByTestId("field-search").fill("crusher motor");
  await page.getByText("L2-CRS-MTR").first().click();
  await expect(page.getByTestId("field-asset")).toContainText("Crusher");
  await page.getByTestId("field-new-request").click();
  const dlg = page.getByRole("dialog");
  const title = dlg.getByRole("textbox", { name: /^Title/ });
  if (!(await title.inputValue())) await title.fill("E2E field round request");
  await page.getByTestId("field-save").click();
  await expect(page.getByTestId("field-outbox")).toContainText(/WR-/, { timeout: 20_000 }); // sent at once when online
});
