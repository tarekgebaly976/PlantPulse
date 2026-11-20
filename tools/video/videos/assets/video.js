// Video 09 – Assets: the equipment tree, the asset page, BOM, meters, QR labels, import.
"use strict";
const { title } = require("../_common");

module.exports = {
  id: "assets",
  file: "09-assets-and-qr-labels",
  intro: "Assets & QR labels",
  title: "PlantPulse – Assets and QR labels",
  covers: "The equipment hierarchy and search, the list with criticality, the asset page (details, QR label, history and reliability, BOM spare parts, meters and condition monitoring, lubrication, attachments), new asset, Excel import with preview, QR label sheets, equipment types",
  keyframes: [["02-how", 0.9], ["03-tree", 0.4], ["04-asset", 0.3], ["04-asset", 0.7]],
  scenes: [
    title("01-title", "Assets & QR labels", "Every machine, its history and its parts",
      "The asset register. Every piece of equipment in one tree, from the plant down to the component, each with its own page, history, spare parts and QR label."),
    {
      id: "02-how", layout: "cards", chapter: "How it works", title: "One page per machine",
      cards: [
        { t: "Hierarchy", d: "Plant, area, line, equipment, component" },
        { t: "Criticality", d: "A, B or C – it drives priorities and RCA rules" },
        { t: "Details", d: "OEM, model, serial number, install date, operating hours" },
        { t: "History", d: "Every work order and its cost, with reliability over 12 months" },
        { t: "BOM", d: "The spare parts that fit this machine" },
        { t: "Meters & monitoring", d: "Running hours and condition points" },
        { t: "Documents", d: "Manuals, drawings and photos" },
        { t: "QR label", d: "Scan it to open this page on the phone" },
      ],
      narration: "The equipment is kept as a tree: plant, area, line, equipment and component. Each asset has a criticality, A, B or C, "
        + "its details, its complete history with costs and reliability, its spare parts list, meters and condition points, documents, and a QR label.",
    },
    {
      id: "03-tree", layout: "app", device: "desktop", chapter: "Assets", step: "1 · Tree & search",
      narration: "The hierarchy view opens level by level. A search finds equipment at every level at once, by code or by name. "
        + "The list view shows criticality, status and maker, filters by criticality, and exports to a spreadsheet.",
      async capture(cap) {
        const s = await cap.login("manager");
        const p = s.page;
        await s.goto("/assets");
        await s.view("The equipment tree, level by level", { weight: 1.2 });
        await s.type(p.getByPlaceholder(/./).first(), "mixer", "Search every level by code or name");
        await s.quiet(async () => { await p.getByPlaceholder(/./).first().fill(""); await p.waitForTimeout(600); });
        await s.click(p.locator(".mantine-SegmentedControl-root").getByText("List", { exact: true }), "List: criticality, status, maker");
      },
    },
    {
      id: "04-asset", layout: "app", device: "desktop", chapter: "Assets", step: "2 · The asset page",
      narration: "Open an asset. Details shows where it sits, its data and its QR label, with the total maintenance cost. "
        + "History lists every work order, with failures and reliability. Then the bill of materials, meters and condition points, "
        + "lubrication points, and the documents. A new work request or work order can be raised from the page itself.",
      async capture(cap) {
        const s = await cap.login("manager");
        const p = s.page;
        await s.goto("/assets");
        await s.quiet(async () => { await p.getByPlaceholder(/./).first().fill("L1-MIX-M1-DRV"); await p.waitForTimeout(1200); });
        await s.click(p.getByRole("cell", { name: "L1-MIX-M1-DRV", exact: true }).first(), "Open the mixer drive", { wait: 1500 });
        await s.click(p.getByRole("tab", { name: "History" }), "History: every work order, cost and reliability");
        await s.click(p.getByRole("tab", { name: "BOM / spare parts" }), "BOM: the spare parts of this machine");
        await s.click(p.getByRole("tab", { name: /Meters/ }), "Meters and condition points");
        await s.click(p.getByRole("tab", { name: "Lubrication" }), "Its lubrication points");
        await s.view("Report a problem or open a work order from here", { focus: p.getByRole("button", { name: "New work request" }), zoom: 1.5 });
      },
    },
    {
      id: "05-labels", layout: "app", device: "desktop", chapter: "Assets", step: "3 · Labels & import",
      narration: "QR labels are printed on standard A4 sheets of twenty-four: choose an asset and everything below it, or a department. "
        + "A whole register can be imported from Excel: download the template, preview, see every error per row, then import. "
        + "And equipment types are suggested from the names, so each machine offers its own failure modes on the work order.",
      async capture(cap) {
        const s = await cap.login("manager");
        const p = s.page;
        await s.goto("/assets");
        await s.click(p.getByRole("button", { name: "Print QR labels" }), "QR labels: A4, 24 per sheet", { wait: 1000 });
        await s.quiet(async () => { await p.keyboard.press("Escape"); await p.waitForTimeout(500); });
        await s.click(p.getByRole("button", { name: "Import", exact: true }), "Import: template, preview, import", { wait: 1000 });
        await s.quiet(async () => { await p.keyboard.press("Escape"); await p.waitForTimeout(500); });
        await s.click(p.getByRole("button", { name: "Equipment types" }), "Equipment types, suggested from the names", { wait: 1200 });
      },
    },
    title("06-end", "Assets & QR labels", "Next: spare parts",
      "That is the asset register. Next: spare parts and the store."),
  ],
};

// ---- Voice, one sentence per filmed step or card ----
require("../_common").applySays(module.exports, {
  "03-tree": ["The hierarchy view opens the equipment tree level by level.", "A search finds equipment at every level at once, by code or by name.",
    "The list view shows criticality, status and maker, filters by criticality, and exports to a spreadsheet."],
  "04-asset": ["Open an asset. Details shows its data, its QR label and the total maintenance cost.",
    "History lists every work order, with failures and reliability over twelve months.", "The bill of materials: the spare parts of this machine.",
    "Its meters and condition monitoring points.", "Its lubrication points.",
    "And a work request or a work order can be raised from the page itself."],
  "05-labels": ["QR labels print on standard A4 sheets of twenty-four: an asset and everything below it, or a department.",
    "A whole register can be imported from Excel: template, preview with every error per row, then import.",
    "And equipment types are suggested from the names, so each machine offers its own failure modes."],
}, {
  "02-how": { lead: "One page per machine.", says: [
    "The equipment is kept as a tree: plant, area, line, equipment and component.", "Each asset has a criticality, A, B or C, which drives priorities and the RCA rules.",
    "Its details: maker, model, serial number, install date and running hours.", "Its complete history, with costs and reliability.",
    "The spare parts that fit it.", "Its meters and condition points.", "Its manuals, drawings and photos.",
    "And a QR label that opens this page on the phone."] },
});
