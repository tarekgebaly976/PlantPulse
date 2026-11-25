// Whiteboard 5 – PlantPulse today, the message and the links (anim "board").
"use strict";
const board = (id, chapter, says, captions, spec) => ({ id, layout: "anim", anim: "board", chapter, says, captions, ...spec });
const row = (p, list) => list.flatMap(([icon, label, color], i) => {
  const x = 300 + i * 440;
  return [{ p, at: 0.2 + i * 0.75, dur: 0.7, icon, x, y: 420, s: 0.85, color, hl: i % 2 ? "amber" : "teal" }, { p, at: 0.65 + i * 0.75, text: label, x, y: 610, size: 46, anchor: "middle" }];
});
module.exports = {
  id: "w05-plantpulse-today",
  file: "44-whiteboard-5-plantpulse-today",
  intro: "The PlantPulse story · 5",
  title: "The PlantPulse story – 5. PlantPulse today",
  covers: "Whiteboard: maintenance and production in one place, work orders, preventive maintenance, condition monitoring, RCA, weekly schedule, skills, shutdowns, spare parts, production reports, OEE and KPIs, on computer and phone with or without signal in three languages, the demo and the Android app",
  keyframes: [["01-today", 0.3], ["01-today", 0.95], ["02-thanks", 0.9]],
  scenes: [
    board("01-today", "1 · PlantPulse today", [
      "Today, PlantPulse brings maintenance and production together, in one place.",
      "Work orders, preventive maintenance and lubrication, condition monitoring, and root cause analysis.",
      "The weekly schedule, skills, shutdowns and spare parts.",
      "Daily production reports, OEE, and KPIs against their targets.",
      "On the computer and on the phone, with or without signal, in English, Arabic and Bengali.",
    ], ["Maintenance and production – one place", "Work orders · PM · condition · RCA", "Schedule · skills · shutdowns · parts", "Production · OEE · KPIs", "Computer and phone – online or offline"], {
      items: [
        { p: 0, at: 0.2, icon: "gear", x: 640, y: 440, s: 1.2 },
        { p: 0, at: 1.4, icon: "pulse", x: 960, y: 440, s: 1.1, color: "red" },
        { p: 0, at: 2.4, icon: "factory", x: 1280, y: 440, s: 1.2, hl: "teal" },
        { p: 0, at: 3.6, text: "PlantPulse", x: 960, y: 700, size: 110, anchor: "middle", color: "teal" },
        { p: 1, at: 0, wipe: true },
        ...row(1, [["clipboard", "work orders"], ["calendar", "PM · lubrication"], ["pulse", "condition", "red"], ["search", "root cause"]]),
        { p: 2, at: 0, wipe: true },
        ...row(2, [["calendar", "weekly schedule"], ["team", "skills"], ["flag", "shutdowns", "teal"], ["gear", "spare parts"]]),
        { p: 3, at: 0, wipe: true },
        ...row(3, [["factory", "daily reports"], ["chart", "OEE", "green"], ["star", "KPI targets", "amber"], ["shield", "safety", "green"]]),
        { p: 4, at: 0, wipe: true },
        { p: 4, at: 0.3, icon: "laptop", x: 520, y: 430, s: 1.2 },
        { p: 4, at: 1.6, icon: "phone", x: 960, y: 430, s: 0.95 },
        { p: 4, at: 2.6, icon: "nosignal", x: 1110, y: 340, s: 0.45, color: "red" },
        { p: 4, at: 3.4, icon: "globe", x: 1420, y: 430, s: 1.0, color: "blue" },
        { p: 4, at: 4.4, text: "online · offline · 3 languages", x: 960, y: 690, size: 56, anchor: "middle" },
      ],
    }),
    board("02-thanks", "2 · Thank you", [
      "Twenty-five years of lessons, in one simple tool.",
      "Try the demo online, or get the Android app on Google Play.",
      "I would love your feedback, especially from the people who live this every day on the shop floor. Thank you.",
    ], ["25 years of lessons – one simple tool", "demo.plantpulse-cmms.com · Google Play", "Your feedback is welcome"], {
      items: [
        { p: 0, at: 0.2, text: "25 years", x: 560, y: 300, size: 100, anchor: "middle", color: "teal" },
        { p: 0, at: 1.4, arrow: [820, 270, 1060, 270], w: 8 },
        { p: 0, at: 2.0, text: "PlantPulse", x: 1360, y: 300, size: 100, anchor: "middle", color: "teal" },
        { p: 1, at: 0.3, icon: "laptop", x: 560, y: 560, s: 0.7 },
        { p: 1, at: 1.2, text: "demo.plantpulse-cmms.com", x: 680, y: 580, size: 54 },
        { p: 1, at: 3.0, icon: "play", x: 560, y: 760, s: 0.55, color: "green" },
        { p: 1, at: 3.8, text: "Android · Google Play", x: 680, y: 780, size: 54 },
        { p: 2, at: 0.5, icon: "heart", x: 1600, y: 700, s: 0.7, color: "red", hl: "red" },
        { p: 2, at: 4.5, text: "Thank you!", x: 1600, y: 880, size: 64, anchor: "middle", color: "red" },
      ],
    }),
  ],
};
