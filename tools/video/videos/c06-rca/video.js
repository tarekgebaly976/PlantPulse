// Cartoon 6 – root cause analysis in the cartoon factory (anim "story", lib/story.js).
// Facts as in video 07: the plant's RCA rules (downtime for the criticality, repeats, production loss, cost, safety),
// the manager's decision with leader, team and due date or a reason why not; investigation in numbered tabs (5W1H from
// the work orders, fishbone with man, machine, method, material, measurement, environment, five whys, root causes
// physical / human / system, action plan with owners and dates); approval or return with a note; actions with
// evidence, an action can raise a work order; the effectiveness check reopens the RCA if the failure returns; one-page
// print report and Excel register.
"use strict";

const story = (id, chapter, says, captions, spec) => ({ id, layout: "anim", anim: "story", chapter, says, captions, ...spec });

module.exports = {
  id: "c06-rca",
  file: "25-cartoon-root-cause-analysis",
  intro: "Cartoon · Root cause analysis",
  title: "PlantPulse cartoon – root cause analysis",
  covers: "Cartoon: the RCA rules that spot a major or repeated breakdown, the manager's decision with leader, team and due date, the investigation with five W's and one H, fishbone and five whys, physical, human and system root causes, the action plan with owners and dates, approval, actions with evidence and their own work orders, the effectiveness check that reopens the RCA, the one-page report and the Excel register",
  keyframes: [["01-rule", 0.6], ["02-why", 0.5], ["03-act", 0.6], ["04-check", 0.9]],
  scenes: [
    story("01-rule", "1 · Not again!", [
      "The grinding mill stops again. High vibration, for the third time this month.",
      "The plant's rules say what a major breakdown is: downtime for the criticality, repeats, production loss, cost, or a safety event. This one matches, so PlantPulse proposes a root cause analysis.",
      "The manager decides. Start it, with a leader, a team and a due date, or mark it not required, with a reason.",
    ], ["Third time this month", "A rule matched – RCA proposed", "The manager decides"], {
      cam: [1050, 650, 1.15],
      cast: { tech: { role: "technician", x: 1130, item: "phone" }, eng: { role: "engineer", x: 2630, item: "tablet" }, mgr: { role: "manager", x: 3930, flip: true } },
      beats: [
        { p: 0, at: 0.2, world: { beacon: "red", running: false } },
        { p: 0, at: 0.8, say: "tech", lines: ["Not again!"], color: "#DC2626" },
        { p: 1, at: 0, cam: [3270, 540, 1.1], dur: 1.6 },
        { p: 1, at: 0.5, on: "big", card: { title: "RCA rules · matched", tag: "Proposed", items: [{ row: ["Equipment", "Grinding mill · A"] }, { row: ["Repeats", "3 in 30 days", "#DC2626"] }, { row: ["Downtime", "14 h", "#DC2626"] }, { row: ["Production loss", "62 t"] }, { badge: ["Root cause analysis proposed", "#D97706"] }], stagger: 0.8 } },
        { p: 1, at: 2.4, say: "eng", lines: ["Third time?"], color: "#D97706", dx: -40 },
        { p: 2, at: 0.2, on: "big", card: { title: "Decision", items: [{ btn: ["Start RCA", "#0F766E"] }, { row: ["Leader", "Reliability engineer"] }, { row: ["Team", "Supervisor, technician, operator"] }, { row: ["Due", "In 14 days"] }], stagger: 0.8 } },
        { p: 2, at: 2.0, say: "mgr", lines: ["Start it – find out why"] },
      ],
    }),
    story("02-why", "2 · Ask why", [
      "The team investigates, tab by tab. First, the problem in five W's and one H, filled in from the work orders.",
      "The fishbone sorts the possible causes: man, machine, method, material, measurement and environment.",
      "Then the five whys. Keep asking why, until the last why is the root cause.",
      "The root causes are recorded as physical, human and system.",
    ], ["Five W's and one H", "The fishbone – six groups of causes", "Five whys", "Physical, human, system"], {
      cam: [2150, 640, 1.2],
      cast: { eng: { role: "engineer", x: 2580, item: "tablet", flip: true }, sup: { role: "supervisor", x: 1520, item: "clipboard" }, tech: { role: "technician", x: 1720, item: "phone" } },
      beats: [
        { p: 0, at: 0.3, on: "tv", card: { title: "1 · Problem – 5W1H", items: [{ row: ["What", "High vibration, trip"] }, { row: ["Where", "Mill drive-end bearing"] }, { row: ["When", "Night shift, 3 times"] }, { row: ["How much", "14 h, 62 t"] }], stagger: 0.7 } },
        { p: 0, at: 1.0, say: "eng", lines: ["What do we know?"] },
        { p: 1, at: 0.4, on: "tv", card: { title: "3 · Fishbone", items: [{ row: ["Machine", "Bearing worn"] }, { row: ["Method", "Greasing by feel"] }, { row: ["Material", "Wrong grease?"] }, { row: ["Man · Measurement · Environment", "Checked"] }], stagger: 0.8 } },
        { p: 1, at: 2.2, say: "sup", lines: ["The grease?"], color: "#D97706" },
        { p: 2, at: 0.2, on: "tv", card: { title: "4 · Five whys", items: [{ li: "Why the trip? – Bearing hot" }, { li: "Why hot? – Too little grease" }, { li: "Why too little? – No amount set" }, { li: "Why none? – Not in a lubrication point" }, { li: "Root cause: no lubrication standard", color: "#DC2626" }], stagger: 0.9 } },
        { p: 2, at: 4.6, say: "tech", lines: ["That's the root!"], color: "#DC2626" },
        { p: 3, at: 0.2, on: "tv", card: { title: "5 · Root causes", items: [{ row: ["Physical", "Bearing starved of grease"] }, { row: ["Human", "Greased by feel"] }, { row: ["System", "No lubrication standard", "#DC2626"] }], stagger: 0.8 } },
      ],
    }),
    story("03-act", "3 · Fix it", [
      "The action plan: containment, corrective and preventive actions, each with an owner and a due date. The manager approves it, or returns it with a note.",
      "The owners carry out their actions, with the result as evidence. An action can raise its own work order; completing the work order completes the action.",
    ], ["Actions: owners and dates – approved", "Evidence, and work orders from actions"], {
      cam: [3270, 540, 1.1],
      cast: { eng: { role: "engineer", x: 2630, item: "tablet" }, mgr: { role: "manager", x: 3930, flip: true } },
      beats: [
        { p: 0, at: 0.3, on: "big", card: { title: "6 · Action plan", tag: "Waiting", items: [{ row: ["Containment", "Grease now · Tech · today"] }, { row: ["Corrective", "Replace bearing · Sup · 3 days"] }, { row: ["Preventive", "Lubrication point, 20 g · Eng · 7 days"] }, { badge: ["Approved by the manager", "#16A34A"], p: 0, at: 5.2 }], stagger: 0.9 } },
        { p: 0, at: 5.4, say: "mgr", lines: ["Approved ✓"], color: "#16A34A" },
        { p: 1, at: 0.2, on: "big", card: { title: "Actions", items: [{ li: "Grease now – done, photo attached ✓", color: "#16A34A" }, { li: "Replace bearing → WO-000288", color: "#2563EB" }, { li: "WO-000288 closed → action done ✓", color: "#16A34A" }, { li: "Lubrication point created ✓", color: "#16A34A" }], stagger: 0.9 } },
        { p: 1, at: 1.4, icon: "paper", x: 2560, y: 700, label: "WO-000288", until: 2 },
        { p: 1, at: 3.8, say: "eng", lines: ["Every action, proven"], color: "#16A34A", dx: -80 },
      ],
    }),
    story("04-check", "4 · Did it work?", [
      "When the last action is done, the effectiveness check starts. If the same failure comes back, the analysis reopens by itself.",
      "Print report puts the whole analysis on one page, and the register of all analyses exports to Excel.",
    ], ["Effectiveness check – reopens if it returns", "One-page report, Excel register"], {
      cam: [1050, 650, 1.15],
      cast: { tech: { role: "technician", x: 1130, item: "phone" }, eng: { role: "engineer", x: 2630, item: "tablet" }, mgr: { role: "manager", x: 3930, flip: true } },
      beats: [
        { p: 0, at: 0, world: { beacon: "green", running: true } },
        { p: 0, at: 0.4, on: "phone", card: { title: "Effectiveness check", tag: "Watching", items: [{ row: ["Grinding mill", "90 days"] }, { row: ["Same failure since", "None", "#16A34A"] }, { li: "If it returns – RCA reopens", color: "#D97706" }], stagger: 0.8 } },
        { p: 0, at: 2.4, say: "tech", lines: ["Smooth for months!"], color: "#16A34A" },
        { p: 1, at: 0, cam: [3270, 540, 1.1], dur: 1.6 },
        { p: 1, at: 0.4, on: "big", card: { title: "RCA register", items: [{ row: ["Grinding mill · vibration", "Closed", "#16A34A"] }, { row: ["Dryer felt · tear", "In progress", "#2563EB"] }, { row: ["Pump P-12 · seal", "Waiting decision", "#D97706"] }, { li: "Print report · Export to Excel", color: "#0F766E" }], stagger: 0.7 } },
        { p: 1, at: 1.6, icon: "paper", x: 2480, y: 300, to: [2490, 400], dur: 1.0, label: "One page" },
        { p: 1, at: 2.6, say: "mgr", lines: ["Fixed for good"], color: "#16A34A" },
      ],
    }),
    story("05-end", "PlantPulse", [
      "Find the root, fix it, and prove it worked. Next: production, the daily report and OEE.",
    ], ["Find it, fix it, prove it"], {
      cam: [2600, 640, 0.75],
      cast: { sup: { role: "supervisor", x: 1900, item: "clipboard" }, tech: { role: "technician", x: 2300, item: "phone" }, eng: { role: "engineer", x: 2700, item: "tablet" }, mgr: { role: "manager", x: 3100 } },
      beats: [{ p: 0, at: 0.3, pose: "sup", wave: 1 }, { p: 0, at: 0.5, pose: "tech", wave: 1 }, { p: 0, at: 0.7, pose: "eng", wave: 1 }, { p: 0, at: 0.9, pose: "mgr", wave: 1 }, { p: 0, at: 0.2, cam: [2600, 640, 0.9], dur: 5 }],
    }),
  ],
};
