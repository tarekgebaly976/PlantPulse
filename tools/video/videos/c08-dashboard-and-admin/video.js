// Cartoon 8 – the Home dashboard, search, notifications, KPIs and reports, and administration (anim "story").
// Facts as in videos 12 and 14: Home with quick buttons, counters, attention list, KPI tiles and condition alarms,
// counters open their list, customised per person and saved on the server; search with the magnifier or Control K;
// notifications; twenty maintenance KPIs against targets (green / amber / red), Not available with the reason, formula,
// records and a twelve-month control chart; company KPIs from Excel; export to Excel and PDF; the management
// presentation (PowerPoint); users, roles and permissions, Excel import that removes nobody, failure codes, workflow,
// plant settings, daily summary e-mail, integration tokens, audit log, English / Arabic / Bengali, light and dark.
"use strict";

const story = (id, chapter, says, captions, spec) => ({ id, layout: "anim", anim: "story", chapter, says, captions, ...spec });
const G = "#0F766E", R = "#DC2626", A = "#D97706", B = "#2563EB";

module.exports = {
  id: "c08-dashboard-and-admin",
  file: "27-cartoon-dashboard-kpis-and-administration",
  intro: "Cartoon · Dashboard & admin",
  title: "PlantPulse cartoon – the dashboard, KPIs, reports and administration",
  covers: "Cartoon: the Home dashboard with counters that open their lists, customised per person; search and notifications; twenty maintenance KPIs against targets, Not available instead of guesses, formula, records and control chart; company KPIs, Excel and PDF export and the management presentation; users, roles and permissions, Excel import, failure codes, workflow, settings, audit log, languages and dark mode",
  keyframes: [["01-home", 0.6], ["02-kpis", 0.6], ["03-report", 0.6], ["04-admin", 0.95]],
  scenes: [
    story("01-home", "1 · Home", [
      "Every morning starts on Home, the plant's dashboard: quick buttons, counters, the work that needs attention, KPI tiles and condition alarms.",
      "Every counter uses the colour code, and opens exactly the list it counts. Each person can arrange it, and phone and computer show the same.",
      "The magnifier, or Control K, searches everything at once, and notifications bring the alerts, approvals and assignments.",
    ], ["Home: everything that needs attention", "Counters open their lists", "Search and notifications"], {
      cam: [1050, 650, 1.15],
      cast: { sup: { role: "supervisor", x: 1130, item: "phone" } },
      beats: [
        { p: 0, at: 0.3, pose: "sup", raise: 0.8 },
        { p: 0, at: 0.6, on: "phone", card: { title: "Home", tag: "Today", items: [{ kpi: ["Overdue work orders", "4", R] }, { kpi: ["Waiting approval", "3", A] }, { kpi: ["PM due this week", "12", G] }, { kpi: ["Condition alarms", "1", R] }], stagger: 0.7 } },
        { p: 0, at: 3.4, say: "sup", lines: ["Good morning!"] },
        { p: 1, at: 0.2, on: "phone", card: { title: "Overdue work orders · 4", items: [{ li: "WO-000231 · Press section", color: R }, { li: "WO-000244 · Rewinder guard", color: R }, { li: "WO-000247 · Pump P-12", color: R }, { li: "WO-000250 · Dryer hood", color: R }], stagger: 0.6 } },
        { p: 1, at: 2.6, say: "sup", lines: ["One tap – the list"], color: G },
        { p: 2, at: 0.2, on: "phone", card: { title: "Search · Ctrl K", items: [{ row: ["Type", "mtr-01 bearing"] }, { li: "MTR-01 · Drive motor", color: B }, { li: "Bearing 6312 · spare part", color: B }, { h: "Notifications" }, { li: "WO-000260 needs your approval", color: A }], stagger: 0.7 } },
      ],
    }),
    story("02-kpis", "2 · KPIs", [
      "KPIs and reports shows twenty maintenance KPIs, calculated from the records. Each one against its target: green met, amber close, red missed.",
      "Missing data says Not available, and why. Nothing is estimated.",
      "Open a KPI to see its formula, the records behind it, and a twelve-month control chart with the target.",
    ], ["Twenty KPIs against targets", "Not available – never guessed", "Formula, records, control chart"], {
      cam: [3270, 540, 1.1],
      cast: { mgr: { role: "manager", x: 3930, flip: true }, eng: { role: "engineer", x: 2630, item: "tablet" } },
      beats: [
        { p: 0, at: 0.3, on: "big", card: { title: "KPIs and reports · this month", items: [{ kpi: ["PM compliance", "96% · target 95%", "#16A34A"] }, { kpi: ["MTTR", "2.9 h · target 2.5 h", A] }, { kpi: ["Breakdown hours", "41 h · target 30 h", R] }, { kpi: ["Planned work", "78% · target 80%", A] }], stagger: 0.7 } },
        { p: 0, at: 1.0, say: "eng", lines: ["Green, amber, red"], dx: -60 },
        { p: 1, at: 0.2, on: "big", card: { title: "Cost per ton", items: [{ badge: ["Not available", "#64748B"] }, { li: "Production tonnage not entered for this month", color: "#64748B", tick: false }], stagger: 0.8 } },
        { p: 1, at: 1.6, say: "mgr", lines: ["No guessing ✓"], color: G },
        { p: 2, at: 0.2, on: "big", card: { title: "MTTR · 12 months", items: [{ row: ["Formula", "repair hours ÷ repairs"] }, { chart: { pts: [3.4, 3.1, 3.2, 2.9, 2.8, 3.0, 2.7, 2.6, 2.8, 2.6, 2.7, 2.9], warn: 2.5 } }, { li: "Open the records behind it", color: B }], stagger: 0.9 } },
      ],
    }),
    story("03-report", "3 · The monthly review", [
      "The plant's own KPI sheet goes in Company KPIs, entered or uploaded from Excel. Every KPI exports to Excel and PDF.",
      "And the management presentation builds a PowerPoint deck in your language: the scorecard, trends, bad actors, costs, and the plan for the next period.",
    ], ["Company KPIs – Excel and PDF", "The management presentation"], {
      cam: [3270, 540, 1.1],
      cast: { mgr: { role: "manager", x: 3930, flip: true }, eng: { role: "engineer", x: 2630, item: "tablet" } },
      beats: [
        { p: 0, at: 0.3, on: "big", card: { title: "Company KPIs", items: [{ row: ["Upload", "Plant KPI sheet.xlsx", G] }, { row: ["Month", "October"] }, { li: "Export · Excel · PDF", color: B }], stagger: 0.8 } },
        { p: 0, at: 1.6, icon: "paper", x: 2500, y: 360, label: "Excel" },
        { p: 1, at: 0.2, on: "big", card: { title: "Management presentation", tag: "PowerPoint", items: [{ li: "Scorecard" }, { li: "Trends" }, { li: "Bad actors" }, { li: "Costs" }, { li: "Plan for next month" }], stagger: 0.6 } },
        { p: 1, at: 3.4, say: "mgr", lines: ["Ready for the meeting!"], color: "#16A34A" },
      ],
    }),
    story("04-admin", "4 · Behind the scenes", [
      "The administrator sets up the users, with their role, departments and trade. A whole team can be added from Excel, and nobody is removed by an import. Roles and permissions show exactly what each role may do.",
      "Failure codes, the workflow and the plant's settings, like time zone, currency and labour rate, are set once. The audit log records who changed what, and when.",
      "And every user picks English, Arabic or Bengali, right to left where needed, and light or dark mode.",
    ], ["Users, roles and permissions", "Codes, workflow, settings, audit log", "English, Arabic, Bengali – light or dark"], {
      cam: [2150, 640, 1.2],
      cast: { eng: { role: "engineer", x: 2580, item: "tablet", flip: true }, tech: { role: "technician", x: 1600, item: "phone" } },
      beats: [
        { p: 0, at: 0.3, on: "tv", card: { title: "Users", items: [{ row: ["Ahmed", "Technician · Mechanical"] }, { row: ["Imran", "Technician · Electrical"] }, { row: ["Sara", "Planner"] }, { row: ["Import", "Team.xlsx – nobody removed", G] }], stagger: 0.8 } },
        { p: 0, at: 1.0, say: "eng", lines: ["Everyone in their place"] },
        { p: 1, at: 0.2, on: "tv", card: { title: "Administration", items: [{ row: ["Failure codes", "problem · cause · remedy"] }, { row: ["Workflow", "allowed status changes"] }, { row: ["Settings", "time zone · currency · rate"] }, { row: ["Audit log", "who changed what, when", B] }], stagger: 0.8 } },
        { p: 2, at: 0, cam: [1150, 650, 1.2], dur: 1.6 },
        { p: 2, at: 0.2, walk: "tech", to: 1130 },
        { p: 2, at: 1.0, pose: "tech", raise: 0.8 },
        { p: 2, at: 1.2, on: "phone", card: { title: "My profile", items: [{ h: "Language" }, { li: "English · العربية · বাংলা", tick: false }, { row: ["Theme", "Light · Dark"] }, { badge: ["العربية ✓", G] }], stagger: 0.8 } },
        { p: 2, at: 3.0, say: "tech", lines: ["أهلاً!"], color: G },
      ],
    }),
    story("05-end", "PlantPulse", [
      "Every number from the records, and every setting in one place. To finish: how it all closes the loop.",
    ], ["Every number from the records"], {
      cam: [2600, 640, 0.75],
      cast: { sup: { role: "supervisor", x: 1900, item: "clipboard" }, tech: { role: "technician", x: 2300, item: "phone" }, eng: { role: "engineer", x: 2700, item: "tablet" }, mgr: { role: "manager", x: 3100 } },
      beats: [{ p: 0, at: 0.3, pose: "sup", wave: 1 }, { p: 0, at: 0.5, pose: "tech", wave: 1 }, { p: 0, at: 0.7, pose: "eng", wave: 1 }, { p: 0, at: 0.9, pose: "mgr", wave: 1 }, { p: 0, at: 0.2, cam: [2600, 640, 0.9], dur: 5 }],
    }),
  ],
};
