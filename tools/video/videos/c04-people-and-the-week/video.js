// Cartoon 4 – the people: shifts and handover, the skill matrix, the weekly maintenance schedule (anim "story").
// Facts as in videos 11, 16 and 17: teams with rotation patterns, roster with leave, overtime and call-outs, manpower
// per day; the handover (summary, breakdowns, pending work, safety, permits, risks), submitted, confirmed by the incoming
// supervisor (not their own), locked; the skill matrix kept by the engineer (levels 1-3, certificates green / amber /
// red, qualified count per skill), required skills and the assignment warning; the weekly schedule from approved work,
// roster, skills, certificates, LOTO cover and line stop windows, deferred work with reasons, hand edits, the engineer's
// then the manager's approval, planned dates and assignees written to the work orders.
"use strict";

const story = (id, chapter, says, captions, spec) => ({ id, layout: "anim", anim: "story", chapter, says, captions, ...spec });

module.exports = {
  id: "c04-people-and-the-week",
  file: "23-cartoon-shifts-skills-and-the-weekly-schedule",
  intro: "Cartoon · People & the week",
  title: "PlantPulse cartoon – shifts, handover, skills and the weekly schedule",
  covers: "Cartoon: teams, rotation patterns and the roster with leave and overtime, manpower per day, the shift handover written, submitted and confirmed by the incoming supervisor; the skill matrix with levels and certificate colours and the qualified count, required skills and the warning on assignment; the weekly maintenance schedule from approved work, roster, skills and stop windows, deferred work with reasons, hand edits, the engineer's and the manager's approvals, and the planned dates on the work orders",
  keyframes: [["01-roster", 0.6], ["02-handover", 0.6], ["03-skills", 0.6], ["04-week", 0.55]],
  scenes: [
    story("01-roster", "1 · Who works when", [
      "Maintenance runs around the clock, every day of the week. Teams follow a rotation pattern, and the roster is made from it.",
      "Leave, overtime and call-outs are entered on the roster too.",
      "Manpower turns it into the hours available each day, and flags a day with planned work but nobody rostered.",
    ], ["Teams, patterns, the roster", "Leave, overtime, call-outs", "Hours available – gaps flagged"], {
      cam: [3270, 540, 1.1],
      cast: { pl: { role: "planner", x: 2630, item: "tablet" }, mgr: { role: "manager", x: 3930, flip: true } },
      beats: [
        { p: 0, at: 0.3, on: "big", card: { title: "Roster · this week", items: [{ bar: ["Team A · Day", 0, 0.57, "#0F766E"] }, { bar: ["Team B · Night", 0.28, 0.57, "#2563EB"] }, { bar: ["Team C · Day", 0.57, 0.43, "#0F766E"] }, { bar: ["Friday & Saturday", 0.71, 0.29, "#7C3AED"] }], stagger: 0.8 } },
        { p: 0, at: 1.0, say: "pl", lines: ["The plant never stops"], dx: -80 },
        { p: 1, at: 0.2, on: "big", card: { title: "Roster · changes", items: [{ li: "Rashid – leave on Thursday", color: "#64748B" }, { li: "Imran – overtime on Saturday", color: "#D97706" }, { li: "Call-out on Friday night", color: "#DC2626" }], stagger: 0.8 } },
        { p: 2, at: 0.2, on: "big", card: { title: "Manpower", items: [{ kpi: ["Sunday", "40 h available", "#16A34A"] }, { kpi: ["Monday", "32 h available", "#16A34A"] }, { kpi: ["Friday – work planned", "nobody rostered", "#DC2626"] }], stagger: 0.8 } },
        { p: 2, at: 2.6, say: "mgr", lines: ["Friday needs someone!"], color: "#DC2626" },
      ],
    }),
    story("02-handover", "2 · The handover", [
      "At the end of the shift, the outgoing supervisor writes the handover: the summary, breakdowns still open, pending work, safety concerns, open permits and critical risks.",
      "The incoming supervisor reads it and confirms it, and then it is locked. Nobody can confirm their own handover.",
    ], ["The handover – nothing is lost", "Confirmed by the next shift – then locked"], {
      cam: [2150, 640, 1.2],
      cast: { out: { role: "supervisor", x: 2580, item: "clipboard", flip: true }, inc: { role: "supervisor", x: 1500 } },
      beats: [
        { p: 0, at: 0.3, on: "tv", card: { title: "Shift handover · Night → Day", items: [{ row: ["Summary", "Press section running"] }, { row: ["Open breakdowns", "1", "#DC2626"] }, { row: ["Pending work", "2 jobs", "#D97706"] }, { row: ["Safety concerns", "Guard loose, rewinder", "#DC2626"] }, { row: ["Open permits", "Hot work, PM1"] }, { row: ["Critical risks", "None"] }], stagger: 0.9 } },
        { p: 0, at: 0.6, say: "out", lines: ["Here is my shift"] },
        { p: 1, at: 0, walk: "inc", to: 1800 },
        { p: 1, at: 1.6, say: "inc", lines: ["Read – confirmed ✓"], color: "#16A34A", y: 420, dx: -60 },
        { p: 1, at: 1.8, on: "tv", card: { title: "Shift handover · Night → Day", tag: "Confirmed", items: [{ badge: ["Confirmed by the day supervisor", "#16A34A"] }, { li: "Locked – cannot be changed", color: "#64748B" }], stagger: 0.8 } },
      ],
    }),
    story("03-skills", "3 · Who can do what", [
      "The engineer keeps the skill matrix: one row per person, one column per skill, at three levels, from basic to expert.",
      "Certificates have an expiry date. Green is valid, amber expires within thirty days, red has expired.",
      "Each skill shows how many people are qualified. Red means nobody, amber means just one person.",
      "Work orders say which skills they need. Assigning someone without them, or with an expired certificate, gives a warning first.",
    ], ["The skill matrix – levels 1 to 3", "Certificates: green, amber, red", "Qualified per skill – single points of failure", "Required skills – checked on assignment"], {
      cam: [3270, 540, 1.1],
      cast: { eng: { role: "engineer", x: 2630, item: "tablet" }, sup: { role: "supervisor", x: 3930, item: "clipboard", flip: true } },
      beats: [
        { p: 0, at: 0.3, on: "big", card: { title: "Skill matrix", items: [{ row: ["Ahmed", "Hydraulics 3 · Alignment 2", "#16A34A"] }, { row: ["Rashid", "Hydraulics 1 · Welding 2", "#16A34A"] }, { row: ["Imran", "PLC 3 · MV switching 2", "#16A34A"] }, { row: ["Hassan", "Welding 3 · Hydraulics 2", "#16A34A"] }], stagger: 0.7 } },
        { p: 0, at: 1.0, say: "eng", lines: ["Who can do what?"], dx: -80 },
        { p: 1, at: 0.2, on: "big", card: { title: "Certificates", items: [{ li: "Ahmed · Confined space – valid", color: "#16A34A" }, { li: "Rashid · Confined space – expires in 12 days", color: "#D97706" }, { li: "Imran · MV switching – expired", color: "#DC2626" }], stagger: 0.9 } },
        { p: 2, at: 0.2, on: "big", card: { title: "Qualified per skill", items: [{ kpi: ["Hydraulics", "3 people", "#16A34A"] }, { kpi: ["Laser alignment", "1 person", "#D97706"] }, { kpi: ["MV switching", "nobody valid", "#DC2626"] }], stagger: 0.8 } },
        { p: 2, at: 2.4, say: "eng", lines: ["Train someone!"], color: "#D97706", dx: -80 },
        { p: 3, at: 0.2, on: "big", card: { title: "WO-000260 · MV breaker test", items: [{ row: ["Needs", "MV switching ≥ 2"] }, { row: ["Assign", "Imran"] }, { badge: ["Certificate expired – warning", "#DC2626"] }], stagger: 0.9 } },
        { p: 3, at: 2.8, say: "sup", lines: ["Good catch!"], color: "#D97706" },
      ],
    }),
    story("04-week", "4 · The week", [
      "Every week, the planner presses Propose schedule. The optimiser places the approved work on the people at work, matching trades, skills, valid certificates, and a supervisor on shift for LOTO.",
      "Work that needs the line stopped only goes into a line stop window agreed with production. What does not fit is deferred, and each one says why.",
      "The planner can move a job by hand. Then the engineer approves the week, and the manager gives the final approval.",
      "The planned dates and the technicians are written into the work orders, and each technician sees the week in My work.",
    ], ["Propose: the right person, the right day", "Stop windows – deferred with a reason", "Engineer, then manager approve", "Into the work orders and My work"], {
      cam: [3270, 540, 1.1],
      cast: { pl: { role: "planner", x: 2630, item: "tablet" }, eng: { role: "engineer", x: 2630, item: "tablet", hidden: true }, mgr: { role: "manager", x: 3930, flip: true, hidden: true }, tech: { role: "technician", x: 1150, item: "phone" } },
      beats: [
        { p: 0, at: 0.3, on: "big", card: { title: "Weekly maintenance schedule", tag: "Proposed", items: [{ bar: ["Ahmed", 0, 0.3, "#0F766E"] }, { bar: ["Rashid", 0.15, 0.4, "#2563EB"] }, { bar: ["Imran", 0.45, 0.3, "#D97706"] }, { bar: ["Hassan", 0.6, 0.35, "#0F766E"] }, { kpi: ["Placed in about a second", "11 work orders", "#16A34A"] }], stagger: 0.8 } },
        { p: 0, at: 0.8, say: "pl", lines: ["Propose schedule!"], dx: -80 },
        { p: 1, at: 0.2, on: "big", card: { title: "Line stop windows · Deferred", items: [{ row: ["Line 1 stops", "Tue 08:00–14:00", "#D97706"] }, { li: "Roll change → inside the window" }, { li: "MV breaker test – certificate expired", color: "#DC2626" }, { li: "Pump overhaul – longer than a shift", color: "#DC2626" }], stagger: 0.9 } },
        { p: 2, at: 0.1, show: "eng" }, { p: 2, at: 0.1, hide: "pl" },
        { p: 2, at: 0.4, on: "big", card: { title: "Weekly maintenance schedule", tag: "Approving", items: [{ li: "Moved by hand – pinned", color: "#2563EB" }, { badge: ["Engineer ✓", "#16A34A"] }, { badge: ["Manager ✓", "#16A34A"], p: 2, at: 4.2 }], stagger: 1.2 } },
        { p: 2, at: 1.8, say: "eng", lines: ["Approved ✓"], color: "#16A34A", dx: -60 },
        { p: 2, at: 3.6, show: "mgr" },
        { p: 2, at: 4.0, say: "mgr", lines: ["Final approval ✓"], color: "#16A34A" },
        { p: 3, at: 0, cam: [1050, 650, 1.2], dur: 1.8 },
        { p: 3, at: 0.6, on: "phone", card: { title: "My work", tag: "This week", items: [{ li: "Tue 08:00 · Roll change", color: "#0F766E" }, { li: "Wed 07:00 · Gearbox inspection", color: "#0F766E" }, { li: "Thu 07:00 · Coupling check", color: "#0F766E" }], stagger: 0.8 } },
        { p: 3, at: 1.0, pose: "tech", raise: 0.8 },
        { p: 3, at: 2.2, say: "tech", lines: ["My week is ready!"], color: "#16A34A" },
      ],
    }),
    story("05-end", "PlantPulse", [
      "The right people, with the right skills, on the right day. Next: shutdowns, the big planned stops.",
    ], ["The right people, the right day"], {
      cam: [2600, 640, 0.75],
      cast: { pl: { role: "planner", x: 2300, item: "tablet" }, eng: { role: "engineer", x: 2700, item: "tablet" }, mgr: { role: "manager", x: 3100 }, sup: { role: "supervisor", x: 1900, item: "clipboard" } },
      beats: [{ p: 0, at: 0.3, pose: "pl", wave: 1 }, { p: 0, at: 0.5, pose: "eng", wave: 1 }, { p: 0, at: 0.7, pose: "mgr", wave: 1 }, { p: 0, at: 0.9, pose: "sup", wave: 1 }, { p: 0, at: 0.2, cam: [2600, 640, 0.9], dur: 5 }],
    }),
  ],
};
