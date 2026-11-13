# User manual

The interface is available in **English** and **Arabic** (right-to-left): use the language button (文A icon) in the
top bar. Your choice is saved to your account. The coloured badge at the top shows whether you are **online**; the
system needs a connection to save records — nothing is stored silently on the device.

A coloured label in the top bar marks systems that are **not** your real plant: red **TEST** = the test copy used
for trying new versions and training; blue **DEMO** = the public demo (https://demo.plantpulse-cmms.com) with sample
data that is reset every night. Record real work only in the system without a label.

Screenshots: `docs/screenshots/`.

## 1. Signing in
Use your company e-mail and password. After 5 wrong attempts the account is locked for 15 minutes. If you belong to
several plants, choose the plant in the top bar; you only see data of the selected plant (and only your department
if your account is department-restricted).

## 2. Install on a phone or tablet
Open the site in Chrome/Edge (Android) or Safari (iOS) → *Add to Home screen*. The app opens on **My work**.

## 2a. Searching
The magnifier in the top bar (or **Ctrl+K**, or **/**) searches everything you are allowed to see at once: equipment,
work orders, work requests, spare parts, PM plans, lubrication and condition-monitoring points, RCAs and shutdowns.
Every list also has its own search box (in Assets it works in the hierarchy view too). Type a code, a name or a few
words in any order — every word must be found, e.g. `crusher motor` or `MIX bearing`. Work orders, requests, plans and
points are also found by their equipment's code or name. Arabic spellings of أ/إ/آ/ا, ة/ه and ى/ي are treated as the
same letter. A word of one or two characters must be the start of a word (`OS` finds `OS1`, but `1` does not match the 1 inside `WO-P1-…`).

## 2b. The dashboard
One colour code, shown as a key under the quick buttons: **red** = act now, **amber** = needs attention or waiting
for someone, **green** = all clear / target met (a counter at zero turns green with a tick), **grey** = information.
Each counter opens exactly the list it counts. *Condition monitoring alarms (open)* counts every open alarm and splits
it into alarm limit and warning limit underneath. *KPIs: result vs target* shows each KPI as a tile with its result
(last 6 months), its target and **Met** / **Close** (missed by up to 10 %) / **Missed**.
*Customise dashboard* (top right): choose sections, counters, calculated KPIs and company KPIs. The layout is saved on
the server for you and the plant, so phone and computer show the same; *Reset to default* restores it.

## 2c. Field round without internet
*Field round (offline)* in the menu (and the red *Offline* badge) opens a screen made for walking the plant. Press
*Prepare for offline* once while connected: all equipment of your departments (code, name, place in the tree,
criticality, QR token, equipment type) and the last five work orders per equipment are kept on the phone. Then, with
or without internet: *Scan QR* (or search) opens the equipment card; *New work request* takes the symptom, suspected
failure mode, priority, *Breakdown* and up to 6 photos (made smaller on the phone). Without internet the request
waits under *Requests from this phone* and is sent by itself when the connection is back (also every minute, or
*Send now*); it then gets its WR number and the photos follow. Each request carries its own reference, so sending it
again never makes a second request; the time it was written on the phone is kept. If PlantPulse is opened without
internet it goes to the field round. Requests not sent are deleted at sign-out (the phone asks first); requests
written by another user on the same phone are only sent when that user signs in. A breakdown written offline reaches
the supervisor only when the phone is back online: also call or use the radio. Approvals, LOTO / permit sign-off and
closing stay online.

## 3. Reporting a problem (everyone with "Work requests")
*Work requests → New work request* (or the red button on an asset page / after scanning its QR code). Choose the asset,
describe the symptom, tick **Breakdown** if the machine is stopped — supervisors are alerted immediately.

## 4. Technicians: doing the work
1. **My work** lists work orders assigned to you, sorted by due date. ⚠ marks jobs needing LOTO/permit.
2. Open a job. If LOTO is required, record every isolation point in the **LOTO isolation register** (Checklist tab)
   when you apply the lock: point, energy type, lock/tag number, and tick *Zero energy verified* after testing.
   The supervisor then signs off the LOTO / permit — the *In progress* button is refused until then.
3. Press **Move to: In progress**.
4. **Checklist** tab: tap OK / Not OK, enter readings (out-of-range readings are flagged), record lubrication tasks
   (only the specified lubricant or an approved alternative is accepted).
5. Record findings, root cause, failure codes, downtime; add **photos** in *Attachments* (camera opens on phones).
6. **Labor** tab: book your hours (you can only book your own time).
7. **Materials** tab → *Spare parts used*: record every part fitted (search by code or description, or type a
   description for items not in the list). This does not change store stock; it builds the history of parts per
   work order and machine and adds the cost to the work order.
8. **Remove lock** for each isolation point when the work is finished — the work order cannot be completed while
   a lock is still applied.
9. **Move to: Awaiting review / test** when done.

Scan an equipment QR label with **Scan QR** to open its page: history, spare parts (BOM), manuals, meters.
**Print QR labels** (Assets page, an asset's page, Lubrication page) makes a PDF of A4 label sheets with 24 labels
(3 × 8, 70 × 37 mm): QR code, code, name and location. Choose an asset (it and everything below it), levels and
department, or a lubrication route; *Labels already used on the first sheet* starts lower on a partly used sheet.
Print at 100% / actual size. At most 2,400 labels (100 sheets) per PDF.

## 5. Supervisors
* *Work requests*: accept (creates a work order) or reject with a reason.
* Approve work orders, assign technicians (*Details* tab — conflicts with leave or overlapping jobs are flagged),
  sign off LOTO/permits (permit number, permit types such as cold/hot work, electrical, confined space, work at
  height, and validity — an expired permit blocks sign-off and restart; every isolation point must be verified),
  record test results, complete and close work. Emergency breakdowns may go straight to
  *In progress*; closing them needs the emergency-closure permission.
* Completion is blocked until required checklist items, test results, failure codes (corrective/emergency) and root
  cause (emergency) are present — the message lists what is missing.
* *Spare parts → Parts used*: parts fitted per machine (a machine includes everything below it), per part and per
  period, with Excel export.
* *Shifts & handover*: confirm handovers written by the outgoing shift (you cannot confirm your own).
* *PM → Approvals*: approve or reject deferral/cancellation requests (you cannot approve your own request).

## 6. Planners
* *Preventive maintenance*: create job plans (task list, readings with limits, safety precautions, LOTO/permit/test
  flags) and PM plans (calendar: every N days/weeks/months/years, fixed or floating from last completion; or meter:
  every N running hours). Work orders are generated automatically *lead days* before the due date — never twice.
* Plan work orders: planned start/end, estimated hours, supervisor; schedule; reserve spare parts.
* *Lubrication*: lubrication points, routes, *Generate route WO*.
* *Importing plans from Excel* (**Import plan** on the Preventive maintenance, Lubrication and Condition monitoring
  pages): download the template, fill one row per task, **Preview**, then **Import** (nothing is saved if any row has
  an error).
  * PM: rows with the same equipment + frequency + trade become **one** PM plan, so a monthly mechanical round is one
    work order with all tasks as its checklist. Frequency can be `weekly`, `monthly`, `quarterly`, `semiannual`,
    `yearly` or a number of days. Numbered steps (`1. … 2. …`) become separate checklist lines; very large rounds
    (more than 60 lines) list one line per task and keep the full procedures in the job plan description.
  * Lubrication: one row per lubrication point; points are grouped into one route per department and frequency
    (e.g. `LR-PM-W`), and new lubricant codes are created from the row.
  * Condition monitoring: one row per measurement point with its alarm limits; points of the same equipment and
    frequency get one predictive reading round.
  * Optional `permit` (`yes` or types such as `cold_work`, `hot_work;work_at_height`) and `loto` (`yes`/`no`) columns
    put the safety requirements on every work order the plan generates.
  * A blank `start_date` spreads the first due dates evenly over the first cycle, so a bulk import does not make
    every plan due on the same day.
* *Shutdowns*: work packages with durations and predecessors; the critical path is calculated and shown in red on the
  Gantt chart; track material/permit/LOTO readiness, daily progress and delay reasons; pre-startup checks must be
  completed before the shutdown can be closed.

### Planning tools (planners, engineers, managers)
* **Auto / Manual work orders** – Preventive maintenance → **Auto / Manual**, per department:
  * **PM work orders** and **PdM rounds**: created by the system (**Auto**, default) or held in *Waiting for release*
    (**Manual**).
  * **Lubrication work orders**: Auto, or Manual = the team generates each route from Lubrication → **Generate**.
  * **Critical PdM alert creates** (points set to auto-create): a **Work order**, a **Work request** for supervisors
    to triage, or **Alert only**. Work requests are otherwise never created automatically; people raise them.
  Rights: PM needs PM-plan rights; PdM needs PdM or PM rights; lubrication needs lubrication or PM rights.
* **Waiting for release** – Preventive maintenance → **Waiting for release** lists PM / PdM occurrences without a work
  order. Tick them and press **Release selected** to create the work orders now (any date).
* **Import work plan** – Work orders or Preventive maintenance → **Import work plan**: download the template, one row
  per work order (equipment, type, priority, due date, planned start, hours, technicians). Put `pm_plan_code` on a
  row to release that plan's next waiting occurrence, so it still counts in PM compliance. Only equipment in your
  departments; assigning technicians needs the assign right. Preview first; nothing is saved if a row has an error.
* **Export plans (Excel)** – Preventive maintenance → **Export plans (Excel)**: sheet *pm_plans* lists every plan
  with its code (asset-frequency-trade, e.g. `PM1-DRYER-03-Q-MECH`; PdM rounds `...-CMM-RELI`); sheet *work_plan*
  (first) already holds the waiting occurrences of the next 60 days in the Import work plan layout. Delete the rows
  you do not want, add technicians, and import the same file.
* **Import shutdown plan** – Shutdowns → **Import shutdown plan**: one row per work package. A new `shutdown_code`
  creates the shutdown (name, start, end); existing package codes are updated; `predecessors` set the order and the
  critical path is recalculated; `create_wo = yes` makes a shutdown work order for the equipment.
* **Bulk close / cancel** – Work orders: tick work orders (or the header box for the whole page) → **Close / cancel
  selected**. *Close* = work done (a PM counts as done), *Cancel* = not done. A reason is required and kept in each
  work order's history. Work requests: tick open requests → **Close selected** (rejected with your reason).
  Rights: planners, engineers, reliability engineers, managers (`wo.bulk_close`).

## 7. Storekeepers
*Spare parts*: goods receipts (optionally against a purchase requisition line), issues and returns against work
orders (cost goes to the work order at moving-average cost), adjustments (reason required), transfers, critical
spares, below-reorder filter, valuation, aging/excess. Stock can never go negative. Purchase requisitions are local
references — there is no ERP connection.

## 8. Reliability engineers
*Condition monitoring*: measurement points with warning/alarm limits; enter readings (or receive them from the plant
gateway); the level **Normal / Warning limit / Alarm limit** (internally normal / warning / critical) or Unknown is a
transparent limit comparison (no prediction is claimed). Each point has a **control chart** of its last 100 readings:
CL (average), UCL/LCL at ±3σ (σ from the average moving range), zones A/B/C, and the eight **Nelson rules** of the
plant's control-chart sheet (1: 1 point beyond 3σ; 2: 7 in a row on one side; 3: 7 rising or falling; 4: 14
alternating; 5: 2 of 3 beyond 2σ; 6: 4 of 5 beyond 1σ; 7: 14 within 1σ; 8: 8 beyond 1σ either side) with their probable
cause. The *Nelson* column of the point list shows the rules broken now (last 30 readings, pattern ending in the last 3).
The Alerts tab filters by level (All open / Alarm limit exceeded / Warning limit exceeded).
Alerts can be acknowledged, turned into a predictive work order and resolved. Trend charts show limits.

### Root cause analysis (RCA) of major breakdowns
*Root cause analysis* in the menu. **What is a major breakdown** is set in *RCA rules* (administrator and maintenance
manager; permission `rca.settings`): downtime at or above a limit per asset criticality (default A 2 h, B 3 h, C 5 h;
blank switches a class off), the same failure mode (problem code) on the same asset N times within D days (default
2 in 30), failure modes that always need an RCA, production loss, repair cost, and a *Safety / environment event*
ticked on the work order. The rules are checked when a corrective or emergency work order is completed or closed,
and again if its downtime, loss or codes are corrected later.

1. **Waiting for decision** — a rule matched (or an engineer / supervisor pressed *Request RCA* on a work order).
   The maintenance manager is notified and presses *Start RCA* (leader from the engineering positions —
   permission `rca.lead` — team members, analysis due date; default 7 days) or *Not required* with a reason.
2. **Investigation** — the team works through the numbered tabs in the standard order: *1. Problem (5W1H)*
   (What, Where, When, Who, Which / how much, How; pre-filled from the work orders) with the problem statement and
   timeline; *2. Evidence & data* (photos, files); *3. Fishbone* (causes under Man, Machine, Method, Material,
   Measurement, Environment, each possible / verified / ruled out; the diagram draws itself; *Ask why?* on a verified
   cause starts a 5 Whys chain); *4. 5 Whys* (five is a guide, not a limit: keep asking "why?" — Why 6, 7… — and add
   branches; the **root cause is the last why of each chain** and can only be marked there, also enforced by the server);
   *5. Root causes* (from the marked last whys; physical, human, system/latent); *6. Action plan* (containment,
   corrective, preventive; owner and due date). Press *Save*. Submitting needs the problem, a 5 Whys chain with its
   root cause marked, a root cause and an action; step 7, the effectiveness check, follows the actions.
   The leader presses *Submit for approval*.
3. **Awaiting approval** — the manager approves or returns it to the team with a note.
4. **Action plan** — owners finish their actions with the result. *Create work order* raises a work order for an
   action; completing that work order finishes the action. A changed PM plan can be linked to the action.
5. **Effectiveness check** — starts when the last action is done (default 90 days). If the same failure mode
   comes back on the asset, the investigation reopens automatically. At the end the manager is told the RCA can be
   *closed as effective*.

Overdue analyses and actions are reminded on the first overdue day and then weekly. *Print report* gives a one-page
A4 report (print or save as PDF, in the interface language). The register can be exported to Excel, and the
management presentation has an RCA slide.

## 9. Managers: KPIs and reports
*KPIs & reports*: 20 KPIs for a period and department. **Targets**: *Set target* on a KPI card (KPI management) for
the whole plant, or for the department chosen at the top; the direction is preset per KPI. The target used is the
department's, else the plant's, else a linked company KPI's. Cards are coloured green (met), amber (missed by up to
10 %) or red (missed); the drill-down shows a 12-month control chart with the target. Click a KPI for its formula, inclusion rules, numerator /
denominator, 12-month trend and the underlying records. If data is missing the KPI says **Not available** and why —
values are never estimated. Export XLSX/PDF. Work order PDF reports are on each work order.
*Management presentation* (planners and managers): choose the period and, optionally, a department, then click the
button. PlantPulse builds a PowerPoint deck in your interface language (English, Arabic or Bengali) with an executive
summary, the KPI scorecard against the previous period and company targets, 12-month trends, work orders, the top 5
bad actors, cost against budget, emergency breakdowns, lubrication and condition monitoring, and the plan for the
next period. Whole months are compared with the same number of months before (October with September, a quarter with
the previous quarter). The charts are native PowerPoint charts, so the deck can be edited before the meeting.
Enter daily production (tonnes, hours) and monthly budgets in the *Production data / Budget* tab — needed for cost
per ton, OEE and budget vs actual.
The plant's own KPI sheet goes in the *Company KPIs* tab: pick the year, *Download template* (two rows per KPI —
Target and Actual — one column per month, already filled with saved values), fill it and upload it (requires KPI
management). Columns: department code (blank = whole plant), unit, `higher_is_better` (yes/no, colours each month
green or red against its target) and optionally `cmms_kpi` (e.g. `mtbf`) to show the KPI next to the value the CMMS
calculates for the same department. A blank cell keeps the saved value, `x` deletes it; new KPI names add KPIs.