// Cartoon 10 – condition monitoring in the cartoon factory (anim "story", lib/story.js).
// Facts as in video 06: measurement points with technique, unit, warning and alarm limits; readings entered on site,
// from a round, or received from the plant; each reading compared with the limits (normal, warning, alarm), a plain
// limit check with no prediction claimed; the control chart of the last hundred readings with the eight Nelson rules;
// an alert raised and the dashboard counter; the engineer acknowledges it and creates a predictive work order with one
// click; resolved with what was found; reading rounds become work orders like PM; Excel import of points, rounds and
// reading history, and a priority list. Nelson rules as in app/services/nelson.py (XmR chart, sigma from the average
// moving range): used on measurement points (last 30 readings), Home, company KPI charts and the management report.
"use strict";

const story = (id, chapter, says, captions, spec) => ({ id, layout: "anim", anim: "story", chapter, says, captions, ...spec });
const G = "#0F766E", R = "#DC2626", A = "#D97706", B = "#2563EB";

module.exports = {
  id: "c10-condition-monitoring",
  file: "29-cartoon-condition-monitoring",
  intro: "Cartoon · Condition monitoring",
  title: "PlantPulse cartoon – condition monitoring and the Nelson rules",
  covers: "Cartoon: measurement points with technique, unit and warning and alarm limits, reading rounds as work orders, a reading compared with the limits at once, the alert and the dashboard counter, the control chart with the Nelson rules, acknowledging the alert, a predictive work order with one click, resolving it with what was found, the eight Nelson rules explained with their probable causes, where PlantPulse uses them (condition monitoring, Home, company KPIs, the management presentation), and Excel import of points, rounds and history",
  keyframes: [["03-chart", 0.6], ["04-rules", 0.32], ["05-where", 0.3], ["06-fix", 0.3]],
  scenes: [
    story("01-points", "1 · Listen to the machines", [
      "Machines warn us before they break: vibration, temperature, current. Condition monitoring listens to them.",
      "Each measurement point has a technique, a unit, and two limits: warning and alarm.",
      "Readings are entered on site, from a round, or received from plant systems. Reading rounds become work orders, just like preventive maintenance.",
    ], ["Catch it before it breaks", "Each point: technique, unit, two limits", "Rounds become work orders"], {
      cam: [3270, 540, 1.1],
      cast: { eng: { role: "engineer", x: 2630, item: "tablet" }, mgr: { role: "manager", x: 3930, flip: true } },
      beats: [
        { p: 0, at: 0.4, on: "big", card: { title: "Condition monitoring", items: [{ kpi: ["Vibration", "mm/s", B] }, { kpi: ["Temperature", "°C", A] }, { kpi: ["Motor current", "A", G] }], stagger: 0.8 } },
        { p: 0, at: 1.2, say: "eng", lines: ["Listen to the machines"], dx: -40 },
        { p: 1, at: 0.2, on: "big", card: { title: "Point · MTR-01 DE bearing", items: [{ row: ["Technique", "Vibration velocity"] }, { row: ["Unit", "mm/s"] }, { row: ["Warning limit", "4.5", A] }, { row: ["Alarm limit", "7.1", R] }], stagger: 0.8 } },
        { p: 2, at: 0.2, on: "big", card: { title: "Reading round · Press section", tag: "Work order", items: [{ li: "8 points · every week" }, { li: "Entered on site, or from plant systems" }, { badge: ["Round work order created", "#16A34A"] }], stagger: 0.8 } },
        { p: 2, at: 2.6, say: "mgr", lines: ["Like PM – on time"], color: "#16A34A" },
      ],
    }),
    story("02-reading", "2 · One number", [
      "On the round, the technician measures the drive motor bearing. Recording a reading takes one number.",
      "The answer comes at once: the warning limit is passed. An alert is raised, and the counter on the dashboard goes up. A plain limit check: nothing is predicted.",
    ], ["One number on the phone", "Warning passed – alert raised"], {
      cam: [1050, 650, 1.15],
      cast: { tech: { role: "technician", x: 1500, item: "phone" } },
      beats: [
        { p: 0, at: 0.2, walk: "tech", to: 1130 },
        { p: 0, at: 1.4, pose: "tech", raise: 0.8 },
        { p: 0, at: 1.8, on: "phone", card: { title: "MTR-01 · DE bearing", tag: "Round", items: [{ row: ["Vibration", "5.8 mm/s"] }, { btn: ["Save reading", G] }], stagger: 0.8 } },
        { p: 1, at: 0.1, world: { beacon: "amber" } },
        { p: 1, at: 0.2, on: "phone", card: { title: "MTR-01 · DE bearing", tag: "Warning", items: [{ row: ["Vibration", "5.8 mm/s", A] }, { row: ["Warning limit", "4.5 – passed", A] }, { badge: ["Alert raised", A] }, { kpi: ["Dashboard · condition alerts", "1", A] }], stagger: 0.8 } },
        { p: 1, at: 1.2, icon: "warn", x: 1000, y: 640 },
        { p: 1, at: 2.4, say: "tech", lines: ["Warning – it's flagged!"], color: A },
      ],
    }),
    story("03-chart", "3 · Real, or noise?", [
      "The engineer opens the point's control chart: the last hundred readings, with the average, the control limits, and the warning and alarm limits.",
      "The eight Nelson rules find patterns, like a steady rise, even inside the limits. Here, seven points in a row are rising. This change is real.",
    ], ["The control chart – a hundred readings", "Nelson rules: a steady rise is real"], {
      cam: [3270, 540, 1.1],
      cast: { eng: { role: "engineer", x: 2630, item: "tablet" }, mgr: { role: "manager", x: 3930, flip: true } },
      beats: [
        { p: 0, at: 0.3, on: "big", card: { title: "Control chart · MTR-01 DE bearing", items: [{ chart: { pts: [2.2, 2.4, 2.1, 2.3, 2.5, 2.2, 2.4, 2.6, 3.0, 3.5, 4.1, 4.7, 5.8], warn: 4.5, alarm: 7.1, max: 8 } }, { row: ["Average", "2.4 mm/s"] }], stagger: 1.0 } },
        { p: 0, at: 1.4, say: "eng", lines: ["Let's look closer"], dx: -40 },
        { p: 1, at: 0.2, on: "big", card: { title: "Control chart · MTR-01 DE bearing", items: [{ chart: { pts: [2.2, 2.4, 2.1, 2.3, 2.5, 2.2, 2.4, 2.6, 3.0, 3.5, 4.1, 4.7, 5.8], warn: 4.5, alarm: 7.1, max: 8 } }, { badge: ["Nelson rule 3 – seven points rising", R] }, { li: "Rising even before the warning limit", color: A, tick: false }], stagger: 1.0 } },
        { p: 1, at: 3.4, say: "mgr", lines: ["Not noise – plan it"], color: R },
      ],
    }),
    story("04-rules", "4 · The eight Nelson rules", [
      "So what are the Nelson rules? Each chart has a centre line, the average, and a sigma, worked out from how much each reading moves from the one before. A limit only speaks when it is already late. The Nelson rules look for patterns.",
      "Rule one: one point more than three sigma from the centre line, often a new person or a wrong setup. Rule two: seven points in a row on the same side of the line: the setup or the process has changed.",
      "Rule three: seven points in a row, all rising or all falling. That is a trend, like wear. Rule four: fourteen points in a row going up and down, in turn. That is over-control: someone adjusting too often.",
      "Rule five: two out of three points more than two sigma out, on the same side, again a new person or a wrong setup. Rule six: four out of five points more than one sigma out: a small shift.",
      "Rule seven: fourteen points in a row hugging the centre line, within one sigma. Rule eight: eight points in a row more than one sigma away, on either side. Both say the process has changed.",
    ], ["Centre line and sigma – patterns, not only limits", "Rule 1: beyond 3σ · Rule 2: seven on one side", "Rule 3: seven rising · Rule 4: fourteen alternating", "Rule 5: 2 of 3 beyond 2σ · Rule 6: 4 of 5 beyond 1σ", "Rule 7: fourteen hugging · Rule 8: eight away"], {
      cam: [3270, 540, 1.1],
      cast: { eng: { role: "engineer", x: 2630, item: "tablet" }, tech: { role: "technician", x: 3930, item: "phone", flip: true } },
      beats: [
        { p: 0, at: 0.3, on: "big", card: { title: "A control chart", items: [{ chart: { pts: [5.1, 4.8, 5.3, 4.9, 5.2, 4.7, 5.0, 5.4, 4.9, 5.1, 4.8, 5.2], cl: 5, sig: 0.5, min: 3, max: 7, h: 260 } }, { row: ["Centre line", "the average"] }, { row: ["Sigma", "from the moving range"] }], stagger: 1.2 } },
        { p: 0, at: 1.2, say: "eng", lines: ["Look for patterns"], dx: -40 },
        { p: 1, at: 0.2, on: "big", card: { title: "Rules 1 and 2", items: [{ h: "1 · One point beyond 3 sigma" }, { chart: { pts: [5, 5.2, 4.8, 5.1, 4.9, 5.3, 4.7, 5.0, 6.7], cl: 5, sig: 0.5, min: 3, max: 7, h: 150, hit: [8] } }, { h: "2 · Seven in a row on one side" }, { chart: { pts: [4.6, 4.4, 4.8, 5.3, 5.4, 5.2, 5.6, 5.3, 5.5, 5.4], cl: 5, sig: 0.5, min: 3, max: 7, h: 150, hit: [3, 4, 5, 6, 7, 8, 9] }, p: 1, at: 5.5 }], stagger: 0.5 } },
        { p: 2, at: 0.2, on: "big", card: { title: "Rules 3 and 4", items: [{ h: "3 · Seven rising or falling – wear" }, { chart: { pts: [4.9, 4.6, 4.7, 4.9, 5.1, 5.3, 5.5, 5.8, 6.0], cl: 5, sig: 0.5, min: 3, max: 7, h: 150, hit: [2, 3, 4, 5, 6, 7, 8] } }, { h: "4 · Fourteen up and down – over-control" }, { chart: { pts: [5, 5.5, 4.6, 5.4, 4.5, 5.6, 4.7, 5.5, 4.6, 5.4, 4.5, 5.5, 4.7, 5.4], cl: 5, sig: 0.5, min: 3, max: 7, h: 150, hit: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13] }, p: 2, at: 5.5 }], stagger: 0.5 } },
        { p: 2, at: 3.0, say: "tech", lines: ["Like our bearing!"], color: "#D97706" },
        { p: 3, at: 0.2, on: "big", card: { title: "Rules 5 and 6", items: [{ h: "5 · Two of three beyond 2 sigma" }, { chart: { pts: [5, 4.9, 5.1, 6.2, 5.0, 6.3, 5.1], cl: 5, sig: 0.5, min: 3, max: 7, h: 150, hit: [3, 5] } }, { h: "6 · Four of five beyond 1 sigma" }, { chart: { pts: [5, 4.9, 5.6, 5.7, 5.1, 5.8, 5.6], cl: 5, sig: 0.5, min: 3, max: 7, h: 150, hit: [2, 3, 5, 6] }, p: 3, at: 5.0 }], stagger: 0.5 } },
        { p: 4, at: 0.2, on: "big", card: { title: "Rules 7 and 8", items: [{ h: "7 · Fourteen within 1 sigma" }, { chart: { pts: [5.1, 4.9, 5.0, 5.2, 4.8, 5.1, 4.9, 5.0, 5.2, 4.9, 5.1, 4.8, 5.0, 5.1], cl: 5, sig: 0.5, min: 3, max: 7, h: 150, hit: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13] } }, { h: "8 · Eight beyond 1 sigma, either side" }, { chart: { pts: [5.7, 4.3, 5.8, 4.2, 5.6, 4.4, 5.7, 4.3], cl: 5, sig: 0.5, min: 3, max: 7, h: 150, hit: [0, 1, 2, 3, 4, 5, 6, 7] }, p: 4, at: 4.5 }], stagger: 0.5 } },
      ],
    }),
    story("05-where", "5 · Where PlantPulse uses them", [
      "Where does PlantPulse use them? First, in condition monitoring. Every measurement point has its control chart, and the points list has a Nelson column, worked out from the last thirty readings, so a pattern shows even inside the limits.",
      "Second, on Home. The condition monitoring section lists the points in alarm, or with a Nelson signal, most urgent first.",
      "Third, in company KPIs. Each KPI has a control chart over the months, against its target, with the same eight rules and the probable cause of each.",
      "And the management presentation counts the points with a Nelson signal, so the monthly review sees them too.",
    ], ["1 · Condition monitoring – the Nelson column", "2 · Home – signals, most urgent first", "3 · Company KPIs – control chart per KPI", "4 · The management presentation"], {
      cam: [3270, 540, 1.1],
      cast: { eng: { role: "engineer", x: 2630, item: "tablet" }, mgr: { role: "manager", x: 3930, flip: true }, sup: { role: "supervisor", x: 1130, item: "phone" } },
      beats: [
        { p: 0, at: 0.3, on: "big", card: { title: "Condition monitoring · Points", items: [{ row: ["MTR-01 DE bearing", "Warning · R3", R] }, { row: ["Fan F-02 bearing", "Normal · R2", A] }, { row: ["Pump P-12 temperature", "Normal", "#16A34A"] }, { li: "Nelson column: last 30 readings", color: B, tick: false }], stagger: 0.8 } },
        { p: 0, at: 4.4, say: "eng", lines: ["Inside the limits!"], color: A, dx: 10 },
        { p: 1, at: 0, cam: [1050, 650, 1.15], dur: 1.6 },
        { p: 1, at: 0.6, pose: "sup", raise: 0.8 },
        { p: 1, at: 0.8, on: "phone", card: { title: "Home · Condition monitoring", items: [{ row: ["MTR-01 DE bearing", "Alarm", R] }, { row: ["Fan F-02 bearing", "R2", A] }, { li: "Most urgent first", color: "#64748B", tick: false }], stagger: 0.7 } },
        { p: 2, at: 0, cam: [3270, 540, 1.1], dur: 1.6 },
        { p: 2, at: 0.5, on: "big", card: { title: "Company KPI · Breakdown hours · monthly", items: [{ chart: { pts: [52, 48, 55, 50, 47, 51, 49, 46, 44, 43, 41, 40, 38], cl: 47, sig: 3, min: 30, max: 62, h: 230, hit: [6, 7, 8, 9, 10, 11, 12] } }, { row: ["Rule 3 · seven in a row falling", "Pattern: trend", "#16A34A"] }], stagger: 1.0 } },
        { p: 2, at: 3.6, say: "mgr", lines: ["A real improvement ✓"], color: "#16A34A" },
        { p: 3, at: 0.3, on: "big", card: { title: "Management presentation", tag: "PowerPoint", items: [{ kpi: ["Points with a Nelson signal", "2", A] }, { li: "Scorecard · Trends · Bad actors · Costs" }], stagger: 0.9 } },
      ],
    }),
    story("06-fix", "6 · Fix it before it breaks", [
      "The engineer acknowledges the alert, and creates a predictive work order with one click.",
      "The bearing is changed in a planned stop, not a breakdown. The alert is resolved with what was found, and the readings go back to normal.",
      "Points, rounds and the history of past readings can be imported from Excel, so the trends start full, and a priority list sets which points matter most.",
    ], ["Acknowledged – predictive work order", "Planned, not a breakdown – resolved", "Excel import – trends start full"], {
      cam: [3270, 540, 1.1],
      cast: { eng: { role: "engineer", x: 2630, item: "tablet" }, tech: { role: "technician", x: 1130, item: "phone" } },
      beats: [
        { p: 0, at: 0.3, on: "big", card: { title: "Alert · MTR-01 DE bearing", tag: "Warning", items: [{ badge: ["Acknowledged by the engineer", B] }, { btn: ["Create predictive work order", G] }, { li: "WO-000301 · Predictive · bearing check", color: "#16A34A", p: 0, at: 2.6 }], stagger: 1.0 } },
        { p: 0, at: 2.6, icon: "paper", x: 2480, y: 380, label: "WO-000301", until: 1 },
        { p: 0, at: 3.0, say: "eng", lines: ["Planned, not a breakdown"], color: "#16A34A", dx: -40 },
        { p: 1, at: 0, cam: [1050, 650, 1.15], dur: 1.6 },
        { p: 1, at: 0.2, world: { beacon: "red", running: false, lock: 1 } },
        { p: 1, at: 0.6, pose: "tech", work: 1 },
        { p: 1, at: 2.6, pose: "tech", work: 0 },
        { p: 1, at: 2.8, world: { lock: 0, beacon: "green", running: true } },
        { p: 1, at: 3.0, on: "phone", card: { title: "Alert · resolved", tag: "Normal", items: [{ row: ["Found", "Outer race worn"] }, { row: ["Done", "Bearing replaced"] }, { row: ["New reading", "2.1 mm/s", "#16A34A"] }], stagger: 0.7 } },
        { p: 1, at: 4.4, say: "tech", lines: ["Back to normal ✓"], color: "#16A34A" },
        { p: 2, at: 0, cam: [3270, 540, 1.1], dur: 1.6 },
        { p: 2, at: 0.4, on: "big", card: { title: "Import from Excel", items: [{ row: ["Points and rounds", "Points.xlsx", G] }, { row: ["Reading history", "3 years", G] }, { row: ["Priority list", "Critical points first", B] }], stagger: 0.8 } },
        { p: 2, at: 0.8, icon: "paper", x: 2480, y: 380, label: "Excel" },
      ],
    }),
    story("07-end", "PlantPulse", [
      "Listen to the machines, and fix them before they stop. That is condition monitoring in PlantPulse.",
    ], ["Fix it before it stops"], {
      cam: [1800, 640, 0.75],
      cast: { tech: { role: "technician", x: 1120, item: "phone" }, eng: { role: "engineer", x: 1500, item: "tablet" }, sup: { role: "supervisor", x: 1900, item: "clipboard" }, mgr: { role: "manager", x: 2300 } },
      beats: [{ p: 0, at: 0, world: { beacon: "green", running: true } }, { p: 0, at: 0.3, pose: "tech", wave: 1 }, { p: 0, at: 0.5, pose: "eng", wave: 1 }, { p: 0, at: 0.7, pose: "sup", wave: 1 }, { p: 0, at: 0.9, pose: "mgr", wave: 1 }, { p: 0, at: 0.2, cam: [1700, 640, 0.9], dur: 5 }],
    }),
  ],
};
