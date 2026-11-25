// Whiteboard 4 – from the idea to a working system, as the code history shows it (migrations from 25 Oct 2026 on;
// open test on Google Play on 24 Nov 2026). Anim "board", a timeline the camera follows.
"use strict";
const board = (id, chapter, says, captions, spec) => ({ id, layout: "anim", anim: "board", chapter, says, captions, ...spec });
const Y = 520;
const step = (p, x, when, what, icons) => [
  { p, at: 0.6, icon: "flag", x, y: Y - 90, s: 0.55, color: "teal" },
  { p, at: 1.4, text: when, x, y: Y - 200, size: 64, anchor: "middle", color: "teal" },
  { p, at: 2.2, text: what, x, y: Y + 90, size: 44, anchor: "middle" },
  ...icons.map(([icon, dx, color], i) => ({ p, at: 3.2 + i * 1.0, icon, x: x + dx, y: Y + 270, s: 0.5, color })),
];
module.exports = {
  id: "w04-building-it",
  file: "43-whiteboard-4-building-it",
  intro: "The PlantPulse story · 4",
  title: "The PlantPulse story – 4. From the idea to a working system",
  covers: "Whiteboard: the first version in late October 2026, then lock-out and permits, failure codes, condition monitoring and lubrication, root cause analysis and KPI targets with Nelson charts, the offline field round, the production module, the skill matrix, the weekly schedule and the cutting plan, the Android app on Google Play, tried on a demo and a test copy first",
  keyframes: [["01-timeline", 0.1], ["01-timeline", 0.5], ["02-tested", 0.8]],
  scenes: [
    board("01-timeline", "1 · Step by step", [
      "In late October 2026, the first version was running: work orders, preventive maintenance, equipment and spare parts.",
      "Within days came lock-out and permits, failure codes, condition monitoring and lubrication.",
      "In early November: root cause analysis, and KPI targets with Nelson control charts.",
      "Then the field round without internet, so the technician never waits for a signal.",
      "In mid-November, the production module: daily reports, OEE, losses and safety.",
      "Then the skill matrix, a weekly schedule built by an optimiser, and the cutting plan against paper waste.",
      "And on the twenty-fourth of November, the Android app went live on Google Play, while the system is on trial in a working paper mill.",
    ], ["Late October · the first version", "Lock-out, failure codes, condition monitoring", "Root cause analysis · KPI targets", "Work without internet", "The production module", "Skills · weekly schedule · cutting plan", "24 November · Google Play"], {
      cam: [960, 540, 1],
      items: [
        { p: 0, at: 0.2, line: [150, Y, 1300, Y], w: 8 },
        ...step(0, 500, "Oct", "first version", [["clipboard", -160], ["calendar", 0], ["gear", 160]]),
        { p: 1, at: 0, cam: [1460, 540, 1], dur: 1.4 },
        { p: 1, at: 0.3, line: [1300, Y, 2200, Y], w: 8 },
        ...step(1, 1400, "+ days", "lock-out · condition", [["lock", -160, "red"], ["pulse", 0, "red"], ["drop", 160, "amber"]]),
        { p: 2, at: 0, cam: [2300, 540, 1], dur: 1.4 },
        { p: 2, at: 0.3, line: [2200, Y, 3100, Y], w: 8 },
        ...step(2, 2300, "Nov", "RCA · KPI targets", [["search", -110], ["chart", 110, "amber"]]),
        { p: 3, at: 0, cam: [3200, 540, 1], dur: 1.4 },
        { p: 3, at: 0.3, line: [3100, Y, 4000, Y], w: 8 },
        ...step(3, 3200, "offline", "no signal? no problem", [["phone", -90], ["nosignal", 90, "red"]]),
        { p: 4, at: 0, cam: [4100, 540, 1], dur: 1.4 },
        { p: 4, at: 0.3, line: [4000, Y, 4900, Y], w: 8 },
        ...step(4, 4100, "mid-Nov", "production", [["factory", -110], ["chart", 110, "green"]]),
        { p: 5, at: 0, cam: [5000, 540, 1], dur: 1.4 },
        { p: 5, at: 0.3, line: [4900, Y, 5800, Y], w: 8 },
        ...step(5, 5000, "Nov 20", "skills · schedule · cutting", [["team", -160], ["calendar", 0], ["sheet", 160]]),
        { p: 6, at: 0, cam: [5900, 540, 1], dur: 1.4 },
        { p: 6, at: 0.3, arrow: [5800, Y, 6500, Y], w: 8 },
        ...step(6, 5900, "Nov 24", "Google Play", [["play", -90, "green"], ["factory", 90]]),
        { p: 6, at: 6.4, icon: "star", x: 6300, y: Y - 200, s: 0.5, color: "amber" },
      ],
    }),
    board("02-tested", "2 · Tested first", [
      "Every step was tried on a demo plant first, then on a test copy, and only then on the real system.",
      "One month, from the first version to Google Play. Next: PlantPulse today.",
    ], ["Demo → test copy → real system", "One month – to Google Play"], {
      items: [
        { p: 0, at: 0.3, icon: "laptop", x: 420, y: 430, s: 0.9 },
        { p: 0, at: 1.2, text: "demo", x: 420, y: 600, size: 56, anchor: "middle", color: "blue" },
        { p: 0, at: 2.0, arrow: [580, 430, 780, 430], w: 7 },
        { p: 0, at: 2.4, icon: "laptop", x: 960, y: 430, s: 0.9 },
        { p: 0, at: 3.2, text: "test copy", x: 960, y: 600, size: 56, anchor: "middle", color: "red" },
        { p: 0, at: 4.0, arrow: [1120, 430, 1320, 430], w: 7 },
        { p: 0, at: 4.4, icon: "factory", x: 1500, y: 430, s: 0.9, hl: "green" },
        { p: 0, at: 5.2, text: "real system", x: 1500, y: 600, size: 56, anchor: "middle", color: "green" },
        { p: 1, at: 0.3, text: "1 month", x: 960, y: 800, size: 100, anchor: "middle", color: "teal" },
        { p: 1, at: 1.6, circle: [960, 770, 240, 75], color: "teal" },
      ],
    }),
  ],
};
