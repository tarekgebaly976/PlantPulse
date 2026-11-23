// Cartoon 9 – the finale: Plan, Do, Check, Act across the whole cartoon factory (anim "story", lib/story.js).
// Facts as in video 18: Plan (PM, lubrication, weekly schedule, shutdowns, cutting plan, KPI targets), Do (work orders
// with LOTO and permits, daily production reports, rounds on the phone), Check (KPIs against targets, control charts
// with Nelson rules, insights, alerts, paper waste), Act (RCA actions, changed plans approved by a second person,
// effectiveness checks); what is learned changes the plan; Home every day and the monthly management presentation.
"use strict";

const story = (id, chapter, says, captions, spec) => ({ id, layout: "anim", anim: "story", chapter, says, captions, ...spec });
const G = "#0F766E", R = "#DC2626", A = "#D97706", B = "#2563EB";

module.exports = {
  id: "c09-pdca",
  file: "28-cartoon-plan-do-check-act",
  intro: "Cartoon · Plan, Do, Check, Act",
  title: "PlantPulse cartoon – the whole loop: Plan, Do, Check, Act",
  covers: "Cartoon finale: Plan with PM and lubrication plans, the weekly schedule, shutdowns, the cutting plan and KPI targets; Do with work orders, lock-out and permits and the daily production report; Check with KPIs, control charts and Nelson rules, insights and paper waste; Act with root cause analysis, approved plan changes and the effectiveness check; and the loop that starts again",
  keyframes: [["01-plan", 0.6], ["02-do", 0.6], ["03-check", 0.6], ["04-act", 0.6]],
  scenes: [
    story("01-plan", "Plan", [
      "To finish, the whole story in one loop: plan, do, check, act. First, plan.",
      "PM and lubrication plans, the weekly schedule, shutdowns and the cutting plan are all made in advance. And every KPI has a target: the plan says what good looks like.",
    ], ["Plan · Do · Check · Act", "Plan: what good looks like"], {
      cam: [3270, 540, 1.1],
      cast: { pl: { role: "planner", x: 2630, item: "tablet" }, mgr: { role: "manager", x: 3930, flip: true } },
      beats: [
        { p: 0, at: 0.3, on: "big", card: { title: "The loop", items: [{ kpi: ["Plan", "what good looks like", B] }, { kpi: ["Do", "safely, and recorded", G] }, { kpi: ["Check", "against the target", A] }, { kpi: ["Act", "fix the cause", R] }], stagger: 0.8 } },
        { p: 1, at: 0.2, on: "big", card: { title: "Plan", items: [{ li: "PM and lubrication plans" }, { li: "Weekly schedule – approved twice" }, { li: "Shutdowns – the critical path" }, { li: "Cutting plan – least trim" }, { li: "A target for every KPI", color: B }], stagger: 0.7 } },
        { p: 1, at: 0.6, icon: "calendar", x: 2480, y: 640 },
        { p: 1, at: 1.2, say: "pl", lines: ["Planned ahead"], dx: -40 },
      ],
    }),
    story("02-do", "Do", [
      "Do. The work is done through work orders: approved, assigned, made safe with lock-out and permits, and recorded with hours, parts and findings.",
      "Production records every day the same way: output, stops, losses and quality.",
    ], ["Do: safely, and recorded", "Production – the same way"], {
      cam: [1050, 650, 1.15],
      cast: { tech: { role: "technician", x: 1500, item: "phone" }, op: { role: "operator", x: 640, item: "phone" } },
      beats: [
        { p: 0, at: 0, world: { beacon: "red", running: false } },
        { p: 0, at: 0.2, walk: "tech", to: 1130 },
        { p: 0, at: 1.4, world: { lock: 1 } },
        { p: 0, at: 1.6, pose: "tech", work: 1 },
        { p: 0, at: 2.0, on: "phone", card: { title: "WO-000231", tag: "In progress", items: [{ li: "LOTO signed off ✓", color: "#16A34A" }, { row: ["Hours", "3.5 h"] }, { row: ["Parts", "Bearing ×1"] }, { row: ["Findings", "Bearing worn"] }], stagger: 0.7 } },
        { p: 1, at: 0, pose: "tech", work: 0 },
        { p: 1, at: 0.1, world: { lock: 0, beacon: "green", running: true } },
        { p: 1, at: 0.6, say: "op", lines: ["Day recorded ✓"], color: G },
      ],
    }),
    story("03-check", "Check", [
      "Check. Every KPI is calculated from those records and shown against its target.",
      "The control chart and the Nelson rules show whether a change is real, or just noise. Insights, alerts and paper waste find drifts before they become big problems.",
    ], ["Check: against the target", "Real change, or just noise?"], {
      cam: [3270, 540, 1.1],
      cast: { eng: { role: "engineer", x: 2630, item: "tablet" }, mgr: { role: "manager", x: 3930, flip: true } },
      beats: [
        { p: 0, at: 0.3, on: "big", card: { title: "KPIs", items: [{ kpi: ["PM compliance", "96%", "#16A34A"] }, { kpi: ["MTTR", "2.9 h", A] }, { kpi: ["Grinding mill vibration", "rising", R] }], stagger: 0.7 } },
        { p: 1, at: 0.2, on: "big", card: { title: "Control chart · Nelson rules", items: [{ chart: { pts: [2.1, 2.3, 2.2, 2.4, 2.6, 2.9, 3.3, 3.8, 4.4], warn: 3.0, alarm: 4.0 } }, { badge: ["Rule 3 – seven points rising: a real change", R] }], stagger: 1.0 } },
        { p: 1, at: 2.6, say: "eng", lines: ["That is real!"], color: R, dx: -40 },
      ],
    }),
    story("04-act", "Act", [
      "Act. A major or repeated failure gets a root cause analysis, with actions, owners and due dates. Changes to plans are approved by a second person.",
      "And the loop closes. What is learned changes the plan, and the effectiveness check proves it. If the failure returns, the analysis reopens by itself.",
    ], ["Act: fix the cause", "The loop closes – and starts again"], {
      cam: [3270, 540, 1.1],
      cast: { eng: { role: "engineer", x: 2630, item: "tablet" }, mgr: { role: "manager", x: 3930, flip: true } },
      beats: [
        { p: 0, at: 0.3, on: "big", card: { title: "Root cause analysis · Grinding mill", items: [{ row: ["Root cause", "No lubrication standard", R] }, { row: ["Action", "Lubrication point, 20 g"] }, { row: ["Owner · due", "Engineer · 7 days"] }, { badge: ["Approved by the manager", "#16A34A"] }], stagger: 0.8 } },
        { p: 0, at: 0.8, icon: "fish", x: 2500, y: 360 , until: 1 },
        { p: 1, at: 0.2, on: "big", card: { title: "The loop closes", items: [{ li: "New lubrication point → the PM plan", color: B }, { li: "Effectiveness check: no repeat in 90 days", color: "#16A34A" }, { li: "Returns? The RCA reopens by itself", color: A }], stagger: 0.9 } },
        { p: 1, at: 3.2, say: "mgr", lines: ["Plan again – better"], color: "#16A34A" },
      ],
    }),
    story("05-end", "PlantPulse", [
      "PlantPulse: plan the work, do it safely, check the results, and act on them. One system, for everyone, every day.",
    ], ["Plan · Do · Check · Act – one system"], {
      cam: [1500, 640, 0.65],
      cast: { op: { role: "operator", x: 640 }, tech: { role: "technician", x: 1000, item: "phone" }, sup: { role: "supervisor", x: 1350, item: "clipboard" }, pl: { role: "planner", x: 1700, item: "tablet" }, eng: { role: "engineer", x: 2050, item: "tablet" }, mgr: { role: "manager", x: 2400 }, sk: { role: "storekeeper", x: 300 } },
      beats: [
        { p: 0, at: 0, world: { beacon: "green", running: true } },
        { p: 0, at: 0.3, pose: "sk", wave: 1 }, { p: 0, at: 0.45, pose: "op", wave: 1 }, { p: 0, at: 0.6, pose: "tech", wave: 1 }, { p: 0, at: 0.75, pose: "sup", wave: 1 },
        { p: 0, at: 0.9, pose: "pl", wave: 1 }, { p: 0, at: 1.05, pose: "eng", wave: 1 }, { p: 0, at: 1.2, pose: "mgr", wave: 1 },
        { p: 0, at: 0.2, cam: [1450, 640, 0.8], dur: 6 },
      ],
    }),
  ],
};
