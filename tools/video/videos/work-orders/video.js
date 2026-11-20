// Video 02 – Work requests and work orders: from a reported problem to a closed, costed work order.
"use strict";
const { pick, choose, confirm, title } = require("../_common");

const REQ = "Hot air leak at oven fan 1";   // a request already in the demo, waiting for the supervisor
const state = {};

module.exports = {
  id: "work-orders",
  file: "02-work-requests-and-work-orders",
  title: "PlantPulse – Work requests and work orders",
  covers: "Work requests (report, accept, reject), the work order list and its tools, the status flow with approval, planning and assignment, execution tabs (checklist, labor, spare parts, attachments), review with failure codes, closing, PDF report, bulk close",
  keyframes: [["02-flow", 0.9], ["03-requests", 0.7], ["06-approve", 0.8], ["08-review", 0.7]],
  scenes: [
    title("01-title", "Work requests & work orders", "From a reported problem to a closed, costed job",
      "Work requests and work orders. This video follows one job from the moment a problem is reported until the work order is closed, with its hours, parts and costs."),
    {
      id: "02-flow", layout: "cards", chapter: "How work flows", title: "The life of a work order",
      cards: [
        { t: "Request", d: "Anyone reports a problem. A supervisor accepts or rejects it" },
        { t: "Triage", d: "A new work order: check, plan, send for approval" },
        { t: "Approved", d: "The supervisor approves and assigns technicians" },
        { t: "Planned · Scheduled", d: "Dates, hours and parts, by the planner" },
        { t: "In progress", d: "Only after LOTO and permit are signed off, if required" },
        { t: "Awaiting review", d: "The technician has finished; the supervisor checks" },
        { t: "Completed", d: "Codes, root cause and tests are in place" },
        { t: "Closed", d: "Final. Counted in the KPIs" },
      ],
      narration: "Every job follows the same path. A request is reported and accepted. The new work order starts in triage, "
        + "is approved and assigned, planned and scheduled, then put in progress. When the technician is done it waits for review, "
        + "and the supervisor completes and closes it. The app checks each step, and only shows the buttons your role is allowed to use.",
    },
    {
      id: "03-requests", layout: "app", device: "desktop", chapter: "Work requests", step: "1 · Request",
      narration: "Work requests are how anyone reports a problem. The supervisor sees the new requests first, with breakdowns marked. "
        + "Open one, choose the type and priority, and accept it: the work order is created. A request can also be rejected, with a reason.",
      async capture(cap) {
        const s = await cap.login("mech.sup");
        const p = s.page;
        await s.goto("/requests");
        await s.view("Work requests: new requests first", { weight: 1.1 });
        await s.click(p.getByText(REQ).first(), "Open the request");
        await s.quiet(async () => { await choose(p, "Priority", "P2"); });
        await s.click(p.getByRole("button", { name: /Accept/ }), "Type and priority, then accept", { zoom: 1.35 });
        await s.click(p.getByRole("link", { name: /Work orders/ }).last(), "The work order is created", { after: async () => { state.wo = p.url(); } });
      },
    },
    {
      id: "04-list", layout: "app", device: "desktop", chapter: "Work orders", step: "2 · The list",
      narration: "The work order list is the planner's desk. Search by number, title or equipment, filter by status and type, "
        + "or show only open or overdue work. From here you create work orders, import a work plan from Excel, export the list, "
        + "and assign or close several work orders at once.",
      async capture(cap) {
        const s = await cap.login("planner");
        const p = s.page;
        await s.goto("/work-orders");
        await s.view("All work orders of the plant", { weight: 1 });
        await s.type(p.getByPlaceholder(/WO number, title or equipment/), "oven", "Search: number, title or equipment");
        await s.click(p.getByRole("switch", { name: "Open only" }), "Open only, or overdue only", { zoom: 1.4, check: true });
        await s.click(p.getByRole("checkbox", { name: "select" }).first(), "Tick work orders to assign, close or cancel them together", { zoom: 1.3 });
        await s.view("Import work plan and Export XLSX", { focus: p.getByRole("button", { name: "Import work plan" }), zoom: 1.5 });
      },
    },
    {
      id: "05-triage", layout: "app", device: "desktop", chapter: "Work orders", step: "3 · Triage",
      narration: "In triage the planner completes the work order: planned start and end, estimated hours, and the safety needs, "
        + "lock-out tag-out, a permit, or a test after the work. Then it goes for approval.",
      async capture(cap) {
        const s = await cap.login("planner");
        const p = s.page;
        await p.goto(state.wo); await s.settle(1200);
        await s.view("A new work order starts in triage", { focus: p.getByTestId("wo-status"), zoom: 1.4, weight: 0.8 });
        await s.click(p.getByRole("tab", { name: "Details" }), "Details: dates, hours, priority, supervisor, safety");
        await s.quiet(async () => {
          await p.getByLabel("Estimated hours").last().fill("3");
          await p.getByLabel("LOTO required").check();
        });
        await s.click(p.getByRole("button", { name: "Save" }).last(), "Estimated hours and LOTO set – save", { zoom: 1.3 });
        await s.click(p.getByTestId("to-awaiting_approval"), "Send for approval", { after: confirm(s) });
      },
    },
    {
      id: "06-approve", layout: "app", device: "desktop", chapter: "Work orders", step: "4 · Approve & assign",
      narration: "The supervisor approves it and assigns the technicians. If a technician is on leave, or already booked on another job "
        + "at the same time, the app says so before you assign.",
      async capture(cap) {
        const s = await cap.login("mech.sup");
        const p = s.page;
        await p.goto(state.wo); await s.settle(1200);
        await s.click(p.getByTestId("to-approved"), "Supervisor: approve", { after: confirm(s) });
        await s.quiet(async () => { await p.getByRole("tab", { name: "Details" }).click(); });
        await s.type(p.getByRole("combobox", { name: "Assign", exact: true }), "Ahmed", "Choose the technician", {
          after: async () => { await p.getByRole("option", { name: /Ahmed Saleh/ }).first().click(); },
        });
        await s.click(p.getByRole("button", { name: "Assign", exact: true }), "Assigned – conflicts would be flagged here", { zoom: 1.3 });
      },
    },
    {
      id: "07-execute", layout: "app", device: "desktop", chapter: "Work orders", step: "5 · The work",
      narration: "The technician starts the work. On the tabs they book their hours, record the spare parts fitted, "
        + "and write the findings and the downtime. Photos go under attachments. Labor and parts are costed on the work order straight away.",
      async capture(cap) {
        const s = await cap.login("tech1");
        const p = s.page;
        await p.goto(state.wo); await s.settle(1200);
        // LOTO first: the work cannot start until the isolation is recorded and signed off (shown in the overview video).
        await s.quiet(async () => {
          await p.getByLabel("Isolation point (e.g. MCC-3 breaker Q12)").fill("Fan 1 motor isolator – MCC-1 Q3");
          await p.getByLabel("Lock / tag no.").fill("L-07");
          await p.getByLabel("Zero energy verified").check();
          await p.getByRole("button", { name: "Apply lock" }).click();
          await p.waitForTimeout(800);
        });
        const sup = await cap.login("mech.sup");
        await sup.page.goto(state.wo); await sup.settle(1000);
        await sup.page.getByRole("button", { name: "Sign off LOTO / permit" }).click();
        await sup.settle(800);
        await p.reload(); await s.settle(1200);
        await s.click(p.getByTestId("to-in_progress"), "Technician: LOTO signed off – start the work", { after: confirm(s) });
        await s.click(p.getByRole("tab", { name: "Labor" }), "Labor: book your own hours");
        await s.quiet(async () => { await p.getByLabel("Hours").fill("2.5"); });
        await s.click(p.getByRole("button", { name: "Book labor" }), "Hours booked and costed");
        await s.click(p.getByRole("tab", { name: "Materials" }), "Materials: spare parts used");
        await s.type(p.getByRole("combobox", { name: "Spare part (search code or description)" }), "coupling", "Search the part by code or description", {
          after: async () => { await p.waitForTimeout(1200); await p.getByRole("option", { name: /CPL-ELEM/ }).first().click(); },
        });
        await s.click(p.getByRole("button", { name: "Add part used" }), "Part recorded on the work order");
        await s.quiet(async () => {
          await p.getByRole("tab", { name: "Checklist" }).click();
          await p.getByLabel("Findings").first().fill("Coupling element worn, fan out of balance");
          await p.getByRole("textbox", { name: "Root cause", exact: true }).fill("Element past its service life");
          await p.getByLabel("Downtime hours").fill("2");
        });
        await s.click(p.getByRole("button", { name: "Save" }).first(), "Findings, root cause and downtime");
        await s.quiet(async () => { await p.getByRole("button", { name: "Remove lock" }).click(); await p.waitForTimeout(600); });
        await s.click(p.getByTestId("to-awaiting_review"), "Lock removed – send for review", { after: confirm(s) });
      },
    },
    {
      id: "08-review", layout: "app", device: "desktop", chapter: "Work orders", step: "6 · Review & close",
      narration: "Now the supervisor reviews. Completion is refused while something is missing, and the message says exactly what: "
        + "here, the problem, cause and remedy codes. With the codes in, the work order is completed and closed. "
        + "The history keeps every step, and the PDF report gives the full work order on one document.",
      async capture(cap) {
        const s = await cap.login("mech.sup");
        const p = s.page;
        await p.goto(state.wo); await s.settle(1200);
        await s.click(p.getByTestId("to-completed"), "Complete? Not yet…", {
          after: async () => { await p.getByTestId("transition-confirm").click(); await p.waitForTimeout(1000); },
        });
        await s.quiet(async () => {
          await p.keyboard.press("Escape");
          await p.locator(".mantine-Notification-closeButton").first().click().catch(() => {});
          await pick(p, "Problem", "VIB");
          await pick(p, "Cause", "WEAR");
          await pick(p, "Remedy", "REPL");
        });
        await s.click(p.getByRole("button", { name: "Save" }).first(), "Problem, cause and remedy codes", { zoom: 1.3 });
        await s.click(p.getByTestId("to-completed"), "Complete", { after: confirm(s) });
        await s.click(p.getByTestId("to-closed"), "Close", { after: confirm(s) });
        await s.click(p.getByRole("tab", { name: "History" }), "Every step, who and when");
        await s.click(p.getByRole("tab", { name: "Details" }), "Hours, parts and the total cost");
        await s.view("PDF report of the work order", { focus: p.getByRole("button", { name: "PDF report" }), zoom: 1.5, weight: 0.8 });
      },
    },
    title("09-end", "Work requests & work orders", "Next: technicians on the phone",
      "That is the full life of a work order. Next: how technicians do the same work on the phone, even without internet."),
  ],
};

// ---- Voice, one sentence per filmed step or card ----
require("../_common").applySays(module.exports, {
  "03-requests": ["Work requests are how anyone reports a problem. The supervisor sees the new ones first, with breakdowns marked.",
    "Open a request to see the equipment and what was reported.",
    "Choose the type and the priority, and accept it. A request can also be rejected, with a reason.",
    "Accepting creates the work order."],
  "04-list": ["The work order list is the planner's desk.", "Search by number, title or equipment.",
    "Filter by status and type, or show only open or overdue work.",
    "Tick several work orders to assign, close or cancel them together.",
    "From here you also import a work plan from Excel, and export the list."],
  "05-triage": ["A new work order starts in triage.", "On the details tab, the planner sets dates, estimated hours, priority and supervisor.",
    "And the safety needs: lock-out tag-out, a permit, or a test after the work.", "Then it is sent for approval."],
  "06-approve": ["The supervisor approves it.", "Then chooses the technician.",
    "If the technician is on leave, or already booked at the same time, the app says so before assigning."],
  "07-execute": ["With the lock-out signed off, the technician starts the work.", "On the labor tab, they book their own hours.",
    "The hours are costed at once.", "On the materials tab, they record the spare parts fitted.",
    "Search the part by code or description.", "The part and its cost are on the work order.",
    "Then the findings, the root cause and the downtime.", "The lock is removed, and the work is sent for review."],
  "08-review": ["The supervisor tries to complete it. Refused: the message says exactly what is missing, here the failure codes.",
    "So the problem, cause and remedy codes are added.", "Now it can be completed.", "And closed.",
    "The history keeps every step, with who and when.", "Details shows the hours, the parts and the total cost.",
    "And the PDF report gives the whole work order on one document."],
}, {
  "02-flow": { lead: "Every job follows the same path, and the app only shows the buttons your role may use.", says: [
    "A request is reported, and the supervisor accepts or rejects it.", "The new work order starts in triage, where it is checked and planned.",
    "The supervisor approves it and assigns the technicians.", "The planner sets dates, hours and parts.",
    "Work starts, but only after lock-out and the permit are signed off, when they are required.",
    "When the technician is done, it waits for review.", "Completed means codes, root cause and tests are in place.",
    "Closed is final, and the job counts in the KPIs."] },
});
