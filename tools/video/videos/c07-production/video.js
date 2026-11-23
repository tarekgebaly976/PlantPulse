// Cartoon 7 – production, paper waste and the cutting plan in the cartoon factory (anim "story", lib/story.js).
// Facts as in videos 13 and 15: the daily report (shift production, runs, stops and sheet breaks with time, section and
// responsible discipline, a breakdown stop raising a work request with one click, reels gross / net / reject / grade,
// quality lines, totals and OEE), submitted by the supervisor, confirmed and locked by the manager or returned to
// draft, reopening makes a revision with a reason; KPIs against targets, insights with an action and an owner; the
// safety register (days without a lost-time incident, rates per million hours); paper waste from the reel reports;
// the cutting plan (jumbo width, up to six reels a set, trim limits, Calculate, planned against actual trim, the
// converting schedule flagging late orders, release locks the plan).
"use strict";

const story = (id, chapter, says, captions, spec) => ({ id, layout: "anim", anim: "story", chapter, says, captions, ...spec });
const G = "#0F766E", R = "#DC2626", A = "#D97706", B = "#2563EB";

module.exports = {
  id: "c07-production",
  file: "26-cartoon-production-and-the-cutting-plan",
  intro: "Cartoon · Production",
  title: "PlantPulse cartoon – the production day, OEE, paper waste and the cutting plan",
  covers: "Cartoon: the daily production report with shifts, runs, stops and sheet breaks, a breakdown stop raising a work request, reels and quality, totals and OEE; submit, confirm and lock, revisions with a reason; production KPIs against targets and insights with actions; the safety register; paper waste from the reel reports; the winder's cutting plan with patterns, planned against actual trim, the converting schedule, and release",
  keyframes: [["01-day", 0.75], ["02-lock", 0.6], ["03-kpis", 0.6], ["04-cut", 0.6]],
  scenes: [
    story("01-day", "1 · The production day", [
      "Production records its day in the same system as maintenance. Each line gets a daily report: shift production and machine runs.",
      "Every stop and sheet break, with its time, section and responsible discipline.",
      "A breakdown stop can raise a maintenance work request with one click.",
      "Then the reels, with gross, net, reject and grade, and the quality lines. Totals and OEE are calculated.",
    ], ["One daily report per line", "Every stop and sheet break", "Breakdown → work request, one click", "Reels, quality – OEE calculated"], {
      cam: [760, 640, 1.15],
      cast: { op: { role: "operator", x: 640, item: "phone" }, sup: { role: "supervisor", x: 2580, item: "clipboard", flip: true } },
      beats: [
        { p: 0, at: 0.2, world: { beacon: "green", running: true } },
        { p: 0, at: 0.3, pose: "op", raise: 0.8 },
        { p: 0, at: 0.6, on: "phone", card: { title: "Daily report · PM1", tag: "Draft", items: [{ row: ["Shift A", "212 t"] }, { row: ["Shift B", "205 t"] }, { row: ["Run", "Grade 80 g"] }], stagger: 0.8 } },
        { p: 1, at: 0, world: { beacon: "red", running: false } },
        { p: 1, at: 0.3, say: "op", lines: ["Sheet break!"], color: R },
        { p: 1, at: 0.8, on: "phone", card: { title: "Stops", items: [{ row: ["Sheet break · 10:42", "Press · 18 min", R] }, { row: ["Discipline", "Production"] }, { row: ["Felt change · 14:05", "Dryer · 45 min", A] }], stagger: 0.8 } },
        { p: 1, at: 3.0, world: { beacon: "green", running: true } },
        { p: 2, at: 0.1, world: { beacon: "amber", running: false } },
        { p: 2, at: 0.3, on: "phone", card: { title: "Stop · 16:20 · Drive motor", items: [{ row: ["Discipline", "Mechanical", A] }, { btn: ["Raise work request", R] }, { badge: ["Work request sent to maintenance ✓", "#16A34A"], p: 2, at: 2.0 }] } },
        { p: 2, at: 2.4, icon: "paper", x: 900, y: 600, to: [2300, 620], dur: 1.6, label: "Work request", until: 3 },
        { p: 3, at: 0, world: { beacon: "green", running: true } },
        { p: 3, at: 0.3, on: "phone", card: { title: "Daily report · PM1", tag: "Totals", items: [{ row: ["Reels · gross / net", "417 t / 401 t"] }, { row: ["Reject", "16 t", A] }, { row: ["Downgrade · holes", "4 t", A] }, { kpi: ["OEE", "81%", G] }], stagger: 0.8 } },
        { p: 3, at: 3.6, say: "op", lines: ["OEE 81%"], color: G },
      ],
    }),
    story("02-lock", "2 · Confirmed and locked", [
      "At the end of the day, the supervisor submits the report. The manager can still correct it, then confirms and locks it, or returns it to draft.",
      "Reopening a confirmed day makes a new revision, and the reason is kept.",
    ], ["Submitted, confirmed, locked", "Reopened? A new revision, with the reason"], {
      cam: [2150, 640, 1.2],
      cast: { sup: { role: "supervisor", x: 1600, item: "clipboard" }, mgr: { role: "manager", x: 2600, flip: true } },
      beats: [
        { p: 0, at: 0.3, on: "tv", card: { title: "Daily report · PM1 · Tue", tag: "Submitted", items: [{ row: ["Production", "417 t"] }, { row: ["OEE", "81%", G] }, { badge: ["Confirmed and locked by the manager", "#16A34A"], p: 0, at: 5.0 }], stagger: 0.8 } },
        { p: 0, at: 0.6, say: "sup", lines: ["Submitted"] },
        { p: 0, at: 5.2, say: "mgr", lines: ["Confirmed ✓"], color: "#16A34A" },
        { p: 1, at: 0.2, on: "tv", card: { title: "Daily report · PM1 · Tue", tag: "Revision 2", items: [{ row: ["Reopened by", "Manager"] }, { row: ["Reason", "Reel weight corrected"] }, { li: "Revision 1 kept in the history", color: "#64748B" }], stagger: 0.8 } },
      ],
    }),
    story("03-kpis", "3 · How did we do?", [
      "Production KPIs are worked out from the reports, each against its target: production, OEE and quality.",
      "Insights compare the last week with the weeks before, and turn a drift, like a rising reject rate, into an action with an owner.",
      "One safety register for the whole plant: days without a lost-time incident, and the rates per million hours worked.",
    ], ["KPIs against targets", "Insights – an action and an owner", "Safety: one register"], {
      cam: [3270, 540, 1.1],
      cast: { mgr: { role: "manager", x: 3930, flip: true }, eng: { role: "engineer", x: 2630, item: "tablet" } },
      beats: [
        { p: 0, at: 0.3, on: "big", card: { title: "Production KPIs · last 7 days", items: [{ kpi: ["Production", "2,860 t · target 2,800", "#16A34A"] }, { kpi: ["OEE", "79% · target 82%", A] }, { kpi: ["Reject rate", "3.9% · target 3%", R] }], stagger: 0.8 } },
        { p: 0, at: 2.8, say: "mgr", lines: ["Rejects are up"], color: R },
        { p: 1, at: 0.2, on: "big", card: { title: "Insight · reject rate rising", items: [{ chart: { pts: [2.8, 2.9, 3.0, 2.9, 3.3, 3.6, 3.9], warn: 3.0, alarm: 3.8 } }, { row: ["Action", "Check the press felts"] }, { row: ["Owner", "Production engineer", B] }], stagger: 0.9 } },
        { p: 1, at: 3.2, say: "eng", lines: ["I'll take it"], dx: -60 },
        { p: 2, at: 0.2, on: "big", card: { title: "Safety", items: [{ kpi: ["Days without a lost-time incident", "214", "#16A34A"] }, { kpi: ["Incident rate per million hours", "1.2", G] }, { li: "Incidents followed up with actions", color: "#64748B" }], stagger: 0.8 } },
        { p: 2, at: 2.4, say: "mgr", lines: ["214 safe days!"], color: "#16A34A" },
      ],
    }),
    story("04-cut", "4 · Cut the trim", [
      "Paper waste is read from the reel reports: trim, reject and total waste, for each paper machine, week by week.",
      "The cutting plan sets up the winder: the jumbo width, up to six reels a set, and the trim limits. The orders are reels by width, or sheets by width and length.",
      "Press Calculate. The optimiser picks the cutting patterns and how many sets of each, and shows the planned trim beside the actual trim from the reports.",
      "The converting schedule flags any order that would be late. When the plan is right, it is released, and locked.",
    ], ["Paper waste – week by week", "The winder and the orders", "Calculate: patterns, less trim", "Converting on time – released"], {
      cam: [3270, 540, 1.1],
      cast: { pl: { role: "planner", x: 2630, item: "tablet" }, mgr: { role: "manager", x: 3930, flip: true } },
      beats: [
        { p: 0, at: 0.3, on: "big", card: { title: "Paper waste · PM1", items: [{ row: ["Trim", "2.6%", A] }, { row: ["Reject", "3.1%", A] }, { kpi: ["Total waste · this week", "5.7%", R] }], stagger: 0.8 } },
        { p: 0, at: 2.6, say: "mgr", lines: ["Too much trim"], color: A },
        { p: 1, at: 0.2, on: "big", card: { title: "Cutting plan · PM1 · 80 g", items: [{ row: ["Jumbo width", "5,200 mm"] }, { row: ["Reels per set", "up to 6"] }, { row: ["Orders", "Reels 1,600 · 1,250 mm"] }, { row: ["", "Sheets 700 × 1,000 mm"] }], stagger: 0.7 } },
        { p: 1, at: 1.0, say: "pl", lines: ["The orders are in"], dx: -60 },
        { p: 2, at: 0.2, on: "big", card: { title: "Cutting patterns", tag: "Calculated", items: [{ bar: ["1,600 · 1,600 · 1,600 · 400", 0, 0.99, G] }, { bar: ["1,250 × 4", 0, 0.96, B] }, { kpi: ["Planned trim", "1.1%", "#16A34A"] }, { kpi: ["Actual trim (reports)", "2.6%", A] }], stagger: 0.8 } },
        { p: 2, at: 0.4, say: "pl", lines: ["Calculate!"], dx: -60 },
        { p: 3, at: 0.2, on: "big", card: { title: "Converting schedule", tag: "Released", items: [{ bar: ["Sheeter 1", 0.05, 0.5, G] }, { bar: ["Rewinder", 0.2, 0.45, B] }, { li: "All orders on time ✓", color: "#16A34A" }, { badge: ["Released – locked", "#16A34A"], p: 3, at: 2.6 }], stagger: 0.8 } },
        { p: 3, at: 3.0, say: "mgr", lines: ["Released ✓"], color: "#16A34A" },
      ],
    }),
    story("05-end", "PlantPulse", [
      "Production and maintenance on the same records, so both sides see the same truth. Next: the dashboard, KPIs and administration.",
    ], ["One truth for production and maintenance"], {
      cam: [1400, 640, 0.75],
      cast: { op: { role: "operator", x: 640 }, tech: { role: "technician", x: 1120, item: "phone" }, sup: { role: "supervisor", x: 1500, item: "clipboard" }, pl: { role: "planner", x: 1900, item: "tablet" } },
      beats: [{ p: 0, at: 0.3, pose: "op", wave: 1 }, { p: 0, at: 0.5, pose: "tech", wave: 1 }, { p: 0, at: 0.7, pose: "sup", wave: 1 }, { p: 0, at: 0.9, pose: "pl", wave: 1 }, { p: 0, at: 0.2, cam: [1300, 640, 0.9], dur: 5 }],
    }),
  ],
};
