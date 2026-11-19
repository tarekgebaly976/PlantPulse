# PlantPulse Operations module: plan for the paper mill

Status: draft for review, 17 Nov 2026. Start planned after 22 Nov 2026 (after the Google Play production application).
Branch: `claude/serene-davinci-0arq11` (migrations up to 0021)

## 0. Progress

**Phase 1 built (17 Nov 2026), on trial on the demo only.** Setting `CMMS_OPERATIONS_MODULE` (off by default; on in
`deploy/docker-compose.demo.yml`). Migration 0022.

- Menu "Production → Production reports" (permission `op.view`); new built-in roles Production Supervisor
  (`op.enter`) and Production Manager (`op.enter`, `op.confirm`, `op.manage`); Production User can enter reports.
- Settings: machines (production line asset, day start, shifts), grades with ideal rates, disciplines (maintenance
  or not), machine sections (with their equipment), quality defects.
- Daily report: runs and GSM changes (ideal tonnes per grade), reels, stops and sheet breaks split between
  disciplines, quality rejects/downgrades, utilities and notes; calculated shift and day totals, OEE as the mill
  calculates it, downtime and breaks by discipline, gross by GSM, month and year to date, checks (24 h accounted,
  rejects explained …). Draft → submitted → confirmed (locked) → reopen (new revision). Print / PDF in form layout.
- A stop is a maintenance downtime event too: a breakdown with a maintenance discipline counts as an equipment failure
  (MTBF), sheet breaks and process stops do not. Breakdown → "Work request" button. Confirming writes the day's
  production record, so OEE and cost per ton on the KPI pages match the report.
- Demo: second sample plant **DPM – Demo Paper Mill – Operations** with about 30 days of **invented** reports (no real
  mill data), rebuilt every night. Accounts `prod.sup@demo.example.com` (enters reports) and
  `prod.mgr@demo.example.com` (confirms, settings), demo password; other demo accounts also see plant DPM.
- **Daily logs (17 Nov, migration 0023):** configurable daily / per-shift log forms (Settings → Daily log forms):
  lines of kind meter (opening/closing, opening = previous closing), running-hours counter (updates the equipment's
  meter on confirming → meter-based PM), number, yes/no, text, calculated (formula over codes); low/high limits flagged.
  Demo forms: **Utilities – daily generation & electricity** (water, RO recovery, effluent, steam, condensate, gas,
  gas-engine generation and forced stoppage, consumption by area, balance, compressor/boiler running hours) and
  **Stock preparation – shift report** (shift checks, grade/speed/broke, furnish bales per line, tank levels, fresh water,
  forklifts, and the department's open work requests / work orders with "Raise work request", shutdown flag).
- **Production dashboard:** production per day (A / B+S / reject), OEE and A×P×Q trends, breaks per day, downtime and
  breaks by discipline, and every log line marked "Dashboard" as a trend, per tonne of paper where marked
  (water, steam, gas, electricity, bales per t).
- **Names and layout (17 Nov, migration 0024):** menu "PM & SP daily report" (the paper machine report with the
  stock preparation shift logs inside, D / N / day side by side, also printed) and "Utilities daily report" (one form:
  water & RO, WWTP with pH / COD / TSS / sludge, power house, power consumption, boiler house, compressed air, natural
  gas). Log forms can be marked "show inside the PM & SP daily report"; each line can add up or average its shifts.
  Clear back buttons and "Previous day / Next day" on the detail pages (phones).
- **Multi-industry architecture (18 Nov, migration 0025).** The module is industry-independent; the paper mill is one
  configuration of it.
  - *Core* (`app/services/production/`): production lines (table `op_machines`) with a production model (continuous,
    batch, discrete), an output unit (t, pcs, m³, packs …) and a **report profile**. Every profile answers in the same
    **standard measures** (`measures.py`: planned / run hours, produced, good, reject, downgrade, net, ideal,
    planned and input quantity, batches, downtime, failures, stops, `loss_<CATEGORY>` hours) plus daily-log codes.
    A measure that is not recorded is None, never 0. Quantities of different units are never added up: KPIs and
    alert rules over several lines work per unit group.
  - *Generic profile* (`generic.py`): output lines (product, batch / lot / order, run hours, planned, input,
    produced, reject, downgrade; ideal rate copied from the product), stops classified by **loss category**,
    quality losses, shift totals, OEE only when its data are there.
  - *Paper profile* (`paper.py`, profile `paper_machine`): grades / GSM, runs, reels, sheet breaks, trim, steam —
    isolated; the engine never imports paper terms. Lines made before 0025 were set to this profile.
  - *Configurable* (`app/models/production.py`, Production setup page): products, loss categories (sub-categories,
    KPI factor reduced, how a stop counts for maintenance, failure flag, discipline / area), KPIs (`kpis.py`:
    standard library incl. OEE (optional), custom formulas over measures and log codes, target / warning /
    critical, direction, line or area scope; status ok / off target / warning / critical / no target / missing
    data), alert rules (`alerts.py`: below, above, outside, KPI limits, total over look-back, trend down / up,
    overdue actions; consecutive days; role to notify, e-mail, escalation; worker job every 3 h and "Check now"),
    alerts (open / acknowledged / resolved / closed), actions (owner, due date, from an alert or insight).
  - *Production insights* (`insights.py`): last 7 days against the 21 before — KPI deviations, negative trends,
    abnormal consumption per unit, parameters outside limits or unusual, repeated losses, bottleneck / main loss,
    low target achievement, high reject, maintenance-related losses, overdue actions, unacknowledged alerts; each
    with a recommendation.
  - *Templates and onboarding* (`templates.py`): "general" and "paper_mill" (adds only what is missing; never
    overwrites); plant setup: industry (informational), features shown in the menu, menu names, setup checklist
    of 10 steps. Future industry templates are new entries there.
  - *Form builder*: new line kinds select (status), multi (checklist), datetime, product, ref (batch / order);
    target, required lines (block submit), forms linked to a line ("per unit" = per unit of that line's output).
  - Demo: plant DPM from the paper_mill template, utilities / SP forms linked to PM1, plus generic discrete line
    **SH1 – Sheeter & packing line** (packs, 3 invented products, output lines, stops by category, 3 sample actions).
  - New pages: Production KPIs, Production insights, Production setup. Default menu names are generic
    ("Production reports", "Daily logs"); the paper template names them "PM & SP daily report" / "Utilities daily report".
  - Paper stops: the stop type plus an optional loss category of that type (e.g. Planned › Wash-up); empty = the
    type's default category.
- **Safety incident register (18 Nov, migration 0026).** One HSE register per plant (`op_incidents`, numbers
  INC-<plant>-000001): type (near miss, first aid, medical, lost time, property, environment, other), severity,
  date / time, area, line, place, people, injured, lost days, immediate action, root cause, status (open /
  investigating / closed — closed by a production manager). Reported from the register page, from any shift log
  whose form has "Show the area's safety incidents" (the SP and utilities forms in the demo) or from a line's daily
  report; managers of the area are notified (serious ones by e-mail). Actions can follow an incident. Standard
  measures `incidents` / `lost_time_incidents` (KPIs INCIDENTS, LTI; alert rule LTI_REPORTED), insight for
  incidents open more than a week, "days without a lost-time incident". The demo SP form no longer has the single
  incident tick box; 6 invented sample incidents.
- **Hours worked and safety rates (19 Nov, migration 0027).** Hours worked per month (employees, contractors) per
  area or for the whole plant (`op_work_hours`, entered on the incidents page by `op.manage`). Safety rates on the
  incidents page: rolling 12 months and per month LTIFR (lost-time injuries × base ÷ hours), LTISR (lost days × base
  ÷ hours) and TRIR (lost-time + medical-treatment injuries × base ÷ hours); base per plant (Production setup):
  1,000,000 h (ILO / most countries, default) or 200,000 h (OSHA). Months without hours are shown as missing and
  left out of the rolling rates. Also KPIs LTIFR / LTISR / TRIR (measures `hours_worked`, `recordable_incidents`,
  `lost_days`, `safety_base`) in the general template. Demo: invented hours for the last three months.
- **Dashboard by area (19 Nov).** The production dashboard chooses an area (the plant's departments that have a
  production line or a log form), then a line when the area has several. An area without a line (e.g. stock
  preparation, utilities) shows its own log forms ("per t" on its form's line, or on all the plant's lines) and the
  KPIs it can have (safety for that area); plant-wide KPIs an area never records are left out.
- **Whole-mill view and dashboard layout (19 Nov, migration 0028).** "Whole mill" (first in the area list, the
  default with several areas): area cards (output, OEE, downtime per line, incidents, open alerts, worst KPI status,
  KPIs off target; tap = open the area), plant KPIs (per unit group), production per line, main losses over all
  lines, safety rates, follow-up (open alerts, overdue / open actions, open incidents). "Customise" (op.manage:
  production manager, administrator): per view (whole mill, each area) the sections on / off and their order, and the
  KPIs (or the default "show on dashboard" ones); stored in `op_plant_config.dashboard`, the same for everyone.
  Everyone with `op.view` sees the dashboard: by default every role with view rights (maintenance manager, planner,
  engineer, management viewer, production roles); changed in Admin → Roles.
- Not yet: Excel import of past daily sheets, winder/FSC, Q-factors (phase 2); further industry templates.

To switch it on for the real installation later: add `CMMS_OPERATIONS_MODULE=true` to `deploy/.env` and restart.

## 1. Goal

Replace the mill's four daily Excel forms with one Operations module in
PlantPulse. Operators enter each fact once; the module calculates everything
the Excel sheets now calculate, prints the forms in their familiar layout, and
feeds the maintenance side (work requests, downtime, meter-based PM, KPIs).

| Form | Owner | Frequency | Excel today |
|---|---|---|---|
| OPI-F-217 Daily PM Production Report | PM | per day, 2 shifts | 1 sheet per day + Rate + summary |
| OPI-F-805 SP Plant Maintenance Monitoring Report | SP | per shift (D/N) | 1 sheet per shift |
| OPI-F-291 Daily Generation Report | Utilities | per day | 1 sheet per day |
| OPI-F-915 Q-Factors Compliance Monitoring | Quality | 6 checks per day | 1 sheet per grade (31 days × 6 slots) + summary |

## 2. What the reports contain

### OPI-F-217 Daily PM Production Report
- Per shift: supervisor, GSM, speed, run time, gross (QCS/Opti), net, A / B / S grade, reject, M/C trim loss, B-grade % and reject %.
- Machine shutdown hours by responsible discipline: SCM, PM/CK, EAI, ME/WS, EMD, Power Plant/Boiler, SP, Planned SD (today and to date).
- Sheet breaks: count and hours by discipline: PM, SP, EAI, ME, EMD, UT, SCM, Misc.
- Event list: duration, begin, end, type (Break down / sheet break), trouble location (e.g. Calender section, Back coater section), details. One fault can be split across disciplines (5 Nov: calender fault, 1 h 45 Mechanical then 1 h 45 EAI).
- Run and GSM-change segments: begin, end, GSM, speed, ideal MT/min (from the **Rate** sheet: GSM → target speed → ideal MT/min, /h, /day), ideal tons, reason for change, grade-change duration and rejects.
- Gross by GSM; FSC claim (FSC Recycled / Non-FSC); broke tower level.
- Winder: FSC claim, run, pattern, production plan, actual, winder input/output, pattern width (cm), trim loss MT/%, handling loss MT/%.
- Quality rejection and downgrade details: defect, quantity, disposition (R/P = repulp, F/H = finishing house).
- Reel list per shift: reel no., gross, net, trim, reject, B-grade.
- Fresh water (PM / SP / UT), steam (MT and MT per MT of paper).
- OEE: availability = run ÷ 24 h; performance = gross ÷ Σ ideal tons of the segments; quality = A-grade ÷ net. 5 Nov: 78.5% × 88.7% × 94.4% = **65.7%**.
- Summary: day / month-to-date / year-to-date gross, net, saleable, A, B, reject, trim loss.

### OPI-F-805 SP Plant Maintenance Monitoring Report
- Operation notes (e.g. PM stock-off 4:48 PM, stock-on 6:13 PM), incident/accident Y/N, CIL done, 5S activities.
- PM grade, PM speed, broke flow (LPM), SP fresh water (m³).
- Raw material furnish per line, recipe % and bale counts: SOP line (Duplex), MW line (OCC), ONP line (Supermix), Tetra Pak line, BKP line (hardwood / softwood virgin pulp).
- Stock levels %: SOP dump tank, MW dump tank #1, ONP dump tank, KP storage tanks #1 and #2, SOP bleaching tank #2.
- Critical equipment issues and shutdown jobs: description, discipline (MECH, EIA, Workshop, Welding), needs shutdown Y/N, **WO # (empty on every line)**.
- Downtime: equipment, from, to, hours, stop/bypass, details, WO #. Issues and root cause.
- Daily forklift status (condition, placed, operating, remarks).

### OPI-F-291 Daily Generation Report (Utilities)
- Flow meters (opening / closing reading → per day): OIG effluent, treated water from bioclarifier, STP make-up, RO #1–3 product and reject, reject water to Tawzea / irrigation, fresh water make-up, fire-fighting line, combiblock water.
- Calculated: total RO product, feed, **RO recovery %**, OPI fresh water procured and total, consumption by area (PM, SP, Utility/boiler, OIG), product water tank level, GLS level.
- Steam generation, boiler make-up, condensate recovery and % (shows `#DIV/0!` when steam is 0), soft water, gas (Nm³), compressed air.
- Gas engines (Jenbacher #1–6): running hours, generation, forced stoppage, remarks.
- Power consumption (MWh) by area: paper machine, stock preparation, boiler house, power-plant auxiliaries, OPF, combiblock, admin, OTY, OFC, PP Seco, WTP, finishing house; OPI vs group consumption, gas use.
- Running-hour counters (day opening / closing): RO plants #1–3, air compressors #1–4 (running and loaded hours), PM and SP air driers, boilers #1–3, EG boilers #1–3, effluent intake, fire fighting.

### OPI-F-915 Q-Factors Compliance Monitoring (Quality)
- One sheet per grade: 230, 250, 280, 300, 320, 350, 380, 400, 450 GSM, each with its target speed.
- About 90 parameters in 5 sections, each with **LSL / LCL / Target / UCL / USL** for that grade:
  - SP: storage-tank layer consistencies, LD cleaner DP per layer.
  - Wet End: mixing-tank consistencies, jet/wire ratio per layer, LD cleaner DP, cationic starch per layer, spray starch solids, biocide dosing.
  - Dry End: LPS steam header, dryer fluff cleaning (OK / NOT OK), pre / curtain / top / back coater IR rows and output %, air dryer temperatures, blade angle, tray viscosity and solids, coat weights.
  - CK (coating kitchen): pH, viscosity, solids for pre-coat, curtain bottom (two recipes) and top coat.
  - FH: sheeter 1–5 camera sensitivity and DRS vacuum pressures.
- 6 checks a day: 7–8 AM, 11–12, 3–4 PM, 7–8 PM, 11–12 AM, 3–4 AM. Codes instead of values: CG, NR, stop, NF, Not run, ODB (and P/T/C codes to confirm).
- Count of non-conformities (NC) per day; points outside control limits; points checked; % compliance.
- Section Compliance summary per day and section: # recorded vs # required, % compliance, overall % against the **80% target**, then Issues → Actions → Status (E1–E5) and Escalation.
- Example, 1–3 Nov: Dry End recorded 117 / 126 / 93 checks against 114 required, and its compliance was 62% / 52% / 48%. Overall compliance was 77–83%.

## 3. Design principles

1. **Enter once.** The grade running on the PM (from the PM report) selects the Q-factor limits. UT meter readings provide the water and steam figures on the PM report. Equipment running hours update meter-based PM. Stops are the same `downtime_events` that MTBF / availability use.
2. **Calculate, never retype.** Totals, to-date figures, RO recovery, OEE, compliance %, specific consumption.
3. **Same forms on paper.** PDF output keeps the form code, revision and layout (OPI-F-217, -805, -291, -915), so audits and ISO documents stay valid.
4. **Lock after confirmation.** Shift supervisor submits, the department head confirms, then the report is locked (as shift handover works today). A correction creates a new revision.
5. **Configurable, not hard-coded.** Sections, parameters, limits, meters, tanks, furnish lines, disciplines and codes are lists the admin can edit. The next customer's mill can use the same module.

## 4. Building blocks (shared engine)

| Block | Used by | Notes |
|---|---|---|
| Grade and rate table | PM, Quality, SP | GSM, target speed, ideal MT/min. Versioned with effective date. |
| Disciplines and machine sections | PM, SP | SCM, PM/CK, EAI, ME/WS, EMD, Power Plant, SP, UT, Misc; wire, press, dryer, coaters, calender, reel, winder, etc. |
| **Readings engine** | Quality, SP, UT | Parameter templates by section, time slots (6/day, per shift, daily), value or code, limits per grade, NC flags. |
| **Meters** | UT, SP, PM | Counter readings (opening/closing, rollover check) for flow, energy and running hours. Running-hour meters linked to assets drive existing meter-based PM plans. |
| Stops and breaks | PM, SP, UT | Extend `downtime_events`: discipline, section, event type (breakdown / sheet break / planned / grade change), source, stop-or-bypass, split across disciplines. |
| Equipment issues | SP (later PM, UT) | Each issue = work request; "needs shutdown" puts it on the next shutdown's job list (existing shutdowns module). |
| Daily report and to-date engine | all | Day / MTD / YTD totals, lock and revision, PDF in form layout. |

## 5. Phases

### Phase 1: Foundation + PM Daily Production Report (about 4 weeks)
- Grade and rate table (import from the Rate sheet), disciplines, machine sections, defect list with dispositions.
- PM shift entry: run segments (ideal tons calculated), reels, stops and breaks (split by discipline), rejects and downgrades, FSC claim, broke tower level, notes.
- Calculations: all OPI-F-217 totals, discipline tables, OEE as the mill calculates it, day / MTD / YTD summary.
- `production_records` gets **ideal tons**, so OEE in the KPI module equals the report's figure even when the GSM changes during the day.
- Stops by ME / EAI / EMD → one tap raises a work request.
- PDF in OPI-F-217 layout; import of the November sheets (01–06) so to-date figures start correct.

### Phase 2: Readings engine + Q-Factors Compliance (about 3 weeks)
- Import the 9 grade sheets: parameters with LSL / LCL / Target / UCL / USL.
- Check rounds per slot (6 a day). The form shows only the current grade's limits, colours values in or out of limits, and offers the codes (CG, NR, stop, NF …).
- Reminder when a slot is due or missed, which addresses the low "recorded vs required" figures in Dry End.
- Section Compliance summary calculated automatically; issues, actions and escalation with owner and due date.
- Out-of-limit on an equipment parameter (IR output, LD cleaner DP, vacuum, air dryer temperature) can raise a work request.
- Trend and control charts using the existing Nelson-rules service (`services/nelson.py`).
- This phase also starts the planned **Quality module**.

### Phase 3: Utilities Daily Generation Report (about 2–3 weeks)
- Meter list from OPI-F-291; daily reading entry with opening = yesterday's closing, rollover and "closing < opening" checks.
- Calculations: per-day values, RO recovery %, fresh water by area, condensate recovery % (no `#DIV/0!`), power by area, gas, compressed air.
- Gas engines: running hours, generation, forced stoppage → downtime events.
- Running-hour counters (compressors, RO plants, driers, boilers) update **meter-based PM plans** automatically.
- PM and SP water and steam figures flow into their reports. **Specific consumption per ton of paper:** water, steam, power, gas.
- PDF in OPI-F-291 layout.

### Phase 4: SP Shift Report (about 2–3 weeks)
- Furnish lines with recipe % and bale counts → fibre consumption per ton.
- Tank levels (readings engine), broke flow, fresh water (from UT meters), CIL and 5S checks, incident Y/N, stock-off / stock-on events.
- Critical equipment issues → work requests (WO # fills itself); open issues carry forward to the next shift; "needs shutdown" → shutdown job list.
- SP downtime (stop / bypass) linked to WOs; forklifts as assets with a daily status.
- PDF in OPI-F-805 layout.

### Phase 5: Winder / FH, dashboards, floor use (about 3 weeks)
- Winder runs: pattern, plan vs actual, input / output, width, trim and handling loss, FSC balance.
- Production dashboard: tons vs plan, OEE trend, downtime and breaks Pareto by discipline and section, grade-change losses, trim %, Q-factor compliance by section, consumption per ton.
- Operations section in the management report; daily e-mail PDF to managers.
- Offline entry in `/field` for rounds and shift entries (reuses offline sync).

Total: about 14–16 weeks. Each phase is usable on its own and goes live on the demo first.

## 5a. Trial on the demo first

Build each phase in the normal code, but **switched off by default**:
- A setting `OPERATIONS_MODULE=true` turns the module on. It is set only in `deploy/.env.demo`.
  The live app (app.plantpulse-cmms.com) and customer copies get the code, but menus and pages stay hidden.
- The new database tables are added everywhere (additive only, no change to existing data), so
  turning the module on later for the live app is just the setting plus a restart.
- The DEMO organization gets a paper-mill part (a paper machine, SP, UT, Quality) with **sample data
  modelled on the November forms but anonymised**: no real names, companies or customer codes.
  The nightly reset rebuilds it, with the last 30 days of reports, reels, stops, meter readings and Q-factor checks.
- Demo accounts to test with: production supervisor, SP operator, UT engineer, quality technician
  (new @demo.example.com accounts, same shared password).
- When the trial is approved: set `OPERATIONS_MODULE=true` in `deploy/.env` (and per customer) and restart.

## 6. Data model (outline)

| Migration | Tables / changes |
|---|---|
| 0022 | `op_grades`, `op_grade_rates` (versioned), `op_disciplines`, `op_sections`, `op_defects` |
| 0023 | `op_daily_reports` (form, department, date, status, revision, lock), `op_shift_entries`, `op_run_segments`, `op_reels`, `op_quality_losses`; `production_records.ideal_tons` |
| 0024 | `downtime_events`: `discipline_id`, `section_id`, `event_type`, `source`, `is_bypass`, `parent_event_id` (split) |
| 0025 | readings engine: `op_param_templates`, `op_params`, `op_param_limits` (per grade), `op_slots`, `op_readings`, `op_compliance_actions` |
| 0026 | meters: `op_meters` (kind, unit, asset link, rollover), `op_meter_readings`; link to existing PM meter readings |
| 0027 | SP: `op_furnish_lines`, `op_furnish_entries`, `op_equipment_issues` (→ work request, shutdown) |
| 0028 | winder: `op_winder_runs` |

Code: `models/operations.py`, `services/operations/*` (pm_report, readings, meters, sp_report, compliance), routers under `/operations`, importers for the four Excel forms, frontend pages under `/operations` (PM report, Q-factors, Utilities, SP).

## 7. Roles

| Role | Can do |
|---|---|
| PM shift supervisor | Enter and submit the PM shift report |
| SP operator / SP shift in-charge | Enter and submit the SP shift report |
| Utilities shift engineer | Enter meters and the generation report |
| Quality technician | Enter Q-factor readings |
| Department head (PM, SP, UT, Quality) | Confirm and lock; issues, actions and escalation |
| Production manager / mill manager | Grades, rates, targets, all reports and dashboards |
| Maintenance | Sees the raised work requests and shutdown jobs; running hours drive PM |

## 8. Points noticed in the files
- The same calender fault on 5 Nov appears as two events (Mechanical, then EAI). The split-by-discipline design keeps it as one stop with two responsibility parts.
- Every WO # cell in the SP report is empty. Linking issues to work requests closes that gap.
- Fresh-water figures differ between files. For 5 Nov the PM report shows PM 2245 / SP 2032 / UT 595 m³, and the UT report shows PM 3267 / SP 2143 / Utility 1337 m³. The PM report may refer to a different day or meters. One source of meter readings removes the difference.
- `#DIV/0!` in condensate recovery when steam generation is 0.
- Q-factor compliance counts missing readings; Dry End is often below the number required.

## 9. Questions for the mill
1. One paper machine only? Can gross production come from a QCS / Opti export later?
2. Who fills each form today (supervisor or clerk)? Is the winder section filled by FH or by PM?
3. Meaning of the Q-factor codes: CG, NR, stop, NF, Not run, ODB, and P1–P10 / T1–T10 / C1–C10.
4. Is "% Compliance" = readings within control limits ÷ readings checked, with 80% as the target for every section?
5. Does the PM report's water figure come from the same meters as the UT report?
6. FSC tracking in the first version, or later?
7. Priority order: the plan proposes PM → Q-factors → Utilities → SP. Change if another form hurts more.
