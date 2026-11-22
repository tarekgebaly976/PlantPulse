import { expect, test, type Page } from "@playwright/test";
import { login } from "./helpers";

async function setChange(page: Page, minutes: string): Promise<void> {
  await page.getByRole("button", { name: "Edit unit" }).first().click();
  const dlg = page.getByRole("dialog");
  const field = dlg.getByLabel("Size change (min)");
  await field.fill(minutes);
  await dlg.getByRole("button", { name: "Save" }).click();
  await expect(dlg).toBeHidden(); // saved: no "id: Extra inputs are not permitted"
}

test("cutting plan: an existing sheeter can be edited and saved", async ({ page }) => {
  await login(page, "prod.mgr"); // a DPM user (the paper mill sample)
  await page.goto("/operations/cutting");
  await setChange(page, "15");
  await page.reload(); // read it back from the server
  await page.getByRole("button", { name: "Edit unit" }).first().click();
  await expect(page.getByRole("dialog").getByLabel("Size change (min)")).toHaveValue("15");
  await page.keyboard.press("Escape");
  await setChange(page, "30"); // back as it was
});

test("cutting plan: customer orders from the Excel template, one plan per cycle", async ({ page }) => {
  await login(page, "prod.mgr");
  await page.goto("/operations/cutting");
  await page.getByRole("button", { name: "Import orders (Excel)" }).click();
  const dlg = page.getByRole("dialog");
  const [file] = await Promise.all([page.waitForEvent("download"), dlg.getByRole("button", { name: "Download template" }).click()]);
  await dlg.locator('input[type="file"]').setInputFiles(await file.path()); // the template's two sample rows: cycle "Week 49"
  await dlg.getByRole("button", { name: "Check file" }).click();
  const cycle = dlg.getByTestId("imp-cycle");
  await expect(cycle).toHaveCount(1);
  await expect(cycle).toContainText("Week 49");
  await expect(cycle).toContainText("New plan");
  await dlg.getByRole("button", { name: "Import", exact: true }).click();
  await expect(dlg).toBeHidden();
  const row = page.getByRole("row", { name: /Week 49/ });
  await expect(row).toContainText("12 reels");
  // clean up: the e2e data stays as it was
  page.on("dialog", (d) => void d.accept());
  await row.click();
  await page.locator("button", { hasText: /^Delete$/ }).click();
  await expect(page.getByRole("row", { name: /Week 49/ })).toHaveCount(0);
});
