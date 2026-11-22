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
