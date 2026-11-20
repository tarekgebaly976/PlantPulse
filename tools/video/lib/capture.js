// Films the real PlantPulse app with Playwright: each step is saved as screenshots plus the box of the element that is
// clicked or typed into, so the compositor (stage.html) can draw the highlight, the pointer and the transitions.
// Only the local demo is used (DEMO organization, @demo.example.com training accounts).
"use strict";

const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const BASE = process.env.VIDEO_BASE_URL || "http://localhost:3000";
const DEMO_DOMAIN = "@demo.example.com";

const VIEWPORTS = {
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 },
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: false, hasTouch: true },
};

// Real company and person names that exist in the sample data (equipment makers, lubricants, one person's name).
// A screen that shows any of them stops the capture, so it never reaches a video. Add more in VIDEO_BLOCKLIST_FILE
// (one name per line, kept outside the repository).
const BLOCKLIST = ["SKF", "ABB", "Flender", "Atlas Copco", "Mobil", "Mobilgear", "Valmet", "Andritz", "Kadant", "Bosch", "Rexroth",
  "Aerzen", "LGEP", "Imran Khan"];

// Sample data shows real makers on equipment, spare parts and lubricants. In the filming browser only (the app and its
// data are not changed) they are shown as neutral sample names, in the style the demo already uses ("Line builder (sample)").
// Longest first. The blocklist check still runs after this, so a name missing here stops the capture.
const MASK = [
  ["Mobilgear 600 XP 220", "Gear oil VG 220 (sample)"], ["LGEP 2", "grease (sample)"], ["Bosch Rexroth", "Hydraulics maker (sample)"],
  ["Atlas Copco", "Compressor maker (sample)"], ["SKF-SA", "Bearing supplier (sample)"], ["SKF", "Bearing maker (sample)"],
  ["Mobil", "Lubricant maker (sample)"], ["Flender", "Gearbox maker (sample)"], ["ABB", "Electrical maker (sample)"],
  ["Aerzen", "Blower maker (sample)"], ["Imran Khan", "Imran K. (sample)"], ["Valmet", "Line builder (sample)"], ["Andritz", "Mill maker (sample)"], ["Kadant", "Equipment maker (sample)"],
];

function blocklist() {
  const extra = process.env.VIDEO_BLOCKLIST_FILE && fs.existsSync(process.env.VIDEO_BLOCKLIST_FILE)
    ? fs.readFileSync(process.env.VIDEO_BLOCKLIST_FILE, "utf8").split(/\r?\n/).map((s) => s.trim()).filter(Boolean) : [];
  return [...BLOCKLIST, ...extra].map((w) => ({ w, re: new RegExp(`(^|[^\\p{L}\\p{N}])${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^\\p{L}\\p{N}])`, "u") }));
}

class Recorder {
  constructor(outDir) {
    this.outDir = outDir;
    this.scenes = {};
    this.scene = null;
    this.n = 0;
    this.block = blocklist();
    fs.mkdirSync(outDir, { recursive: true });
  }
  begin(sceneId) { this.scene = sceneId; this.scenes[sceneId] = []; }
  add(beat) { this.scenes[this.scene].push(beat); }
  file(tag) { this.n += 1; return path.join(this.outDir, `${this.scene}-${String(this.n).padStart(3, "0")}-${tag}.png`); }
  save() { fs.writeFileSync(path.join(this.outDir, "beats.json"), JSON.stringify(this.scenes, null, 1)); }
}

/** One signed-in user in one browser (desktop or phone). */
class Session {
  constructor(rec, page, device) { this.rec = rec; this.page = page; this.device = device; }

  async settle(ms = 700) {
    await this.page.waitForLoadState("networkidle").catch(() => {});
    await this.page.waitForTimeout(ms);
  }

  async check() {
    const text = await this.page.evaluate(() => document.body.innerText);
    for (const { w, re } of this.rec.block) if (re.test(text)) throw new Error(`Blocked name "${w}" is visible on ${this.page.url()} (scene ${this.rec.scene})`);
  }

  async mask() {
    await this.page.evaluate((pairs) => {
      const rx = pairs.map(([a, b]) => [new RegExp(`(^|[^\\p{L}\\p{N}])${a.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=$|[^\\p{L}\\p{N}])`, "gu"), b]);
      const fix = (v) => rx.reduce((x, [r, b]) => x.replace(r, (_m, p) => p + b), v);
      const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let n = w.nextNode(); n; n = w.nextNode()) { const v = fix(n.nodeValue); if (v !== n.nodeValue) n.nodeValue = v; }
      document.querySelectorAll("input, textarea").forEach((e) => { const v = fix(e.value); if (v !== e.value) e.value = v; });
    }, MASK);
  }

  async snap(tag) {
    await this.mask();
    await this.check();
    const f = this.rec.file(tag);
    await this.page.screenshot({ path: f });
    return path.basename(f);
  }

  async box(locator) {
    await locator.scrollIntoViewIfNeeded().catch(() => {});
    await this.page.waitForTimeout(250);
    const b = await locator.boundingBox();
    if (!b) throw new Error(`No box for ${locator}`);
    return { x: b.x, y: b.y, w: b.width, h: b.height };
  }

  vp() { return this.page.viewportSize(); }

  async goto(url) { await this.page.goto(BASE + url); await this.settle(1200); }

  /** A still view of the current screen. opts.focus: a locator to frame (zoom target, no click). */
  async view(caption, opts = {}) {
    const box = opts.focus ? await this.box(opts.focus) : null;
    await this.settle(opts.wait ?? 300);
    this.rec.add({ kind: "view", device: this.device, vp: this.vp(), imgs: [await this.snap("view")], box, caption, zoom: opts.zoom ?? null, weight: opts.weight ?? 1, say: opts.say ?? null });
  }

  /** Click an element: the "before" screen with its box, then the screen after the click. */
  async click(locator, caption, opts = {}) {
    const box = await this.box(locator);
    const before = await this.snap("before");
    if (opts.check) await locator.check(); else await locator.click();
    await this.settle(opts.wait ?? 900);
    if (opts.after) await opts.after();
    const after = await this.snap("after");
    this.rec.add({ kind: "click", device: this.device, vp: this.vp(), imgs: [before, after], box, caption, zoom: opts.zoom ?? null, weight: opts.weight ?? 1, say: opts.say ?? null });
  }

  /** Type into a field; a few in-between screenshots show the text appearing. */
  async type(locator, text, caption, opts = {}) {
    const box = await this.box(locator);
    const imgs = [await this.snap("type0")];
    await locator.click();
    const steps = Math.min(4, Math.max(2, Math.ceil(text.length / 8)));
    for (let i = 1; i <= steps; i++) {
      await locator.fill(text.slice(0, Math.round((text.length * i) / steps)));
      await this.page.waitForTimeout(150);
      imgs.push(await this.snap(`type${i}`));
    }
    if (opts.after) { await opts.after(); await this.settle(500); imgs.push(await this.snap("typed")); }
    this.rec.add({ kind: "type", device: this.device, vp: this.vp(), imgs, box, caption, zoom: opts.zoom ?? null, weight: opts.weight ?? 1, say: opts.say ?? null });
  }

  /** Do something without filming it (e.g. fill fields already shown, or prepare data). */
  async quiet(fn) { await fn(this.page); await this.settle(500); }
}

/** Arabic films: the capture steps are written with the English labels; they are translated to the app's own Arabic
 *  labels (from its language files) wherever Playwright looks for a role name, label, text or placeholder. */
let patched = false;
function patchForArabic(page) {
  if (patched) return;
  patched = true;
  const map = require("./i18n-map").build("ar");
  const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const keys = [...map.keys()].sort((a, b) => a.length - b.length);
  const tr = (v) => {
    if (typeof v === "string") {
      if (map.has(v)) return map.get(v);
      if (/:$/.test(v) && map.has(v.slice(0, -1))) return map.get(v.slice(0, -1));
      if (/[a-z]/.test(v) && v.length >= 4) {  // English matching is by substring: find the shortest UI text that contains it
        const lv = v.toLowerCase(), wb = new RegExp(`(^|\\W)${esc(lv)}($|\\W)`);
        const k = keys.find((x) => wb.test(x.toLowerCase())) || keys.find((x) => x.toLowerCase().includes(lv));
        if (k) return map.get(k);
      }
      const m = v.match(/^(\+ |[^:]+: )(.+)$/);  // "Add: Lubrication points", "+ Work packages"
      if (m) { const a = map.get(m[1].replace(/: $/, "")) , b = map.get(m[2]); if (b) return (m[1].startsWith("+") ? "+ " : (a ?? m[1].replace(/: $/, "")) + ": ") + b; }
      return v;
    }
    if (v instanceof RegExp) {
      if (/^\^?[\w\s\\.()&-]+\$?$/.test(v.source) && !/^\^?[A-Z0-9-]+\$?$/.test(v.source)) {
        const k = keys.find((x) => v.test(x));
        if (k) return new RegExp(esc(map.get(k)), v.flags.replace("i", ""));
      }
      return v;
    }
    return v;
  };
  const opts = (o) => (o && o.name !== undefined ? { ...o, name: tr(o.name) } : o);
  const wrap = (proto) => {
    for (const fn of ["getByRole", "getByLabel", "getByText", "getByPlaceholder", "getByTitle"]) {
      const orig = proto[fn];
      proto[fn] = function (a, o) { return fn === "getByRole" ? orig.call(this, a, opts(o)) : orig.call(this, tr(a), o); };
    }
    const loc = proto.locator;
    proto.locator = function (sel, o) { return loc.call(this, typeof sel === "string" ? sel.replace(/has-text\("([^"]+)"\)/g, (m, x) => `has-text("${tr(x)}")`) : sel, o); };
    const f = proto.filter;
    proto.filter = function (o) { return f.call(this, o && o.hasText !== undefined ? { ...o, hasText: tr(o.hasText) } : o); };
  };
  wrap(Object.getPrototypeOf(page));
  wrap(Object.getPrototypeOf(page.locator("body")));
}

class Capture {
  constructor(outDir, password, lang = "en") {
    this.lang = lang;
    this.rec = new Recorder(outDir);
    this.password = password;
    this.browser = null;
    this.sessions = [];
  }
  async start() { this.browser = await chromium.launch(); }
  async stop() { for (const s of this.sessions) await s.ctx.close().catch(() => {}); await this.browser.close(); this.rec.save(); }
  scene(id) { this.rec.begin(id); }

  /** Sign in as a demo training account (e.g. "manager" → manager@demo.example.com), in English. */
  async login(who, device = "desktop") {
    const ctx = await this.browser.newContext({ ...VIEWPORTS[device], locale: "en-US", timezoneId: "Asia/Riyadh", colorScheme: "light" });
    const page = await ctx.newPage();
    await page.goto(BASE + "/login");
    await page.locator('input[type="email"]').fill(who + DEMO_DOMAIN);
    await page.locator('input[name="password"]').fill(this.password);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(/\/$/);
    const csrf = (await ctx.cookies()).find((c) => c.name === "cmms_csrf")?.value ?? "";
    await page.request.post(BASE + "/api/v1/auth/locale", { data: { locale: this.lang }, headers: { "X-CSRF-Token": csrf } });
    // Film without the blinking text cursor and without the short "Saved" pop-ups (error messages stay visible).
    await ctx.addInitScript(() => {
      const css = "*{caret-color:transparent !important} .mantine-Notification-root:not(:has(.mantine-Notification-title)){display:none !important}";
      document.addEventListener("DOMContentLoaded", () => { const st = document.createElement("style"); st.textContent = css; document.head.appendChild(st); });
    });
    await page.reload();
    if (this.lang === "ar") patchForArabic(page);
    const s = new Session(this.rec, page, device);
    s.ctx = ctx;
    this.sessions.push(s);
    await s.settle(1200);
    return s;
  }

  /** Plant switcher in the top bar (DMO = general demo plant, DPM = demo paper mill with the production module). */
  async plant(s, code) {
    const sel = s.page.getByRole("textbox", { name: "Plant" }).or(s.page.getByLabel("Plant", { exact: true })).first();
    await sel.click();
    await s.page.getByRole("option", { name: code, exact: true }).click();
    await s.settle(1500);
  }
}

module.exports = { Capture, BASE };
