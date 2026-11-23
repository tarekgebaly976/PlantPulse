// Cartoon 1 – work requests and work orders, acted out in the cartoon factory (layout "anim", anim "story",
// lib/story.js). Facts as in video 02: request → accepted → triage → approved and assigned → LOTO / permit → work with
// hours and parts → review (failure codes required) → completed → closed; history, cost, PDF; KPIs and RCA proposals.
"use strict";

const story = (id, chapter, says, captions, spec) => ({ id, layout: "anim", anim: "story", chapter, says, captions, ...spec });
const WO = "WO-000231 · Press section";

module.exports = {
  id: "c01-work-orders",
  file: "20-cartoon-work-requests-and-work-orders",
  intro: "Cartoon · Work orders",
  title: "PlantPulse cartoon – from a noise to a closed work order",
  covers: "Cartoon: an operator reports a noise as a work request, the supervisor accepts it, triage with dates, hours, priority and safety needs, approval and assignment with the leave, clash and skill checks, LOTO, the work on the phone with checklist, hours and parts, findings and downtime, review with the failure codes, completion, closing, history, cost and the PDF, and the KPIs and RCA proposals",
  keyframes: [["01-report", 0.85], ["02-plan", 0.5], ["03-work", 0.6], ["04-close", 0.5]],
  scenes: [
    story("01-report", "1 · Report", [
      "Every job starts with a problem. Here, the operator hears a noise on the press section.",
      "He reports it from the phone or the computer: a work request, with the equipment and what he sees.",
      "The supervisor sees new requests first, with breakdowns marked. He accepts it, and accepting creates the work order.",
    ], ["A noise on the press section", "A work request, from the phone", "Accepted – the work order is created"], {
      cam: [560, 650, 1.15],
      cast: { op: { role: "operator", x: 640, item: "phone" }, sup: { role: "supervisor", x: 2560, item: "clipboard", flip: true } },
      beats: [
        { p: 0, at: 0.2, world: { beacon: "amber" } },
        { p: 0, at: 1.2, say: "op", lines: ["What is that noise?"] },
        { p: 1, at: 0, pose: "op", raise: 0.8 },
        { p: 1, at: 0.4, on: "phone", card: { title: "New work request", items: [{ row: ["Equipment", "Press section"] }, { row: ["What I see", "Noise, vibration"] }, { row: ["Breakdown?", "No", "#D97706"] }, { btn: ["Send request", "#DC2626"] }] } },
        { p: 1, at: 0.2, cam: [760, 640, 1.15] },
        { p: 2, at: 0, cam: [2200, 640, 1.25], dur: 1.6 },
        { p: 2, at: 0.3, pose: "op", raise: 0 },
        { p: 2, at: 0.6, on: "tv", card: { title: "Work requests", tag: "New", items: [{ li: "Press section – noise", tick: false, color: "#F59E0B" }, { li: "Rewinder – guard loose", tick: false, color: "#94A3B8" }, { badge: ["Accepted – work order created", "#16A34A"], p: 2, at: 2.6 }] } },
        { p: 2, at: 1.8, say: "sup", lines: ["Accepted!", "Work order is open"], color: "#16A34A" },
        { p: 2, at: 2.6, icon: "paper", x: 2230, y: 750 },
      ],
    }),
    story("02-plan", "2 · Plan", [
      "The new work order starts in triage. The planner sets the dates, the estimated hours and the priority.",
      "And the safety needs: lock-out tag-out, a permit, or a test after the work.",
      "The supervisor approves it and assigns a technician. If he is on leave, already booked, or missing a required skill, PlantPulse says so first.",
    ], ["Triage: dates, hours, priority", "Safety: LOTO, permit, test", "Approved and assigned – checked first"], {
      cam: [3250, 520, 1.15],
      cast: { pl: { role: "planner", x: 2640, item: "tablet" }, sup: { role: "supervisor", x: 2570, item: "clipboard", flip: true, hidden: true }, tech: { role: "technician", x: 1500, item: "phone" } },
      beats: [
        { p: 0, at: 0.3, on: "big", card: { title: WO, tag: "Triage", items: [{ row: ["Planned start", "Tue 08:00"] }, { row: ["Estimated hours", "4 h"] }, { row: ["Priority", "P2", "#D97706"] }, { h: "Safety", p: 1, at: 0 }, { li: "Lock-out tag-out required", p: 1, at: 0.3, color: "#DC2626" }, { li: "Permit required", p: 1, at: 1.0, color: "#DC2626" }, { li: "Test after the work", p: 1, at: 1.7, color: "#2563EB" }] } },
        { p: 0, at: 0.8, say: "pl", lines: ["Tuesday, 4 hours, P2"], dx: -90 },
        { p: 1, at: 0.4, say: "pl", lines: ["LOTO and permit first"], dx: -90 },
        { p: 2, at: 0, hide: "pl" }, { p: 2, at: 0, show: "sup" },
        { p: 2, at: 0, cam: [2150, 640, 1.2], dur: 1.6 },
        { p: 2, at: 0.3, walk: "tech", to: 1980 },
        { p: 2, at: 0.6, on: "tv", card: { title: WO, tag: "Approved", items: [{ li: "Ahmed – at work Tuesday" }, { li: "No other job at 08:00" }, { li: "Hydraulics level 2 – certificate valid" }, { badge: ["Assigned", "#16A34A"] }], stagger: 0.7 } },
        { p: 2, at: 1.0, say: "sup", lines: ["Approved ✓", "Ahmed, it's yours"] },
        { p: 2, at: 3.4, say: "tech", lines: ["On it!"], color: "#16A34A" },
      ],
    }),
    story("03-work", "3 · Do", [
      "With lock-out signed off, the technician starts the work on the phone.",
      "He follows the checklist, books his hours, and records the spare parts he fitted. Hours and parts are costed at once.",
      "Then the findings, the root cause and the downtime. The lock comes off, and the job goes for review.",
    ], ["LOTO signed off – work starts", "Checklist, hours, parts – costed at once", "Findings, cause, downtime – to review"], {
      cam: [1150, 650, 1.25],
      cast: { tech: { role: "technician", x: 1560, item: "phone" }, sup: { role: "supervisor", x: 1700, item: "clipboard", flip: true } },
      beats: [
        { p: 0, at: 0, world: { beacon: "red", running: false } },
        { p: 0, at: 0.2, walk: "tech", to: 1130 },
        { p: 0, at: 0.4, walk: "sup", to: 1440 },
        { p: 1, at: 0, walk: "sup", to: 760 },
        { p: 1, at: 2.6, face: "sup", left: false },
        { p: 0, at: 1.6, world: { lock: 1 } },
        { p: 0, at: 1.9, say: "sup", lines: ["LOTO signed off ✓"], color: "#D97706" },
        { p: 1, at: 0, pose: "tech", work: 1 },
        { p: 1, at: 0.2, on: "phone", card: { title: WO, tag: "In progress", items: [{ li: "Isolate and lock" }, { li: "Check bearing play" }, { li: "Vibration 2.3 mm/s" }, { row: ["Hours", "3.5 h · costed", "#0F766E"] }, { row: ["Part fitted", "Bearing ×1", "#0F766E"] }], stagger: 0.8 } },
        { p: 1, at: 0.3, cam: [1000, 650, 1.2] },
        { p: 2, at: 0, pose: "tech", work: 0 },
        { p: 2, at: 0.1, on: "phone", card: { title: WO, tag: "Review", items: [{ row: ["Findings", "Bearing worn"] }, { row: ["Root cause", "Lubrication"] }, { row: ["Downtime", "2.5 h", "#D97706"] }, { btn: ["Send for review", "#0F766E"] }], stagger: 0.6 } },
        { p: 2, at: 2.0, world: { lock: 0, beacon: "green", running: true } },
        { p: 2, at: 2.4, say: "tech", lines: ["Running again!"], color: "#16A34A" },
      ],
    }),
    story("04-close", "4 · Check", [
      "The supervisor reviews it. If something is missing, like the failure codes, PlantPulse says exactly what.",
      "With the problem, cause and remedy codes in place, it is completed, and then closed.",
      "The history keeps every step with who and when. The work order shows its hours, parts and total cost, and the PDF report puts it all on one page.",
      "Closed work counts in the KPIs. And a repeated failure is proposed for root cause analysis.",
    ], ["Missing? PlantPulse says what", "Codes in place – completed, closed", "History, cost and the PDF report", "KPIs – and RCA for repeats"], {
      cam: [2150, 640, 1.2],
      cast: { sup: { role: "supervisor", x: 2580, item: "clipboard", flip: true }, eng: { role: "engineer", x: 2760, item: "tablet" }, mgr: { role: "manager", x: 3900, flip: true } },
      beats: [
        { p: 0, at: 0.3, on: "tv", card: { title: WO, tag: "Review", items: [{ badge: ["Cannot complete: failure codes missing", "#DC2626"] }, { li: "Problem: bearing failure", p: 1, at: 0.2 }, { li: "Cause: lubrication", p: 1, at: 0.8 }, { li: "Remedy: replace", p: 1, at: 1.4 }, { badge: ["Completed · Closed", "#16A34A"], p: 1, at: 2.6 }] } },
        { p: 0, at: 1.2, say: "sup", lines: ["Codes are missing…"], color: "#DC2626" },
        { p: 1, at: 2.6, say: "sup", lines: ["Closed ✓"], color: "#16A34A" },
        { p: 2, at: 0.2, on: "tv", card: { title: WO, tag: "Closed", items: [{ row: ["Reported", "Mon 09:12 · Operator"] }, { row: ["Approved", "Mon 10:05 · Supervisor"] }, { row: ["Closed", "Tue 14:30 · Supervisor"] }, { kpi: ["Total cost", "SAR 1,840", "#0F766E"] }], stagger: 0.6 } },
        { p: 2, at: 3.0, icon: "paper", x: 2200, y: 520, to: [2380, 660], dur: 1.2, label: "PDF report", until: 3 },
        { p: 3, at: 0, cam: [3250, 560, 1.05], dur: 1.6 },
        { p: 3, at: 0.4, on: "big", card: { title: "KPIs", items: [{ kpi: ["MTTR", "2.5 h", "#0F766E"] }, { kpi: ["Backlog", "38 h", "#D97706"] }, { kpi: ["Breakdowns this month", "3", "#2563EB"] }] } },
        { p: 3, at: 1.6, say: "mgr", lines: ["It's in the KPIs"] },
        { p: 3, at: 2.8, say: "eng", lines: ["Third time this month?", "Root cause analysis"], color: "#D97706" },
      ],
    }),
    story("05-end", "PlantPulse", [
      "That is the life of a work order, from the first noise to the KPIs. Next: preventive maintenance.",
    ], ["From the first noise to the KPIs"], {
      cam: [1400, 640, 0.75],
      cast: { op: { role: "operator", x: 640 }, tech: { role: "technician", x: 1120, item: "phone" }, sup: { role: "supervisor", x: 1500, item: "clipboard" }, pl: { role: "planner", x: 1900, item: "tablet" } },
      beats: [
        { p: 0, at: 0.3, pose: "op", wave: 1 }, { p: 0, at: 0.5, pose: "tech", wave: 1 }, { p: 0, at: 0.7, pose: "sup", wave: 1 }, { p: 0, at: 0.9, pose: "pl", wave: 1 },
        { p: 0, at: 0.2, cam: [1300, 640, 0.9], dur: 4 },
      ],
    }),
  ],
};
