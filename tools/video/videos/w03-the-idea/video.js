// Whiteboard 3 – the idea: one simple tool from 25 years on the shop floor, and five rules (anim "board").
"use strict";
const board = (id, chapter, says, captions, spec) => ({ id, layout: "anim", anim: "board", chapter, says, captions, ...spec });
const rule = (p, y, n, icon, text, color) => [
  { p, at: 0.2, text: String(n), x: 300, y: y + 30, size: 90, anchor: "middle", color: "amber" },
  { p, at: 0.7, icon, x: 450, y, s: 0.42, color },
  { p, at: 1.6, text, x: 560, y: y + 18, size: 50 },
];
module.exports = {
  id: "w03-the-idea",
  file: "42-whiteboard-3-the-idea",
  intro: "The PlantPulse story · 3",
  title: "The PlantPulse story – 3. The idea",
  covers: "Whiteboard: the idea of one simple tool built from twenty-five years on the shop floor, and its five rules: usable with gloves and no signal, one record for maintenance and production, never a guessed number, safety in every job, three languages",
  keyframes: [["01-idea", 0.8], ["02-rules", 0.95]],
  scenes: [
    board("01-idea", "1 · The idea", [
      "So I asked myself: what if one simple tool covered all of it, built by someone who has lived it?",
      "Twenty-five years of what works on the shop floor, turned into software.",
    ], ["What if one simple tool covered it all?", "25 years of experience – into software"], {
      items: [
        { p: 0, at: 0.3, icon: "bulb", x: 960, y: 360, s: 1.6, color: "amber", hl: "amber" },
        { p: 0, at: 2.6, text: "one simple tool", x: 960, y: 640, size: 80, anchor: "middle", color: "teal" },
        { p: 1, at: 0, wipe: true },
        { p: 1, at: 0.3, text: "25 years", x: 520, y: 500, size: 110, anchor: "middle", color: "teal" },
        { p: 1, at: 1.4, icon: "team", x: 520, y: 680, s: 0.6 },
        { p: 1, at: 2.2, arrow: [820, 470, 1120, 470], w: 8 },
        { p: 1, at: 2.8, icon: "laptop", x: 1380, y: 440, s: 1.3, hl: "teal" },
        { p: 1, at: 4.0, icon: "phone", x: 1600, y: 500, s: 0.55 },
        { p: 1, at: 4.6, text: "software", x: 1420, y: 660, size: 60, anchor: "middle" },
      ],
    }),
    board("02-rules", "2 · Five rules", [
      "I set myself five rules.",
      "One: if a technician can't use it with gloves on and no signal, it isn't finished.",
      "Two: one record for maintenance and production.",
      "Three: never guess a number. If the data is missing, say so.",
      "Four: safety is built into every job, not added on.",
      "Five: English, Arabic and Bengali, from day one. Next: from the idea to a working system.",
    ], ["Five rules", "1 · Gloves on, no signal – it must work", "2 · One record for maintenance and production", "3 · Never guess a number", "4 · Safety in every job", "5 · English, Arabic, Bengali"], {
      items: [
        { p: 0, at: 0.2, text: "5 rules", x: 960, y: 130, size: 90, anchor: "middle", color: "teal" },
        { p: 0, at: 1.0, underline: [800, 1120, 155], color: "teal" },
        ...rule(1, 260, 1, "nosignal", "gloves on, no signal – it must work", "red"),
        ...rule(2, 410, 2, "factory", "one record: maintenance + production"),
        ...rule(3, 560, 3, "chart", "never guess a number", "amber"),
        ...rule(4, 710, 4, "shield", "safety in every job", "green"),
        ...rule(5, 860, 5, "globe", "English · العربية · Bengali", "blue"),
      ],
    }),
  ],
};
