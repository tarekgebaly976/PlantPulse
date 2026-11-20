// Video 10 – Spare parts: the store, stock, receipts, adjustments, requisitions, valuation, parts used.
"use strict";
const { title, applySays } = require("../_common");

module.exports = {
  id: "inventory",
  file: "10-spare-parts",
  intro: "Spare parts",
  title: "PlantPulse – Spare parts",
  covers: "Parts list with critical spares and below-reorder filter, the part page (stock per warehouse, ledger), goods receipt at moving-average cost, adjustments with a reason, purchase requisitions (local references, no ERP), valuation, aging and excess, parts used per machine with Excel export",
  keyframes: [["02-how", 0.9], ["03-parts", 0.5], ["04-receipt", 0.6], ["05-reports", 0.8]],
  scenes: [
    title("01-title", "Spare parts", "The right part, in stock, at the right cost",
      "Spare parts. The store's stock, every movement in and out, and the parts used on every machine."),
    {
      id: "02-how", layout: "cards", chapter: "How it works", title: "The store in PlantPulse",
      cards: [
        { t: "Part", d: "Code, description, unit, criticality, min, max and reorder point" },
        { t: "Stock", d: "On hand, reserved, available and on order, per warehouse" },
        { t: "Goods receipt", d: "At moving-average cost, optionally against a requisition" },
        { t: "Issue and return", d: "Against a work order; the cost goes to the work order" },
        { t: "Adjustment", d: "Always with a reason; stock can never go negative" },
        { t: "Requisitions", d: "Local references – no ERP connection" },
        { t: "Valuation", d: "Stock value, aging and excess" },
        { t: "Parts used", d: "Per machine, per part and per period" },
      ],
    },
    {
      id: "03-parts", layout: "app", device: "desktop", chapter: "Spare parts", step: "1 · Parts & stock",
      async capture(cap) {
        const s = await cap.login("store");
        const p = s.page;
        await s.goto("/inventory");
        await s.view("All spare parts with their stock", { weight: 1.1 });
        await s.click(p.getByLabel("Critical spare"), "Only critical spares", { check: true, zoom: 1.4 });
        await s.click(p.getByLabel("Below reorder point"), "Or only parts below the reorder point", { check: true, zoom: 1.4 });
        await s.quiet(async () => { await p.getByLabel("Critical spare").uncheck(); await p.getByLabel("Below reorder point").uncheck(); await p.waitForTimeout(800); });
        await s.click(p.getByRole("cell", { name: /CPL-ELEM/ }).first(), "Open a part", { wait: 1500 });
        await s.click(p.getByRole("tab", { name: "Transactions" }), "Every movement, in and out");
      },
    },
    {
      id: "04-receipt", layout: "app", device: "desktop", chapter: "Spare parts", step: "2 · Receipts & adjustments",
      async capture(cap) {
        const s = await cap.login("store");
        const p = s.page;
        await s.goto("/inventory");
        await s.click(p.getByRole("button", { name: "Goods receipt" }), "Goods receipt", { wait: 900 });
        const d = p.getByRole("dialog");
        await s.quiet(async () => {
          await d.getByRole("combobox", { name: "Part" }).click(); await d.getByRole("combobox", { name: "Part" }).fill("CPL"); await p.getByRole("option").first().click();
          await d.getByRole("combobox", { name: "Warehouse" }).click(); await p.getByRole("option").first().click();
          await d.getByLabel("Quantity").fill("4");
          await d.getByLabel("Unit cost").fill("395");
        });
        await s.click(d.getByRole("button", { name: "Save" }), "Part, store, quantity and cost");
        await s.click(p.getByRole("button", { name: "Adjustment" }), "Adjustment: quantity change and a required reason", { wait: 900 });
      },
    },
    {
      id: "05-reports", layout: "app", device: "desktop", chapter: "Spare parts", step: "3 · Requisitions & reports",
      async capture(cap) {
        const s = await cap.login("store");
        const p = s.page;
        await s.goto("/inventory");
        await s.click(p.getByRole("tab", { name: "Purchase requisitions / POs" }), "Purchase requisitions");
        await s.click(p.getByRole("tab", { name: "Valuation" }), "Valuation of the stock");
        await s.click(p.getByRole("tab", { name: "Aging & excess" }), "Aging and excess");
        await s.click(p.getByRole("tab", { name: "Parts used" }), "Parts used per machine, part and period");
      },
    },
    title("06-end", "Spare parts", "Next: shifts and handover",
      "That is the store. Next: shifts and the handover between them."),
  ],
};

applySays(module.exports, {
  "03-parts": ["The parts list shows every spare part with its stock.", "Filter the critical spares.", "Or the parts below their reorder point.",
    "Open a part: its data, and the stock in each warehouse: on hand, reserved, available and on order.",
    "The transactions tab lists every movement, in and out."],
  "04-receipt": ["The storekeeper books a goods receipt.", "Part, store, quantity and unit cost. The average cost is updated by itself.",
    "Corrections are made as an adjustment, and an adjustment always needs a reason. Stock can never go negative."],
  "05-reports": ["Purchase requisitions are kept as local references, with the ERP order number. There is no ERP connection.",
    "Valuation gives the value of the stock.", "Aging and excess show what has not moved.",
    "And Parts used shows what was fitted, per machine, including everything below it, per part and per period, with an Excel export."],
}, {
  "02-how": { lead: "The store in PlantPulse.", says: [
    "Each part has a code, description, unit, criticality, and min, max and reorder point.",
    "Stock is kept per warehouse: on hand, reserved, available and on order.",
    "Goods receipts are booked at moving-average cost, optionally against a requisition.",
    "Issues and returns go against a work order, and the cost goes with them.",
    "Adjustments always need a reason, and stock can never go negative.",
    "Requisitions are local references; there is no ERP connection.",
    "Valuation shows the stock value, its aging and excess.",
    "And parts used shows what was fitted on every machine."] },
});
