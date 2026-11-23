// Cartoon 3 – equipment, QR labels and spare parts in the cartoon factory (anim "story", lib/story.js).
// Facts as in videos 09 and 10: the equipment tree (plant, area, line, equipment, component), criticality A/B/C, the
// asset page (details, history and reliability, spare parts of the machine, meters and condition points, lubrication,
// documents, QR label, a request from the page), QR label sheets of 24 and Excel import; parts with min, max and
// reorder point, stock per warehouse (on hand, reserved, available, on order), receipts at moving-average cost,
// issues against work orders, adjustments with a reason and never negative, local requisitions (no ERP link),
// valuation, aging and excess, parts used per machine.
"use strict";

const story = (id, chapter, says, captions, spec) => ({ id, layout: "anim", anim: "story", chapter, says, captions, ...spec });

module.exports = {
  id: "c03-assets-and-parts",
  file: "22-cartoon-equipment-qr-and-spare-parts",
  intro: "Cartoon · Equipment & parts",
  title: "PlantPulse cartoon – equipment, QR labels and spare parts",
  covers: "Cartoon: the equipment tree and criticality, the asset page (details, history and reliability, spare parts, meters, condition points, lubrication, documents), the QR label that opens it, label sheets and Excel import; spare parts with min, max and reorder point, stock per warehouse, receipts at moving-average cost, issues against a work order, adjustments with a reason, local requisitions, valuation, aging and excess, and the parts used on each machine",
  keyframes: [["01-tree", 0.6], ["02-page", 0.6], ["03-store", 0.5], ["04-issue", 0.6]],
  scenes: [
    story("01-tree", "1 · Equipment", [
      "Every machine in the plant lives in one tree: plant, area, line, equipment and component.",
      "Each one has a criticality, A, B or C. It drives the priorities and the rules for root cause analysis.",
      "And each one gets a QR label. Printed on sheets of twenty-four, stuck on the machine, and scanned with any phone.",
    ], ["One tree: plant to component", "Criticality A, B, C", "A QR label on every machine"], {
      cam: [3250, 540, 1.12],
      cast: { eng: { role: "engineer", x: 2630, item: "tablet" }, tech: { role: "technician", x: 1500, item: "phone" } },
      beats: [
        { p: 0, at: 0.3, on: "big", card: { title: "Equipment", items: [{ li: "Plant · Paper mill", color: "#0F766E" }, { li: "  Area · Paper machine 1", color: "#0F766E" }, { li: "    Line · Press section", color: "#0F766E" }, { li: "      Equipment · MTR-01 Drive motor", color: "#2563EB" }, { li: "        Component · DE bearing", color: "#64748B" }], stagger: 0.8 } },
        { p: 0, at: 0.8, say: "eng", lines: ["Everything in one tree"], dx: -80 },
        { p: 1, at: 0.2, on: "big", card: { title: "Criticality", items: [{ kpi: ["A · stops the line", "Highest priority", "#DC2626"] }, { kpi: ["B · slows it down", "Medium", "#D97706"] }, { kpi: ["C · has a spare", "Lower", "#64748B"] }], stagger: 0.9 } },
        { p: 2, at: 0, cam: [1050, 650, 1.25], dur: 1.6 },
        { p: 2, at: 0.2, walk: "tech", to: 1130 },
        { p: 2, at: 0.6, icon: "tag", x: 1800, y: 700, to: [905, 790], dur: 1.6, label: "QR" },
        { p: 2, at: 2.4, say: "tech", lines: ["Label on, ready to scan"] },
      ],
    }),
    story("02-page", "2 · One page per machine", [
      "Scan it, and the machine's own page opens: its details, maker, model and running hours, and what it cost to maintain.",
      "Its full history, every work order, with failures and reliability over twelve months.",
      "The spare parts that fit it, its meters and condition points, its lubrication, and its manuals and drawings.",
      "And a problem can be reported from the page itself, in seconds.",
    ], ["Details and cost", "History and reliability", "Parts, meters, lubrication, documents", "Report a problem from here"], {
      cam: [900, 650, 1.15],
      cast: { tech: { role: "technician", x: 1130, item: "phone", flip: true } },
      beats: [
        { p: 0, at: 0, pose: "tech", raise: 0.8 },
        { p: 0, at: 0.4, on: "phone", card: { title: "MTR-01 · Drive motor", tag: "A", items: [{ row: ["Maker / model", "Sample motor 90 kW"] }, { row: ["Running hours", "18,420 h"] }, { row: ["Status", "In service", "#16A34A"] }, { kpi: ["Maintenance cost", "SAR 12,300", "#0F766E"] }], stagger: 0.8 } },
        { p: 1, at: 0.1, on: "phone", card: { title: "MTR-01 · History", items: [{ li: "Bearing replaced · Mar" }, { li: "PM gearbox inspection · Jun" }, { li: "Coupling aligned · Sep" }, { kpi: ["MTBF (12 months)", "212 h", "#0F766E"] }], stagger: 0.7 } },
        { p: 2, at: 0.1, on: "phone", card: { title: "MTR-01 · Everything", items: [{ row: ["Spare parts", "6 parts"] }, { row: ["Meters", "Running hours"] }, { row: ["Condition points", "Vibration, temp."] }, { row: ["Lubrication", "2 points"] }, { row: ["Documents", "Manual, drawing"] }], stagger: 0.6 } },
        { p: 3, at: 0.1, on: "phone", card: { title: "MTR-01 · Drive motor", items: [{ btn: ["Report a problem", "#DC2626"] }, { badge: ["Request sent ✓", "#16A34A"], p: 3, at: 1.6 }] } },
        { p: 3, at: 1.8, say: "tech", lines: ["Sent!"], color: "#16A34A" },
      ],
    }),
    story("03-store", "3 · The store", [
      "Spare parts live in the store. Each part has a minimum, a maximum and a reorder point, and critical spares are marked.",
      "Stock is kept per warehouse: on hand, reserved, available and on order.",
      "The storekeeper books goods receipts, and the average cost is updated by itself. A correction always needs a reason, and stock can never go negative.",
    ], ["Min, max, reorder point – critical spares", "Stock per warehouse", "Receipts at average cost – corrections with a reason"], {
      cam: [-560, 640, 1.15],
      cast: { sk: { role: "storekeeper", x: -1000 } },
      beats: [
        { p: 0, at: 0.3, on: "pop", card: { title: "Bearing 6312", tag: "Critical", items: [{ row: ["Minimum", "2"] }, { row: ["Maximum", "8"] }, { row: ["Reorder point", "3", "#D97706"] }, { badge: ["Below reorder point", "#D97706"] }], stagger: 0.8 } },
        { p: 0, at: 1.0, say: "sk", lines: ["Only 2 left!"], color: "#D97706" },
        { p: 1, at: 0.2, on: "pop", card: { title: "Bearing 6312 · Stock", items: [{ kpi: ["On hand", "2", "#0F766E"] }, { kpi: ["Reserved", "1", "#D97706"] }, { kpi: ["Available", "1", "#2563EB"] }, { kpi: ["On order", "6", "#64748B"] }], stagger: 0.7 } },
        { p: 2, at: 0.2, icon: "truck", x: -1700, y: 860, to: [-560, 860], dur: 2.2, front: false },
        { p: 2, at: 2.2, icon: "box", x: -560, y: 820, to: [-880, 780], dur: 1.0 },
        { p: 2, at: 1.2, on: "pop", card: { title: "Goods receipt", items: [{ row: ["Part", "Bearing 6312"] }, { row: ["Quantity", "6"] }, { row: ["Unit cost", "SAR 310"] }, { badge: ["Average cost updated", "#16A34A"] }, { li: "Adjustment? A reason is required", color: "#D97706" }], stagger: 0.8 } },
        { p: 2, at: 3.2, say: "sk", lines: ["Received ✓"], color: "#16A34A" },
      ],
    }),
    story("04-issue", "4 · Parts on the job", [
      "Parts are issued against a work order, and their cost goes with them onto the job.",
      "Requisitions are kept as local references with the purchase order number. There is no ERP connection.",
      "Valuation shows the value of the stock, aging and excess show what has not moved, and parts used shows what was fitted on every machine.",
    ], ["Issued to a work order – with its cost", "Requisitions: local references", "Valuation, aging, parts used per machine"], {
      cam: [-560, 640, 1.1],
      cast: { sk: { role: "storekeeper", x: -1000 }, tech: { role: "technician", x: 300, item: "phone", flip: true }, mgr: { role: "manager", x: 3930, flip: true } },
      beats: [
        { p: 0, at: 0.1, walk: "tech", to: -790 },
        { p: 0, at: 2.4, icon: "box", x: -960, y: 780, to: [-850, 760], dur: 0.8, until: 1 },
        { p: 0, at: 1.6, on: "pop", card: { title: "Issue to WO-000231", items: [{ row: ["Part", "Bearing 6312 ×1"] }, { row: ["Cost on the work order", "SAR 310", "#0F766E"] }] } },
        { p: 0, at: 3.0, say: "tech", lines: ["Thanks – on the job"] },
        { p: 1, at: 0.2, on: "pop", card: { title: "Purchase requisition", items: [{ row: ["Bearing 6312", "×6"] }, { row: ["Purchase order no.", "PO-48213"] }, { li: "Local reference – no ERP link", color: "#64748B" }], stagger: 0.8 } },
        { p: 2, at: 0, cam: [3270, 540, 1.1], dur: 1.8 },
        { p: 2, at: 0.6, on: "big", card: { title: "Store reports", items: [{ kpi: ["Stock value", "SAR 418,000", "#0F766E"] }, { kpi: ["Not moved in 12 months", "SAR 36,500", "#D97706"] }, { li: "Parts used per machine – Excel export", color: "#2563EB" }], stagger: 0.9 } },
        { p: 2, at: 2.2, say: "mgr", lines: ["What sits on the shelf?"] },
      ],
    }),
    story("05-end", "PlantPulse", [
      "Every machine with its own page, and every part where it should be. Next: the people, their shifts and their skills.",
    ], ["Every machine, every part"], {
      cam: [400, 640, 0.75],
      cast: { sk: { role: "storekeeper", x: -300 }, tech: { role: "technician", x: 1150, item: "phone" }, eng: { role: "engineer", x: 1550, item: "tablet" } },
      beats: [{ p: 0, at: 0.3, pose: "sk", wave: 1 }, { p: 0, at: 0.5, pose: "tech", wave: 1 }, { p: 0, at: 0.7, pose: "eng", wave: 1 }, { p: 0, at: 0.2, cam: [500, 640, 0.9], dur: 5 }],
    }),
  ],
};
