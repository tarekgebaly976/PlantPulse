// Video 08 – Root cause analysis of major breakdowns.
"use strict";
const { title } = require("../_common");

const open = async (s, num) => { await s.goto("/rca"); await s.page.locator(".mantine-SegmentedControl-root").getByText("All", { exact: true }).click(); await s.page.getByText(num).first().click(); await s.settle(1500); };

module.exports = {
  id: "rca",
  file: "08-root-cause-analysis",
  intro: "Root cause analysis",
  title: "PlantPulse – Root cause analysis",
  covers: "RCA rules (what is a major breakdown), the register, the manager's decision, the investigation in numbered steps (5W1H, evidence, fishbone, 5 Whys, root causes, action plan), approval, actions with work orders, effectiveness check, print report",
  keyframes: [["02-how", 0.9], ["05-investigation", 0.45], ["05-investigation", 0.75], ["06-actions", 0.6]],
  scenes: [
    title("01-title", "Root cause analysis", "So a major breakdown does not happen twice",
      "Root cause analysis. When a breakdown is serious, or keeps coming back, PlantPulse proposes an analysis, guides the team through it, and checks that the fix really worked."),
    {
      id: "02-how", layout: "cards", chapter: "How it works", title: "From breakdown to proven fix",
      cards: [
        { t: "Rules", d: "Downtime per criticality, repeats, production loss, cost, safety events" },
        { t: "Decision", d: "The manager starts the RCA with a leader and team, or says why not" },
        { t: "Investigation", d: "5W1H, evidence, fishbone and 5 Whys" },
        { t: "Root causes", d: "Physical, human and system causes" },
        { t: "Action plan", d: "Containment, corrective and preventive actions, owner and date" },
        { t: "Approval", d: "The manager approves, or returns it with a note" },
        { t: "Effectiveness check", d: "If the same failure comes back, the RCA reopens by itself" },
        { t: "Report", d: "One printable page, and an Excel register" },
      ],
      narration: "The plant decides what a major breakdown is: downtime above a limit for the equipment's criticality, the same failure repeating, "
        + "production loss, repair cost, or a safety event. When a work order is completed and a rule matches, an RCA is proposed. "
        + "The manager decides, the team investigates step by step, the actions are carried out, and an effectiveness check follows.",
    },
    {
      id: "03-register", layout: "app", device: "desktop", chapter: "Root cause analysis", step: "1 · Register & rules",
      narration: "The register lists every analysis: waiting for a decision, in progress, or closed, with the failure mode, why it was started, the leader and the due date. "
        + "The RCA rules are set here by the manager, and the register exports to Excel.",
      async capture(cap) {
        const s = await cap.login("manager");
        const p = s.page;
        await s.goto("/rca");
        await s.view("The RCA register", { weight: 1.1 });
        await s.click(p.locator(".mantine-SegmentedControl-root").getByText("All", { exact: true }), "All analyses, with why each one started");
        await s.click(p.getByRole("button", { name: "RCA rules" }), "RCA rules: what counts as a major breakdown", { wait: 1000 });
      },
    },
    {
      id: "04-decision", layout: "app", device: "desktop", chapter: "Root cause analysis", step: "2 · Decision",
      narration: "A rule matched on the grinding mill: high vibration again. The manager opens the proposal, and starts the RCA with a leader, the team and a due date, "
        + "or marks it not required, with a reason.",
      async capture(cap) {
        const s = await cap.login("manager");
        const p = s.page;
        await open(s, "RCA-DMO-000002");
        await s.view("Waiting for decision: why it was proposed", { weight: 1.1 });
        await s.click(p.getByRole("button", { name: "Start RCA" }).first(), "Start: leader, team and due date", { wait: 1000 });
      },
    },
    {
      id: "05-investigation", layout: "app", device: "desktop", chapter: "Root cause analysis", step: "3 · Investigation",
      narration: "The investigation follows numbered tabs. One: the problem, in five W's and one H, filled in from the work orders. Two: evidence. "
        + "Three: the fishbone, with possible causes under man, machine, method, material, measurement and environment. "
        + "Four: the five whys; the root cause is the last why of each chain. Five: the root causes. Six: the action plan.",
      async capture(cap) {
        const s = await cap.login("manager");
        const p = s.page;
        await open(s, "RCA-DMO-000003");
        await s.click(p.getByRole("tab", { name: "1. Problem (5W1H)" }), "1 · Problem: 5W1H");
        await s.click(p.getByRole("tab", { name: "3. Fishbone (possible causes)" }), "3 · Fishbone: the six M's");
        await s.click(p.getByRole("tab", { name: "4. 5 Whys" }), "4 · 5 Whys: keep asking why");
        await s.click(p.getByRole("tab", { name: "5. Root causes" }), "5 · Root causes");
        await s.click(p.getByRole("tab", { name: /6\. Action plan/ }), "6 · Action plan");
      },
    },
    {
      id: "06-actions", layout: "app", device: "desktop", chapter: "Root cause analysis", step: "4 · Actions & check",
      narration: "Once approved, the owners carry out their actions. An action can raise its own work order; completing the work order completes the action. "
        + "When the last action is done, the effectiveness check starts. If the same failure returns on that equipment, the analysis reopens by itself. "
        + "Print report gives the whole RCA on one page.",
      async capture(cap) {
        const s = await cap.login("manager");
        const p = s.page;
        await open(s, "RCA-DMO-000004");
        await s.click(p.getByRole("tab", { name: /6\. Action plan/ }), "Actions: owner, due date, work order");
        await s.view("Create work order from an action", { focus: p.getByRole("button", { name: "Create work order" }).first(), zoom: 1.4 });
        await s.click(p.getByRole("link", { name: "Print report" }), "Print report: the RCA on one page", { wait: 2000 });
      },
    },
    title("07-end", "Root cause analysis", "Next: assets and QR labels",
      "That is root cause analysis. Next: the asset register, the equipment tree and QR labels."),
  ],
};

// ---- Voice, one sentence per filmed step or card ----
require("../_common").applySays(module.exports, {
  "03-register": ["The register lists every analysis: waiting for a decision, in progress, or closed.",
    "Each with its failure mode, why it was started, the leader and the due date. The register exports to Excel.",
    "The RCA rules, set by the manager, say what counts as a major breakdown."],
  "04-decision": ["A rule matched on the grinding mill: high vibration again. The page shows why, and the total impact.",
    "The manager starts the RCA with a leader, the team and a due date, or marks it not required, with a reason."],
  "05-investigation": ["The investigation follows numbered tabs. One: the problem, in five W's and one H, filled in from the work orders.",
    "Three: the fishbone, with possible causes under man, machine, method, material, measurement and environment.",
    "Four: the five whys. Keep asking why; the root cause is the last why of each chain.",
    "Five: the root causes: physical, human and system.", "Six: the action plan, with owners and due dates."],
  "06-actions": ["Once approved, the owners carry out their actions, with the result as evidence.",
    "An action can raise its own work order; completing the work order completes the action. When the last action is done, the effectiveness check starts, and if the failure returns, the RCA reopens by itself.",
    "Print report gives the whole analysis on one page."],
}, {
  "02-how": { lead: "From a breakdown to a proven fix.", says: [
    "The plant's rules decide what a major breakdown is: downtime for the criticality, repeats, production loss, cost, or a safety event.",
    "The manager decides: start the RCA with a leader and team, or say why not.", "The team investigates: five W's and one H, evidence, fishbone and five whys.",
    "They find the root causes: physical, human and system.", "They plan containment, corrective and preventive actions, with owners and dates.",
    "The manager approves, or returns it with a note.", "Then the effectiveness check: if the same failure comes back, the RCA reopens.",
    "And everything prints on one page, with an Excel register."] },
});
