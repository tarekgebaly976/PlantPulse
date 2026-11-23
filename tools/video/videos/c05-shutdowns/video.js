// Cartoon 5 – shutdowns in the cartoon factory (anim "story", lib/story.js).
// Facts as in video 06: name, scope, planned window; work packages with duration, manpower, contractors and
// predecessors; critical path in red, float on the rest, total against the window; readiness for materials, permits
// and lock-out; daily progress with a reason for any delay; pre-startup checks required before completion; the
// completion report with lessons learned and documents; Excel import of a plan.
"use strict";

const story = (id, chapter, says, captions, spec) => ({ id, layout: "anim", anim: "story", chapter, says, captions, ...spec });
const R = "#DC2626", G = "#0F766E";

module.exports = {
  id: "c05-shutdowns",
  file: "24-cartoon-shutdowns",
  intro: "Cartoon · Shutdowns",
  title: "PlantPulse cartoon – shutdowns, from the plan to a safe restart",
  covers: "Cartoon: a shutdown with its scope and window, work packages with duration, manpower, contractors and predecessors, the Gantt chart with the critical path and float, the total against the window, readiness for materials, permits and lock-out, daily progress with delay reasons, pre-startup checks before completion, the report with lessons learned, and Excel import",
  keyframes: [["01-plan", 0.7], ["02-gantt", 0.6], ["03-ready", 0.8], ["04-restart", 0.6]],
  scenes: [
    story("01-plan", "1 · The big stop", [
      "Once a year, paper machine one stops for five days. A shutdown is planned in PlantPulse, with its name, its scope and the planned window.",
      "It is split into work packages. Each has a duration, the manpower, the contractors, and the packages it must wait for.",
    ], ["A shutdown: name, scope, window", "Work packages – and what they wait for"], {
      cam: [3270, 540, 1.1],
      cast: { pl: { role: "planner", x: 2630, item: "tablet" }, mgr: { role: "manager", x: 3930, flip: true } },
      beats: [
        { p: 0, at: 0.3, on: "big", card: { title: "Shutdown · PM1 annual stop", tag: "Planned", items: [{ row: ["Scope", "Paper machine 1 – whole line"] }, { row: ["Planned start", "Sun 06:00"] }, { row: ["Planned end", "Thu 18:00", G] }, { kpi: ["Window", "5 days", G] }], stagger: 0.8 } },
        { p: 0, at: 1.2, say: "mgr", lines: ["Five days – no more"], color: "#D97706" },
        { p: 1, at: 0.2, on: "big", card: { title: "Work packages", items: [{ row: ["1 · Isolate the line", "4 h · 3 people"] }, { row: ["2 · Replace felts", "2 days · contractor"] }, { row: ["3 · Gearbox overhaul", "3 days · waits for 1"] }, { row: ["4 · Roll grinding", "2 days · waits for 1"] }, { row: ["5 · Restart test", "8 h · waits for 2, 3, 4"] }], stagger: 0.8 } },
        { p: 1, at: 1.0, say: "pl", lines: ["Who waits for whom"], dx: -80 },
      ],
    }),
    story("02-gantt", "2 · The critical path", [
      "PlantPulse calculates the schedule at once and draws it as a Gantt chart. The critical path is in red: a delay there delays the restart.",
      "The other packages have float, time they can slip without harm. At the top, the total duration is checked against the window.",
    ], ["The Gantt chart – critical path in red", "Float, and the total against the window"], {
      cam: [3270, 540, 1.1],
      cast: { pl: { role: "planner", x: 2630, item: "tablet" }, mgr: { role: "manager", x: 3930, flip: true } },
      beats: [
        { p: 0, at: 0.3, on: "big", card: { title: "Gantt · PM1 annual stop", items: [{ bar: ["Isolate", 0, 0.06, R] }, { bar: ["Felts", 0.06, 0.4, G] }, { bar: ["Gearbox", 0.06, 0.62, R] }, { bar: ["Grinding", 0.06, 0.4, G] }, { bar: ["Restart test", 0.68, 0.1, R] }], stagger: 0.7 } },
        { p: 0, at: 3.4, say: "pl", lines: ["The gearbox is critical"], color: R, dx: -80 },
        { p: 1, at: 0.2, on: "big", card: { title: "Gantt · PM1 annual stop", items: [{ kpi: ["Total duration", "3.9 days", G] }, { kpi: ["Window", "5 days", G] }, { badge: ["Fits the window ✓", "#16A34A"] }, { li: "Felts and grinding: 1.1 days of float", color: "#64748B" }], stagger: 0.8 } },
        { p: 1, at: 2.6, say: "mgr", lines: ["It fits ✓"], color: "#16A34A" },
      ],
    }),
    story("03-ready", "3 · Ready, then go", [
      "Before the stop, every package is checked for readiness: materials, permits and lock-out.",
      "The line stops. During the shutdown, progress is logged every day.",
      "A delay always needs a reason, and the package shows as delayed, so everyone knows where the restart is at risk.",
    ], ["Readiness: materials, permits, LOTO", "Progress logged daily", "Delays – always with a reason"], {
      cam: [2150, 640, 1.2],
      cast: { sup: { role: "supervisor", x: 2580, item: "clipboard", flip: true }, tech: { role: "technician", x: 1600, item: "phone" } },
      beats: [
        { p: 0, at: 0.3, on: "tv", card: { title: "Readiness", items: [{ row: ["Materials", "100%", "#16A34A"] }, { row: ["Permits", "80%", "#D97706"] }, { row: ["Lock-out", "100%", "#16A34A"] }], stagger: 0.8 } },
        { p: 0, at: 1.4, icon: "box", x: 1500, y: 820, to: [1700, 820], dur: 1.0, until: 1 },
        { p: 0, at: 2.4, say: "sup", lines: ["One permit to go"], color: "#D97706" },
        { p: 1, at: 0, cam: [1050, 650, 1.15], dur: 1.6 },
        { p: 1, at: 0.2, world: { beacon: "red", running: false } },
        { p: 1, at: 0.6, walk: "tech", to: 1130 },
        { p: 1, at: 1.2, world: { lock: 1 } },
        { p: 1, at: 1.6, pose: "tech", work: 1 },
        { p: 1, at: 1.8, on: "phone", card: { title: "Progress · day 2", items: [{ row: ["Felts", "70%", G] }, { row: ["Gearbox", "40%", G] }, { row: ["Grinding", "60%", G] }], stagger: 0.7 } },
        { p: 2, at: 0, pose: "tech", work: 0 },
        { p: 2, at: 0.2, on: "phone", card: { title: "Gearbox overhaul", tag: "Delayed", items: [{ row: ["Progress", "40%", R] }, { row: ["Reason", "Bearing arrived late"] }, { badge: ["Delayed – critical path", R] }], stagger: 0.8 } },
        { p: 2, at: 2.4, say: "tech", lines: ["Delayed – reason logged"], color: R },
      ],
    }),
    story("04-restart", "4 · A safe restart", [
      "Before the restart come the pre-startup and commissioning checks. The shutdown cannot be completed until every one is confirmed.",
      "The line starts again. The completion report keeps the lessons learned and the documents, ready for next year. A whole plan can also be imported from Excel.",
    ], ["Pre-startup checks – all confirmed", "Lessons learned – ready for next year"], {
      cam: [1050, 650, 1.15],
      cast: { tech: { role: "technician", x: 1130, item: "phone" }, eng: { role: "engineer", x: 760, item: "tablet" } },
      beats: [
        { p: 0, at: 0, world: { beacon: "red", running: false, lock: 1 } },
        { p: 0, at: 0.3, on: "phone", card: { title: "Pre-startup checks", items: [{ li: "Guards back in place ✓", color: "#16A34A" }, { li: "Locks removed ✓", color: "#16A34A" }, { li: "Rotation checked ✓", color: "#16A34A" }, { badge: ["All checks confirmed", "#16A34A"] }], stagger: 0.9 } },
        { p: 0, at: 2.2, say: "eng", lines: ["Every check, confirmed"] },
        { p: 1, at: 0, world: { lock: 0, beacon: "green", running: true } },
        { p: 1, at: 0.4, say: "tech", lines: ["Running again!"], color: "#16A34A" },
        { p: 1, at: 1.2, cam: [3270, 540, 1.1], dur: 1.8 },
        { p: 1, at: 2.4, on: "big", card: { title: "Completion report · PM1 annual stop", tag: "Completed", items: [{ row: ["Finished", "Thu 15:20", "#16A34A"] }, { li: "Lesson: order the gearbox bearing earlier" }, { li: "Documents attached" }, { li: "Next plan – import from Excel", color: "#2563EB" }], stagger: 0.8 } },
      ],
    }),
    story("05-end", "PlantPulse", [
      "Planned, followed and restarted safely, on time. Next: root cause analysis, so a big breakdown does not happen twice.",
    ], ["Planned, followed, restarted safely"], {
      cam: [1400, 640, 0.75],
      cast: { tech: { role: "technician", x: 1120, item: "phone" }, sup: { role: "supervisor", x: 1500, item: "clipboard" }, pl: { role: "planner", x: 1900, item: "tablet" }, mgr: { role: "manager", x: 2300 } },
      beats: [{ p: 0, at: 0.3, pose: "tech", wave: 1 }, { p: 0, at: 0.5, pose: "sup", wave: 1 }, { p: 0, at: 0.7, pose: "pl", wave: 1 }, { p: 0, at: 0.9, pose: "mgr", wave: 1 }, { p: 0, at: 0.2, cam: [1500, 640, 0.9], dur: 5 }],
    }),
  ],
};
