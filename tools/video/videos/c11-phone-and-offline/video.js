// Cartoon 11 – the technician's phone and the offline field round (anim "story", lib/story.js).
// Facts as in video 08 and the user manual: installs on the home screen, bottom bar (Home, My work, plus, Scan QR,
// More), My work soonest first with a mark on jobs needing LOTO or a permit; Scan QR with the camera or the typed code;
// the equipment page; a request from the symptom ("What do you see or hear?") with a suspected failure mode the
// technician confirms later, Breakdown alerts the supervisors; the field round prepared once online (equipment of
// your departments and your work orders), offline requests and own work orders (start, hours, parts, findings, send
// for review), a call-or-radio reminder for a stopped machine; approvals, LOTO sign-off and closing need a connection;
// sent by themselves when online, each once, with the time it was written; conflicts shown as Keep mine / Keep theirs.
"use strict";

const story = (id, chapter, says, captions, spec) => ({ id, layout: "anim", anim: "story", chapter, says, captions, ...spec });
const G = "#0F766E", R = "#DC2626", A = "#D97706", B = "#2563EB";

module.exports = {
  id: "c11-phone-and-offline",
  file: "30-cartoon-the-phone-and-the-offline-field-round",
  intro: "Cartoon · The phone & offline",
  title: "PlantPulse cartoon – the technician's phone and the offline field round",
  covers: "Cartoon: PlantPulse on the phone's home screen, the bottom bar, My work, Scan QR or the typed code, a request from the symptom with a suspected failure mode, the field round prepared once online, requests and work orders without internet, what still needs a connection, sending by itself once the phone is back online, and conflicts with Keep mine or Keep theirs",
  keyframes: [["01-phone", 0.6], ["02-scan", 0.6], ["03-offline", 0.5], ["04-online", 0.6]],
  scenes: [
    story("01-phone", "1 · Everything in the pocket", [
      "For the technician, PlantPulse lives on the phone. It installs on the home screen and opens on Home.",
      "The bar at the bottom holds Home, My work, the plus button, Scan QR and More.",
      "My work lists the jobs, soonest first. A mark shows the jobs that need lock-out or a permit.",
    ], ["On the phone's home screen", "Home, My work, plus, Scan QR, More", "My work – soonest first"], {
      cam: [1500, 650, 1.2],
      cast: { tech: { role: "technician", x: 1900, item: "phone" } },
      beats: [
        { p: 0, at: 0.3, walk: "tech", to: 1600 },
        { p: 0, at: 1.4, pose: "tech", raise: 0.8 },
        { p: 0, at: 1.6, on: "phone", card: { title: "Home", tag: "Today", items: [{ kpi: ["My open jobs", "3", G] }, { kpi: ["Waiting on this phone", "0", "#64748B"] }], stagger: 0.7 } },
        { p: 1, at: 0.2, on: "phone", card: { title: "The bottom bar", items: [{ li: "Home" }, { li: "My work" }, { li: "+  New request or work order" }, { li: "Scan QR" }, { li: "More" }], stagger: 0.5 } },
        { p: 2, at: 0.2, on: "phone", card: { title: "My work", items: [{ li: "Today 08:00 · Roll change", color: G }, { li: "Today 13:00 · Pump P-12 seal · LOTO + permit", color: R }, { li: "Tomorrow · Gearbox inspection", color: G }], stagger: 0.8 } },
        { p: 2, at: 2.6, say: "tech", lines: ["LOTO on the second one"], color: R },
      ],
    }),
    story("02-scan", "2 · Scan and report", [
      "Every machine has a QR label. Scan QR uses the camera, or type the code printed under the label, and the equipment page opens.",
      "To report a problem, the phone asks: what do you see or hear? A suspected failure mode is filled in from the answer, and the technician confirms it later on the work order.",
      "If the machine is stopped, tick Breakdown, and the supervisors are alerted at once.",
    ], ["Scan – or type the code", "What do you see or hear?", "Breakdown – supervisors alerted"], {
      cam: [1050, 650, 1.15],
      cast: { tech: { role: "technician", x: 1500, item: "phone" }, sup: { role: "supervisor", x: 2580, item: "clipboard", flip: true } },
      beats: [
        { p: 0, at: 0.2, walk: "tech", to: 1130 },
        { p: 0, at: 1.4, pose: "tech", raise: 0.8 },
        { p: 0, at: 1.6, on: "phone", card: { title: "Scan QR", items: [{ row: ["Camera", "MTR-01 found ✓", "#16A34A"] }, { row: ["or type", "MTR-01"] }, { h: "MTR-01 · Drive motor" }, { li: "History · parts · documents" }], stagger: 0.7 } },
        { p: 1, at: 0.2, on: "phone", card: { title: "New work request", items: [{ h: "What do you see or hear?" }, { li: "Noise", color: "#94A3B8", tick: false }, { li: "Vibration ✓", color: G }, { li: "Leak", color: "#94A3B8", tick: false }, { row: ["Suspected", "Bearing wear", A] }], stagger: 0.7 } },
        { p: 1, at: 2.8, say: "tech", lines: ["It shakes!"], color: A },
        { p: 2, at: 0.1, world: { beacon: "red", running: false } },
        { p: 2, at: 0.3, on: "phone", card: { title: "New work request", items: [{ row: ["Breakdown", "Yes ✓", R] }, { btn: ["Send", R] }, { badge: ["Supervisors alerted", "#16A34A"], p: 2, at: 1.6 }] } },
        { p: 2, at: 1.6, icon: "warn", x: 1500, y: 560, to: [2300, 560], dur: 1.4, until: 3 },
      ],
    }),
    story("03-offline", "3 · No signal? No problem", [
      "Some areas have no signal. So the field round is opened once while connected, and the equipment of your departments and your work orders are kept on the phone.",
      "Now the signal is gone. The badge turns red, and the round still works. Scan, write a request, and for a stopped machine the phone reminds you to call or use the radio as well.",
      "Your own work orders work too: start the work, book hours, add parts, write the findings, and send it for review. It all waits on the phone. Approvals, lock-out sign-off and closing still need a connection.",
    ], ["Prepare once – while connected", "Offline: scan and report", "Work orders offline – waiting on the phone"], {
      cam: [-560, 640, 1.15],
      cast: { tech: { role: "technician", x: -100, item: "phone", flip: true } },
      beats: [
        { p: 0, at: 0.2, pose: "tech", raise: 0.8 },
        { p: 0, at: 0.5, on: "pop", card: { title: "Field round", tag: "Online", items: [{ btn: ["Prepare for offline", G] }, { badge: ["412 equipment ready offline", "#16A34A"], p: 0, at: 2.4 }, { li: "My work orders: 3 kept", color: G }], stagger: 0.8 } },
        { p: 1, at: 0, walk: "tech", to: -700 },
        { p: 1, at: 0.8, say: "tech", lines: ["No signal here…"], color: R },
        { p: 1, at: 1.2, on: "pop", card: { title: "Field round", tag: "Offline", items: [{ badge: ["Offline – saved on the phone", R] }, { row: ["Scanned", "Conveyor C-4"] }, { row: ["Request", "Belt torn · Breakdown", R] }, { li: "Stopped machine: call or use the radio too", color: A, tick: false }], stagger: 0.8 } },
        { p: 2, at: 0.2, pose: "tech", work: 1 },
        { p: 2, at: 0.4, on: "pop", card: { title: "WO-000231 · offline", items: [{ li: "Started" }, { li: "Hours: 2.5 h" }, { li: "Part: Bearing ×1" }, { li: "Findings written" }, { kpi: ["Waiting on this phone", "2", A] }], stagger: 0.8 } },
        { p: 2, at: 4.8, pose: "tech", work: 0 },
      ],
    }),
    story("04-online", "4 · Back online", [
      "As soon as the phone is back online, everything waiting is sent by itself. The request gets its number, each item is sent only once, and the time it was written is kept.",
      "If someone changed the same line meanwhile, nothing is overwritten. The phone shows both, with Keep mine or Keep theirs.",
    ], ["Sent by itself – once, with its time", "Conflicts: Keep mine or Keep theirs"], {
      cam: [1050, 650, 1.15],
      cast: { tech: { role: "technician", x: 1600, item: "phone" } },
      beats: [
        { p: 0, at: 0.1, walk: "tech", to: 1130 },
        { p: 0, at: 1.2, pose: "tech", raise: 0.8 },
        { p: 0, at: 1.4, on: "phone", card: { title: "Back online", items: [{ li: "WR-000318 · Belt torn · sent", color: "#16A34A" }, { li: "WO-000231 · sent for review", color: "#16A34A" }, { row: ["Written at", "10:42 – kept"] }, { kpi: ["Waiting on this phone", "0", "#16A34A"] }], stagger: 0.8 } },
        { p: 0, at: 4.4, say: "tech", lines: ["All sent ✓"], color: "#16A34A" },
        { p: 1, at: 0.2, on: "phone", card: { title: "Checklist · one conflict", items: [{ row: ["Yours", "Vibration 2.3"] }, { row: ["Now on the server", "Vibration 2.4", B] }, { btn: ["Keep mine", G] }, { btn: ["Keep theirs", "#64748B"] }], stagger: 0.7 } },
      ],
    }),
    story("05-end", "PlantPulse", [
      "The whole job in the pocket, with or without signal. Next: safety first, lock-out and permits.",
    ], ["In the pocket – with or without signal"], {
      cam: [1100, 640, 0.8],
      cast: { tech: { role: "technician", x: 1130, item: "phone" }, op: { role: "operator", x: 640, item: "phone" }, sup: { role: "supervisor", x: 1550, item: "clipboard" } },
      beats: [{ p: 0, at: 0, world: { beacon: "green", running: true } }, { p: 0, at: 0.3, pose: "op", wave: 1 }, { p: 0, at: 0.5, pose: "tech", wave: 1 }, { p: 0, at: 0.7, pose: "sup", wave: 1 }, { p: 0, at: 0.2, cam: [1100, 640, 0.95], dur: 5 }],
    }),
  ],
};
