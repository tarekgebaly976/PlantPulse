// Video 04 – Preventive maintenance and the planning tools.
"use strict";
const { title } = require("../_common");

const state = {};

module.exports = {
  id: "pm",
  file: "04-preventive-maintenance",
  intro: "Preventive maintenance",
  title: "PlantPulse – Preventive maintenance",
  covers: "Job plans and PM plans (calendar or meter, fixed or floating), automatic work orders with their checklist, the schedule, waiting for release, Auto / Manual per department, deferral and cancellation approvals, importing and exporting plans",
  keyframes: [["02-how", 0.9], ["03-plans", 0.6], ["04-generate", 0.85], ["06-deferral", 0.8]],
  scenes: [
    title("01-title", "Preventive maintenance", "Plan once – the work orders come by themselves",
      "Preventive maintenance. You describe the job once, say how often it is due, and PlantPulse creates the work orders on time, with the checklist inside."),
    {
      id: "02-how", layout: "cards", chapter: "How it works", title: "From a plan to a work order",
      cards: [
        { t: "Job plan", d: "The tasks, readings with their limits, safety precautions and tools" },
        { t: "PM plan", d: "Which equipment, which job plan, and how often" },
        { t: "Calendar or meter", d: "Every N days, weeks, months or years – or every N running hours" },
        { t: "Fixed or floating", d: "From a fixed date, or from the last completion" },
        { t: "Work order", d: "Created a set number of days before the due date – never twice" },
        { t: "Checklist", d: "The job plan's tasks, filled in on the work order" },
        { t: "Compliance", d: "Done on time, within the tolerance, counts in PM compliance" },
        { t: "Approvals", d: "Deferring or cancelling a PM needs a second person" },
      ],
      narration: "It works in two steps. A job plan describes the work: the tasks, readings with their limits, safety precautions and tools. "
        + "A PM plan links a job plan to a piece of equipment and says how often: by calendar, or by running hours, from a fixed date or from the last completion. "
        + "A set number of days before the due date the work order is created by itself, never twice, and the tasks become its checklist.",
    },
    {
      id: "03-plans", layout: "app", device: "desktop", chapter: "Preventive maintenance", step: "1 · Plans",
      narration: "This is the planner's page. The PM plans tab lists every plan with its next due date and last completion. "
        + "Job plans hold the task lists. A new job plan takes its tasks one by one, as a check or as a reading with a unit and limits. "
        + "A new PM plan picks the equipment, the job plan, the trigger and the frequency.",
      async capture(cap) {
        const s = await cap.login("planner");
        const p = s.page;
        await s.goto("/pm");
        await s.view("PM plans: next due date and last completion", { weight: 1.2 });
        await s.click(p.getByRole("tab", { name: "Job plans" }), "Job plans: the task lists");
        await s.click(p.getByRole("button", { name: "New job plan" }), "New job plan: tasks, readings, safety, tools", { wait: 1000 });
        await s.quiet(async () => { await p.keyboard.press("Escape"); await p.waitForTimeout(500); });
        await s.click(p.getByRole("button", { name: "New PM plan" }), "New PM plan: equipment, trigger, frequency, lead days", { wait: 1000 });
        await s.quiet(async () => { await p.keyboard.press("Escape"); await p.waitForTimeout(500); });
      },
    },
    {
      id: "04-generate", layout: "app", device: "desktop", chapter: "Preventive maintenance", step: "2 · Work orders",
      narration: "Work orders are generated every day by the scheduler. A planner can also run it now. The schedule tab shows what is coming, "
        + "with a link to each work order. Open one: the tasks of the job plan are its checklist, with OK or Not OK, and readings that are flagged when they are out of range.",
      async capture(cap) {
        const s = await cap.login("planner");
        const p = s.page;
        await s.goto("/pm");
        await s.click(p.getByRole("button", { name: "Run scheduler now" }), "Run the scheduler now", { wait: 2500 });
        await s.click(p.getByRole("tab", { name: "Schedule" }), "Schedule: what is due, with its work order");
        await s.click(p.getByRole("link", { name: "→" }).first(), "Open the generated work order", { wait: 1500 });
        state.pmwo = p.url();
        await s.view("The job plan's tasks are the checklist", { focus: p.getByText(/Bearing temperature DS/).first(), zoom: 1.35, weight: 1.3 });
      },
    },
    {
      id: "05-waiting", layout: "app", device: "desktop", chapter: "Preventive maintenance", step: "3 · Auto or manual",
      narration: "Each department chooses: Auto, the system creates the work orders, or Manual, the occurrences wait in Waiting for release, "
        + "and the team releases them when it suits the plan. The same switch exists for condition monitoring rounds and lubrication routes.",
      async capture(cap) {
        const s = await cap.login("planner");
        const p = s.page;
        await s.goto("/pm");
        await s.click(p.getByRole("tab", { name: "Auto / Manual" }), "Auto or Manual, per department");
        await s.click(p.getByRole("tab", { name: "Waiting for release" }), "Waiting for release: tick and release");
      },
    },
    {
      id: "06-deferral", layout: "app", device: "desktop", chapter: "Preventive maintenance", step: "4 · Deferral",
      narration: "Sometimes a PM cannot be done on its date. The planner requests a deferral, with a reason and a new date, or a cancellation. "
        + "It is not changed until a supervisor or manager approves it, and nobody can approve their own request.",
      async capture(cap) {
        const s = await cap.login("planner");
        const p = s.page;
        await s.goto("/pm");
        await s.quiet(async () => { await p.getByRole("tab", { name: "Schedule" }).click(); await p.waitForTimeout(800); });
        await s.click(p.getByRole("button", { name: "Request deferral" }).first(), "Request a deferral");
        await s.quiet(async () => {
          const d = p.getByRole("dialog");
          await d.getByLabel("Reason").fill("Line stop moved to next week by production");
          const nd = new Date(Date.now() + 9 * 864e5).toISOString().slice(0, 10);
          await d.getByLabel("New due date").fill(nd);
        });
        await s.click(p.getByRole("dialog").getByRole("button", { name: "Submit" }), "Reason and new date – submit");
        const m = await cap.login("manager");
        await m.goto("/pm");
        await m.click(m.page.getByRole("tab", { name: /Approvals/ }), "Manager: approvals waiting");
        await m.click(m.page.getByRole("button", { name: "Approve" }).first(), "Approve – the due date moves", { zoom: 1.4 });
      },
    },
    {
      id: "07-import", layout: "app", device: "desktop", chapter: "Preventive maintenance", step: "5 · Excel",
      narration: "Existing plans can be imported from Excel: download the template, one row per task, preview, then import. "
        + "Nothing is saved if a row has an error. Export plans gives every plan, plus the next sixty days of work, ready to plan and import back as a work plan.",
      async capture(cap) {
        const s = await cap.login("planner");
        const p = s.page;
        await s.goto("/pm");
        await s.click(p.getByRole("button", { name: "Import plan" }), "Import plan: template, preview, import", { wait: 1000 });
        await s.quiet(async () => { await p.keyboard.press("Escape"); await p.waitForTimeout(500); });
        await s.view("Export plans (Excel) and Import work plan", { focus: p.getByRole("button", { name: "Export plans (Excel)" }), zoom: 1.5 });
      },
    },
    title("08-end", "Preventive maintenance", "Next: lubrication",
      "That is preventive maintenance. Next: lubrication, with its points, routes and the right lubricant every time."),
  ],
};

// ---- Voice, one sentence per filmed step or card ----
require("../_common").applySays(module.exports, {
  "03-plans": ["This is the planner's page. PM plans lists every plan, with its next due date and last completion.",
    "Job plans hold the task lists.", "A new job plan takes its tasks one by one: a check, or a reading with a unit and limits, plus safety precautions and tools.",
    "A new PM plan picks the equipment, the job plan, the trigger, the frequency, and how many days ahead the work order is made."],
  "04-generate": ["The scheduler makes the work orders every day. A planner can also run it now.",
    "The schedule tab shows what is due, with a link to each work order.", "Open one.",
    "The job plan's tasks are its checklist: OK or not OK, and readings that are flagged when out of range."],
  "05-waiting": ["Each department chooses: Auto, the system creates the work orders, or Manual. The same switch exists for condition monitoring rounds and lubrication routes.",
    "In Manual, the occurrences wait in Waiting for release, and the team releases them when it suits the plan."],
  "06-deferral": ["Sometimes a PM cannot be done on its date. The planner requests a deferral.", "With a reason and a new date.",
    "The manager sees it waiting in Approvals.", "And approves it. Nobody can approve their own request."],
  "07-import": ["Existing plans can be imported from Excel: download the template, one row per task, preview, then import. Nothing is saved if a row has an error.",
    "Export plans gives every plan, plus the next sixty days of work, ready to plan and import back as a work plan."],
}, {
  "02-how": { lead: "Preventive maintenance works in two steps.", says: [
    "A job plan describes the work: the tasks, readings with limits, safety precautions and tools.",
    "A PM plan links the job plan to a piece of equipment, and says how often.", "By the calendar, or by running hours.",
    "From a fixed date, or from the last completion.", "The work order is created a set number of days before it is due, and never twice.",
    "The job plan's tasks become its checklist.", "Done on time, within the tolerance, it counts in PM compliance.",
    "And deferring or cancelling a PM needs a second person to approve."] },
});
