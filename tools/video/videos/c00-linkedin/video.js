// Cartoon teaser for a LinkedIn post (about a minute): the whole program in six quick beats, captions for muted
// autoplay, ending on the demo address. Facts as in the cartoon series 1–13.
"use strict";

const story = (id, chapter, says, captions, spec) => ({ id, layout: "anim", anim: "story", chapter, says, captions, ...spec });
const G = "#0F766E", R = "#DC2626", A = "#D97706", B = "#2563EB";

module.exports = {
  id: "c00-linkedin",
  file: "00-plantpulse-in-one-minute",
  intro: "PlantPulse in one minute",
  title: "PlantPulse in one minute",
  covers: "Teaser: a problem reported from the phone, a safe work order with lock-out, work offline, preventive work and the weekly schedule, condition monitoring with the Nelson rules, KPIs, and the demo address",
  keyframes: [["01-report", 0.6], ["02-work", 0.6], ["04-check", 0.6], ["06-end", 0.7]],
  scenes: [
    story("01-report", "Report", [
      "A noise on the line. The operator reports it from the phone in seconds, and the supervisor turns it into a work order.",
    ], ["A problem, reported in seconds"], {
      cam: [900, 650, 1.1],
      cast: { op: { role: "operator", x: 640, item: "phone" }, sup: { role: "supervisor", x: 1500, item: "clipboard", flip: true } },
      beats: [
        { p: 0, at: 0, world: { beacon: "amber" } },
        { p: 0, at: 0.3, say: "op", lines: ["What is that noise?"] },
        { p: 0, at: 1.4, pose: "op", raise: 0.8 },
        { p: 0, at: 1.6, on: "phone", card: { title: "New work request", items: [{ row: ["Equipment", "Press section"] }, { li: "Vibration ✓", color: G }, { badge: ["Accepted – work order created", "#16A34A"], p: 0, at: 4.4 }], stagger: 0.6 } },
        { p: 0, at: 4.6, say: "sup", lines: ["On it ✓"], color: "#16A34A" },
      ],
    }),
    story("02-work", "Do it safely", [
      "The technician locks it out, works from the phone, even without signal, and books hours and parts as he goes.",
    ], ["Safe, on the phone – even offline"], {
      cam: [1050, 650, 1.15],
      cast: { tech: { role: "technician", x: 1500, item: "phone" } },
      beats: [
        { p: 0, at: 0, world: { beacon: "red", running: false } },
        { p: 0, at: 0.2, walk: "tech", to: 1130 },
        { p: 0, at: 1.2, world: { lock: 1 } },
        { p: 0, at: 1.5, pose: "tech", work: 1 },
        { p: 0, at: 1.8, on: "phone", card: { title: "WO-000231", tag: "Offline", items: [{ li: "LOTO signed off ✓", color: "#16A34A" }, { row: ["Hours", "3.5 h"] }, { row: ["Part", "Bearing ×1"] }], stagger: 0.6 } },
        { p: 0, at: 5.0, pose: "tech", work: 0 },
        { p: 0, at: 5.2, world: { lock: 0, beacon: "green", running: true } },
        { p: 0, at: 5.6, say: "tech", lines: ["Running again!"], color: "#16A34A" },
      ],
    }),
    story("03-plan", "Plan ahead", [
      "Preventive work comes by itself, on time. And every week, the schedule puts the right people, with the right skills, on the right day.",
    ], ["Planned work – on time, the right people"], {
      cam: [3270, 540, 1.1],
      cast: { pl: { role: "planner", x: 2630, item: "tablet" }, mgr: { role: "manager", x: 3930, flip: true } },
      beats: [
        { p: 0, at: 0.2, on: "big", card: { title: "Weekly maintenance schedule", tag: "Approved", items: [{ bar: ["Ahmed", 0, 0.3, G] }, { bar: ["Rashid", 0.15, 0.4, B] }, { bar: ["Imran", 0.45, 0.3, A] }, { kpi: ["PM compliance", "96%", "#16A34A"] }], stagger: 0.6 } },
        { p: 0, at: 1.0, say: "pl", lines: ["Planned in a second"], dx: -40 },
        { p: 0, at: 5.6, say: "mgr", lines: ["Approved ✓"], color: "#16A34A" },
      ],
    }),
    story("04-check", "Catch it early", [
      "Condition monitoring and the Nelson rules spot a rising trend long before a breakdown.",
    ], ["A trend caught before the breakdown"], {
      cam: [3270, 540, 1.1],
      cast: { eng: { role: "engineer", x: 2630, item: "tablet" }, mgr: { role: "manager", x: 3930, flip: true } },
      beats: [
        { p: 0, at: 0.2, on: "big", card: { title: "Control chart · MTR-01 bearing", items: [{ chart: { pts: [5.1, 4.8, 5.2, 4.9, 5.0, 4.9, 5.1, 5.3, 5.5, 5.7, 5.9, 6.1], cl: 5.2, sig: 0.4, min: 3.4, max: 7, h: 240, hit: [5, 6, 7, 8, 9, 10, 11] } }, { badge: ["Nelson rule 3 – seven rising", R] }], stagger: 0.9 } },
        { p: 0, at: 3.2, say: "eng", lines: ["Fix it early!"], color: R, dx: 10 },
      ],
    }),
    story("05-kpis", "Know the numbers", [
      "Every KPI comes from the real records, against its target, from the phone to the monthly management deck.",
    ], ["Real numbers, against targets"], {
      cam: [3270, 540, 1.1],
      cast: { mgr: { role: "manager", x: 3930, flip: true }, eng: { role: "engineer", x: 2630, item: "tablet" } },
      beats: [
        { p: 0, at: 0.2, on: "big", card: { title: "KPIs", items: [{ kpi: ["PM compliance", "96%", "#16A34A"] }, { kpi: ["MTTR", "2.9 h", A] }, { kpi: ["OEE", "81%", G] }, { kpi: ["Breakdown hours", "−18%", "#16A34A"] }], stagger: 0.6 } },
        { p: 0, at: 3.2, say: "mgr", lines: ["One truth for everyone"], color: "#16A34A" },
      ],
    }),
    story("06-end", "PlantPulse", [
      "PlantPulse. Maintenance and production, in one place, in English, Arabic and Bengali. Try the demo today.",
    ], ["Try the demo: demo.plantpulse-cmms.com"], {
      cam: [3270, 540, 1.0],
      cast: { tech: { role: "technician", x: 2500, item: "phone" }, sup: { role: "supervisor", x: 2700, item: "clipboard" }, eng: { role: "engineer", x: 3850, item: "tablet", flip: true }, mgr: { role: "manager", x: 4050, flip: true } },
      beats: [
        { p: 0, at: 0.2, on: "big", card: { title: "PlantPulse", items: [{ h: "Maintenance and production in one place" }, { li: "Work orders · PM · Condition monitoring" }, { li: "Weekly schedule · Shutdowns · RCA" }, { li: "Production · KPIs · Offline on the phone" }, { badge: ["demo.plantpulse-cmms.com", G] }], stagger: 0.5 } },
        { p: 0, at: 0.6, pose: "tech", wave: 1 }, { p: 0, at: 0.8, pose: "sup", wave: 1 }, { p: 0, at: 1.0, pose: "eng", wave: 1 }, { p: 0, at: 1.2, pose: "mgr", wave: 1 },
      ],
    }),
  ],
};
