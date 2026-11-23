// Cartoon 2 – preventive maintenance and lubrication in the cartoon factory (anim "story", lib/story.js).
// Facts as in videos 04 and 05: job plan + PM plan (calendar or running hours, fixed or from last completion), work
// order made days ahead and never twice, checklist with readings flagged out of range, PM compliance with tolerance,
// deferral approved by someone else; lubrication points (lubricant, amount, method, frequency), routes as one work
// order, actual quantity per point, only the specified lubricant or an approved alternative, consumption, QR labels.
"use strict";

const story = (id, chapter, says, captions, spec) => ({ id, layout: "anim", anim: "story", chapter, says, captions, ...spec });

module.exports = {
  id: "c02-pm-and-lubrication",
  file: "21-cartoon-preventive-maintenance-and-lubrication",
  intro: "Cartoon · PM & lubrication",
  title: "PlantPulse cartoon – preventive maintenance and lubrication",
  covers: "Cartoon: job plans and PM plans (calendar or running hours, fixed or from the last completion), work orders made days ahead and never twice with the checklist inside, readings flagged out of range, PM compliance, deferral approved by another person; lubrication points, routes as one work order, actual quantities, only the specified lubricant or an approved alternative, consumption and QR labels",
  keyframes: [["01-plans", 0.6], ["02-do", 0.3], ["03-lube", 0.55], ["03-lube", 0.85]],
  scenes: [
    story("01-plans", "1 · Plan once", [
      "Preventive maintenance works in two steps. A job plan describes the work: the tasks, readings with limits, safety precautions and tools.",
      "A PM plan links it to a machine and says how often: by the calendar or by running hours, from a fixed date or from the last completion.",
      "PlantPulse then creates the work order a set number of days before it is due, never twice, with the tasks as its checklist.",
    ], ["Job plan: tasks, readings, safety, tools", "PM plan: which machine, how often", "Work orders on time – never twice"], {
      cam: [3250, 540, 1.12],
      cast: { pl: { role: "planner", x: 2630, item: "tablet" } },
      beats: [
        { p: 0, at: 0.4, on: "big", card: { title: "Job plan · Gearbox inspection", items: [{ li: "Check the oil level" }, { li: "Bearing temperature – max 80 °C", color: "#2563EB" }, { li: "Check the coupling" }, { row: ["Safety", "LOTO", "#DC2626"] }, { row: ["Tools", "Torque wrench"] }], stagger: 0.8 } },
        { p: 0, at: 1.0, say: "pl", lines: ["Describe it once"], dx: -80 },
        { p: 1, at: 0.2, on: "big", card: { title: "PM plan · Drive motor", tag: "PM", items: [{ row: ["Equipment", "MTR-01 · Drive motor"] }, { row: ["Job plan", "Gearbox inspection"] }, { row: ["Every", "3 months", "#0F766E"] }, { row: ["or", "2,000 running hours", "#0F766E"] }, { row: ["Counted from", "Last completion"] }, { row: ["Work order made", "7 days ahead"] }], stagger: 0.7 } },
        { p: 1, at: 1.0, say: "pl", lines: ["Calendar or hours"], dx: -80 },
        { p: 2, at: 0.2, icon: "calendar", x: 2500, y: 640, scale: 1.2 },
        { p: 2, at: 0.6, on: "big", card: { title: "Schedule", items: [{ li: "WO-000245 · Gearbox inspection · due Thu" }, { li: "3 tasks in its checklist" }, { li: "Never created twice" }, { badge: ["On time, automatically", "#16A34A"] }], stagger: 0.8 } },
        { p: 2, at: 1.2, say: "pl", lines: ["It comes by itself!"], color: "#16A34A", dx: -80 },
      ],
    }),
    story("02-do", "2 · Do and check", [
      "On the day, the technician opens it on the phone and works through the checklist. A reading out of range is flagged at once.",
      "Done on time, within its tolerance, it counts in PM compliance.",
      "If a PM cannot be done on its date, the planner asks for a deferral with a reason, and the manager approves it. Nobody approves their own request.",
    ], ["The checklist on the phone", "On time – PM compliance", "Deferral: asked and approved by two people"], {
      cam: [1050, 650, 1.2],
      cast: { tech: { role: "technician", x: 1500, item: "phone" }, pl: { role: "planner", x: 2630, item: "tablet" }, mgr: { role: "manager", x: 3930, flip: true } },
      beats: [
        { p: 0, at: 0.1, walk: "tech", to: 1130 },
        { p: 0, at: 0.6, on: "phone", card: { title: "WO-000245 · PM", tag: "In progress", items: [{ li: "Check the oil level" }, { li: "Bearing temp. 86 °C – over 80", color: "#DC2626" }, { badge: ["Out of range – flagged", "#DC2626"] }, { li: "Check the coupling", p: 0, at: 5.0 }], stagger: 0.9 } },
        { p: 0, at: 2.6, say: "tech", lines: ["86 °C – flagged!"], color: "#DC2626" },
        { p: 1, at: 0, cam: [3270, 540, 1.1], dur: 1.6 },
        { p: 1, at: 0.4, on: "big", card: { title: "KPIs", items: [{ kpi: ["PM compliance", "96%", "#16A34A"] }, { kpi: ["Done on time", "48 of 50", "#16A34A"] }] } },
        { p: 1, at: 1.0, say: "mgr", lines: ["96% on time"], color: "#16A34A" },
        { p: 2, at: 0.3, on: "big", card: { title: "Deferral request · WO-000251", tag: "Waiting", items: [{ row: ["Reason", "Line running a big order"] }, { row: ["New date", "Next Tuesday"] }, { row: ["Asked by", "Planner"] }, { badge: ["Approved by the manager", "#16A34A"], p: 2, at: 6.0 }], stagger: 0.7 } },
        { p: 2, at: 0.6, say: "pl", lines: ["Can we move it?"], dx: -80 },
        { p: 2, at: 6.0, say: "mgr", lines: ["Approved ✓"], color: "#16A34A" },
      ],
    }),
    story("03-lube", "3 · Lubrication", [
      "Lubrication works the same way. Each point says which lubricant, how much, by what method and how often.",
      "Points are grouped into routes. When points are due, the route becomes one work order.",
      "The technician records each point with the quantity actually applied. Only the specified lubricant, or an approved alternative, is accepted.",
      "Consumption shows how much of each lubricant was used, and QR labels are printed for each route.",
    ], ["Each point: lubricant, amount, method, frequency", "Due points – one route work order", "Actual quantity – right lubricant only", "Consumption and QR labels"], {
      cam: [-560, 640, 1.15],
      cast: { tech: { role: "technician", x: -880, item: "phone" }, sk: { role: "storekeeper", x: -120, flip: true } },
      beats: [
        { p: 0, at: 0.3, on: "pop", card: { title: "Lubrication point", items: [{ row: ["Point", "Drive motor – DE bearing"] }, { row: ["Lubricant", "Grease EP2", "#B45309"] }, { row: ["Amount", "20 g"] }, { row: ["Method", "Grease gun"] }, { row: ["Every", "2 weeks", "#0F766E"] }], stagger: 0.7 } },
        { p: 0, at: 0.6, say: "sk", lines: ["Grease EP2 is here"] },
        { p: 1, at: 0.2, walk: "tech", to: -430 },
        { p: 1, at: 0.3, on: "pop", card: { title: "Route · Press section", items: [{ li: "6 points due this week" }, { li: "Grouped in one route" }, { badge: ["One route work order created", "#16A34A"] }], stagger: 0.8 } },
        { p: 1, at: 1.6, icon: "drop", x: -470, y: 760, to: [-430, 690], dur: 0.8 },
        { p: 2, at: 0, cam: [1000, 650, 1.2], dur: 1.6 },
        { p: 2, at: 0, walk: "tech", to: 1120 },
        { p: 2, at: 0.6, on: "phone", card: { title: "Route · Press section", tag: "Lubrication", items: [{ li: "Point 1 – 20 g applied" }, { li: "Point 2 – 18 g applied" }, { row: ["Lubricant", "Grease EP2 ✓", "#16A34A"] }, { badge: ["Other grease – not accepted", "#DC2626"] }], stagger: 1.0 } },
        { p: 2, at: 3.4, say: "tech", lines: ["Only the right grease"], color: "#B45309" },
        { p: 3, at: 0, cam: [3270, 540, 1.1], dur: 1.6 },
        { p: 3, at: 0.4, on: "big", card: { title: "Lubricant consumption", items: [{ kpi: ["Grease EP2", "1.2 kg", "#B45309"] }, { kpi: ["Gear oil VG 220", "14 L", "#2563EB"] }, { li: "QR labels printed for every route", color: "#0F766E" }], stagger: 0.8 } },
        { p: 3, at: 2.0, icon: "tag", x: 2560, y: 640, label: "QR label" },
      ],
    }),
    story("04-end", "PlantPulse", [
      "Plan it once, and PlantPulse brings the work on time, with the right lubricant every time. Next: equipment, QR labels and spare parts.",
    ], ["Plan once – on time, every time"], {
      cam: [1000, 640, 0.8],
      cast: { tech: { role: "technician", x: 1150, item: "phone" }, pl: { role: "planner", x: 1550, item: "tablet" }, sk: { role: "storekeeper", x: 300 } },
      beats: [{ p: 0, at: 0.3, pose: "tech", wave: 1 }, { p: 0, at: 0.5, pose: "pl", wave: 1 }, { p: 0, at: 0.7, pose: "sk", wave: 1 }, { p: 0, at: 0.2, cam: [1000, 640, 0.95], dur: 5 }],
    }),
  ],
};
