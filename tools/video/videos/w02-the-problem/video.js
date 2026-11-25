// Whiteboard 2 – the problem: a good system with correct results that does not cover everything (anim "board").
"use strict";
const board = (id, chapter, says, captions, spec) => ({ id, layout: "anim", anim: "board", chapter, says, captions, ...spec });
const isl = (p, x, y, icon, l1, extra = []) => [
  { p, at: 0.2, icon, x, y, s: 0.85, hl: "amber" }, ...extra,
  { p, at: 1.4, text: l1, x, y: y + 150, size: 44, anchor: "middle" },
];
module.exports = {
  id: "w02-the-problem",
  file: "41-whiteboard-2-the-problem",
  intro: "The PlantPulse story · 2",
  title: "The PlantPulse story – 2. The problem",
  covers: "Whiteboard: a good maintenance system with correct results that does not cover everything on the shop floor, and the daily work outside it: the weekly plan in Excel, handover on paper, skills in people's heads, condition readings in separate sheets, production apart, and no signal in the plant",
  keyframes: [["01-system", 0.8], ["02-islands", 0.75]],
  scenes: [
    board("01-system", "1 · A good system", [
      "The main maintenance system we used at work was good, and its results were correct.",
      "But it did not cover everything we needed on the shop floor.",
      "So a lot of the daily work happened outside it.",
    ], ["A good system – correct results", "But it didn't cover everything", "Work outside the system"], {
      items: [
        { p: 0, at: 0.2, icon: "laptop", x: 620, y: 420, s: 1.4 },
        { p: 0, at: 1.8, icon: "check", x: 620, y: 400, s: 0.9, color: "green" },
        { p: 0, at: 2.6, text: "good system · correct results", x: 620, y: 640, size: 50, anchor: "middle", color: "green" },
        { p: 1, at: 0.2, icon: "question", x: 1360, y: 400, s: 1.3, color: "red" },
        { p: 1, at: 1.4, text: "not everything", x: 1360, y: 640, size: 54, anchor: "middle", color: "red" },
        { p: 2, at: 0, wipe: true },
        { p: 2, at: 0.4, text: "outside the system", x: 960, y: 560, size: 110, anchor: "middle" },
        { p: 2, at: 2.0, circle: [960, 525, 560, 120], color: "red" },
      ],
    }),
    board("02-islands", "2 · Islands of work", [
      "The weekly plan lived in Excel.",
      "The shift handover was written on paper.",
      "Skills and certificates were kept in people's heads.",
      "Condition readings sat in a separate sheet.",
      "Production and maintenance each looked at their own numbers.",
      "And out in the plant, the technician often had no signal.",
      "Six islands, and time lost between them, every single day. Next: the idea.",
    ], ["The weekly plan in Excel", "The handover on paper", "Skills in people's heads", "Readings in a separate sheet", "Production and maintenance apart", "No signal in the plant", "Six islands – time lost every day"], {
      items: [
        ...isl(0, 380, 290, "sheet", "weekly plan in Excel"),
        ...isl(1, 960, 290, "papers", "handover on paper"),
        ...isl(2, 1540, 290, "person", "skills in heads", [{ p: 2, at: 1.0, icon: "question", x: 1640, y: 200, s: 0.4, color: "red" }]),
        ...isl(3, 380, 670, "chart", "readings in a sheet"),
        ...isl(4, 960, 670, "factory", "production apart", [{ p: 4, at: 1.0, icon: "gear", x: 1080, y: 600, s: 0.4 }]),
        ...isl(5, 1540, 670, "phone", "no signal", [{ p: 5, at: 1.0, icon: "nosignal", x: 1650, y: 600, s: 0.45, color: "red" }]),
        { p: 6, at: 0, wipe: true },
        { p: 6, at: 0.4, text: "6 islands", x: 760, y: 520, size: 130, anchor: "middle", color: "amber" },
        { p: 6, at: 1.6, arrow: [1050, 480, 1300, 480], w: 8 },
        { p: 6, at: 2.2, icon: "clock", x: 1460, y: 470, s: 1.0, color: "red", hl: "red" },
        { p: 6, at: 3.4, text: "time lost every day", x: 1460, y: 650, size: 50, anchor: "middle", color: "red" },
      ],
    }),
  ],
};
