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
  // More opens the full menu; the maintenance group folds on a phone
  await bar.getByRole("button", { name: "More" }).click();
  const fold = page.getByTestId("nav-group-navGroup.maintenance");
  const pmLink = page.getByRole("link", { name: "Preventive maintenance" });
  if ((await fold.getAttribute("aria-expanded")) === "true") await fold.click();
  await expect(pmLink).toBeHidden();
  await fold.click();
  await expect(pmLink).toBeVisible();
  await page.getByRole("button", { name: "menu" }).click();
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

test("field round offline: a work order created, started, booked and sent for review without internet, sent when online", async ({ page, context }) => {
  await login(page, "engineer");
  await page.goto("/field");
  const prepare = page.getByTestId("field-prepare");
  if (await prepare.isVisible().catch(() => false)) await prepare.click();
  await expect(page.getByTestId("field-tabs")).toBeVisible();
  await context.setOffline(true);
  await page.getByTestId("field-search").fill("crusher motor");
  await page.getByText("L2-CRS-MTR").first().click();
  await page.getByTestId("field-new-wo").click();
  await page.getByTestId("fwo-type").click();
  await page.getByRole("option", { name: "Emergency breakdown" }).click();
  await page.getByTestId("fwo-title").fill("E2E offline breakdown: motor tripped");
  await expect(page.getByTestId("fwo-me")).toBeChecked();
  await page.getByTestId("fwo-save").click();
  // An emergency the engineer does himself opens at once and can start on the phone.
  const screen = page.getByTestId("fwo-screen");
  await expect(screen).toBeVisible();
  await page.getByTestId("fwo-start").click();
  await expect(page.getByTestId("fwo-status")).toHaveText("In progress");
  await page.getByTestId("fwo-hours").fill("1.5");
  await page.getByTestId("fwo-add-hours").click();
  await expect(screen).toContainText("1.5 h");
  await page.getByTestId("fwo-part-text").fill("Motor terminal lug");
  await page.getByTestId("fwo-add-part").click();
  await page.getByTestId("fwo-findings").fill("Terminal lug burnt at phase L2");
  await page.getByTestId("fwo-root_cause").fill("Loose terminal");
  await page.getByTestId("fwo-root_cause").blur();
  await page.getByTestId("fwo-submit").click();
  await expect(page.getByTestId("fwo-status")).toHaveText(/Awaiting review/);
  await page.getByRole("button", { name: "Close" }).last().click();
  await expect(page.getByTestId("out-wo_new")).toContainText("Waiting");
  await expect(page.getByTestId("out-wo_sync")).toContainText("Waiting");
  // Back online: the work order is created first, then the work done on it.
  await context.setOffline(false);
  await expect(page.getByTestId("out-wo_new")).toContainText(/WO-/, { timeout: 30_000 });
  await expect(page.getByTestId("out-wo_sync")).toContainText("Sent", { timeout: 30_000 });
  const num = (await page.getByTestId("out-wo_new").innerText()).match(/WO-[\w-]+/)![0];
  const plant = (await (await page.request.get("/api/v1/auth/me")).json()).plants[0].plant_id as string;
  const list = await (await page.request.get("/api/v1/work-orders", { params: { q: num }, headers: { "X-Plant-Id": plant } })).json();
  const wo = list.items.find((w: { number: string }) => w.number === num);
  expect(wo.status).toBe("awaiting_review");
  expect(wo.findings).toBe("Terminal lug burnt at phase L2");
  expect(wo.actual_labor_hours).toBe(1.5);
});
