// Video 14 – The production module (demo paper mill DPM): everything production users and production data do.
"use strict";
const { title, applySays } = require("../_common");

const openDay = async (s, status) => {
  await s.goto("/operations");
  await s.page.getByRole("row").filter({ hasText: status }).first().click();
  await s.settle(1500);
};

module.exports = {
  id: "production",
  file: "14-production-module",
  intro: "The production module",
  title: "PlantPulse – The production module",
  covers: "Production dashboard by area, the daily production report (shifts, runs, stops and sheet breaks, reels, quality), raising a work request from a breakdown stop, submit and confirm, print, utilities daily logs, production KPIs, production insights and alert rules, safety incidents and safety rates, production setup",
  keyframes: [["03-dashboard", 0.4], ["04-report", 0.5], ["06-kpis", 0.5], ["08-safety", 0.5]],
  scenes: [
    title("01-title", "The production module", "Production days, losses and KPIs – next to maintenance",
      "The production module. Production records its days, stops, quality and safety in the same system as maintenance, so both sides see the same truth."),
    {
      id: "02-how", layout: "cards", chapter: "How it works", title: "From a production day to an action",
      cards: [
        { t: "Setup", d: "Areas, lines, products, loss categories, KPIs, alert rules" },
        { t: "Daily report", d: "Shifts, runs, stops, reels and quality, per line and day" },
        { t: "Breakdowns", d: "A breakdown stop raises a maintenance work request" },
        { t: "Submit & confirm", d: "The supervisor submits, the manager confirms and locks" },
        { t: "Daily logs", d: "Utilities, stock preparation and checks" },
        { t: "KPIs", d: "OEE, production, quality, losses – against targets" },
        { t: "Insights", d: "Rules that spot drifts and repeated losses, with actions" },
        { t: "Safety", d: "Incidents, actions and safety rates" },
      ],
    },
    {
      id: "03-dashboard", layout: "app", device: "desktop", chapter: "Production", step: "1 · Dashboard",
      async capture(cap) {
        const s = await cap.login("prod.mgr");
        const p = s.page;
        await s.goto("/operations/dashboard");
        await s.view("Every area at a glance", { weight: 1.2 });
        await s.view("KPI tiles with target and trend", { focus: p.getByText("OEE · PM1").first(), zoom: 1.4 });
        await s.click(p.getByText("7 days", { exact: true }), "Period: 7, 30 or 90 days");
      },
    },
    {
      id: "04-report", layout: "app", device: "desktop", chapter: "Production", step: "2 · Daily report",
      async capture(cap) {
        const s = await cap.login("prod.sup");
        const p = s.page;
        await s.goto("/operations");
        await s.view("Month to date, and one line per day", { weight: 1.1 });
        await s.click(p.getByRole("row").filter({ hasText: "Confirmed" }).nth(2), "Open a day", { wait: 1800 });
        await s.click(p.getByRole("button", { name: "Stops and sheet breaks" }), "Stops and sheet breaks", { wait: 900 });
        await s.click(p.getByRole("button", { name: "Reels" }).first(), "Reels: gross, net, reject, grades", { wait: 900 });
        await s.click(p.getByRole("button", { name: /Quality: rejects/ }).first(), "Quality: rejects and downgrades", { wait: 900 });
      },
    },
    {
      id: "05-confirm", layout: "app", device: "desktop", chapter: "Production", step: "3 · Submit & confirm",
      async capture(cap) {
        const s = await cap.login("prod.mgr");
        const p = s.page;
        await openDay(s, "Submitted");
        await s.view("Submitted: the manager can still correct it", { weight: 1.1 });
        await s.view("Confirm and lock – or return to draft", { focus: p.getByRole("button", { name: "Confirm and lock" }), zoom: 1.6 });
        await s.click(p.getByRole("link", { name: "Utilities daily report" }), "Utilities daily report", { wait: 1500 });
      },
    },
    {
      id: "06-kpis", layout: "app", device: "desktop", chapter: "Production", step: "4 · KPIs & insights",
      async capture(cap) {
        const s = await cap.login("prod.mgr");
        const p = s.page;
        await s.goto("/operations/kpis");
        await s.view("Production KPIs against their targets", { weight: 1.2 });
        await s.click(p.getByRole("link", { name: "Production insights" }), "Production insights", { wait: 1500 });
        await s.view("Each insight comes with an action", { focus: p.getByRole("button", { name: "Action" }).first(), zoom: 1.3 });
      },
    },
    {
      id: "08-safety", layout: "app", device: "desktop", chapter: "Production", step: "5 · Safety",
      async capture(cap) {
        const s = await cap.login("prod.mgr");
        const p = s.page;
        await s.goto("/operations/incidents");
        await s.view("Days without a lost-time incident, and the safety rates", { weight: 1.2 });
        await s.click(p.getByRole("button", { name: "Report incident" }), "Report an incident", { wait: 1000 });
        await s.quiet(async () => { await p.keyboard.press("Escape"); await p.waitForTimeout(400); });
        await s.click(p.getByRole("link", { name: "Production setup" }), "Production setup, step by step", { wait: 1500 });
      },
    },
    title("09-end", "The production module", "Next: PDCA – how PlantPulse closes the loop",
      "That is the production module. To finish: how PlantPulse closes the loop, with Plan, Do, Check, Act."),
  ],
};

applySays(module.exports, {
  "03-dashboard": ["The production dashboard shows every area of the mill: its status, what is off target, and its incidents.",
    "Every KPI tile shows the result, the target and the trend. The production manager can customise the layout for everyone.",
    "Choose the period: seven, thirty or ninety days, for the whole mill or one area."],
  "04-report": ["The daily report keeps one line per production day: output, quality, run time, OEE, breaks and downtime, with the month to date on top.",
    "Open a day. The supervisor fills it in during the day: shift production and machine runs.",
    "Every stop and sheet break, with its time, section and responsible discipline. A breakdown stop can raise a maintenance work request with one click.",
    "The reels, with gross, net, reject and grades.", "And the quality lines: rejects and downgrades with their defect. Totals and OEE are calculated."],
  "05-confirm": ["When the day is over, the supervisor submits it to the manager, who can still correct it.",
    "The manager confirms and locks it, or returns it to draft. Reopening a confirmed day makes a new revision, with the reason kept.",
    "Utilities, stock preparation and checks have their own daily log forms, with totals and warnings calculated."],
  "06-kpis": ["Production KPIs are worked out from the reports and logs, each against its target, for yesterday, the last seven days or the month.",
    "Production insights compare the last week with the weeks before, using alert rules.",
    "Each insight, like a rising reject rate or a repeated loss, comes with an action and an owner."],
  "08-safety": ["One safety register for the whole plant: days without a lost-time incident, and the rates per million hours worked.",
    "Incidents are reported here or from the shift logs, and followed up with actions.",
    "And production setup guides the configuration step by step: areas, lines, products, loss categories, KPIs, quality defects and daily log forms."],
}, {
  "02-how": { lead: "From a production day to an action.", says: [
    "Setup describes the plant: areas, lines, products, loss categories, KPIs and alert rules.",
    "Each day, each line gets a report: shifts, runs, stops, reels and quality.",
    "A breakdown stop can raise a maintenance work request directly.",
    "The supervisor submits the day, and the manager confirms and locks it.",
    "Utilities and stock preparation keep their own daily logs.",
    "KPIs like OEE, production and quality are calculated against targets.",
    "Insights spot drifts and repeated losses, and turn them into actions.",
    "And safety incidents and safety rates are kept in one register."] },
});
