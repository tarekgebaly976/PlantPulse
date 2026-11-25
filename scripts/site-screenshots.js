#!/usr/bin/env node
// Phone screenshots for the website (site/public/img/<dir>/*.webp, 540 x 960) from a LOCAL copy of the app with the
// public demo's sample plant. Never point it at a real system.
//
//   cd backend && CMMS_DEMO_PASSWORD='Demo-Passw0rd!2026' .venv/bin/python -m app.cli seed-demo --profile general
//   .venv/bin/uvicorn app.main:app --port 8000 &                     # no CMMS_INSTANCE_LABEL: no DEMO badge on the shots
//   cd ../frontend && npm run build && BACKEND_URL=http://127.0.0.1:8000 npx next start -p 3000 &
//   node scripts/site-screenshots.js site/public/img/v5               # needs Playwright (require('playwright'))
//
// Google Play listing (1080 x 1920 PNG, the 8 shots in PLAY below, numbered):
//   node scripts/site-screenshots.js docs/play-store --play
//
// The planner shot proposes next week's maintenance schedule in that LOCAL database (a draft, as the planner would).
//
// The file names are those used in site/public/index.html; put new shots in a NEW folder (v4, v5 …) and change the
// paths in index.html, so phones do not keep showing cached old images.
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const BASE = process.env.APP_URL ?? "http://127.0.0.1:3000";
const PASSWORD = process.env.DEMO_PASSWORD ?? "Demo-Passw0rd!2026";
const out = path.resolve(process.argv[2] ?? "site/public/img/v5");
const play = process.argv.includes("--play");
// Website: 540 x 960 WebP. Google Play: 1080 x 1920 PNG, only these, in this order.
const PLAY = ["dashboard", "asset-qr", "field-offline", "schedule-board", "skills", "pdm-trend", "nelson", "dashboard-ar"];
const PHONE = { viewport: { width: 405, height: 720 }, deviceScaleFactor: play ? 1080 / 405 : 4 / 3, isMobile: true, hasTouch: true };

async function session(browser, who, lang = "en") {
  const ctx = await browser.newContext(PHONE);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`);
  await page.waitForLoadState("networkidle");
  await page.locator('input[name="email"]').fill(`${who}@demo.example.com`);
  await page.locator('input[name="password"]').fill(PASSWORD);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
  // Same language every time (the preference is stored per user on the server).
  // (On phones the language button sits in the account menu, so set it through the API and reload.)
  await page.evaluate(async (locale) => {
    const csrf = decodeURIComponent((document.cookie.match(/(?:^|; )cmms_csrf=([^;]*)/) ?? [])[1] ?? "");
    await fetch("/api/v1/auth/locale", { method: "POST", headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf }, body: JSON.stringify({ locale }) });
  }, lang);
  await page.reload(); await page.waitForTimeout(800);
  const plant = await page.evaluate(async () => (await (await fetch("/api/v1/auth/me")).json()).plants[0].plant_id);
  const api = (url) => page.evaluate(async ([u, p]) => { // inside the page, so the (Secure) session cookie goes along
    const r = await fetch(`/api/v1${u}`, { headers: { "X-Plant-Id": p } });
    if (!r.ok) throw new Error(`${u}: ${r.status}`);
    return r.json();
  }, [url, plant]);
  return { ctx, page, api };
}

async function settle(page) {
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await page.waitForTimeout(1200); // charts animate
}

/** PNG from Playwright → WebP via the browser's own encoder (no extra tools). */
async function save(browser, png, name) {
  if (play) {
    const i = PLAY.indexOf(name);
    if (i < 0) return;
    const file = `${i + 1}-${name}.png`;
    fs.writeFileSync(path.join(out, file), png);
    console.log(`  ${file}`);
    return;
  }
  const page = await browser.newPage();
  const b64 = png.toString("base64");
  const webp = await page.evaluate(async (data) => {
    const img = new Image();
    img.src = `data:image/png;base64,${data}`;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.width; c.height = img.height;
    c.getContext("2d").drawImage(img, 0, 0);
    return c.toDataURL("image/webp", 0.82).split(",")[1];
  }, b64);
  await page.close();
  fs.writeFileSync(path.join(out, `${name}.webp`), Buffer.from(webp, "base64"));
  console.log(`  ${name}.webp`);
}

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch();
  const shot = async (page, name) => { await settle(page); await save(browser, await page.screenshot(), name); };

  // Maintenance manager: dashboard, equipment, request, work order, PM, condition monitoring, KPIs
  const m = await session(browser, "manager");
  await m.page.goto(`${BASE}/`); await shot(m.page, "dashboard");

  const asset = (await m.api("/assets?q=L1-MIX-M1-DRV-BRG-DE&limit=5")).items.find((a) => a.code === "L1-MIX-M1-DRV-BRG-DE");
  await m.page.goto(`${BASE}/assets/${asset.id}`); await shot(m.page, "asset");
  await m.page.getByText("QR label", { exact: false }).first().scrollIntoViewIfNeeded();
  await m.page.evaluate(() => window.scrollBy(0, 160)); await shot(m.page, "asset-qr");
  await m.page.evaluate(() => window.scrollTo(0, 0));
  await m.page.getByRole("button", { name: "New work request" }).first().click();
  const dlg = m.page.getByRole("dialog");
  await dlg.locator('input[name="req-title"]').fill("Abnormal noise at mixer drive-end bearing");
  await dlg.getByLabel("Description").fill("Loud grinding noise since morning shift, housing hot to touch.");
  await shot(m.page, "request");
  await m.page.keyboard.press("Escape");

  const wo = (await m.api("/work-orders?q=WO-DMO-000100&limit=1")).items[0];
  await m.page.goto(`${BASE}/work-orders/${wo.id}`); await shot(m.page, "wo");

  await m.page.goto(`${BASE}/pm`); await shot(m.page, "pm");

  await m.page.goto(`${BASE}/pdm`); await settle(m.page);
  await m.page.getByTestId("table-cards").getByText("VIB-MIX-DE", { exact: true }).click();
  await shot(m.page, "pdm-trend");
  const nel = m.page.getByRole("dialog").getByTestId("nelson-table");
  if (await nel.count()) {
    await nel.evaluate((el) => el.scrollIntoView({ block: "end" })); await shot(m.page, "nelson");
  } else console.log("  (no Nelson table in the trend dialog)");
  await m.page.keyboard.press("Escape");

  await m.page.goto(`${BASE}/kpis`); await settle(m.page);
  // The last six months (the default is the month so far, often too little data for a picture).
  const from = new Date(); from.setMonth(from.getMonth() - 6);
  await m.page.getByLabel("From", { exact: true }).fill(from.toISOString().slice(0, 10));
  await settle(m.page);
  await m.page.getByTestId("kpi-mtbf").click();
  await m.page.getByRole("dialog").locator(".recharts-wrapper").first().scrollIntoViewIfNeeded();
  await shot(m.page, "kpi-trend");
  await m.page.keyboard.press("Escape");
  await m.page.getByRole("tab", { name: /failure/i }).click(); await settle(m.page);
  await m.page.locator(".recharts-wrapper").first().scrollIntoViewIfNeeded();
  await m.page.evaluate(() => window.scrollBy(0, 120)); await shot(m.page, "pareto");
  await m.page.goto(`${BASE}/`);
  await m.ctx.close();

  // Technician: own work list, then the field round without a connection
  const tech = await session(browser, "tech1");
  await tech.page.goto(`${BASE}/my-work`); await shot(tech.page, "mywork");
  await tech.page.goto(`${BASE}/field`); await settle(tech.page);
  await tech.ctx.setOffline(true); await tech.page.waitForTimeout(1500);
  await tech.page.getByText(/My work orders/).first().click();
  await shot(tech.page, "field-offline");
  await tech.ctx.setOffline(false);
  await tech.ctx.close();

  // Planner: next week's maintenance schedule (proposed if it is not yet) and the skill matrix
  const pl = await session(browser, "planner");
  const sunday = new Date(); sunday.setDate(sunday.getDate() + 7 - sunday.getDay());
  await pl.page.goto(`${BASE}/schedule?week=${sunday.toISOString().slice(0, 10)}`); await settle(pl.page);
  const propose = pl.page.getByTestId("propose");
  if (await propose.count()) { await propose.click(); await pl.page.getByText("Work orders scheduled").waitFor({ timeout: 60000 }); }
  await pl.page.waitForTimeout(6000); // the "Schedule proposed" message closes by itself
  await pl.page.reload(); await settle(pl.page);
  await pl.page.getByText("Work orders scheduled").first().evaluate((el) => el.scrollIntoView({ block: "start" }));
  await pl.page.evaluate(() => window.scrollBy(0, -90)); await shot(pl.page, "schedule");
  await pl.page.locator("main table").first().evaluate((el) => el.scrollIntoView({ block: "start" }));
  await pl.page.evaluate(() => window.scrollBy(0, -70)); await shot(pl.page, "schedule-board");
  await pl.page.goto(`${BASE}/shifts`); await settle(pl.page);
  await pl.page.getByRole("tab", { name: "Skill matrix" }).click(); await settle(pl.page);
  await pl.page.locator("table").first().scrollIntoViewIfNeeded();
  await pl.page.evaluate(() => window.scrollBy(0, -20)); await shot(pl.page, "skills");
  await pl.ctx.close();

  // Arabic interface (manager), then back to English so the demo account stays as it was
  const ar = await session(browser, "manager", "ar");
  await ar.page.goto(`${BASE}/`); await shot(ar.page, "dashboard-ar");
  await ar.ctx.close();
  await (await session(browser, "manager", "en")).ctx.close();

  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
