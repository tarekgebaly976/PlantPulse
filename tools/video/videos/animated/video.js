// Video 19 – animated explainer in a cartoon factory (lib/factory.js): the technician, supervisor, engineer and manager around one machine; the QR label,
// condition monitoring with warning and alarm limits, the Nelson rules, the work order from alert to close, the
// weekly schedule with its two approvals, and the KPIs. Drawn (layout "anim", lib/anim.js), not filmed: every action
// shown exists in the app; numbers are sample values and each scene carries an "Illustration" label.
"use strict";

const anim = (id, name, chapter, says, captions, extra = {}) => ({ id, layout: "anim", anim: name, chapter, says, captions, ...extra });

module.exports = {
  id: "animated",
  file: "19-plantpulse-animated",
  intro: "From the signal to the fix",
  title: "PlantPulse – from the signal to the fix (animated)",
  covers: "Animated: the four roles (technician, supervisor, engineer, maintenance manager), the QR label and the machine on the phone, condition monitoring with warning and alarm limits and automatic work, the Nelson rules on a control chart, a work order from alert to close (assignment with skills, LOTO, checklist, review, RCA), the weekly schedule with its two approvals, and the KPIs",
  keyframes: [["01-roles", 0.95], ["02-qr", 0.8], ["03-monitoring", 0.9], ["04-nelson", 0.85], ["05-work", 0.9], ["06-plan", 0.9], ["07-loop", 0.9]],
  scenes: [
    anim("01-roles", "f_cast", "The team", [
      "PlantPulse connects four roles around every machine.",
      "The technician does the work on the floor, from the phone.",
      "The supervisor turns requests into work orders, assigns people and signs off LOTO.",
      "The engineer keeps the skill matrix, approves the weekly plan first and leads root cause analysis.",
      "And the maintenance manager gives the final approval and follows the KPIs.",
    ], ["Four roles, one system", "Technician – the work, on the phone", "Supervisor – work orders, people, LOTO", "Engineer – skills, the week, RCA", "Manager – final approval, KPIs"], {
      cards: [
        ["My work on the phone", "Checklist and readings", "Parts and hours"],
        ["Requests to work orders", "Assigns the technician", "LOTO and permit sign-off"],
        ["Skill matrix", "Approves the week first", "Leads the RCA"],
        ["Final approval", "KPIs and targets", "Reports"],
      ],
    }),
    anim("02-qr", "f_qr", "QR label", [
      "Every machine carries a QR label.",
      "The technician scans it with the phone, and the machine opens: its status, open work and next PM.",
      "From there he reports a problem in seconds, and on a field round it works even without a network.",
    ], ["Every machine has a QR label", "Scan: the machine opens on the phone", "Report a problem in seconds – offline too"]),
    anim("03-monitoring", "f_cm", "Condition monitoring", [
      "Readings go into condition monitoring: vibration, temperature, oil analysis, thermography and more.",
      "Each reading is checked against its warning and alarm limits.",
      "A warning raises an amber alert. An alarm raises a critical alert and notifies the team.",
      "A critical alert opens a work order by itself, or a work request for triage, as the department chooses.",
    ], ["Readings from every technique", "Checked against warning and alarm limits", "Amber warning, red critical alert", "Work order or request – automatically"]),
    anim("04-nelson", "f_nelson", "Nelson rules", [
      "Limits catch a problem late. The Nelson rules catch the pattern early.",
      "The centre line is the average, and sigma comes from the moving range.",
      "Seven points in a row, all rising, is a trend, like wear, even while every point is inside the limits.",
      "Seven points in a row on one side of the centre line means the process has shifted.",
      "PlantPulse checks all eight rules on every measurement point and on the KPI control charts.",
    ], ["Limits are late – patterns are early", "Centre line and sigma", "Rule 3: seven rising – a trend", "Rule 2: seven on one side – a shift", "All eight rules, on every chart"]),
    anim("05-work", "f_flow", "From alert to close", [
      "The alert reaches the supervisor, who approves the work order.",
      "He assigns a technician, and PlantPulse warns if a required skill or a valid certificate is missing.",
      "LOTO and permits are signed off before the work can start.",
      "The technician follows the checklist on the phone, records readings, parts and hours, and submits the job.",
      "The supervisor reviews and closes it. A repeated failure is proposed to the engineer for root cause analysis.",
    ], ["Supervisor approves the work order", "Assign – skills and certificates checked", "LOTO and permit first", "Checklist, readings, parts, hours", "Reviewed, closed – repeat failure to RCA"]),
    anim("06-plan", "f_plan", "Plan and follow up", [
      "Planned work goes into the week with the weekly schedule, from the roster and the skills.",
      "The engineer approves the week first, then the manager gives the final approval.",
      "And the manager follows the results on the KPIs: PM compliance, MTBF, MTTR and backlog.",
    ], ["The week, from the roster and the skills", "Engineer, then manager approve", "Results on the KPIs"]),
    anim("07-loop", "f_loop", "The loop", [
      "From the signal to the fix, and back to the next plan: one system for the whole team. PlantPulse.",
    ], ["From the signal to the fix – PlantPulse"]),
  ],
};
