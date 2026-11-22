// Video 18 – Cutting plan: paper waste (trim loss) as the baseline, the winder and the units after it (sheeters,
// rewinders), the orders of a plan, Calculate (cutting patterns, trim against the actual trim), the route of each order
// through the converting units and their schedule, release, and importing orders from Excel. Demo paper mill (DPM).
"use strict";
const { title, applySays } = require("../_common");

const PLAN = "Next week – grade 350 (sample)";

async function start(cap, url) {
  const s = await cap.login("prod.mgr");
  // the production manager works in the demo paper mill (DPM) only: no plant switcher
  if (url) await s.goto(url);
  return s;
}

module.exports = {
  id: "cutting",
  file: "18-cutting-plan",
  intro: "Cutting plan",
  title: "PlantPulse – Cutting plan",
  covers: "Paper waste (trim loss) from the production reports as the baseline; the cutting plan of the winder: jumbo width and limits, the sheeters and rewinders after it, a plan's reel and sheet orders, Calculate (cutting patterns, sets, planned trim beside the actual trim), the parent reel and unit for each order, the converting schedule and load per unit, release, and importing orders from Excel",
  keyframes: [["03-waste", 0.4], ["05-calc", 0.5], ["06-converting", 0.5]],
  scenes: [
    title("01-title", "Cutting plan", "Less trim on the winder – and a converting plan that fits", ""),
    {
      id: "02-how", layout: "cards", chapter: "How it works", title: "From customer orders to knife settings",
      cards: [
        { t: "Baseline", d: "Paper waste (trim) from the daily production reports" },
        { t: "Winder", d: "Jumbo width, reels per set, minimum and maximum trim" },
        { t: "Units after it", d: "Any number of sheeters and rewinders, with their sizes and speed" },
        { t: "Orders", d: "Reels by width, or sheets by width × length, with a tolerance and due date" },
        { t: "Calculate", d: "The optimiser picks the cutting patterns and how many sets of each" },
        { t: "Both stages", d: "For each sheet order: the unit and the parent reel width" },
        { t: "Converting schedule", d: "Each unit's jobs in time, against the due dates" },
        { t: "Release", d: "The released plan is locked for production" },
      ],
    },
    {
      id: "03-waste", layout: "app", device: "desktop", chapter: "Cutting plan", step: "1 · Paper waste",
      async capture(cap) {
        const s = await start(cap, "/");
        const p = s.page;
        await s.click(p.getByRole("link", { name: "Paper waste (trim)" }), "Production › Paper waste (trim)", { wait: 2000 });
        await s.view("Trim, reject and waste from the reel reports", { focus: p.getByText("Trim %", { exact: true }).first(), zoom: 1.2 });
        await s.view("Per grade, per shift and the top causes", { focus: p.getByText("By grade", { exact: true }), zoom: 1.2 });
      },
    },
    {
      id: "04-setup", layout: "app", device: "desktop", chapter: "Cutting plan", step: "2 · Winder and units",
      async capture(cap) {
        const s = await start(cap, "/");
        const p = s.page;
        await s.click(p.getByRole("link", { name: "Cutting plan (winder)" }), "Production › Cutting plan (winder)", { wait: 2000 });
        await s.view("The winder: jumbo 3200 mm, up to 6 reels a set", { focus: p.getByText("Winder · PM1"), zoom: 1.5 });
        await s.view("Four sheeters and a rewinder after the winder", { focus: p.getByText(/Units after the winder/), zoom: 1.4 });
        await s.click(p.getByText(PLAN), "A cutting plan: one machine, one grade", { wait: 2000 });
        await s.view("Orders: reels by width, sheets by width × length", { focus: p.getByText(/^Orders \(/), zoom: 1.2, weight: 1.2 });
      },
    },
    {
      id: "05-calc", layout: "app", device: "desktop", chapter: "Cutting plan", step: "3 · Calculate",
      async capture(cap) {
        const s = await start(cap, "/operations/cutting");
        const p = s.page;
        await s.quiet(async () => { await p.getByText(PLAN).click(); await p.waitForTimeout(1500); });
        await s.click(p.getByRole("button", { name: "Calculate", exact: true }), "Calculate", {
          wait: 1500, after: async () => { await p.waitForTimeout(24000); } });
        await s.view("Planned trim beside the actual trim of the grade", { focus: p.getByText("Planned trim", { exact: true }).first(), zoom: 1.3, weight: 1.2 });
        await s.view("The cutting patterns and how many sets of each", { focus: p.getByText("Cutting patterns", { exact: true }), zoom: 1.2, weight: 1.2 });
        await s.view("Reels per width and where each goes", { focus: p.getByText("Reels per width", { exact: true }), zoom: 1.3 });
      },
    },
    {
      id: "06-converting", layout: "app", device: "desktop", chapter: "Cutting plan", step: "4 · Converting",
      async capture(cap) {
        const s = await start(cap, "/operations/cutting");
        const p = s.page;
        await s.quiet(async () => { await p.getByText(PLAN).click(); await p.waitForTimeout(1500); });
        await s.view("Sheet orders: the unit and the parent reel", { focus: p.getByText("Sheeters and rewinders", { exact: true }), zoom: 1.3 });
        await s.view("The converting schedule, unit by unit", { focus: p.getByText("Converting schedule", { exact: true }), zoom: 1.2, weight: 1.2 });
        await s.view("Load per unit and size changes", { focus: p.getByText("Load per unit", { exact: true }), zoom: 1.3 });
      },
    },
    {
      id: "07-release", layout: "app", device: "desktop", chapter: "Cutting plan", step: "5 · Release",
      async capture(cap) {
        const s = await start(cap, "/operations/cutting");
        const p = s.page;
        await s.quiet(async () => { await p.getByText(PLAN).click(); await p.waitForTimeout(1500); });
        p.once("dialog", (dlg) => dlg.accept());
        await s.click(p.getByRole("button", { name: "Release", exact: true }), "Release: the plan is locked", { wait: 1500 });
        await s.goto("/operations/cutting");
        await s.click(p.getByRole("button", { name: "Import orders (Excel)" }), "Import orders from Excel", { wait: 1000 });
      },
    },
    title("08-end", "Cutting plan", "Plan the cut – then watch the waste fall", ""),
  ],
};

applySays(module.exports, {
  "03-waste": ["It starts with the waste the plant already records. Paper waste, under Production, reads the daily production reports.",
    "For each paper machine: trim, reject and total waste, week by week, from the jumbo reels.",
    "And by grade, by shift and by cause. This is the baseline before the cutting is optimised."],
  "04-setup": ["The cutting plan is in the Production menu.",
    "The winder: the jumbo width, up to six reels a set, and the minimum and maximum trim.",
    "After the winder, any number of sheeters and rewinders, each with the sizes it can make and its speed.",
    "A cutting plan holds the orders of one machine and one grade.",
    "Reel orders by width, sheet orders by width and length, each with a tolerance and a due date."],
  "05-calc": ["Press Calculate. The optimiser tries hundreds of cutting patterns and picks the best mix.",
    "The planned trim sits beside the actual trim of this grade from the reports, so you see what the plan saves.",
    "The cutting patterns: the knife setting of each, how many sets, and the trim.",
    "And every reel width: how many are cut, and whether it goes to the customer or to a sheeter or rewinder."],
  "06-converting": ["For sheet orders, the plan also picks the unit and the parent reel width, so the winder and the converting fit together.",
    "The converting schedule shows each unit's jobs in time, from the start of converting, and flags any order that would be late.",
    "And the load of each unit, with its size changes."],
  "07-release": ["When the plan is right, release it. A released plan is locked.",
    "Orders can also come from Excel: one file can hold several production cycles, and nothing is saved while the file has errors."],
}, {
  "02-how": { lead: "How the cutting plan works.", says: [
    "The paper waste in the daily reports is the baseline.",
    "The winder has its jumbo width and its limits.",
    "After it come the sheeters and rewinders.",
    "The orders are reels by width, or sheets by width and length.",
    "Calculate picks the cutting patterns and how many sets of each.",
    "For each sheet order it also picks the unit and the parent reel.",
    "And it times the converting against the due dates.",
    "The released plan is locked for production."] },
});
module.exports.scenes[0].narration = "The cutting plan. Less trim on the winder, and a converting plan that fits.";
module.exports.scenes[module.exports.scenes.length - 1].narration = "That is the cutting plan. Plan the cut, then watch the waste in the reports fall.";
