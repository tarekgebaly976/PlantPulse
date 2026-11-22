// Video 17 – Weekly maintenance schedule: the proposal (OR-Tools), line stop windows, deferred work with its reasons,
// hand edits, the engineer's approval, the manager's final approval, and the planned dates on the work orders.
"use strict";
const { title, applySays } = require("../_common");

const NEXT = "Next period";
/** Open the schedule from the menu and step to next week (the demo's work is planned for next week). */
async function openNextWeek(s, filmed) {
  const p = s.page;
  await s.goto("/");
  const link = p.getByRole("link", { name: "Maintenance schedule" });
  if (filmed) await s.click(link, "Maintenance › Maintenance schedule", { wait: 1500 });
  else await s.quiet(async () => { await link.click(); });
  const next = p.getByRole("button", { name: NEXT });
  if (filmed) await s.click(next, "Next week, Sunday to Saturday", { wait: 1500 });
  else await s.quiet(async () => { await next.click(); await p.waitForTimeout(800); });
}

module.exports = {
  id: "schedule",
  file: "17-weekly-maintenance-schedule",
  intro: "Weekly maintenance schedule",
  title: "PlantPulse – Weekly maintenance schedule",
  covers: "The maintenance schedule under Maintenance: the roster, skills and line stop windows it works from, the proposal by the optimiser (OR-Tools), deferred work orders with their reasons, editing by hand (move, place), the engineer's approval, the maintenance manager's final approval, and the assignments and planned dates written to the work orders",
  keyframes: [["04-propose", 0.5], ["05-edit", 0.6], ["07-manager", 0.6], ["08-wo", 0.7]],
  scenes: [
    title("01-title", "Weekly maintenance schedule", "Who does which job, on which day – proposed in seconds, approved in two steps", ""),
    {
      id: "02-how", layout: "cards", chapter: "How it works", title: "From approved work to a week's plan",
      cards: [
        { t: "Approved work", d: "Open work orders that are approved and not yet done" },
        { t: "Roster", d: "Who is at work each day of the week, with leave and overtime" },
        { t: "Skills & safety", d: "Trade, required skills, valid certificates, LOTO and permit sign-off" },
        { t: "Line stop windows", d: "Work that needs the line stopped goes only into a stop" },
        { t: "Proposal", d: "The optimiser places the work by priority and due date" },
        { t: "Deferred", d: "What does not fit, each with its reason" },
        { t: "Engineer", d: "Reviews and approves first" },
        { t: "Manager", d: "Final approval writes assignees and planned dates" },
      ],
    },
    {
      id: "03-week", layout: "app", device: "desktop", chapter: "Maintenance schedule", step: "1 · The week",
      async capture(cap) {
        const s = await cap.login("planner");
        const p = s.page;
        await openNextWeek(s, true);
        await s.view("Not proposed yet · engineer · manager", { focus: p.getByText("Not proposed yet"), zoom: 1.2 });
        await s.view("Line stop windows agreed with production", { focus: p.getByTestId("stop-windows"), zoom: 1.4 });
        await s.view("The roster of the week: shift, leave, overtime", { focus: p.getByTestId("schedule-grid"), zoom: 1.2 });
      },
    },
    {
      id: "04-propose", layout: "app", device: "desktop", chapter: "Maintenance schedule", step: "2 · Proposal",
      async capture(cap) {
        const s = await cap.login("planner");
        const p = s.page;
        await openNextWeek(s, false);
        await s.click(p.getByTestId("propose"), "Propose schedule", { wait: 4000 });
        await s.view("Scheduled, hours, deferred, overtime, warnings", { focus: p.getByText("Work orders scheduled"), zoom: 1.1 });
        await s.view("Each job on a person and a day", { focus: p.getByTestId("schedule-grid"), zoom: 1.2, weight: 1.3 });
        await s.view("Deferred work, each with its reason", { focus: p.getByTestId("deferred"), zoom: 1.3, weight: 1.4 });
      },
    },
    {
      id: "05-edit", layout: "app", device: "desktop", chapter: "Maintenance schedule", step: "3 · Edit by hand",
      async capture(cap) {
        const s = await cap.login("planner");
        const p = s.page;
        await openNextWeek(s, false);
        await s.quiet(async () => { await p.getByTestId("propose").click(); await p.waitForTimeout(3500); });
        const chip = p.getByTestId("schedule-grid").locator('[data-testid^="chip-"]').last();
        await s.click(chip, "Click a job to move it", { wait: 900 });
        const d = p.getByRole("dialog");
        await s.quiet(async () => {
          await d.getByRole("textbox", { name: "Day" }).or(d.getByRole("combobox", { name: "Day" })).first().click();
          await p.getByRole("option").nth(3).click();
        });
        await s.view("Another day or person – the change is pinned", { focus: d, zoom: 1.4 });
        await s.click(d.getByRole("button", { name: "Save" }), "Moved and pinned", { wait: 1500 });
        const row = p.getByTestId("deferred").getByRole("row").filter({ hasText: "Gearbox oil sample" });
        await s.click(row.getByRole("button", { name: "Place" }), "Place a deferred job by hand", { wait: 900 });
        const d2 = p.getByRole("dialog");
        await s.quiet(async () => {
          await d2.getByRole("textbox", { name: "Day" }).or(d2.getByRole("combobox", { name: "Day" })).first().click();
          await p.getByRole("option").nth(1).click();
          const who = d2.getByRole("textbox", { name: "People" }).or(d2.getByRole("combobox", { name: "People" })).first();
          await who.click(); await who.fill("Hassan"); await p.getByRole("option").first().click();
          await p.keyboard.press("Escape").catch(() => {});
        });
        await s.view("Day and technician", { focus: d2, zoom: 1.4 });
        await s.click(d2.getByRole("button", { name: "Save" }), "Placed", { wait: 1500 });
      },
    },
    {
      id: "06-engineer", layout: "app", device: "desktop", chapter: "Maintenance schedule", step: "4 · Engineer",
      async capture(cap) {
        const pl = await cap.login("planner");
        await openNextWeek(pl, false);
        await pl.quiet(async () => { await pl.page.getByTestId("propose").click(); await pl.page.waitForTimeout(3500); });
        const s = await cap.login("engineer");
        const p = s.page;
        await openNextWeek(s, false);
        await s.view("The engineer reviews the proposal", { focus: p.getByTestId("schedule-grid"), zoom: 1.1 });
        await s.click(p.getByTestId("review"), "Approve (engineer)", { wait: 1500 });
        await s.view("Step 2 done: waiting for the manager", { focus: p.getByTestId("sched-status"), zoom: 1.6 });
      },
    },
    {
      id: "07-manager", layout: "app", device: "desktop", chapter: "Maintenance schedule", step: "5 · Manager",
      async capture(cap) {
        const pl = await cap.login("planner");
        await openNextWeek(pl, false);
        await pl.quiet(async () => { await pl.page.getByTestId("propose").click(); await pl.page.waitForTimeout(3500); });
        const en = await cap.login("engineer");
        await openNextWeek(en, false);
        await en.quiet(async () => { await en.page.getByTestId("review").click(); });
        const s = await cap.login("manager");
        const p = s.page;
        await openNextWeek(s, false);
        p.once("dialog", (dlg) => dlg.accept());
        await s.click(p.getByRole("button", { name: "Final approval" }), "Final approval", { wait: 2000 });
        await s.quiet(async () => { await p.getByRole("dialog").getByRole("button", { name: "Close" }).click(); });
        await s.view("Approved – the week is locked", { focus: p.getByTestId("sched-status"), zoom: 1.5 });
        cap.keep = s;
        module.exports.state = { s };
      },
    },
    {
      id: "08-wo", layout: "app", device: "desktop", chapter: "Maintenance schedule", step: "6 · Work orders",
      async capture(cap) {
        const s = module.exports.state.s;
        cap.keep = null;
        const p = s.page;
        const link = p.getByTestId("schedule-grid").locator('[data-testid^="chip-"]').first();
        const number = (await link.getAttribute("data-testid")).replace("chip-", "");
        await s.goto("/work-orders");
        await s.quiet(async () => { await p.getByPlaceholder(/./).first().fill(number); await p.waitForTimeout(1000); });
        await s.click(p.getByText(number).first(), "A scheduled work order", { wait: 1500 });
        await s.click(p.getByRole("tab", { name: "Details" }), "Planned start and end, from the schedule", { wait: 900 });
        await s.view("And the assigned technician", { focus: p.getByText("Assignees", { exact: true }), zoom: 1.4 });
      },
    },
    title("09-end", "Weekly maintenance schedule", "Next: the cutting plan", ""),
  ],
};

applySays(module.exports, {
  "03-week": ["The maintenance schedule is in the Maintenance menu.",
    "A plan is a week, Sunday to Saturday, by default. The planner works on next week.",
    "Three steps: the proposal, the engineer's approval, and the manager's final approval.",
    "Line stop windows are the times production has agreed to stop a line. Work that needs the line stopped is only placed inside one.",
    "The grid is the roster of the week: who is at work each day, on which shift, and who is on leave or on overtime."],
  "04-propose": ["Press Propose schedule. The optimiser, built on Google's OR-Tools, places the approved work in about a second.",
    "The result: work orders scheduled, planned hours, deferred work, overtime and warnings.",
    "Each job sits on a person and a day, coloured by priority, within the hours of the shift, and matching trade, skills and certificates.",
    "What does not fit is deferred, and each one says why: an expired certificate, no stop window long enough, longer than a shift, or no estimated hours."],
  "05-edit": ["The planner can still change it by hand. Click a job.",
    "Choose another day or another person. The change is pinned: it stays when the week is proposed again, and any rule it breaks shows as a warning.",
    "Saved.",
    "A deferred job can be placed by hand too.",
    "Choose the day and the technician.",
    "It is now in the plan."],
  "06-engineer": ["Next, the engineer reviews the proposal.",
    "And approves it, or sends it back with a comment.",
    "The week now waits for the maintenance manager."],
  "07-manager": ["The maintenance manager gives the final approval.",
    "The week is approved and locked. Only the manager can reopen it."],
  "08-wo": ["The final approval writes the plan into the work orders.",
    "Each one now has its planned start and end.",
    "And the technician it was given to, who sees it in My work."],
}, {
  "02-how": { lead: "How the schedule is made.", says: [
    "It starts from the open work orders that are approved.",
    "The roster says who is at work each day.",
    "Each job must match the trade, the required skills, valid certificates, and a supervisor or engineer on shift for LOTO and permits.",
    "Work that needs the line stopped goes only into a stop window.",
    "The optimiser proposes the week, by priority and due date.",
    "What does not fit is deferred, with the reason.",
    "The engineer approves first.",
    "And the manager's final approval writes the assignees and planned dates."] },
});
module.exports.scenes[0].narration = "The weekly maintenance schedule. Who does which job, on which day, proposed in seconds and approved in two steps.";
module.exports.scenes[module.exports.scenes.length - 1].narration = "That is the weekly maintenance schedule. Next: the cutting plan.";
