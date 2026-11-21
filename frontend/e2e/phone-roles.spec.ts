import { expect, test, type Browser, type Page } from "@playwright/test";
import { login } from "./helpers";

// Phone home and bottom bar by role (360 px), and the computer layout that must not change.
async function phone(browser: Browser, who: string): Promise<Page> {
  const context = await browser.newContext({ viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  await login(page, who);
  return page;
}

async function choosePlant(page: Page, code: string): Promise<void> {
  const sel = page.locator(".pp-header input[aria-label]");
  if ((await sel.inputValue()) === code) return;
  await sel.click();
  await page.getByRole("option", { name: code }).click();
  await expect(sel).toHaveValue(code);
}

test("technician phone home: work orders first, no buttons repeated from the bottom bar", async ({ browser }) => {
  const page = await phone(browser, "tech1");
  const main = page.locator("main");
  await expect(main.getByText("Needs attention", { exact: true })).toBeInViewport();
  await expect(main.getByRole("link", { name: "New work request" })).toBeHidden(); // it is the + button
  await expect(main.getByRole("link", { name: "Scan QR" })).toBeHidden(); // it is in the bottom bar
  await expect(main.getByRole("link", { name: "Field round (offline)" })).toBeVisible(); // not in the bottom bar
  await expect(page.getByTestId("dash-legend")).toBeHidden();
  await page.getByTestId("dash-legend-button").click();
  await expect(page.locator(".mantine-Popover-dropdown").getByText("Red = act now")).toBeVisible();
  const bar = page.getByTestId("bottom-nav");
  await expect(bar.getByTestId("bottom-second")).toHaveAttribute("aria-label", "My work");
  await expect(bar.getByRole("link", { name: "New work request" })).toBeVisible();
  await page.context().close();
});

test("supervisor phone: work orders in the bottom bar, create menu", async ({ browser }) => {
  const page = await phone(browser, "mech.sup");
  const bar = page.getByTestId("bottom-nav");
  await expect(bar.getByTestId("bottom-second")).toHaveAttribute("aria-label", "Work orders");
  await bar.getByTestId("create-menu").click();
  await expect(page.getByRole("menuitem")).toHaveText(["New work request", "New work order"]);
  await page.context().close();
});

test("production user phone: lines on the home page, production reports and the day report one tap away", async ({ browser }) => {
  const page = await phone(browser, "production");
  await choosePlant(page, "DPM");
  const prod = page.getByTestId("dash-production");
  await expect(prod).toBeInViewport();
  await expect(prod.getByTestId("prod-line").first()).toContainText("PM1");
  const bar = page.getByTestId("bottom-nav");
  await expect(bar.getByTestId("bottom-second")).toHaveAttribute("aria-label", "Production reports");
  await bar.getByTestId("create-menu").click();
  await expect(page.getByRole("menuitem").first()).toHaveText("Report for a day");
  await page.getByRole("menuitem", { name: "Report for a day" }).click();
  await expect(page).toHaveURL(/\/operations/);
  await expect(page.getByRole("dialog", { name: "Report for a day" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
  // "More" opens with the production group open
  await bar.getByTestId("bottom-more").click();
  await expect(page.getByTestId("nav-group-navGroup.operations")).toHaveAttribute("aria-expanded", "true");
  await page.context().close();
});

test("storekeeper phone: spare parts in the bottom bar", async ({ browser }) => {
  const page = await phone(browser, "store");
  const bar = page.getByTestId("bottom-nav");
  await expect(bar.getByTestId("bottom-second")).toHaveAttribute("aria-label", "Spare parts");
  await expect(bar.getByTestId("create-menu")).toHaveCount(0);
  await page.context().close();
});

test("phone tabs: one row that scrolls, the tab opened from a link is on screen", async ({ browser }) => {
  const page = await phone(browser, "manager");
  await page.goto("/pm?tab=approvals");
  const active = page.locator("main .mantine-Tabs-tab[data-active]");
  await expect(active).toContainText("Approvals");
  await expect.poll(async () => page.evaluate(() => {
    const t = document.querySelector("main .mantine-Tabs-tab[data-active]")!;
    const l = t.parentElement!.getBoundingClientRect(), r = t.getBoundingClientRect();
    const tops = new Set([...t.parentElement!.children].map((c) => Math.round(c.getBoundingClientRect().top)));
    return tops.size === 1 && r.left >= l.left - 1 && r.right <= l.right + 1 && r.height >= 44;
  })).toBe(true);
  await page.context().close();
});

test("computer home keeps the quick buttons and the colour key", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await login(page, "tech1");
  const main = page.locator("main");
  await expect(main.getByRole("link", { name: "New work request" })).toBeVisible();
  await expect(main.getByRole("link", { name: "Scan QR" })).toBeVisible();
  await expect(page.getByTestId("dash-legend")).toBeVisible();
  await expect(page.getByTestId("customise-dashboard")).toBeVisible();
  await expect(page.getByTestId("bottom-nav")).toBeHidden();
});
