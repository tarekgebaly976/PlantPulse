// Video 16 – Skill matrix: the plant's skills, technicians' levels and certificates, required skills on job plans and
// work orders, and the warning when someone without them is assigned.
"use strict";
const { title, applySays } = require("../_common");

/** Open a work order from the list by its title (search box, then the row). */
async function openWo(s, text) {
  const p = s.page;
  await s.goto("/work-orders");
  await p.getByPlaceholder(/./).first().fill(text);
  await s.settle(1000);
  await p.getByText(text).first().click();
  await s.settle(1500);
}

module.exports = {
  id: "skills",
  file: "16-skill-matrix",
  intro: "Skill matrix",
  title: "PlantPulse – Skill matrix",
  covers: "The skill matrix under Shifts: the plant's skills (equipment, technique, safety authorisation), levels 1 to 3, certificates with an expiry date and their colours, the qualified count per skill, a new skill with an automatic code, required skills on job plans and work orders, and the warning when someone without them is assigned",
  keyframes: [["03-matrix", 0.2], ["04-cell", 0.6], ["06-wo", 0.8]],
  openWo,
  scenes: [
    title("01-title", "Skill matrix", "Who can do the job – and whose certificate is still valid", ""),
    {
      id: "02-what", layout: "cards", chapter: "How it works", title: "What the skill matrix holds",
      cards: [
        { t: "Skills", d: "The plant's own list: equipment, techniques and safety authorisations" },
        { t: "Levels 1 – 3", d: "1 basic (under supervision), 2 independent, 3 expert who trains others" },
        { t: "Certificates", d: "A skill can need a certificate with an expiry date" },
        { t: "Colours", d: "Red expired or no date, amber expires within 30 days, green valid" },
        { t: "Qualified count", d: "People at level 2 or more with a valid certificate, per skill" },
        { t: "Required skills", d: "On job plans and work orders, with a minimum level" },
        { t: "Warning", d: "Assigning someone without them is stopped with the reason" },
        { t: "Weekly schedule", d: "The proposal only places qualified people" },
      ],
    },
    {
      id: "03-matrix", layout: "app", device: "desktop", chapter: "Skill matrix", step: "1 · The matrix",
      async capture(cap) {
        const s = await cap.login("engineer");
        const p = s.page;
        await s.goto("/shifts");
        await s.click(p.getByRole("tab", { name: "Skill matrix" }), "Shifts › Skill matrix: people × skills");
        await s.view("The level of each person, coloured by the certificate", { focus: p.getByTestId("skill-matrix"), zoom: 1.25, weight: 1.3 });
        await s.view("Last row: how many are qualified", { focus: p.getByText("Qualified (level 2+, valid)"), zoom: 1.5 });
      },
    },
    {
      id: "04-cell", layout: "app", device: "desktop", chapter: "Skill matrix", step: "2 · Level and certificate",
      async capture(cap) {
        const s = await cap.login("engineer");
        const p = s.page;
        await s.goto("/shifts");
        await s.quiet(async () => { await p.getByRole("tab", { name: "Skill matrix" }).click(); });
        const row = p.getByRole("row").filter({ hasText: "Rashid Nasser" });
        await s.click(row.getByRole("cell").nth(2), "Amber: the certificate expires within 30 days", { wait: 900 });
        const d = p.getByRole("dialog");
        await s.view("Level and the date the certificate is valid until", { focus: d, zoom: 1.4 });
        await s.quiet(async () => { await d.getByLabel("Certificate valid until").fill("2027-11-30"); });
        await s.view("The renewed certificate", { focus: d.getByLabel("Certificate valid until"), zoom: 1.6 });
        await s.click(d.getByRole("button", { name: "Save" }), "Saved: now green", { wait: 1200 });
      },
    },
    {
      id: "05-new", layout: "app", device: "desktop", chapter: "Skill matrix", step: "3 · New skill",
      async capture(cap) {
        const s = await cap.login("engineer");
        const p = s.page;
        await s.goto("/shifts");
        await s.quiet(async () => { await p.getByRole("tab", { name: "Skill matrix" }).click(); });
        await s.click(p.getByRole("button", { name: "New skill" }), "New skill", { wait: 900 });
        const d = p.getByRole("dialog");
        await s.view("Code: Automatic – from the name", { focus: d.getByLabel("Code"), zoom: 1.6 });
        await s.type(d.getByLabel(/^Name/).first(), "Vibration analysis", "The name, and its category");
        await s.click(d.getByRole("button", { name: "Save" }), "A new column in the matrix", { wait: 1200 });
      },
    },
    {
      id: "06-wo", layout: "app", device: "desktop", chapter: "Skill matrix", step: "4 · Required skills",
      async capture(cap) {
        const s = await cap.login("engineer");
        const p = s.page;
        await s.goto("/pm");
        await s.click(p.getByRole("tab", { name: "Job plans" }), "Job plans: a Skills button on each");
        await s.click(p.getByRole("button", { name: "Skills" }).first(), "Required skills of the job plan", { wait: 900 });
        const d = p.getByRole("dialog");
        await s.click(d.getByRole("button", { name: "Edit" }), "Add a skill and its minimum level", {
          wait: 700, after: async () => {
            await d.getByRole("button", { name: "Add skill" }).click();
            await d.getByRole("combobox", { name: "Name" }).last().click();
            await p.getByRole("option", { name: /Hydraulics/ }).first().click();
            await d.getByRole("combobox", { name: "Minimum level" }).last().click();
            await p.getByRole("option", { name: /^2 ·/ }).first().click();
            await p.waitForTimeout(400);
          } });
        await s.click(d.getByRole("button", { name: "Save" }), "Hydraulics, level 2 or more", { wait: 1000 });
        await s.quiet(async () => { await p.keyboard.press("Escape"); });
        await openWo(s, "Medium-voltage breaker test");
        await s.quiet(async () => { await p.getByRole("tab", { name: "Details" }).click(); });
        await s.view("The work order needs HV at level 2", { focus: p.getByText("Required skills", { exact: true }), zoom: 1.3 });
        await s.quiet(async () => {
          const c = p.getByRole("combobox", { name: "Assign", exact: true });
          await c.click(); await c.fill("Imran"); await p.waitForTimeout(800); await p.getByRole("option").first().click();
        });
        await s.click(p.getByRole("button", { name: "Assign", exact: true }), "Stopped: his HV certificate has expired", { wait: 1200, weight: 1.3 });
      },
    },
    title("07-end", "Skill matrix", "Next: the weekly maintenance schedule", ""),
  ],
};

applySays(module.exports, {
  "03-matrix": ["The skill matrix is a tab under Shifts. The engineer keeps it: one row per person, one column per skill.",
    "Each cell is the person's level, one to three, coloured by the certificate: green valid, amber expiring within thirty days, red expired or without a date.",
    "The last row counts the qualified people per skill. Red means nobody, amber means only one person, so you see where the plant depends on a single technician."],
  "04-cell": ["Click a cell. Here a confined space certificate expires within thirty days.",
    "The level and the date the certificate is valid until.",
    "Enter the date of the renewed certificate.",
    "Saved. The cell turns green."],
  "05-new": ["A new skill.",
    "The code field is optional now: left blank, it is made automatically from the name.",
    "Type the name, choose the category, and say whether a certificate is needed.",
    "The skill is a new column in the matrix."],
  "06-wo": ["Job plans have a Skills button.",
    "It lists the skills the work needs.",
    "Add one, with its minimum level.",
    "Saved. Work orders made from this plan take these skills with them.",
    "This work order, a medium-voltage breaker test, needs the switching authorisation at level two.",
    "Assigning a technician whose certificate has expired is stopped, with the reason. A supervisor can still override it on purpose."],
}, {
  "02-what": { lead: "What the skill matrix holds.", says: [
    "The plant's own skills: equipment, techniques and safety authorisations.",
    "Three levels: basic under supervision, independent, and expert who trains others.",
    "Some skills need a certificate with an expiry date.",
    "The colour code shows which certificates are valid, expiring or expired.",
    "Each skill shows how many people are qualified.",
    "Job plans and work orders say which skills they need.",
    "Assigning someone without them gives a warning.",
    "And the weekly schedule only places qualified people."] },
});
module.exports.scenes[0].narration = "The skill matrix. Who can do which job, at what level, and whose certificate is still valid.";
module.exports.scenes[module.exports.scenes.length - 1].narration = "That is the skill matrix. Next: the weekly maintenance schedule.";
