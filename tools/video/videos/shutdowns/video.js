// Video 07 – Shutdowns: work packages, critical path, readiness, progress, pre-startup checks.
"use strict";
const { title } = require("../_common");

const state = {};
const day = (d, hh) => { const x = new Date(Date.now() + d * 864e5); return `${x.toISOString().slice(0, 10)}T${hh}`; };
const PKGS = [
  ["P10", "Isolate line 1 – LOTO on all drives", 4, []],
  ["P20", "Replace mixer drive bearings", 10, ["P10"]],
  ["P30", "Oven fan coupling change", 6, ["P10"]],
  ["P40", "Press HPU hose renewal", 5, ["P10"]],
  ["P50", "Line 1 restart and run test", 3, ["P20", "P30", "P40"]],
];

async function addPackage(p, [code, name, hours, preds]) {
  await p.getByRole("button", { name: "+ Work packages" }).click();
  const d = p.getByRole("dialog");
  await d.getByLabel("Code").fill(code);
  await d.getByLabel("Name").fill(name);
  await d.getByLabel("Duration (h)").fill(String(hours));
  for (const x of preds) {
    await d.locator('label:has-text("Predecessors")').locator("xpath=..").locator(".mantine-MultiSelect-input").click();
    await p.getByRole("option", { name: x, exact: true }).click();
    await p.keyboard.press("Escape");
  }
  return d;
}

module.exports = {
  id: "shutdowns",
  file: "07-shutdowns",
  intro: "Shutdowns",
  title: "PlantPulse – Shutdowns",
  covers: "Creating a shutdown, work packages with durations and predecessors, the critical path on the Gantt chart, readiness of materials, permits and LOTO, daily progress and delay reasons, pre-startup checks, completion report and lessons learned, Excel import",
  keyframes: [["02-how", 0.9], ["04-gantt", 0.7], ["05-readiness", 0.6], ["06-checks", 0.8]],
  scenes: [
    title("01-title", "Shutdowns", "Planned stops, planned to the hour",
      "Shutdowns. A planned stop of a line or the whole plant, broken into work packages, scheduled on a Gantt chart with its critical path, and followed day by day until a safe restart."),
    {
      id: "02-how", layout: "cards", chapter: "How it works", title: "A shutdown, step by step",
      cards: [
        { t: "Shutdown", d: "Name, scope, planned start and end" },
        { t: "Work packages", d: "Duration, manpower, contractors, predecessors" },
        { t: "Critical path", d: "Calculated, shown in red; float for the rest" },
        { t: "Fits the window?", d: "Total duration against the planned stop" },
        { t: "Readiness", d: "Materials, permits and LOTO per package" },
        { t: "Progress", d: "Daily percentage, with the reason for any delay" },
        { t: "Pre-startup checks", d: "Must all be done before the shutdown is completed" },
        { t: "Report", d: "Lessons learned and documents" },
      ],
      narration: "A shutdown is split into work packages, each with a duration, manpower and the packages it must wait for. "
        + "PlantPulse calculates the critical path and shows whether the plan fits the planned stop. Then it follows readiness, progress and delays, "
        + "and the restart is only allowed after every pre-startup check is done.",
    },
    {
      id: "03-create", layout: "app", device: "desktop", chapter: "Shutdowns", step: "1 · Plan",
      narration: "The planner creates the shutdown with its window, then adds the work packages. Here: isolate the line first, "
        + "then three jobs in parallel, and the restart test at the end, which waits for all three.",
      async capture(cap) {
        const s = await cap.login("planner");
        const p = s.page;
        await s.goto("/shutdowns");
        await s.click(p.getByRole("button", { name: "New shutdown" }), "New shutdown");
        await s.quiet(async () => {
          const d = p.getByRole("dialog");
          await d.getByLabel("Name").fill("Line 1 planned stop");
          await d.getByLabel("Scope").fill("Mixer drive bearings, oven fan coupling, press HPU hoses");
          await d.getByLabel("Start").fill(day(5, "06:00"));
          await d.getByLabel("End").fill(day(6, "18:00"));
        });
        await s.click(p.getByRole("dialog").getByRole("button", { name: "Create" }), "Name, scope and the planned window – the code is automatic");
        await s.quiet(async () => { await p.getByText("Line 1 planned stop").first().click(); await p.waitForURL(/shutdowns\//); state.url = p.url(); await s.settle(800); });
        await s.quiet(async () => { await addPackage(p, PKGS[0]); await p.getByRole("dialog").getByRole("button", { name: "Create" }).click(); await p.waitForTimeout(800); });
        await s.click(p.getByRole("button", { name: "+ Work packages" }), "Add work packages");
        await s.quiet(async () => { await p.keyboard.press("Escape"); await p.waitForTimeout(400); });
        const d = await addPackage(p, PKGS[1]);
        await s.click(d.getByRole("button", { name: "Create" }), "Duration, manpower and predecessors", { zoom: 1 });
        for (const pk of PKGS.slice(2)) await s.quiet(async () => { await addPackage(p, pk); await p.getByRole("dialog").getByRole("button", { name: "Create" }).click(); await p.waitForTimeout(800); });
      },
    },
    {
      id: "04-gantt", layout: "app", device: "desktop", chapter: "Shutdowns", step: "2 · Critical path",
      narration: "The schedule is calculated at once. The critical path is drawn in red: any delay there delays the restart. "
        + "The other packages show their float. At the top: total duration against the window, and whether it fits.",
      async capture(cap) {
        const s = await cap.login("planner");
        const p = s.page;
        await p.goto(state.url); await s.settle(1500);
        await s.view("Gantt: the critical path in red", { focus: p.getByText("P30 Oven fan coupling", { exact: false }).first(), zoom: 1.45, weight: 1.4 });
        await s.view("Duration against the window – does it fit?", { focus: p.getByText("Fits planned window"), zoom: 1.6 });
      },
    },
    {
      id: "05-readiness", layout: "app", device: "desktop", chapter: "Shutdowns", step: "3 · Readiness & progress",
      narration: "In the packages list, each package is marked ready for materials, permits and LOTO, and the readiness percentages at the top follow. "
        + "During the stop, progress is logged every day, and a delay always has a reason.",
      async capture(cap) {
        const s = await cap.login("planner");
        const p = s.page;
        await p.goto(state.url); await s.settle(1200);
        await s.click(p.getByRole("tab", { name: "Work packages" }), "Work packages: float, readiness, progress");
        const sel = p.getByRole("row", { name: /P20/ }).locator(".mantine-Select-input").first();
        await s.click(sel, "Materials ready?", { zoom: 1.4 });
        await s.click(p.getByRole("option", { name: "Ready", exact: true }).first(), "Readiness percentages follow", { zoom: 1.2 });
        await s.click(p.getByRole("row", { name: /P20/ }).getByRole("button", { name: "±" }), "Log progress");
        await s.quiet(async () => {
          const d = p.getByRole("dialog");
          await d.getByLabel("%").fill("40");
          await d.getByLabel("Delay reason").fill("Bearing puller arrived late");
        });
        await s.click(p.getByRole("dialog").getByRole("button", { name: "Save" }), "Progress, with the reason for a delay");
      },
    },
    {
      id: "06-checks", layout: "app", device: "desktop", chapter: "Shutdowns", step: "4 · Safe restart",
      narration: "Before the restart come the pre-startup and commissioning checks. Each one is confirmed with its result. "
        + "The completion report keeps the lessons learned and the documents, ready for the next stop. A whole shutdown plan can also be imported from Excel.",
      async capture(cap) {
        const s = await cap.login("planner");
        const p = s.page;
        await p.goto(state.url); await s.settle(1200);
        await s.click(p.getByRole("tab", { name: "Pre-startup & commissioning checks" }), "Pre-startup checks");
        await s.quiet(async () => { await p.getByLabel("Description").fill("All guards refitted and interlocks tested"); });
        await s.click(p.getByRole("button", { name: "Add check" }), "Add a check");
        await s.quiet(async () => { await p.getByPlaceholder("Result").first().fill("Done, signed by shift leader"); });
        await s.click(p.getByRole("button", { name: "Confirm" }).first(), "Confirm with the result");
        await s.click(p.getByRole("tab", { name: "Completion report" }), "Completion report: lessons learned");
      },
    },
    title("07-end", "Shutdowns", "Next: root cause analysis",
      "That is shutdowns. Next: root cause analysis, so a major breakdown does not happen twice."),
  ],
};

// ---- Voice, one sentence per filmed step or card ----
require("../_common").applySays(module.exports, {
  "03-create": ["The planner creates the shutdown.", "With its name, scope and the planned window. The code can be left blank: it is made from the name.",
    "Then the work packages: first, isolate the line.",
    "Each package has a duration, manpower, and the packages it must wait for. Three jobs in parallel, then the restart test, which waits for all three."],
  "04-gantt": ["The schedule is calculated at once. The critical path is drawn in red: any delay there delays the restart. The others show their float.",
    "At the top: the total duration against the window, and whether it fits."],
  "05-readiness": ["The packages list shows float, readiness and progress.", "Each package is marked ready for materials, permits and lock-out.",
    "And the readiness percentages at the top follow.", "During the stop, progress is logged every day.",
    "A delay always has a reason, and the package shows as delayed."],
  "06-checks": ["Before the restart come the pre-startup and commissioning checks.", "Add each check.",
    "And confirm it with its result. The shutdown cannot be completed until every check is done.",
    "The completion report keeps the lessons learned and the documents. A whole shutdown plan can also be imported from Excel."],
}, {
  "02-how": { lead: "A shutdown, step by step.", says: [
    "The shutdown has a name, a scope, and a planned start and end.", "It is split into work packages, with duration, manpower, contractors and predecessors.",
    "The critical path is calculated and shown in red; the rest has float.", "The total duration is checked against the planned stop.",
    "Readiness is followed for materials, permits and lock-out.", "Progress is logged daily, with the reason for any delay.",
    "Every pre-startup check must be done before the shutdown is completed.", "And the report keeps the lessons learned."] },
});
