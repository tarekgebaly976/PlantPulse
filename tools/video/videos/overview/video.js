// Video 1 – PlantPulse overview (about 2 minutes, not detailed).
// Each scene: id (also the name of your own recording: voice/overview/<id>.wav), narration, layout, and for app scenes
// a capture function that films the real app (local demo, training accounts only).
"use strict";

const pick = async (page, scope, label, search, option) => {
  const input = scope.getByRole("combobox", { name: label, exact: true }).first();
  await input.click();
  await input.fill(search);
  await page.getByRole("option", { name: option ?? new RegExp(search) }).first().click();
};

// The story's equipment: the hydraulic power unit of the press on line 1 (demo asset).
const ASSET = "L1-FRM-PRS-HPU";
const TITLE = "Hydraulic oil leak, press stopped";
const state = {}; // urls shared between scenes

module.exports = {
  id: "overview",
  file: "01-plantpulse-overview",
  title: "PlantPulse – overview",
  covers: "What PlantPulse is, who uses it, the modules map, the colour code, and one breakdown from report to KPIs",
  keyframes: [["01-title", 0.6], ["04-modules", 0.92], ["05-colours", 0.85], ["06-report", 0.62], ["08-safety", 0.9]],
  scenes: [
    {
      id: "01-title", layout: "title",
      title: "PlantPulse", subtitle: "Maintenance and production for an industrial plant – in one place",
      narration: "This is PlantPulse: maintenance and production for an industrial plant, in one place.",
    },
    {
      id: "02-what", layout: "app", device: "desktop", chapter: "What it is",
      narration: "PlantPulse is a web app for the whole plant: on a computer, a tablet or a phone, in English, Arabic or Bengali. "
        + "Everyone signs in and sees their own plant, starting with the dashboard.",
      async capture(cap) {
        const s = await cap.login("manager");
        await s.view("The dashboard: today's work of the plant at a glance", { weight: 1.3 });
        await s.view("Every counter opens the list it counts", { focus: s.page.getByText("Needs attention").first(), zoom: 1.35 });
      },
    },
    {
      id: "03-who", layout: "cards", chapter: "Who uses it",
      title: "One system, every role",
      cards: [
        { t: "Technicians", d: "My work, checklists, hours, spare parts – on the phone" },
        { t: "Supervisors", d: "Accept requests, assign, sign off LOTO and permits, close" },
        { t: "Planners", d: "Preventive plans, schedules, shutdowns" },
        { t: "Engineers", d: "Condition monitoring, root cause analysis" },
        { t: "Store", d: "Spare parts and parts used" },
        { t: "Production", d: "Shift reports, daily logs, production KPIs" },
        { t: "Managers", d: "KPIs, reports and approvals" },
      ],
      narration: "Technicians and supervisors run the daily work. Planners and engineers plan maintenance. "
        + "The store keeps the spare parts, production records its shifts, and managers follow the results.",
    },
    {
      id: "04-modules", layout: "modules", chapter: "The modules",
      title: "The modules – grouped as in the menu",
      groups: [
        { t: "Daily work", items: ["My work", "Scan QR", "Field round (offline)", "Work requests", "Work orders"] },
        { t: "Production", items: ["Production dashboard", "Production reports", "Daily logs", "Production KPIs", "Production insights", "Safety incidents"] },
        { t: "Maintenance", items: ["Preventive maintenance", "Lubrication", "Condition monitoring", "Shutdowns", "Root cause analysis"] },
        { t: "Assets & resources", items: ["Assets", "Spare parts", "Shifts & handover"] },
        { t: "Analysis & admin", items: ["KPIs & reports", "Administration"] },
      ],
      narration: "The menu follows the same order. Daily work: requests and work orders. Production: reports, logs and KPIs. "
        + "Maintenance: preventive plans, lubrication, condition monitoring, shutdowns and root cause analysis. "
        + "Then assets, spare parts and shifts. And finally, KPIs and administration.",
    },
    {
      id: "05-colours", layout: "app", device: "desktop", chapter: "The colour code", legend: true,
      narration: "One colour code runs through every screen. Red: act now. Amber: needs attention, or waiting for someone. "
        + "Green: all clear, or target met. Grey: information.",
      async capture(cap) {
        const s = await cap.login("manager");
        await s.view("The colour key, under the quick buttons", { focus: s.page.getByText("Colour key:").locator(".."), zoom: 1.6 });
        await s.view("Counters and KPI tiles use the same colours", { focus: s.page.getByText("KPIs: result vs target").locator("xpath=ancestor::div[contains(@class,'mantine-Paper-root')][1]"), zoom: 1.2, weight: 1.4 });
      },
    },
    {
      id: "06-report", layout: "app", device: "phone", chapter: "A breakdown, start to finish", step: "1 · Report",
      narration: "Now one quick story. On line one the press has stopped: its hydraulic unit is leaking oil. "
        + "The shift leader reports it from a phone, and ticks Breakdown.",
      async capture(cap) {
        const s = await cap.login("production", "phone");
        const p = s.page;
        await s.click(p.locator(".pp-fab"), "Shift leader: the + button – new work request");
        const dlg = p.getByRole("dialog");
        const asset = dlg.getByRole("combobox").first();
        await s.type(asset, ASSET, "Choose the equipment", { after: async () => { await p.waitForTimeout(800); await p.getByRole("option").first().click(); } });
        await s.type(dlg.locator('input[name="req-title"]'), TITLE, "Say what is wrong");
        await s.quiet(async () => { await dlg.getByRole("combobox", { name: "Suggested priority" }).click(); await p.getByRole("option", { name: "P1" }).click(); });
        await s.click(dlg.getByLabel("Breakdown (machine stopped)"), "Breakdown: the machine is stopped", { check: true });
        await s.click(dlg.getByRole("button", { name: "Submit" }), "Submit – supervisors are alerted at once", { wait: 1500 });
      },
    },
    {
      id: "07-accept", layout: "app", device: "desktop", chapter: "A breakdown, start to finish", step: "2 · Work order",
      narration: "The mechanical supervisor sees it straight away, accepts the request as an emergency, and a work order is created.",
      async capture(cap) {
        const s = await cap.login("mech.sup");
        const p = s.page;
        await s.goto("/requests");
        await s.click(p.getByText(TITLE).first(), "Supervisor: the new request, marked as a breakdown");
        await s.quiet(async () => { await p.getByRole("combobox", { name: "Type" }).click(); await p.getByRole("option", { name: "Emergency breakdown" }).click(); });
        await s.click(p.getByRole("button", { name: "Accept" }), "Accept as an emergency breakdown", { zoom: 1.3 });
        await s.click(p.getByRole("link", { name: /Work orders/ }).last(), "The work order is created", {
          after: async () => { state.wo = p.url(); },
        });
      },
    },
    {
      id: "08-safety", layout: "app", device: "desktop", chapter: "A breakdown, start to finish", step: "3 · Safely",
      narration: "Before anyone touches the machine: lock-out tag-out and a work permit. Each isolation point is recorded with its lock, "
        + "zero energy is verified, and the supervisor signs off. Until then, the work cannot start.",
      async capture(cap) {
        const s = await cap.login("mech.sup");
        const p = s.page;
        await p.goto(state.wo); await s.settle(1200);
        await s.quiet(async () => {
          await p.getByRole("tab", { name: "Details" }).click();
          await p.getByLabel("LOTO required").check();
          await p.getByLabel("Permit required").check();
          await p.getByRole("button", { name: "Save" }).first().click();
          await p.waitForTimeout(800);
          await pick(p, p, "Assign", "Ahmed Saleh");
          await p.getByRole("button", { name: "Assign", exact: true }).click();
          await p.waitForTimeout(800);
          await p.getByRole("tab", { name: "Checklist" }).click();
        });
        await s.type(p.getByLabel("Isolation point (e.g. MCC-3 breaker Q12)"), "HPU motor starter – MCC-2 Q7", "LOTO register: the isolation point");
        await s.quiet(async () => { await p.getByLabel("Lock / tag no.").fill("L-12"); await p.getByLabel("Zero energy verified").check(); });
        await s.click(p.getByRole("button", { name: "Apply lock" }), "Lock applied, zero energy verified");
        await s.quiet(async () => {
          await p.getByLabel("Permit reference").fill("CWP-0418");
          await p.locator('label:has-text("Permit types")').locator("xpath=..").locator(".mantine-MultiSelect-input").click();
          await p.getByRole("option", { name: "Cold work", exact: true }).click();
          await p.keyboard.press("Escape");
        });
        await s.click(p.getByRole("button", { name: "Sign off LOTO / permit" }), "The supervisor signs off LOTO and the permit");
      },
    },
    {
      id: "09-work", layout: "app", device: "phone", chapter: "A breakdown, start to finish", step: "4 · The work",
      narration: "The technician starts the job on the phone, writes what was found and what was done, removes the lock, "
        + "and sends the work for review.",
      async capture(cap) {
        const s = await cap.login("tech1", "phone");
        const p = s.page;
        await s.goto("/my-work");
        await s.click(p.getByTestId("my-wo-card").filter({ hasText: TITLE }).first(), "Technician: My work");
        await s.click(p.getByTestId("to-in_progress"), "Start the work", { after: async () => { await p.getByTestId("transition-confirm").click(); await s.settle(900); } });
        await s.quiet(async () => { await p.getByRole("tab", { name: "Checklist" }).click(); });
        await s.type(p.getByLabel("Findings").first(), "Hose fitting cracked on pressure line", "Findings");
        await s.quiet(async () => {
          await p.getByRole("textbox", { name: "Root cause", exact: true }).fill("Fitting fatigue from vibration");
          await p.getByRole("button", { name: "Save" }).first().click();
          await p.waitForTimeout(800);
        });
        await s.click(p.getByRole("button", { name: "Remove lock" }), "Remove the lock when finished");
        await s.click(p.getByTestId("to-awaiting_review"), "Work done – send for review", { after: async () => { await p.getByTestId("transition-confirm").click(); await s.settle(900); } });
      },
    },
    {
      id: "10-close", layout: "app", device: "desktop", chapter: "A breakdown, start to finish", step: "5 · Closed",
      narration: "The supervisor checks the work, adds the failure codes, completes it, and closes it. Every step is kept in the history.",
      async capture(cap) {
        const s = await cap.login("mech.sup");
        const p = s.page;
        await p.goto(state.wo); await s.settle(1200);
        await s.view("Supervisor: awaiting review", { focus: p.getByTestId("wo-status"), zoom: 1.4, weight: 0.8 });
        await s.quiet(async () => {
          await pick(p, p, "Problem", "LEAK");
          await pick(p, p, "Cause", "WEAR");
          await pick(p, p, "Remedy", "REPL");
          await p.getByRole("button", { name: "Save" }).first().click();
          await p.waitForTimeout(800);
        });
        await s.click(p.getByTestId("to-completed"), "Failure codes in – complete", { after: async () => { await p.getByTestId("transition-confirm").click(); await s.settle(900); } });
        await s.click(p.getByTestId("to-closed"), "Close the work order", { after: async () => { await p.getByTestId("transition-confirm").click(); await s.settle(900); } });
        await s.click(p.getByRole("tab", { name: "History" }), "Every step is kept in the history");
      },
    },
    {
      id: "11-kpis", layout: "app", device: "desktop", chapter: "A breakdown, start to finish", step: "6 · KPIs",
      narration: "And it counts. Breakdown downtime, repair time and emergency work are calculated from these records, "
        + "and every KPI is shown against its target, in the same colours.",
      async capture(cap) {
        const s = await cap.login("manager");
        await s.goto("/kpis");
        await s.view("Maintenance KPIs, calculated from the records", { weight: 1.2 });
        await s.view("Each KPI against its target: met, close or missed", { focus: s.page.getByTestId("kpi-mttr"), zoom: 1.5 });
      },
    },
    {
      id: "12-end", layout: "title",
      title: "PlantPulse", subtitle: "Next: each module in detail",
      narration: "PlantPulse: one system, from the shop floor to the KPIs. Next: each module in detail.",
    },
  ],
};
