// Video 05 – Lubrication: points, routes, route work orders, the right lubricant, consumption.
"use strict";
const { confirm, title } = require("../_common");

const state = {};

module.exports = {
  id: "lubrication",
  file: "05-lubrication",
  intro: "Lubrication",
  title: "PlantPulse – Lubrication",
  covers: "Lubricants, lubrication points, routes, generating a route work order, recording each point with the actual quantity, approved alternatives with compatibility evidence, tasks and consumption, QR labels and Excel import",
  keyframes: [["02-how", 0.9], ["03-lists", 0.5], ["04-route", 0.85], ["05-alternative", 0.7]],
  scenes: [
    title("01-title", "Lubrication", "The right lubricant, the right amount, on time",
      "Lubrication. Every lubrication point, which lubricant it takes, how much and how often, grouped into routes that become work orders by themselves."),
    {
      id: "02-how", layout: "cards", chapter: "How it works", title: "Points, routes and work orders",
      cards: [
        { t: "Lubricant", d: "Code, product, grease or oil, viscosity or specification" },
        { t: "Point", d: "Equipment, component, lubricant, quantity, method, how often" },
        { t: "Route", d: "The points of one area, walked together" },
        { t: "Route work order", d: "One work order with every point that is due" },
        { t: "Record", d: "Actual quantity per point, by the person who did it" },
        { t: "Only the right one", d: "The specified lubricant, or an approved alternative" },
        { t: "Consumption", d: "How much of each lubricant was used" },
        { t: "QR labels", d: "Printed per route, for every point" },
      ],
      narration: "Each lubrication point says which equipment and component, which lubricant, how much, by what method, and how often, in days or running hours. "
        + "Points are grouped into routes. When points are due, the route becomes one work order. Each point is recorded with the actual quantity, "
        + "and only the specified lubricant, or an approved alternative, is accepted.",
    },
    {
      id: "03-lists", layout: "app", device: "desktop", chapter: "Lubrication", step: "1 · Points & routes",
      narration: "The lubrication page has a tab for each list. Points, with their next due date: overdue ones in red. Routes, with the number of points. "
        + "Tasks, each one done or pending, with its work order. The lubricants, and the consumption of each.",
      async capture(cap) {
        const s = await cap.login("planner");
        const p = s.page;
        await s.goto("/lubrication");
        await s.view("Lubrication points – overdue in red", { weight: 1.2 });
        await s.click(p.getByRole("tab", { name: "Routes" }), "Routes and their points");
        await s.click(p.getByRole("tab", { name: "Tasks" }), "Tasks: done or pending, with the work order");
        await s.click(p.getByRole("tab", { name: "Lubricants" }), "The lubricants");
        await s.click(p.getByRole("tab", { name: "Consumption" }), "Consumption per lubricant");
      },
    },
    {
      id: "04-route", layout: "app", device: "desktop", chapter: "Lubrication", step: "2 · Route work order",
      narration: "Adding a point takes one form: equipment, component, lubricant, amount, method, frequency and route. "
        + "Routes are generated automatically, or by the team with Generate. The work order lists every due point, with a reminder: "
        + "never mix or substitute lubricants without verified compatibility and approval. The technician records each point with the quantity actually applied.",
      async capture(cap) {
        const s = await cap.login("planner");
        const p = s.page;
        await s.goto("/lubrication");
        await s.click(p.getByRole("button", { name: "Add: Lubrication points" }), "Add a lubrication point", { wait: 900 });
        const d = p.getByRole("dialog");
        await s.quiet(async () => {
          const a = d.getByRole("combobox").first(); await a.click(); await a.fill("L1-OVN-Z1-FAN1"); await p.waitForTimeout(900);
          await p.getByRole("option", { name: /^L1-OVN-Z1-FAN1 / }).first().click();
          await d.getByLabel("Component").fill("Fan bearing DE");
          await d.getByRole("combobox", { name: "Lubricant" }).click(); await p.getByRole("option", { name: /EP2/ }).first().click();
          await d.getByLabel("Quantity").fill("25");
          await d.getByLabel("Method").fill("Grease gun, 5 strokes");
          await d.getByLabel("Frequency (days)").fill("30");
          await d.getByRole("combobox", { name: "Routes" }).click(); await p.getByRole("option", { name: "LR-L1-MIX" }).click();
        });
        await s.click(d.getByRole("button", { name: "Create" }), "Equipment, lubricant, amount, method, every 30 days, route", { zoom: 1 });
        await s.quiet(async () => { await p.keyboard.press("Escape"); await p.getByRole("tab", { name: "Routes" }).click(); await p.waitForTimeout(600); });
        await s.click(p.getByRole("row", { name: /LR-L1-MIX/ }).getByRole("button", { name: "Generate route WO" }), "Generate the route work order", { wait: 1500 });
        await s.click(p.getByRole("tab", { name: "Tasks" }), "Tasks: done, missed or pending, with their work order");
        await s.quiet(async () => { await p.getByRole("link", { name: "→" }).last().click(); await p.waitForURL(/work-orders\//); state.wo = p.url(); });
        const m = await cap.login("mech.sup");
        const q = m.page;
        await q.goto(state.wo); await m.settle(1200);
        await m.view("One work order with every due point", { weight: 1.1 });
        await m.click(q.getByTestId("to-in_progress"), "Start the route", { after: confirm(m) });
        await m.view("Use only the specified lubricant", { focus: q.getByText(/Do not mix or substitute lubricants/), zoom: 1.4 });
        await m.quiet(async () => { await q.getByLabel("Actual quantity").first().fill("25"); });
        await m.click(q.getByRole("button", { name: "Record" }).first(), "Record the actual quantity", { zoom: 1.4 });
      },
    },
    {
      id: "05-alternative", layout: "app", device: "desktop", chapter: "Lubrication", step: "3 · Alternatives",
      narration: "When another lubricant may be used, an engineer approves it as an alternative, and must write the compatibility evidence. "
        + "From then on, both are accepted on that point, and nothing else is.",
      async capture(cap) {
        const s = await cap.login("reliability");
        const p = s.page;
        await s.goto("/lubrication");
        await s.click(p.getByRole("button", { name: "Approve alternative" }), "Approve an alternative lubricant", { wait: 900 });
        const d = p.getByRole("dialog");
        await s.quiet(async () => {
          await d.getByRole("combobox", { name: "Lubricant", exact: true }).click();
          await p.getByRole("option").first().click();
          await d.getByRole("combobox", { name: "Approved alternatives" }).click();
          await p.getByRole("option").first().click();
        });
        await s.type(d.getByLabel("Compatibility evidence"), "Same base oil and thickener; supplier compatibility sheet attached to the lubricant record", "Compatibility evidence is required");
        await s.click(d.getByRole("button", { name: "Approve" }), "Approved – now both are accepted on that point", { zoom: 1.3 });
      },
    },
    {
      id: "06-labels", layout: "app", device: "desktop", chapter: "Lubrication", step: "4 · Labels & import",
      narration: "QR labels can be printed for a whole route, so every point can be scanned in the plant. "
        + "And existing lubrication plans can be imported from Excel: one row per point, grouped into routes by department and frequency.",
      async capture(cap) {
        const s = await cap.login("planner");
        const p = s.page;
        await s.goto("/lubrication");
        await s.click(p.getByRole("button", { name: "Print QR labels" }), "Print QR labels for a route", { wait: 1000 });
        await s.quiet(async () => { await p.keyboard.press("Escape"); await p.waitForTimeout(500); });
        await s.click(p.getByRole("button", { name: "Import plan" }), "Import plan from Excel", { wait: 1000 });
      },
    },
    title("07-end", "Lubrication", "Next: condition monitoring",
      "That is lubrication. Next: condition monitoring, readings, limits and alarms."),
  ],
};

// ---- Voice, one sentence per filmed step or card ----
require("../_common").applySays(module.exports, {
  "03-lists": ["The lubrication page has a tab for each list. The points, with their next due date: overdue ones in red.",
    "The routes, with their number of points.", "The tasks, done, missed or pending, each with its work order.",
    "The lubricants.", "And the consumption of each lubricant."],
  "04-route": ["Adding a point takes one form.", "Equipment, component, lubricant, amount, method, how often, and its route. The code is optional: left blank, it is made from the name.",
    "Routes are generated automatically, or by the team with Generate.", "Every due point now has its task and work order.",
    "One work order holds every due point of the route.", "The technician starts the route.",
    "A reminder: never mix or substitute lubricants without verified compatibility and approval.",
    "Each point is recorded with the quantity actually applied."],
  "05-alternative": ["When another lubricant may be used, an engineer approves it as an alternative.",
    "The compatibility evidence must be written.", "Approved: from now on both are accepted on that point, and nothing else is."],
  "06-labels": ["QR labels can be printed for a whole route, so every point can be scanned in the plant.",
    "And existing lubrication plans can be imported from Excel: one row per point, grouped into routes."],
}, {
  "02-how": { lead: "Lubrication in PlantPulse works like this.", says: [
    "Each lubricant has a code, a product, grease or oil, and its viscosity or specification.",
    "Each point says which equipment and component, which lubricant, how much, by what method, and how often.",
    "Points are grouped into routes, walked together.", "When points are due, the route becomes one work order.",
    "Each point is recorded with the actual quantity.", "Only the specified lubricant, or an approved alternative, is accepted.",
    "Consumption shows how much of each lubricant was used.", "And QR labels are printed per route."] },
});
