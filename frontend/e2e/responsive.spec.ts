import { expect, test, type Page } from "@playwright/test";
import { login } from "./helpers";

// Phones, tablets and desktop, in English and Arabic: no page wider than the screen, the top bar and the bottom bar
// stay on screen, and the main touch targets are at least 44 x 44 px below the desktop breakpoint (62em = 992 px).
const SIZES = [
  { w: 360, h: 740 },
  { w: 412, h: 915 },
  { w: 768, h: 1024 },
  { w: 1024, h: 768 },
];
const PAGES = ["/admin", "/schedule", "/pm", "/work-orders"];

async function setLocale(page: Page, locale: "en" | "ar"): Promise<void> {
  const csrf = (await page.context().cookies()).find((c) => c.name === "cmms_csrf")?.value ?? "";
  const res = await page.request.post("/api/v1/auth/locale", { data: { locale }, headers: { "X-CSRF-Token": csrf } });
  expect(res.status()).toBe(204);
}

for (const lang of ["en", "ar"] as const) {
  for (const { w, h } of SIZES) {
    test(`layout fits the screen at ${w}px (${lang})`, async ({ browser }) => {
      const phone = w < 992;
      const context = await browser.newContext({ viewport: { width: w, height: h }, isMobile: phone, hasTouch: phone });
      const page = await context.newPage();
      await login(page, "admin");
      await setLocale(page, lang);
      try {
        for (const path of PAGES) {
          await page.goto(path);
          await expect(page.locator("html")).toHaveAttribute("dir", lang === "ar" ? "rtl" : "ltr");
          await expect(page.getByRole("heading").first()).toBeVisible();
          await page.waitForLoadState("networkidle");
          const m = await page.evaluate(() => {
            const box = (sel: string) => {
              const e = document.querySelector(sel);
              if (!e || getComputedStyle(e).display === "none") return null;
              const r = e.getBoundingClientRect();
              return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height };
            };
            return {
              pageWidth: document.documentElement.scrollWidth,
              header: ['.pp-header button[aria-label="menu"]', '[data-testid="global-search"]', '.pp-header a[href="/notifications"]', '[data-testid="account-menu"]'].map(box),
              bottomNav: box('[data-testid="bottom-nav"]'),
              rowCheckbox: box('[data-testid="table-cards"] label.pp-hit44'),
            };
          });
          // No page wider than the screen (mobile browsers would zoom out and push the bars off screen).
          expect(m.pageWidth, `${path} page width`).toBeLessThanOrEqual(w);
          for (const b of m.header.filter((x) => x !== null)) {
            expect(b.left, `${path} header control on screen`).toBeGreaterThanOrEqual(0);
            expect(b.right, `${path} header control on screen`).toBeLessThanOrEqual(w);
            if (phone) expect(Math.min(b.width, b.height), `${path} header touch target`).toBeGreaterThanOrEqual(44);
          }
          if (phone) {
            expect(m.bottomNav, `${path} bottom bar`).not.toBeNull();
            expect(m.bottomNav!.bottom, `${path} bottom bar on screen`).toBeLessThanOrEqual(h + 1);
            expect(m.bottomNav!.width, `${path} bottom bar width`).toBeLessThanOrEqual(w);
            if (m.rowCheckbox) expect(Math.min(m.rowCheckbox.width, m.rowCheckbox.height), `${path} row checkbox touch target`).toBeGreaterThanOrEqual(44);
          } else {
            expect(m.bottomNav, "desktop has no bottom bar").toBeNull();
          }
        }
        if (phone) {
          // The account menu (sign out, password) opens on a phone.
          await page.getByTestId("account-menu").click();
          await expect(page.getByRole("menuitem", { name: lang === "ar" ? /تسجيل الخروج/ : /sign out/i })).toBeVisible();
          await page.keyboard.press("Escape");
        }
      } finally {
        await setLocale(page, "en");
        await context.close();
      }
    });
  }
}
