// Video 11 – Shifts and handover: roster, manpower, teams, shift types, the handover between shifts.
"use strict";
const { title, applySays } = require("../_common");

const state = {};

module.exports = {
  id: "shifts",
  file: "11-shifts-and-handover",
  intro: "Shifts & handover",
  title: "PlantPulse – Shifts and handover",
  covers: "The roster, available manpower, teams and rotation patterns, shift types, roster import from Excel, writing a shift handover (summary, outstanding breakdowns, pending work, safety concerns, permits, risks), submitting it and the incoming supervisor's confirmation",
  keyframes: [["03-roster", 0.3], ["04-handover", 0.5], ["05-confirm", 0.8]],
  scenes: [
    title("01-title", "Shifts & handover", "Who is on shift – and what they need to know",
      "Shifts and handover. Who works when, how many hours are available, and a written handover so nothing is lost between shifts."),
    {
      id: "03-roster", layout: "app", device: "desktop", chapter: "Shifts", step: "1 · Roster",
      async capture(cap) {
        const s = await cap.login("mech.sup");
        const p = s.page;
        await s.goto("/shifts");
        await s.click(p.getByRole("tab", { name: "Teams" }), "Teams and their rotation pattern");
        await s.click(p.getByRole("button", { name: "Generate from pattern" }), "Generate the roster from the pattern", { wait: 900 });
        await s.click(p.getByRole("dialog").getByRole("button", { name: "Generate" }), "Generated", { wait: 1500 });
        await s.click(p.getByRole("tab", { name: "Roster" }), "The roster: who works which shift");
        await s.click(p.getByRole("tab", { name: "Manpower" }), "Manpower: hours available per day");
        await s.click(p.getByRole("tab", { name: "Shift types" }), "Shift types: D, N, G…");
        await s.click(p.getByRole("button", { name: "Import roster" }), "Import the roster from Excel", { wait: 1000 });
      },
    },
    {
      id: "04-handover", layout: "app", device: "desktop", chapter: "Shifts", step: "2 · Handover",
      async capture(cap) {
        const s = await cap.login("tech1");
        const p = s.page;
        await s.goto("/shifts");
        await s.click(p.getByRole("button", { name: "New handover" }), "New handover, written by the outgoing shift", { wait: 1000 });
        const d = p.getByRole("dialog");
        await s.quiet(async () => {
          await d.getByRole("textbox", { name: "Department" }).or(d.getByRole("combobox", { name: "Department" })).first().click();
          await p.getByRole("option").first().click();
          await d.getByRole("textbox", { name: "Shift" }).or(d.getByRole("combobox", { name: "Shift" })).first().click();
          await p.getByRole("option").first().click();
          const inc = d.getByRole("combobox", { name: "Incoming person" }); await inc.click(); await inc.fill("Omar"); await p.getByRole("option").first().click();
          await d.getByLabel("Outstanding breakdowns").fill("Crusher motor tripped, will not restart – electricians on it");
          await d.getByLabel("Pending work").fill("Mixer DE bearing change planned for Monday");
          await d.getByLabel("Safety concerns").fill("Oil on the floor near the press – area taped off");
        });
        await s.type(d.getByLabel("Summary"), "Line 1 ran all shift; line 2 stopped 3 h on the crusher.", "Summary, breakdowns, pending work, safety");
        await s.click(d.getByRole("button", { name: "Create" }), "Saved as a draft", { wait: 1800 });
        state.url = p.url();
        await s.click(p.getByRole("button", { name: "Submit" }), "Submit it to the incoming person");
      },
    },
    {
      id: "05-confirm", layout: "app", device: "desktop", chapter: "Shifts", step: "3 · Confirm",
      async capture(cap) {
        const s = await cap.login("mech.sup");
        const p = s.page;
        await p.goto(state.url); await s.settle(1200);
        await s.view("The incoming supervisor reads it", { weight: 1.1 });
        await s.click(p.getByRole("button", { name: "Confirm" }), "Confirm and lock", { wait: 1200 });
      },
    },
    title("06-end", "Shifts & handover", "Next: KPIs and reports",
      "That is shifts and handover. Next: KPIs and reports."),
  ],
};

applySays(module.exports, {
  "03-roster": ["Teams follow a rotation pattern.", "From the pattern, the roster is generated for the period.", "Done.",
    "The roster shows who works which shift, day by day; leave, overtime and call-outs are entered here too.",
    "Manpower turns it into hours available per day, and flags days with planned work but nobody rostered.",
    "Shift types are the codes in the roster, like day, evening and night.",
    "And a whole month can be imported from Excel."],
  "04-handover": ["At the end of the shift, the outgoing person writes the handover.",
    "The summary, outstanding breakdowns, pending work, safety concerns, open permits and critical risks, for the incoming person.",
    "It is saved as a draft.", "And submitted."],
  "05-confirm": ["The incoming supervisor reads it.", "And confirms it, which locks it. Nobody can confirm their own handover."],
});
