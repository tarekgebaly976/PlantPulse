// Cartoon 12 – lock-out tag-out and permits (anim "story", lib/story.js).
// Facts as in the user manual and the LOTO register: each isolation point recorded when the lock is applied (point,
// energy type, lock / tag number, zero energy verified after testing); the supervisor signs off LOTO and the permit
// (permit number, types: cold work, hot work, electrical, confined space, work at height, excavation, lifting,
// chemical; validity), an expired permit blocks sign-off and restart, every point must be verified, In progress is
// refused until then; emergency breakdowns may go straight to In progress; locks removed per point (applied by /
// removed by), the work order cannot complete while a lock is on; completion lists what is missing.
"use strict";

const story = (id, chapter, says, captions, spec) => ({ id, layout: "anim", anim: "story", chapter, says, captions, ...spec });
const G = "#0F766E", R = "#DC2626", A = "#D97706";

module.exports = {
  id: "c12-loto-and-permits",
  file: "31-cartoon-lock-out-and-permits",
  intro: "Cartoon · Safety first",
  title: "PlantPulse cartoon – lock-out tag-out and work permits",
  covers: "Cartoon: the LOTO isolation register with point, energy, lock number and zero energy verified, the supervisor's sign-off with the permit number, types and validity, work blocked until every point is verified, expired permits, emergency breakdowns, removing each lock before completion, and the message that lists what is missing",
  keyframes: [["01-isolate", 0.7], ["02-signoff", 0.6], ["03-remove", 0.5], ["03-remove", 0.9]],
  scenes: [
    story("01-isolate", "1 · Isolate", [
      "Before anyone touches a machine, it is made safe. This work order needs lock-out tag-out.",
      "The technician records every isolation point in the LOTO register, as the lock is applied: the point, the type of energy, and the lock and tag number.",
      "Then the energy is tested, and Zero energy verified is ticked.",
    ], ["Safety first", "Every isolation point – in the register", "Zero energy verified"], {
      cam: [1050, 650, 1.15],
      cast: { tech: { role: "technician", x: 1500, item: "phone" } },
      beats: [
        { p: 0, at: 0, world: { beacon: "amber", running: false } },
        { p: 0, at: 0.3, walk: "tech", to: 1150 },
        { p: 0, at: 1.8, say: "tech", lines: ["Make it safe first"], color: A },
        { p: 1, at: 0.2, world: { lock: 1 } },
        { p: 1, at: 0.4, pose: "tech", raise: 0.8 },
        { p: 1, at: 0.6, on: "phone", card: { title: "LOTO isolation register", items: [{ row: ["Point", "MCC-3 breaker Q12"] }, { row: ["Energy", "Electrical", R] }, { row: ["Lock / tag no.", "L-07"] }, { row: ["Point", "Hydraulic valve V3", "#64748B"], p: 1, at: 5.2 }, { row: ["Energy", "Hydraulic", A], p: 1, at: 5.6 }], stagger: 0.8 } },
        { p: 2, at: 0.3, pose: "tech", work: 1 },
        { p: 2, at: 1.2, pose: "tech", work: 0 },
        { p: 2, at: 1.4, on: "phone", card: { title: "LOTO isolation register", items: [{ li: "MCC-3 breaker Q12 · L-07 · verified", color: "#16A34A" }, { li: "Hydraulic valve V3 · L-08 · verified", color: "#16A34A" }, { badge: ["Zero energy verified ✓", "#16A34A"] }], stagger: 0.7 } },
      ],
    }),
    story("02-signoff", "2 · Sign-off", [
      "The supervisor signs off the lock-out and the permit on site: the permit number, its types, like hot work, electrical, confined space or work at height, and how long it is valid.",
      "Until every point is verified and signed off, the work cannot start: In progress is refused. An expired permit blocks the sign-off and the restart. Only an emergency breakdown may go straight to work.",
    ], ["Permit: number, types, validity", "No sign-off – no start"], {
      cam: [1050, 650, 1.15],
      cast: { tech: { role: "technician", x: 1150, item: "phone" }, sup: { role: "supervisor", x: 760, item: "clipboard" } },
      beats: [
        { p: 0, at: 0, world: { beacon: "amber", running: false, lock: 1 } },
        { p: 0, at: 0.3, on: "phone", card: { title: "Permit · WO-000231", items: [{ row: ["Permit no.", "PTW-5521"] }, { row: ["Types", "Electrical · Hot work", R] }, { row: ["Valid until", "Today 18:00"] }, { badge: ["LOTO and permit signed off ✓", "#16A34A"], p: 0, at: 6.4 }], stagger: 0.8 } },
        { p: 0, at: 6.6, say: "sup", lines: ["Signed off ✓"], color: "#16A34A" },
        { p: 1, at: 0.2, on: "phone", card: { title: "Move to: In progress", items: [{ badge: ["Refused until LOTO is signed off", R] }, { li: "Expired permit: blocked", color: R, tick: false }, { li: "Emergency: may start at once", color: A, tick: false }], stagger: 0.9 } },
        { p: 1, at: 1.0, say: "tech", lines: ["Safety before speed"] },
      ],
    }),
    story("03-remove", "3 · Remove and close", [
      "When the work is finished, each lock is removed, and the register keeps who applied it and who removed it. The work order cannot be completed while a lock is still on.",
      "And if anything else is missing, like test results or failure codes, the message lists exactly what. Then it can be completed, and the machine runs again.",
    ], ["Every lock removed – before completion", "Missing? The message says what"], {
      cam: [1050, 650, 1.15],
      cast: { tech: { role: "technician", x: 1150, item: "phone" }, sup: { role: "supervisor", x: 760, item: "clipboard" } },
      beats: [
        { p: 0, at: 0, world: { beacon: "amber", running: false, lock: 1 } },
        { p: 0, at: 0.3, on: "phone", card: { title: "WO-000231 · Complete", items: [{ badge: ["1 lock still applied – remove before completing", R] }, { li: "MCC-3 Q12 · removed by Ahmed", color: "#16A34A" }, { li: "Valve V3 · still locked", color: R, tick: false }], stagger: 0.9 } },
        { p: 0, at: 3.8, world: { lock: 0 } },
        { p: 0, at: 4.0, say: "tech", lines: ["Last lock off"], color: G },
        { p: 1, at: 0.2, on: "phone", card: { title: "WO-000231 · Complete", items: [{ li: "Test result recorded", color: "#16A34A" }, { li: "Failure codes in place", color: "#16A34A" }, { badge: ["Completed ✓", "#16A34A"] }], stagger: 0.8 } },
        { p: 1, at: 3.0, world: { beacon: "green", running: true } },
        { p: 1, at: 3.4, say: "sup", lines: ["Safe, and running ✓"], color: "#16A34A" },
      ],
    }),
    story("04-end", "PlantPulse", [
      "Locked, verified, signed off, and released. Safety is built into every work order.",
    ], ["Safety in every work order"], {
      cam: [1100, 640, 0.8],
      cast: { tech: { role: "technician", x: 1150, item: "phone" }, sup: { role: "supervisor", x: 1550, item: "clipboard" }, eng: { role: "engineer", x: 1950, item: "tablet" } },
      beats: [{ p: 0, at: 0, world: { beacon: "green", running: true } }, { p: 0, at: 0.3, pose: "tech", wave: 1 }, { p: 0, at: 0.5, pose: "sup", wave: 1 }, { p: 0, at: 0.7, pose: "eng", wave: 1 }, { p: 0, at: 0.2, cam: [1250, 640, 0.95], dur: 5 }],
    }),
  ],
};
