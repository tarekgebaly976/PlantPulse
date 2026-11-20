// Video 13 – Administration: users, departments and failure codes, roles, workflow, plant settings, daily summary, tokens, audit log, jobs.
"use strict";
const { title, applySays } = require("../_common");

module.exports = {
  id: "admin",
  file: "13-administration",
  intro: "Administration",
  title: "PlantPulse – Administration",
  covers: "Users (add, edit, import from Excel, reset password), departments and failure codes, roles and permissions, the work order workflow, plant settings, the daily summary, integration tokens, the audit log and background jobs; languages and dark mode",
  keyframes: [["02-users", 0.3], ["03-setup", 0.5], ["04-control", 0.7]],
  scenes: [
    title("01-title", "Administration", "Users, rules and settings – for the administrator",
      "Administration. Where the plant administrator sets up users, roles, departments, codes, the workflow and the plant's settings."),
    {
      id: "02-users", layout: "app", device: "desktop", chapter: "Administration", step: "1 · Users",
      async capture(cap) {
        const s = await cap.login("admin");
        const p = s.page;
        await s.goto("/admin");
        await s.view("Users of the plant", { weight: 1.1 });
        await s.click(p.getByRole("button", { name: "Import users (Excel)" }), "Import users from Excel", { wait: 1000 });
        await s.quiet(async () => { await p.keyboard.press("Escape"); await p.waitForTimeout(400); });
        await s.click(p.getByRole("tab", { name: "Roles & permissions" }), "Roles and their permissions");
      },
    },
    {
      id: "03-setup", layout: "app", device: "desktop", chapter: "Administration", step: "2 · Plant setup",
      async capture(cap) {
        const s = await cap.login("admin");
        const p = s.page;
        await s.goto("/admin");
        await s.click(p.getByRole("tab", { name: /Departments/ }), "Departments and failure codes");
        await s.click(p.getByRole("tab", { name: "Workflow" }), "The work order workflow");
        await s.click(p.getByRole("tab", { name: "Plant settings" }), "Plant settings");
        await s.click(p.getByRole("tab", { name: "Daily summary" }), "The daily summary");
      },
    },
    {
      id: "04-control", layout: "app", device: "desktop", chapter: "Administration", step: "3 · Control",
      async capture(cap) {
        const s = await cap.login("admin");
        const p = s.page;
        await s.goto("/admin");
        await s.click(p.getByRole("tab", { name: "Integration tokens" }), "Integration tokens");
        await s.click(p.getByRole("tab", { name: "Audit log" }), "The audit log: who changed what");
        await s.click(p.getByRole("tab", { name: "Background jobs" }), "Background jobs");
        await s.click(p.getByRole("button", { name: "Language" }), "English, Arabic or Bengali", { wait: 800 });
      },
    },
    title("05-end", "Administration", "Next: the production module",
      "That is administration. Next: the production module."),
  ],
};

applySays(module.exports, {
  "02-users": ["The users tab lists everyone in the plant, with their role, departments and trade. Each one can be edited, given a new temporary password, or removed from the plant.",
    "A whole team can be added or changed from Excel; nobody is removed by an import.",
    "Roles and permissions show exactly what each role may do."],
  "03-setup": ["Departments, and the failure codes: problems, causes and remedies, per equipment type.",
    "The workflow sets which status changes are allowed, and which permission each one needs. The safety rules stay fixed.",
    "Plant settings: time zone, currency, labor rate and more.",
    "And the daily summary e-mailed to managers."],
  "04-control": ["Integration tokens let plant systems send readings.",
    "The audit log records who changed what, and when.",
    "Background jobs show the scheduler's runs.",
    "And every user picks English, Arabic or Bengali, right to left where needed, and light or dark mode."],
});
