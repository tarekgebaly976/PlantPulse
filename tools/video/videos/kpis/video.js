// Video 12 – Dashboard, search, notifications, KPIs and reports.
"use strict";
const { title, applySays } = require("../_common");

module.exports = {
  id: "kpis",
  file: "12-kpis-and-reports",
  intro: "KPIs & reports",
  title: "PlantPulse – Dashboard, KPIs and reports",
  covers: "The dashboard and its colour code, customising it, search across everything, notifications, the 20 maintenance KPIs with targets and drill-down (formula, records, control chart), company KPIs, production and budget data, Excel and PDF exports, the management presentation",
  keyframes: [["02-dashboard", 0.3], ["04-kpis", 0.4], ["04-kpis", 0.8], ["05-reports", 0.6]],
  scenes: [
    title("01-title", "KPIs & reports", "From every record to a number you can trust",
      "The dashboard, KPIs and reports. Every number is calculated from the records in PlantPulse, and every number can be opened down to those records."),
    {
      id: "02-dashboard", layout: "app", device: "desktop", chapter: "Dashboard", step: "1 · Dashboard",
      async capture(cap) {
        const s = await cap.login("manager");
        const p = s.page;
        await s.view("Home – the dashboard", { weight: 1 });
        await s.view("Counters in the colour code", { focus: p.getByTestId("dash-legend"), zoom: 1.4 });
        await s.click(p.getByTestId("customise-dashboard"), "Customise dashboard", { wait: 1000 });
      },
    },
    {
      id: "03-search", layout: "app", device: "desktop", chapter: "Dashboard", step: "2 · Search & notifications",
      async capture(cap) {
        const s = await cap.login("manager");
        const p = s.page;
        await s.click(p.getByTestId("global-search"), "Search everything – or Ctrl+K", { wait: 800 });
        await s.type(p.getByRole("dialog").getByRole("textbox").first(), "mixer bearing", "Words in any order", { after: async () => { await p.waitForTimeout(1200); } });
        await s.quiet(async () => { await p.keyboard.press("Escape"); });
        await s.click(p.getByRole("link", { name: "Notifications" }).first(), "Notifications");
      },
    },
    {
      id: "04-kpis", layout: "app", device: "desktop", chapter: "KPIs & reports", step: "3 · KPIs",
      async capture(cap) {
        const s = await cap.login("manager");
        const p = s.page;
        await s.goto("/kpis");
        await s.view("Twenty maintenance KPIs for the period", { weight: 1.1 });
        await s.view("Result against target: met, close, missed", { focus: p.getByTestId("kpi-mttr"), zoom: 1.5 });
        await s.click(p.getByTestId("kpi-mttr"), "Open a KPI: formula, records, 12 months", { wait: 1500 });
        await s.quiet(async () => { await p.keyboard.press("Escape"); await p.waitForTimeout(500); });
        await s.click(p.getByRole("tab", { name: "Company KPIs" }), "The plant's own KPI sheet");
      },
    },
    {
      id: "05-reports", layout: "app", device: "desktop", chapter: "KPIs & reports", step: "4 · Reports",
      async capture(cap) {
        const s = await cap.login("manager");
        const p = s.page;
        await s.goto("/kpis");
        await s.click(p.getByRole("tab", { name: /Production data/ }), "Production and budget data");
        await s.view("Export XLSX and PDF", { focus: p.getByRole("button", { name: "Export XLSX" }), zoom: 1.5 });
        await s.view("Management presentation", { focus: p.getByRole("button", { name: "Management presentation" }), zoom: 1.5 });
      },
    },
    title("06-end", "KPIs & reports", "Next: administration",
      "That is the dashboard, KPIs and reports. Next: administration."),
  ],
};

applySays(module.exports, {
  "02-dashboard": ["The Home page is the first screen, the plant's dashboard: quick buttons, counters, the work that needs attention, KPI tiles and condition alarms.",
    "Every counter uses the colour code and opens exactly the list it counts.",
    "Each person can customise it: sections, counters and KPIs. The layout is saved on the server, so phone and computer show the same."],
  "03-search": ["The magnifier, or Control K, searches everything you may see at once.",
    "Type a code, a name, or a few words in any order: equipment, work orders, requests, parts, plans, RCAs and shutdowns.",
    "Notifications collect alerts, approvals and assignments for you."],
  "04-kpis": ["KPIs and reports shows twenty maintenance KPIs for any period and department, calculated from the records.",
    "Each one against its target: green met, amber close, red missed. Missing data says Not available, and why; nothing is estimated.",
    "Open a KPI: its formula, the records behind it, and a twelve-month control chart with the target.",
    "The plant's own KPI sheet goes in Company KPIs, entered or uploaded from Excel, month by month."],
  "05-reports": ["Production and budget data are entered here, for cost per ton, OEE and budget against actual.",
    "Every KPI exports to Excel and PDF.",
    "And the management presentation builds a PowerPoint deck in your language, with the scorecard, trends, bad actors, costs and the plan for the next period."],
});
