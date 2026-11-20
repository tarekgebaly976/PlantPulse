// Video 06 – Condition monitoring: measurement points, readings, limits, control charts, alerts.
"use strict";
const { title } = require("../_common");

module.exports = {
  id: "pdm",
  file: "06-condition-monitoring",
  intro: "Condition monitoring",
  title: "PlantPulse – Condition monitoring",
  covers: "Measurement points with warning and alarm limits, recording readings, the level (normal, warning, alarm), trends and control charts with the Nelson rules, alerts: acknowledge, predictive work order, resolve; Excel imports and priorities",
  keyframes: [["02-how", 0.9], ["03-points", 0.7], ["04-reading", 0.8], ["05-alerts", 0.8]],
  scenes: [
    title("01-title", "Condition monitoring", "Readings, limits and alerts – before the breakdown",
      "Condition monitoring. Vibration, temperature, current and other readings are compared with their limits, so a problem is seen and planned before it becomes a breakdown."),
    {
      id: "02-how", layout: "cards", chapter: "How it works", title: "From a reading to a work order",
      cards: [
        { t: "Measurement point", d: "Equipment, technique, unit, warning and alarm limits" },
        { t: "Reading", d: "Entered on site, from a round, or received from the plant" },
        { t: "Level", d: "Normal, warning limit or alarm limit – a plain limit check, no guessing" },
        { t: "Control chart", d: "The last 100 readings, with the eight Nelson rules" },
        { t: "Alert", d: "Raised when a limit is passed" },
        { t: "Work order", d: "A predictive work order straight from the alert" },
        { t: "Resolve", d: "Close the alert with what was done" },
        { t: "Rounds", d: "Reading rounds become work orders, like PM" },
      ],
      narration: "Each measurement point belongs to a piece of equipment and has a technique, a unit, and warning and alarm limits. "
        + "Every reading is compared with these limits: normal, warning, or alarm. It is a transparent limit check; no prediction is claimed. "
        + "Passing a limit raises an alert, and the alert can become a predictive work order.",
    },
    {
      id: "03-points", layout: "app", device: "desktop", chapter: "Condition monitoring", step: "1 · Points",
      narration: "The points list shows the last value and the level of each point, worst first. The Nelson column shows patterns in the recent readings, "
        + "like a steady rise, even while the values are still inside the limits. Click a point to see its control chart, with the limits drawn in.",
      async capture(cap) {
        const s = await cap.login("reliability");
        const p = s.page;
        await s.goto("/pdm");
        await s.view("Every point: last value and level", { weight: 1.2 });
        await s.click(p.getByRole("cell", { name: "VIB-MIX-DE" }), "Click a point: its control chart and limits", { wait: 1500 });
        await s.view("Control chart: average, limits, Nelson rules", { focus: p.locator(".recharts-wrapper").first(), zoom: 1.25, weight: 1.3 });
      },
    },
    {
      id: "04-reading", layout: "app", device: "desktop", chapter: "Condition monitoring", step: "2 · A reading",
      narration: "Recording a reading takes one number. The answer comes at once: here, the blower bearing has passed its warning limit. "
        + "An alert is raised, and the counter on the dashboard goes up.",
      async capture(cap) {
        const s = await cap.login("reliability");
        const p = s.page;
        await s.goto("/pdm");
        await s.click(p.getByRole("cell", { name: "VIB-AER1" }), "Blower 1 bearing velocity", { wait: 1200 });
        await s.type(p.getByTestId("reading-input"), "5.2", "Record the reading");
        await s.click(p.getByRole("button", { name: "Save" }), "At once: warning limit passed", { zoom: 1.35, wait: 1500 });
      },
    },
    {
      id: "05-alerts", layout: "app", device: "desktop", chapter: "Condition monitoring", step: "3 · Alerts",
      narration: "The alerts tab lists the open alerts, filtered by level. Open one: the engineer acknowledges it, and creates a predictive work order with one click. "
        + "When the work is done, the alert is resolved with what was found.",
      async capture(cap) {
        const s = await cap.login("reliability");
        const p = s.page;
        await s.goto("/pdm");
        await s.click(p.getByRole("tab", { name: "Alerts" }), "Open alerts");
        await s.click(p.getByTestId("alert-level").getByText("Alarm limit exceeded"), "Only the alarm limit", { zoom: 1.3 });
        await s.click(p.getByRole("cell", { name: /VIB-MIX-DE/ }).first(), "Open the alert", { wait: 1200 });
        await s.click(p.getByRole("button", { name: "Acknowledge" }), "Acknowledge");
        await s.click(p.getByRole("button", { name: "Create work order" }), "Create the predictive work order", { wait: 1500 });
        await s.view("The predictive work order – then resolve the alert", { focus: p.getByTestId("wo-status"), zoom: 1.3 });
      },
    },
    {
      id: "06-excel", layout: "app", device: "desktop", chapter: "Condition monitoring", step: "4 · Excel",
      narration: "Points and their reading rounds can be imported from Excel, and so can the history of past readings, so the trends start full. "
        + "A priority list in Excel sets which points matter most.",
      async capture(cap) {
        const s = await cap.login("reliability");
        const p = s.page;
        await s.goto("/pdm");
        await s.click(p.getByRole("button", { name: "Import readings history" }), "Import the readings history", { wait: 1000 });
        await s.quiet(async () => { await p.keyboard.press("Escape"); await p.waitForTimeout(500); });
        await s.view("Import plan · readings history · priorities", { focus: p.getByRole("button", { name: "Import plan" }), zoom: 1.4 });
      },
    },
    title("07-end", "Condition monitoring", "Next: shutdowns",
      "That is condition monitoring. Next: shutdowns, planned as work packages on a Gantt chart."),
  ],
};

// ---- Voice, one sentence per filmed step or card ----
require("../_common").applySays(module.exports, {
  "03-points": ["The points list shows the last value and the level of each point, worst first. The Nelson column shows patterns, like a steady rise, even inside the limits.",
    "Click a point.", "Its control chart: the average, the control limits, the warning and alarm limits, and every Nelson rule that is broken."],
  "04-reading": ["Here is the blower bearing.", "Recording a reading takes one number.",
    "The answer comes at once: the warning limit is passed. An alert is raised, and the dashboard counter goes up."],
  "05-alerts": ["The alerts tab lists the open alerts.", "Filtered by level: here, only the alarm limit.", "Open the alert.",
    "The engineer acknowledges it.", "And creates a predictive work order with one click.",
    "Here it is. When the work is done, the alert is resolved with what was found."],
  "06-excel": ["Points and their rounds can be imported from Excel, and so can the history of past readings, so the trends start full.",
    "And a priority list in Excel sets which points matter most."],
}, {
  "02-how": { lead: "Condition monitoring works like this.", says: [
    "Each measurement point has a technique, a unit, and warning and alarm limits.",
    "Readings are entered on site, from a round, or received from the plant.",
    "Each reading is compared with the limits: normal, warning or alarm. A plain limit check, no prediction is claimed.",
    "The control chart shows the last hundred readings, with the eight Nelson rules.", "Passing a limit raises an alert.",
    "The alert can become a predictive work order.", "And it is resolved with what was done.",
    "Reading rounds become work orders, just like preventive maintenance."] },
});
