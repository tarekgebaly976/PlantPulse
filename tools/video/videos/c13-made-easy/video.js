// Cartoon 13 – the small things that make PlantPulse easy to use (anim "story", lib/story.js).
// Only features of PlantPulse itself; no comparison with other products. Facts: one colour code, counters that open
// their list, search with Control K and words in any order; codes made from the name; QR scan or typed code; the
// symptom picker; photos from the phone camera; warnings before assigning (leave, clash, skill, certificate); the
// completion message that lists what is missing; Not available instead of a guess; nobody approves their own request;
// the offline round (sent once, time kept, Keep mine / Keep theirs); Excel imports with template, preview, error
// report and duplicate check, imports that remove nobody; label sheets that start lower on a used sheet; three
// languages with right to left, light and dark; Home arranged per person and saved on the server; home-screen install.
"use strict";

const story = (id, chapter, says, captions, spec) => ({ id, layout: "anim", anim: "story", chapter, says, captions, ...spec });
const G = "#0F766E", R = "#DC2626", A = "#D97706", B = "#2563EB";

module.exports = {
  id: "c13-made-easy",
  file: "32-cartoon-made-easy",
  intro: "Cartoon · Made easy",
  title: "PlantPulse cartoon – the small things that make it easy",
  covers: "Cartoon: one colour code and counters that open their lists, search with Control K, codes made from the name, scanning or typing the QR code, the symptom picker and photos, warnings before mistakes, messages that say exactly what is missing, Not available instead of guesses, the offline round, Excel imports with a preview and an error report, label sheets that continue where you stopped, three languages, dark mode, and a Home page arranged for each person",
  keyframes: [["01-see", 0.6], ["02-type", 0.6], ["03-safe", 0.6], ["04-excel", 0.6]],
  scenes: [
    story("01-see", "1 · See it at a glance", [
      "A program is only useful if people like to use it. So PlantPulse is full of small things that save time. First, one colour code on every screen: red, act now. Amber, needs attention. Green, all clear. Grey, information.",
      "Every counter opens exactly the list it counts. And the magnifier, or Control K, finds anything: type a code, a name, or a few words in any order.",
    ], ["One colour code everywhere", "Counters open their list – Ctrl K finds anything"], {
      cam: [3270, 540, 1.1],
      cast: { sup: { role: "supervisor", x: 2630, item: "clipboard" }, mgr: { role: "manager", x: 3930, flip: true } },
      beats: [
        { p: 0, at: 0.4, on: "big", card: { title: "One colour code", items: [{ kpi: ["Red", "act now", R] }, { kpi: ["Amber", "needs attention", A] }, { kpi: ["Green", "all clear", "#16A34A"] }, { kpi: ["Grey", "information", "#64748B"] }], stagger: 1.2 } },
        { p: 0, at: 2.0, say: "mgr", lines: ["Easy to read!"], color: "#16A34A" },
        { p: 1, at: 0.2, on: "big", card: { title: "Search · Ctrl K", items: [{ row: ["Typed", "pump seal p-12"] }, { li: "WO-000247 · Pump P-12 seal", color: B }, { li: "P-12 · Process pump", color: B }, { li: "Mechanical seal 45 mm · spare part", color: B }], stagger: 0.8 } },
        { p: 1, at: 2.4, say: "sup", lines: ["Found in a second"], dx: -40 },
      ],
    }),
    story("02-type", "2 · Type less", [
      "Leave a code blank, and it is made from the name.",
      "Scan a QR label, or type the code printed under it. To report a problem, just pick what you see or hear, and add a photo with the phone's camera.",
    ], ["Codes made from the name", "Scan, pick, photo – less typing"], {
      cam: [1050, 650, 1.15],
      cast: { tech: { role: "technician", x: 1130, item: "phone" } },
      beats: [
        { p: 0, at: 0.2, pose: "tech", raise: 0.8 },
        { p: 0, at: 0.4, on: "phone", card: { title: "New spare part", items: [{ row: ["Name", "Bearing 6312 C3"] }, { row: ["Code", "Automatic – from the name", G] }, { badge: ["Saved as B6312C", "#16A34A"], p: 0, at: 2.2 }], stagger: 0.7 } },
        { p: 1, at: 0.2, on: "phone", card: { title: "New work request", items: [{ row: ["Equipment", "MTR-01 · scanned"] }, { h: "What do you see or hear?" }, { li: "Vibration ✓", color: G }, { row: ["Photo", "camera ✓", B] }, { btn: ["Send", R] }], stagger: 0.7 } },
        { p: 1, at: 3.6, say: "tech", lines: ["Done in seconds"], color: "#16A34A" },
      ],
    }),
    story("03-safe", "3 · Mistakes caught early", [
      "Before a job is assigned, PlantPulse warns if the person is on leave, already booked, missing a skill, or has an expired certificate.",
      "When something blocks a step, the message lists exactly what is missing. Where data is missing, a KPI says Not available, and why: nothing is guessed. And nobody approves their own request.",
      "In the field, work goes on without signal, is sent once, and keeps its time. If two people changed the same line, nobody's work is lost: Keep mine, or Keep theirs.",
    ], ["Warnings before assigning", "Exactly what is missing – never a guess", "Offline – nothing lost"], {
      cam: [2150, 640, 1.2],
      cast: { sup: { role: "supervisor", x: 2580, item: "clipboard", flip: true }, tech: { role: "technician", x: 1600, item: "phone" } },
      beats: [
        { p: 0, at: 0.3, on: "tv", card: { title: "Assign · WO-000260", items: [{ li: "Rashid – on leave Thursday", color: A, tick: false }, { li: "Imran – MV certificate expired", color: R, tick: false }, { li: "Ahmed – free, skill level 2", color: "#16A34A" }], stagger: 0.9 } },
        { p: 0, at: 3.4, say: "sup", lines: ["Ahmed, then"], color: "#16A34A" },
        { p: 1, at: 0.2, on: "tv", card: { title: "Cannot complete yet", items: [{ li: "Failure codes missing", color: R, tick: false }, { li: "Test result missing", color: R, tick: false }, { row: ["Cost per ton", "Not available – no tonnage", "#64748B"] }, { row: ["Own deferral", "approved by someone else", A] }], stagger: 0.9 } },
        { p: 2, at: 0.2, on: "tv", card: { title: "Field round", items: [{ row: ["Offline items", "sent once"] }, { row: ["Written at", "kept"] }, { row: ["Same line changed", "Keep mine · Keep theirs", B] }], stagger: 0.8 } },
        { p: 2, at: 2.6, say: "tech", lines: ["Nothing lost ✓"], color: "#16A34A" },
      ],
    }),
    story("04-excel", "4 · Excel, done right", [
      "Lots of data? Excel imports come with a template. Each file is checked first, with a preview, duplicates found, and an error report that shows each wrong row.",
      "A team import never removes anybody. And QR label sheets can start lower on a sheet that is already partly used, so no label is wasted.",
    ], ["Template, preview, error report", "Nobody removed – no label wasted"], {
      cam: [3270, 540, 1.1],
      cast: { pl: { role: "planner", x: 2630, item: "tablet" }, mgr: { role: "manager", x: 3930, flip: true } },
      beats: [
        { p: 0, at: 0.3, on: "big", card: { title: "Import spare parts", items: [{ row: ["Template", "Parts template.xlsx", G] }, { row: ["Preview", "248 rows"] }, { row: ["Duplicates", "3 found", A] }, { row: ["Errors", "Row 41 · unit missing", R] }], stagger: 0.8 } },
        { p: 0, at: 0.8, icon: "paper", x: 2480, y: 380, label: "Excel", until: 1 },
        { p: 0, at: 3.8, say: "pl", lines: ["Fix row 41, then go"], dx: -40 },
        { p: 1, at: 0.2, on: "big", card: { title: "Import users · Print QR labels", items: [{ li: "12 updated · 4 added · nobody removed", color: "#16A34A" }, { row: ["Labels already used", "first 9 on the sheet"] }, { li: "Printing starts at label 10", color: G }], stagger: 0.9 } },
      ],
    }),
    story("05-yours", "5 · Made for you", [
      "Everyone picks English, Arabic or Bengali, right to left where needed, and light or dark mode.",
      "Each person arranges their own Home, and it is saved on the server, so the phone and the computer show the same. And PlantPulse installs on the phone like an app.",
    ], ["Three languages – light or dark", "Your Home, on every device"], {
      cam: [1050, 650, 1.15],
      cast: { tech: { role: "technician", x: 1130, item: "phone" }, op: { role: "operator", x: 640, item: "phone" } },
      beats: [
        { p: 0, at: 0.2, pose: "tech", raise: 0.8 },
        { p: 0, at: 0.4, on: "phone", card: { title: "My profile", items: [{ h: "Language" }, { li: "English · العربية · বাংলা", tick: false }, { row: ["Theme", "Light · Dark"] }, { badge: ["العربية ✓", G] }], stagger: 0.8 } },
        { p: 0, at: 3.4, say: "op", lines: ["English for me"] },
        { p: 1, at: 0.2, on: "phone", card: { title: "Customise Home", items: [{ li: "Counters ✓" }, { li: "KPIs ✓" }, { li: "Condition alarms ✓" }, { li: "Saved – same on phone and computer", color: B }], stagger: 0.7 } },
        { p: 1, at: 3.2, say: "tech", lines: ["My Home, my way"], color: "#16A34A" },
      ],
    }),
    story("06-end", "PlantPulse", [
      "Small things, every day, for every person. That is what makes PlantPulse easy to use.",
    ], ["Small things – every day"], {
      cam: [1500, 640, 0.65],
      cast: { sk: { role: "storekeeper", x: 300 }, op: { role: "operator", x: 640 }, tech: { role: "technician", x: 1000, item: "phone" }, sup: { role: "supervisor", x: 1350, item: "clipboard" }, pl: { role: "planner", x: 1700, item: "tablet" }, eng: { role: "engineer", x: 2050, item: "tablet" }, mgr: { role: "manager", x: 2400 } },
      beats: [
        { p: 0, at: 0, world: { beacon: "green", running: true } },
        { p: 0, at: 0.3, pose: "sk", wave: 1 }, { p: 0, at: 0.45, pose: "op", wave: 1 }, { p: 0, at: 0.6, pose: "tech", wave: 1 }, { p: 0, at: 0.75, pose: "sup", wave: 1 },
        { p: 0, at: 0.9, pose: "pl", wave: 1 }, { p: 0, at: 1.05, pose: "eng", wave: 1 }, { p: 0, at: 1.2, pose: "mgr", wave: 1 },
        { p: 0, at: 0.2, cam: [1450, 640, 0.8], dur: 6 },
      ],
    }),
  ],
};
