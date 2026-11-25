// Whiteboard 1 – twenty-five years in maintenance (anim "board", lib/board.js). First person, the founder's story from
// the founder's CV, without any company names: paper machine engineer from 2000, Suez 2008, Riyadh from 2011
// (superintendent, mechanical manager, predictive maintenance), head of engineering and maintenance since 2016 at a
// 200,000 t/yr board mill, paper machine upgrade over SAR 100M, about SAR 1M a year saved, TPM, RCM, Lean.
"use strict";

const board = (id, chapter, says, captions, spec) => ({ id, layout: "anim", anim: "board", chapter, says, captions, ...spec });
const Y = 560;  // the timeline
const mile = (p, at, x, year, l1, l2) => [
  { p, at, icon: "flag", x, y: Y - 90, s: 0.55, color: "teal" },
  { p, at: at + 0.9, text: year, x, y: Y - 200, size: 80, anchor: "middle", color: "teal" },
  { p, at: at + 1.6, text: l1, x, y: Y + 90, size: 44, anchor: "middle" },
  ...(l2 ? [{ p, at: at + 2.6, text: l2, x, y: Y + 145, size: 38, anchor: "middle", color: "grey" }] : []),
];

module.exports = {
  id: "w01-my-story",
  file: "40-whiteboard-1-twenty-five-years",
  intro: "The PlantPulse story · 1",
  title: "The PlantPulse story – 1. Twenty-five years in maintenance",
  covers: "Whiteboard: more than twenty-five years in engineering and maintenance in paper and board mills in Egypt and Saudi Arabia, from paper machine engineer to head of an engineering and maintenance department, and three lessons that became PlantPulse",
  keyframes: [["01-years", 0.12], ["01-years", 0.35], ["02-lessons", 0.9]],
  scenes: [
    board("01-years", "1 · Twenty-five years", [
      "More than twenty-five years. That is how long I have worked in engineering and maintenance, in paper and board mills, in Egypt and Saudi Arabia.",
      "It started in 2000, as a mechanical engineer on a paper machine: rolls, pumps, gearboxes and cranes, laser alignment, and my first PM checklists and lubrication schedules.",
      "In 2008, a paper mill in Suez. In 2011, Riyadh: superintendent, then mechanical manager, bringing in vibration analysis, bearing diagnostics and oil sampling.",
      "Since 2016, I have led the engineering and maintenance department of a two hundred thousand ton a year board mill: mechanical, condition monitoring, planning, workshops and utilities.",
      "Along the way: a paper machine upgrade worth more than a hundred million riyals, about a million riyals a year saved in maintenance cost, and TPM, RCM and Lean on the shop floor.",
    ], ["25+ years in engineering and maintenance", "2000 · Mechanical engineer on a paper machine", "2008 · Suez – 2011 · Riyadh", "Since 2016 · Head of engineering and maintenance", "SAR 100M+ upgrade · ≈ SAR 1M a year saved · TPM, RCM, Lean"], {
      cam: [960, 540, 1],
      items: [
        { p: 0, at: 0.2, text: "25+", x: 560, y: 500, size: 300, color: "teal", anchor: "middle", dur: 1.1 },
        { p: 0, at: 1.5, text: "years", x: 560, y: 620, size: 90, anchor: "middle" },
        { p: 0, at: 2.6, icon: "factory", x: 1330, y: 390, s: 1.4, hl: "teal" },
        { p: 0, at: 4.4, text: "paper & board mills", x: 1330, y: 640, size: 54, anchor: "middle" },
        { p: 0, at: 6.0, text: "Egypt → Saudi Arabia", x: 1330, y: 720, size: 46, anchor: "middle", color: "grey" },
        { p: 1, at: 0, wipe: true },
        { p: 1, at: 0.4, line: [150, Y, 1250, Y], w: 8 },
        ...mile(1, 1.0, 500, "2000", "mechanical engineer", "paper machine"),
        { p: 1, at: 5.0, icon: "wrench", x: 950, y: 380, s: 0.5 },
        { p: 1, at: 6.0, icon: "gear", x: 1100, y: 380, s: 0.45 },
        { p: 1, at: 7.4, icon: "clipboard", x: 950, y: 820, s: 0.45 },
        { p: 1, at: 8.4, icon: "drop", x: 1100, y: 820, s: 0.42, color: "amber" },
        { p: 2, at: 0, cam: [2100, 540, 1], dur: 1.6 },
        { p: 2, at: 0.6, line: [1250, Y, 2950, Y], w: 8 },
        ...mile(2, 1.2, 1650, "2008", "Suez, Egypt", "paper mill"),
        ...mile(2, 4.6, 2500, "2011", "Riyadh", "superintendent → manager"),
        { p: 2, at: 8.4, icon: "pulse", x: 2500, y: 830, s: 0.9, color: "red" },
        { p: 3, at: 0, cam: [3350, 540, 1], dur: 1.6 },
        { p: 3, at: 0.6, arrow: [2950, Y, 4150, Y], w: 8 },
        ...mile(3, 1.2, 3450, "2016", "head of engineering & maintenance", "200,000 t / year board mill"),
        { p: 3, at: 6.4, icon: "team", x: 3200, y: 840, s: 0.6 },
        { p: 3, at: 7.6, icon: "pulse", x: 3450, y: 840, s: 0.6, color: "red" },
        { p: 3, at: 8.6, icon: "calendar", x: 3700, y: 840, s: 0.5 },
        { p: 4, at: 0, wipe: true },
        { p: 4, at: 0.4, icon: "trophy", x: 2790, y: 400, s: 1.0, color: "amber", hl: "amber" },
        { p: 4, at: 1.8, text: "SAR 100M+", x: 2790, y: 640, size: 64, anchor: "middle", color: "teal" },
        { p: 4, at: 2.8, text: "paper machine upgrade", x: 2790, y: 705, size: 40, anchor: "middle" },
        { p: 4, at: 4.6, icon: "chart", x: 3350, y: 400, s: 0.95, hl: "green" },
        { p: 4, at: 6.0, text: "≈ SAR 1M / year", x: 3350, y: 640, size: 64, anchor: "middle", color: "teal" },
        { p: 4, at: 7.0, text: "saved in maintenance cost", x: 3350, y: 705, size: 40, anchor: "middle" },
        { p: 4, at: 8.6, icon: "loop", x: 3910, y: 400, s: 1.0, color: "teal" },
        { p: 4, at: 9.6, text: "TPM · RCM · Lean", x: 3910, y: 640, size: 56, anchor: "middle", color: "teal" },
      ],
    }),
    board("02-lessons", "2 · Three lessons", [
      "Along the way, I learned three lessons.",
      "One: machines warn you before they break, if someone is listening.",
      "Two: what is not recorded did not happen.",
      "Three: maintenance and production succeed, or fail, together.",
      "Those three lessons became the start of PlantPulse. Next: the problem I saw every day.",
    ], ["Three lessons", "1 · Machines warn you first", "2 · Not recorded = did not happen", "3 · Maintenance and production together", "The start of PlantPulse"], {
      items: [
        { p: 0, at: 0.2, text: "3 lessons", x: 960, y: 200, size: 96, anchor: "middle", color: "teal" },
        { p: 0, at: 1.4, underline: [760, 1160, 225], color: "teal" },
        { p: 1, at: 0.2, text: "1", x: 230, y: 420, size: 120, color: "amber" },
        { p: 1, at: 0.7, icon: "pulse", x: 520, y: 380, s: 1.2, color: "red" },
        { p: 1, at: 2.2, text: "machines warn you first", x: 470, y: 560, size: 46, anchor: "middle" },
        { p: 2, at: 0.2, text: "2", x: 830, y: 420, size: 120, color: "amber" },
        { p: 2, at: 0.7, icon: "clipboard", x: 1060, y: 380, s: 0.95 },
        { p: 2, at: 2.0, text: "not recorded = didn't happen", x: 1060, y: 560, size: 42, anchor: "middle" },
        { p: 3, at: 0.2, text: "3", x: 1360, y: 420, size: 120, color: "amber" },
        { p: 3, at: 0.6, icon: "gear", x: 1560, y: 330, s: 0.55 },
        { p: 3, at: 1.4, icon: "factory", x: 1720, y: 380, s: 0.7 },
        { p: 3, at: 2.4, text: "together", x: 1640, y: 560, size: 46, anchor: "middle" },
        { p: 4, at: 0.2, icon: "bulb", x: 760, y: 770, s: 0.85, color: "amber", hl: "amber" },
        { p: 4, at: 1.6, text: "PlantPulse", x: 880, y: 800, size: 80, color: "teal" },
        { p: 4, at: 3.0, circle: [1085, 775, 250, 75], color: "teal" },
      ],
    }),
  ],
};
