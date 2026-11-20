// Video 15 – PDCA: how PlantPulse supports Plan – Do – Check – Act, using only features that exist in the app.
"use strict";
const { title, applySays } = require("../_common");

module.exports = {
  id: "pdca",
  file: "15-pdca-continuous-improvement",
  intro: "PDCA – continuous improvement",
  title: "PlantPulse – PDCA, continuous improvement",
  covers: "Plan – Do – Check – Act with PlantPulse: plans, targets and schedules (Plan); work orders, safety and records on the phone (Do); KPIs, control charts, insights and alerts (Check); RCA actions, changed plans, effectiveness checks and approvals (Act)",
  keyframes: [["02-cycle", 0.95], ["03-plan", 0.5], ["05-check", 0.5], ["06-act", 0.5]],
  scenes: [
    title("01-title", "PDCA with PlantPulse", "Plan · Do · Check · Act – every day, on real records",
      "To finish: how PlantPulse supports continuous improvement, with the Plan, Do, Check, Act cycle."),
    {
      id: "02-cycle", layout: "cards", chapter: "PDCA", title: "Plan · Do · Check · Act",
      cards: [
        { t: "Plan", d: "PM and lubrication plans, shutdowns, targets for every KPI" },
        { t: "Do", d: "Work orders with LOTO and permits, daily production reports, field rounds" },
        { t: "Check", d: "KPIs against targets, control charts, Nelson rules, insights, alerts" },
        { t: "Act", d: "RCA actions, changed plans, effectiveness checks, approvals" },
      ],
    },
    {
      id: "03-plan", layout: "app", device: "desktop", chapter: "PDCA", step: "Plan",
      async capture(cap) {
        const s = await cap.login("planner");
        const p = s.page;
        await s.goto("/pm");
        await s.view("Plan: preventive plans and their schedule", { weight: 1.1 });
        const m = await cap.login("manager");
        await m.goto("/kpis");
        await m.view("Plan: a target for every KPI", { focus: m.page.getByTestId("kpi-mttr"), zoom: 1.4 });
      },
    },
    {
      id: "04-do", layout: "app", device: "desktop", chapter: "PDCA", step: "Do",
      async capture(cap) {
        const s = await cap.login("mech.sup");
        const p = s.page;
        await s.goto("/work-orders");
        await s.view("Do: the work, done safely and recorded", { weight: 1.1 });
        const q = await cap.login("prod.sup");
        await q.goto("/operations");
        await q.view("Do: every production day recorded", { weight: 1 });
      },
    },
    {
      id: "05-check", layout: "app", device: "desktop", chapter: "PDCA", step: "Check",
      async capture(cap) {
        const s = await cap.login("manager");
        const p = s.page;
        await s.goto("/kpis");
        await s.view("Check: every KPI against its target", { weight: 1 });
        await s.click(p.getByTestId("kpi-mttr"), "Check: control chart and Nelson rules", { wait: 1500 });
        const m = await cap.login("prod.mgr");
        await m.goto("/operations/insights");
        await m.view("Check: insights spot drifts and repeated losses", { weight: 1.1 });
      },
    },
    {
      id: "06-act", layout: "app", device: "desktop", chapter: "PDCA", step: "Act",
      async capture(cap) {
        const s = await cap.login("manager");
        const p = s.page;
        await s.goto("/rca");
        await s.quiet(async () => { await p.locator(".mantine-SegmentedControl-root").getByText("All", { exact: true }).click(); await p.getByText("RCA-DMO-000004").first().click(); await s.settle(1500); });
        await s.click(p.getByRole("tab", { name: /6\. Action plan/ }), "Act: corrective and preventive actions, with owners");
        await s.goto("/pm");
        await s.click(p.getByRole("tab", { name: /Approvals/ }), "Act: changes to the plan are approved");
      },
    },
    {
      id: "07-loop", layout: "cards", chapter: "PDCA", title: "The loop closes – and starts again",
      cards: [
        { t: "Act → Plan", d: "A changed PM plan or a new target starts the next cycle" },
        { t: "Effectiveness check", d: "If the failure comes back, the RCA reopens by itself" },
        { t: "One truth", d: "Maintenance and production on the same records" },
        { t: "Every day", d: "Small cycles on the dashboard, big ones in the reviews" },
      ],
    },
    title("08-end", "PlantPulse", "Plan · Do · Check · Act – in one system",
      "PlantPulse: plan the work, do it safely, check the results, and act on them. One system, every day."),
  ],
};

applySays(module.exports, {
  "03-plan": ["Plan. Preventive maintenance, lubrication routes and shutdowns are planned in advance, and the work orders come by themselves on time.",
    "And every KPI has a target, for the plant or each department. The plan says what good looks like."],
  "04-do": ["Do. The work is done through work orders: approved, assigned, made safe with lock-out and permits, and recorded with hours, parts and findings, on the computer or the phone.",
    "Production records every day the same way: output, stops, losses and quality."],
  "05-check": ["Check. Every KPI is calculated from those records and shown against its target, in the colour code.",
    "The control chart and the Nelson rules show whether a change is real, or just noise.",
    "And insights and alerts find drifts and repeated losses before they become big problems."],
  "06-act": ["Act. A major or repeated failure gets a root cause analysis, with corrective and preventive actions, owners and due dates.",
    "Changes to plans, like a deferral or a cancellation, are approved by a second person, and kept in the history."],
}, {
  "02-cycle": { lead: "PDCA is a simple loop: plan, do, check, act, and again. PlantPulse gives each step its tools.", says: [
    "Plan: preventive and lubrication plans, shutdowns, and a target for every KPI.",
    "Do: work orders with lock-out and permits, daily production reports, and field rounds on the phone.",
    "Check: KPIs against targets, control charts with Nelson rules, insights and alerts.",
    "Act: RCA actions, changed plans, effectiveness checks and approvals."] },
  "07-loop": { lead: "And the loop closes.", says: [
    "What is learned changes the plan: a better PM plan, or a new target, starts the next cycle.",
    "The effectiveness check proves it: if the same failure returns, the analysis reopens by itself.",
    "Maintenance and production work on the same records, so everyone checks the same truth.",
    "Small cycles every day on the dashboard, and bigger ones in the monthly review with the management presentation."] },
});
