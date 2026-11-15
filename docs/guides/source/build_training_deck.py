"""PlantPulse – full training course presentation (all modules, every role, with the November 2026 improvements),
with speaker notes. Same look as the "What is new" deck (its drawing helpers are reused; the Arabic one is right to
left). argv: out.pptx en|ar

Sessions A–F follow the training workbook; the numbers in brackets point to the work instructions."""

import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
OUT, LANG = sys.argv[1], sys.argv[2]
AR = LANG == "ar"
_src = open(os.path.join(HERE, "build_whatsnew_deck_ar.py" if AR else "build_whatsnew_deck.py"), encoding="utf-8").read()
_src = _src[: _src.index("# 1 cover")]
_src = _src.replace("PlantPulse · ما الجديد · نوفمبر 2026", "PlantPulse · دورة التدريب · نوفمبر 2026").replace(
    "PlantPulse · What is new · November 2026", "PlantPulse · Training course · November 2026")
sys.argv = [sys.argv[0], OUT]
exec(_src)  # noqa: S102 – helpers: prs, slide, text, rect, card, picture, colours, M, W, H, N

IMGDIR = os.path.join(HERE, "..", "img")


def img(name):
    return "ar-" + name if AR and os.path.exists(os.path.join(IMGDIR, "ar-" + name)) else name


def wide_pic(kicker, title, notes, bullets, pic, size=17):
    """Bullets on one side, a desktop screenshot (16:10) on the other."""
    sl = slide(kicker, title, notes)
    text(sl, M, Inches(1.85), Inches(5.2), Inches(5.0), bullets, size, bullets=True)
    picture(sl, img(pic), Inches(6.05), Inches(1.9), w=Inches(6.7))
    return sl


def phone_pic(kicker, title, notes, bullets, pic, size=18, extra=None):
    """Bullets and a phone screenshot."""
    sl = slide(kicker, title, notes)
    text(sl, M, Inches(1.85), Inches(8.6), Inches(5.0), bullets, size, bullets=True)
    picture(sl, img(pic), Inches(10.2), Inches(1.7), h=Inches(5.15))
    return sl


def cards(kicker, title, notes, items, cols=None, h=Inches(4.6), bsize=15, dark=False):
    sl = slide(kicker, title, notes, dark=dark)
    n = len(items)
    cols = cols or n
    rows = (n + cols - 1) // cols
    gap = Inches(0.25)
    cw = (W - 2 * M - gap * (cols - 1)) / cols
    ch = (h - gap * (rows - 1)) / rows
    for i, it in enumerate(items):
        t, b = it[0], it[1]
        acc = it[2] if len(it) > 2 else TEAL
        card(sl, M + (cw + gap) * (i % cols), Inches(1.9) + (ch + gap) * (i // cols), cw, ch, t, b, accent=acc, bsize=bsize)
    return sl


def modules(kicker, title, notes, items, cols=5):
    """Small cards: a two-line title, then the text below it (no overlap)."""
    sl = slide(kicker, title, notes)
    gap = Inches(0.22)
    rows = (len(items) + cols - 1) // cols
    cw = (W - 2 * M - gap * (cols - 1)) / cols
    ch = Inches(2.25)
    for i, (t, b) in enumerate(items):
        x, y = M + (cw + gap) * (i % cols), Inches(1.9) + (ch + gap) * (i // cols)
        rect(sl, x, y, cw, ch, WHITE)
        rect(sl, x, y, Inches(0.09), ch, AMBER if i == 1 else TEAL, shape=MSO_SHAPE.RECTANGLE)
        text(sl, x + Inches(0.22), y + Inches(0.12), cw - Inches(0.35), Inches(0.75), t, 15, True, NAVY)
        text(sl, x + Inches(0.22), y + Inches(0.9), cw - Inches(0.35), ch - Inches(1.0), b, 12, color=INK2)
    del rows
    return sl


def flow(sl, steps, y, colour=TEAL, size=13):
    n = len(steps)
    gap = Inches(0.12)
    bw = (W - 2 * M - gap * (n - 1)) / n
    for i, s in enumerate(steps):
        r = rect(sl, M + (bw + gap) * i, y, bw, Inches(1.0), colour if i < n - 1 else NAVY)
        text(sl, M + (bw + gap) * i + Inches(0.08), y + Inches(0.12), bw - Inches(0.16), Inches(0.8), s, size, True, WHITE,
             align=PP_ALIGN.CENTER)
        del r


def table(sl, rows, widths, y, size=12):
    if AR:
        rows = [list(reversed(r)) for r in rows]
        widths = list(reversed(widths))
    total = sum(widths)
    x = M if not AR else W - M - Inches(total)
    t = sl.shapes.add_table(len(rows), len(rows[0]), x, y, Inches(total), Inches(0.4) * len(rows)).table
    for j, wd in enumerate(widths):
        t.columns[j].width = Inches(wd)
    for i, r in enumerate(rows):
        for j, v in enumerate(r):
            c = t.cell(i, j)
            c.text = v
            c.fill.solid()
            c.fill.fore_color.rgb = RGBColor.from_string("23616D") if i == 0 else (WHITE if i % 2 else RGBColor.from_string("EEF4F6"))
            for p in c.text_frame.paragraphs:
                if AR:
                    rtl(p)  # noqa: F821 – from the Arabic helpers
                for run in p.runs:
                    run.font.size, run.font.name, run.font.bold = Pt(size), FONT, i == 0
                    run.font.color.rgb = WHITE if i == 0 else NAVY


def cover(title, sub, tag, notes):
    sl = slide("", "", notes, dark=True)
    text(sl, M, Inches(1.9), Inches(11.5), Inches(1.2), "PlantPulse", 60, True, WHITE)
    text(sl, M, Inches(3.05), Inches(11.5), Inches(0.8), title, 32, False, AMBER)
    text(sl, M, Inches(4.0), Inches(11.5), Inches(1.4), sub, 20, color=RGBColor.from_string("DCE6E8"))
    text(sl, M, Inches(5.9), Inches(11.5), Inches(0.5), tag, 14, color=RGBColor.from_string("9FB3B8"))


T = {}
# =====================================================================================================================
T["en"] = dict(
    cover=("Training course · every role", "The whole system step by step – from a reported problem to KPIs and root cause analysis – "
           "with the November 2026 improvements: work orders without internet, KPI targets, Nelson control charts, one colour code, RCA",
           "Maintenance management for industrial plants · edition of 15 November 2026 · use with the work instructions and the training workbook",
           "Full training course for PlantPulse. Run session A for everyone, then the role sessions. Each session ends with its exercises "
           "from the training workbook (the trainee shows the result) and the quiz. Use the DEMO plant or the test copy, never the real data."),
    plan=("Course plan", "Six sessions, one per role",
          "Everyone starts with session A. Technicians take B, supervisors and planners C, engineers D, managers E, the administrator F. "
          "Numbers in brackets are the procedures in the work instructions; the exercises are in the training workbook.",
          [["Session", "Who", "Time", "Contents", "Exercises"],
           ["A. Everyone", "All users, production", "45 min", "Sign in, app on the phone, menu, search, dashboard colours, customise; report a problem, field round, scan QR (1, 2.1–2.3)", "1–4"],
           ["B. Technicians", "Technicians, lubricators", "90 min", "Carry out a work order, LOTO and permit, spare parts, work orders without internet and conflicts, lubrication, readings (2.6–2.8, 2.10–2.11, 3.4–3.5)", "5–8, 18–19"],
           ["C. Supervisors, planners", "Supervisors, planners", "2 h", "Accept requests, assign, review and close; offline work; PM schedule, deferrals, imports; alarm levels (2.4–2.11, 3.1–3.3, 3.5)", "5–10, 18–19"],
           ["D. Engineers, reliability", "Engineers, reliability", "2 h", "Control charts and Nelson rules, measurement points, failure modes, RCA, offline work orders (2.10, 3.5–3.9, 6.3, 7)", "9–13, 18"],
           ["E. Managers", "Manager, management", "90 min", "KPI targets, company KPIs, colour code, management presentation, RCA decisions (6, 7)", "11–16"],
           ["F. Administrator", "PlantPulse administrator", "60 min", "Users and departments, imports, test copy, server update, backups (9)", "17"]]),
    modules=("The system", "Everything maintenance needs, in one place",
             "A quick map of the modules. Each one is covered in the role sessions. The field round works without internet; everything else needs a connection.",
             [("Requests & work orders", "Problem → approved job → done → closed, with history per machine"), ("Field round (offline)", "QR, requests and work orders on the phone without signal"),
              ("Preventive maintenance", "Plans, job plans and the schedule create the work by themselves"), ("Lubrication", "Points, routes, lubricants and compliance"),
              ("Condition monitoring", "Readings, alarm and warning limits, Nelson control charts"), ("Spare parts", "Parts used per job and machine, stock and purchase references"),
              ("Shifts & handover", "Roster from Excel, shift handover, manpower"), ("Shutdowns", "Work packages, readiness and schedule"),
              ("KPIs & reports", "Calculated KPIs with targets, company KPIs, management PowerPoint"), ("Root cause analysis", "5 Whys, fishbone, actions and effectiveness check")]),
    flow=("Work order", "How a job flows",
          "Every job follows the same path. Who may move it to each status is set by role (Administration › Workflow). Emergencies may skip approval and start at once. "
          "Safety rules cannot be switched off: no start before LOTO / permit sign-off, no completion while a lock is applied.",
          ["Work request", "Triage", "Approved", "Planned / scheduled", "In progress", "Awaiting review", "Completed", "Closed"],
          ["Anyone reports; production too", "Supervisor accepts → work order", "LOTO / permit signed off before start", "Technician: checklist, hours, parts, findings",
           "Supervisor checks and completes", "Closed jobs are read-only history"]),
    a1=("Session A · everyone", "Getting started",
        "Show the steps live. Install from Chrome on Android (not Samsung Internet). The language choice follows the user on every device. "
        "The magnifier (Ctrl+K) finds equipment, work orders, requests, parts, plans, points, RCAs and shutdowns with words in any order.",
        ["Open app.plantpulse-cmms.com, sign in, change the temporary password", "Phone: Chrome › Install app (iPhone: Share › Add to Home Screen)",
         "Menu: daily work, maintenance, assets and resources, KPIs, administration", "ONLINE badge, bell for notifications, language EN / AR / BN",
         "Magnifier or Ctrl+K: one search for everything", "Assets: hierarchy tree, equipment page with its full history"], "tr-assets.png"),
    a2=("Session A · everyone", "The dashboard: one colour code, your own layout",
        "Red = act now, amber = needs attention or waiting for someone, green = all clear or target met, grey = information. A counter at zero turns green. "
        "Tap a counter to open exactly the list it counts. Customise dashboard (top right) saves the layout on the server, the same on phone and computer.",
        ["Red act now · amber attention · green all clear · grey information", "Counters open the exact list they count", "KPI tiles: result, target, Met / Close / Missed",
         "Customise dashboard: choose sections, counters and KPIs", "Saved for you on the server – same on phone and PC"], "dashboard.png"),
    a3=("Session A · everyone", "Report a problem, scan a QR label",
        "A work request instead of a phone call means every breakdown is counted in MTBF and MTTR. Breakdown = machine stopped: the area supervisors are notified at once. "
        "Every machine has a QR label (cmms:asset:…); scanning opens its page with history and the New work request button.",
        ["Work requests › New work request: equipment, symptom, priority, photo", "Tick Breakdown if the machine is stopped – supervisors are told at once",
         "Scan QR: the camera opens the machine page and its history", "Follow the status of your request in the list", "Use the app, not WhatsApp: every failure counts in the KPIs"], "tr-requests.png"),
    a4=("Session A · everyone", "Field round without internet",
        "Prepare once while connected: the equipment of your departments, QR tokens, failure codes, last jobs, and – for those who do the work – your work orders and the spare-parts list. "
        "Then scan, look up and report with no signal. Everything written waits on the phone and is sent by itself when the connection is back, never twice. "
        "If PlantPulse is opened without internet it goes to the field round.",
        ["Once, online: Field round › Prepare for offline (later: Update)", "Scan QR or search → equipment card and last jobs", "New work request with up to 6 photos – kept on the phone",
         "Waiting on this phone → sent by itself when online", "Breakdown offline: also call or use the radio", "Tab My work orders: see session B"], "tr-field.png"),
    b1=("Session B · technicians", "My work on the phone",
        "My work lists the jobs assigned to you by due date; a warning mark means LOTO or a permit. The bottom bar gives the technician shortcuts: dashboard, my work, new request, scan, notifications.",
        ["My work: your jobs, sorted by due date", "Warning mark = LOTO or permit needed", "Open: Move to In progress when allowed", "Bottom bar: my work · new request · scan QR · notifications",
         "No signal? Use the field round (next slides)"], "tr-mywork.png"),
    b2=("Session B · technicians", "Carry out a work order",
        "Walk through one job in the demo: start, checklist with OK / Not OK and readings (out of range is flagged), findings and the failure codes symptom / problem / cause / remedy, "
        "labour hours, spare parts used, photos, then Awaiting review. Book hours on every job, otherwise Planned maintenance % and labour cost stay not available.",
        ["Move to: In progress (after LOTO / permit sign-off)", "Checklist: OK / Not OK, readings checked against their range", "Findings, downtime, symptom – problem – cause – remedy",
         "Labor: book your own hours every job", "Materials: spare parts used (list or description)", "Remove your locks › Move to: Awaiting review"], "tr-wo.png"),
    b3=("Session B · technicians", "Safety first: LOTO and permit",
        "PlantPulse supports the physical lock-and-tag procedure, it does not replace it. The system refuses to start work before sign-off, to sign off an expired permit, "
        "and to complete a job while a lock is still applied.",
        [("Technician", "• Record each isolation point: point, energy type, lock number\n• Apply lock, test, Verify zero energy\n• At the end: Remove lock on every point", TEAL),
         ("Supervisor", "• Check every point\n• Permit number, permit types, valid until\n• Sign off LOTO / permit – only now can work start", AMBER),
         ("The system refuses", "• Start before sign-off\n• Sign-off of an expired permit\n• Completion while a lock is applied\n• Starting on the phone offline without sign-off", RED)]),
    b4=("Session B · new", "Work orders without internet",
        "Prepare the phone (Field round › Update). In My work orders open the job: Start work only shows when it is approved and, if needed, LOTO / permit is signed off. "
        "Checklist, readings, hours, parts, findings, root cause, hold or send for review – all offline. Engineers and supervisors also create work orders here; "
        "an emergency the writer does can start at once. Everything is sent by itself when online, never twice. Exercise 18.",
        ["Field round › Update before going without signal", "My work orders › open › Start work", "Checklist OK / Not OK, readings with range check", "Hours, spare parts, findings, root cause, downtime",
         "Put on hold or Work done – send for review", "New work order (engineers, supervisors); emergency can start at once", "Sent by itself when back online – never twice"], "offline-wo.png", 17),
    b5=("Session B · new", "When the phone shows a conflict",
        "If someone else changed the same line while you were offline – for example the supervisor recorded the reading online – that line is not overwritten. "
        "The phone shows yours and the server's value with who did it. Agree, then Keep mine or Keep theirs. Everything else was already saved. "
        "Send for review waits until the lines are decided: then Send again. Exercise 19, in pairs.",
        ["Red Decide badge = a line was changed by someone else meanwhile", "Read Yours and Now on the server (and who)", "Keep mine or Keep theirs – agree with your colleague",
         "Then Send again on Work done – send for review", "Closed / cancelled meanwhile: nothing applied, the line says why", "Nothing is ever overwritten without your decision"]),
    b6=("Session B · technicians", "Lubrication routes and condition readings",
        "Lubrication work orders list every point of the route: done, skipped with a reason, or an alternative lubricant (needs approval). "
        "Readings: a value above the warning limit turns amber, above the alarm limit red, and one alarm is opened and escalated – never duplicated.",
        [("Lubrication route", "• Open the lubrication job in My work\n• Each point: done / skipped (reason) / alternative lubricant\n• Complete: counts in lubrication compliance", TEAL),
         ("Condition reading", "• Condition monitoring › click the point (full screen on a phone)\n• Enter the value\n• Warning limit = amber, alarm limit = red\n• One alarm per point, escalated not duplicated", ORANGE)]),
    c1=("Session C · supervisors and planners", "From request to closed job",
        "Supervisors triage requests (accept creates the work order, reject needs a reason), assign technicians (warned about leave and clashes, bulk assign for many), "
        "sign off LOTO / permits, review the work and close it. Closing is refused until checklist, test result and failure codes are complete; root cause too for emergencies.",
        [("1 Triage", "• Accept & create WO or Reject with reason\n• Breakdowns show as open emergencies", ORANGE), ("2 Assign", "• Assignees, lead technician\n• Warned: leave, overlapping jobs\n• Bulk assign", TEAL),
         ("3 Review", "• Checklist, readings, hours, parts, photos\n• Test result if needed\n• Send back with a note", AMBER), ("4 Close", "• Completed → Closed\n• Refused while something is missing\n• PDF report per job", GREEN)]),
    c2=("Session C · supervisors and planners", "Preventive maintenance",
        "PM plans (time or meter based) with job plans create work orders by themselves up to 7 days before due; the scheduler runs every 15 minutes. "
        "Moving or cancelling a PM is a request with a reason, approved by the supervisor. Plans import from Excel with a preview; nothing is saved until all rows are valid.",
        ["PM plans: frequency, last done, next due", "Job plans: tasks, readings, hours, safety", "Schedule: due dates and their work orders", "Move or cancel a PM: request + supervisor approval",
         "Import plan from Excel (PM, lubrication, condition monitoring)", "Compliance uses the approved date"], "tr-pm.png"),
    c3=("Session C · supervisors and planners", "Shifts, handover and spare parts used",
        "Shift types and the monthly roster come from Excel; assignment warns about leave. Handover records what the next shift must know. "
        "Spare parts used are recorded on each work order (from the list or a description); store stock is not changed because the store is not connected.",
        ["Shift types (D, N, G…) and roster import from Excel", "Handover: open jobs, safety notes, confirm by the next shift", "Manpower view per day",
         "Spare parts used per job and machine, with Excel export", "Daily summary of the plant"], "tr-shifts.png"),
    d1=("Session D · engineers and reliability", "Condition monitoring and alarm levels",
        "Measurement points with warning and alarm limits, priorities and techniques. Alarm limit is not a plant shutdown: it means act soon. "
        "The dashboard counter equals the list it opens. Points import from Excel, history readings too.",
        ["Points: technique, unit, warning and alarm limits, priority", "Level column: Normal · Warning limit · Alarm limit", "Nelson column: rules broken now",
         "Alerts: acknowledge, create work order, resolve", "Import points and past readings from Excel"], "tr-pdm.png"),
    d2=("Session D · engineers and reliability", "Control charts and Nelson rules",
        "Every point and KPI has a control chart: CL is the average, UCL and LCL at 3 sigma, zones A, B, C. A red number marks a broken rule; the table gives the pattern and the probable cause. "
        "Rules follow the plant's sheet (7 / 7 / 14 variant).",
        ["CL = average · UCL / LCL = ±3σ · zones A, B, C", "Red circle and number = rule broken", "Rule 1: one point beyond 3σ – setup, new person", "Rule 2: 7 in a row on one side – process change",
         "Rule 3: 7 rising or falling – wear, trend", "Rule 4: 14 alternating – over-control"], "control-chart.png"),
    d3=("Session D · engineers and reliability", "Failure modes and root cause analysis",
        "Failure modes Pareto shows where breakdown hours go. A completed breakdown matching the RCA rules is proposed automatically; the manager starts it with a leader and team. "
        "Standard order: 1 Problem (5W1H), 2 Evidence, 3 Fishbone, 4 5 Whys (beyond five if needed; root cause on the last why), 5 Root causes, 6 Actions. "
        "Approval, actions as work orders and an effectiveness check that reopens the RCA if the failure returns.",
        ["Failure modes: Pareto by mode or code, per asset", "RCA proposed by rules, started by the manager", "1 Problem · 2 Evidence · 3 Fishbone · 4 5 Whys · 5 Root causes · 6 Actions",
         "Root cause taken from the last why", "Approval → action plan → effectiveness check"], "tr-rca.png"),
    e1=("Session E · managers", "KPI targets and company KPIs",
        "Set target on any KPI card, for the plant or a department chosen at the top. Close = missed by up to 10 %. The same targets drive the dashboard tiles and the presentation. "
        "Company KPIs: Add KPI and Enter month in the app, coloured months and a control chart with the target line.",
        ["Set target on each KPI card (plant or department)", "Met · Close (≤ 10 % off) · Missed", "Production data and budget feed cost and per-ton KPIs", "Company KPIs: Add KPI, Enter month – no Excel needed",
         "Click a KPI name: control chart with target line"], "kpi-targets.png"),
    e2=("Session E · managers", "Reports for the monthly meeting",
        "One click on the KPI page builds an editable PowerPoint (English, Arabic or Bengali) for a period and department. RCA decisions: start, approve, follow actions.",
        [("Management presentation", "• Period and department → PowerPoint\n• Scorecard with target and status\n• Trends, bad actors, cost vs budget\n• Condition monitoring and RCAs", AMBER),
         ("Decisions", "• Start or dismiss proposed RCAs\n• Approve RCA action plans\n• Approve PM deferrals", TEAL),
         ("Follow-up", "• Dashboard tiles vs target\n• Overdue and emergency counters\n• Notifications for approvals", GREEN)]),
    f1=("Session F · administrator", "Administration",
        "Users have a role and one or more departments; a user sees only those areas. Roles and permissions are editable, the workflow too. "
        "Try imports and changes on the test copy first. The server update command takes a backup first; run it again if the window closes.",
        ["Users: role, departments, trade; reset password", "Import users from Excel (preview first)", "Roles & permissions, workflow steps", "Departments and failure codes (Excel)",
         "Test copy before changing the real plant", "Server update and daily backups"], "tr-admin.png"),
    assess=("Training", "How each session is assessed",
            "Each exercise has a Check the trainee shows before moving on. The quiz has 18 questions, pass mark 14. Sign the attendance sheet at the end. Materials: work instructions (EN / AR, two editions) and the training workbook.",
            [("19 exercises", "• On the DEMO plant or the test copy\n• Each with a Check shown to the trainer\n• 18–19: offline work order and conflict", TEAL),
             ("Quiz", "• 18 questions, one answer each\n• Pass mark 14 of 18\n• Answer key for the trainer", AMBER),
             ("Sign-off", "• Attendance and sign-off sheet\n• Session complete when all checks and the quiz are passed", GREEN)]),
    rules=("Golden rules", "Ten rules for every day",
           "Close the course with these rules. They are what makes the data – and so the KPIs – right.",
           ["Report every problem in PlantPulse, not by phone or WhatsApp", "Tick Breakdown when the machine is stopped – and call", "Never start before LOTO / permit sign-off",
            "Book your hours and the parts on every job", "Choose symptom, problem, cause and remedy", "Update the field round before going without signal",
            "Decide conflicts with your colleague – never guess", "Supervisors review the same day", "Managers set targets once and look at them monthly", "Use your own account only"]),
    nxt=("Next steps", "After the training",
         "Agree dates for each session and who attends. Prepare the phones of the technicians (app installed, field round updated). Managers set the main targets. "
         "PlantPulse on Google Play after closed testing (about 22 November).",
         ["Plan sessions A–F and the attendance list", "Install the app and prepare every technician phone (Field round › Update)", "Managers set targets for the main KPIs",
          "Each person customises the dashboard", "Weekly: review Nelson signals and open RCAs", "Questions: the work instructions, troubleshooting part"]),
)
# =====================================================================================================================
T["ar"] = dict(
    cover=("دورة التدريب · لكل الأدوار", "النظام كاملًا خطوة بخطوة – من الإبلاغ عن مشكلة حتى المؤشرات وتحليل السبب الجذري – "
           "مع تحسينات نوفمبر 2026: أوامر العمل بدون إنترنت، مستهدفات المؤشرات، خرائط تحكم نيلسون، مفتاح ألوان واحد، تحليل السبب الجذري",
           "إدارة الصيانة للمصانع · إصدار 15 نوفمبر 2026 · تُستخدم مع تعليمات العمل وكتيّب التدريب",
           "دورة التدريب الكاملة على PlantPulse. ابدأ بالجلسة (أ) للجميع ثم جلسات الأدوار. كل جلسة تنتهي بتمارينها من كتيّب التدريب (يعرض المتدرب النتيجة) وبالاختبار. "
           "استخدم مصنع DEMO أو النسخة التجريبية، وليس بيانات المصنع الحقيقية."),
    plan=("خطة الدورة", "ست جلسات، جلسة لكل دور",
          "الجميع يبدأ بالجلسة (أ). الفنيون (ب)، المشرفون والمخطِّطون (ج)، المهندسون (د)، المديرون (هـ)، مسؤول النظام (و). الأرقام بين الأقواس هي إجراءات تعليمات العمل، والتمارين في كتيّب التدريب.",
          [["الجلسة", "الفئة", "المدة", "المحتوى", "التمارين"],
           ["أ. الجميع", "كل المستخدمين، الإنتاج", "45 دقيقة", "الدخول، التطبيق على الجوال، القائمة، البحث، ألوان لوحة المعلومات وتخصيصها؛ الإبلاغ عن مشكلة، جولة الموقع، مسح QR (1، 2.1–2.3)", "1–4"],
           ["ب. الفنيون", "الفنيون، فنيو التزييت", "90 دقيقة", "تنفيذ أمر العمل، العزل والتصريح، قطع الغيار، أوامر العمل بدون إنترنت والتعارض، التزييت، القراءات (2.6–2.8، 2.10–2.11، 3.4–3.5)", "5–8، 18–19"],
           ["ج. المشرفون والمخطِّطون", "المشرفون، المخطِّطون", "ساعتان", "قبول الطلبات، التكليف، المراجعة والإغلاق؛ العمل بدون إنترنت؛ جدول الوقائية والتأجيل والاستيراد؛ مستويات الإنذار (2.4–2.11، 3.1–3.3، 3.5)", "5–10، 18–19"],
           ["د. المهندسون والاعتمادية", "المهندسون، الاعتمادية", "ساعتان", "خرائط التحكم وقواعد نيلسون، نقاط القياس، أنماط الأعطال، تحليل السبب الجذري، أوامر العمل بدون إنترنت (2.10، 3.5–3.9، 6.3، 7)", "9–13، 18"],
           ["هـ. المديرون", "مدير الصيانة، الإدارة", "90 دقيقة", "مستهدفات المؤشرات، مؤشرات الشركة، مفتاح الألوان، العرض التقديمي للإدارة، قرارات التحليل (6، 7)", "11–16"],
           ["و. مسؤول النظام", "مسؤول PlantPulse", "60 دقيقة", "المستخدمون والأقسام، الاستيراد، النسخة التجريبية، تحديث الخادم، النسخ الاحتياطية (9)", "17"]]),
    modules=("النظام", "كل ما تحتاجه الصيانة في مكان واحد",
             "خريطة سريعة للوحدات، وكل واحدة تُشرح في جلسات الأدوار. جولة الموقع تعمل بدون إنترنت، وكل ما عداها يحتاج اتصالًا.",
             [("الطلبات وأوامر العمل", "مشكلة ← عمل معتمد ← منفذ ← مغلق، مع سجل لكل ماكينة"), ("جولة الموقع (بدون إنترنت)", "QR والطلبات وأوامر العمل على الجوال بدون تغطية"),
              ("الصيانة الوقائية", "الخطط وخطط العمل والجدول تنشئ الأعمال تلقائيًا"), ("التزييت", "النقاط والمسارات والزيوت والالتزام"),
              ("مراقبة الحالة", "القراءات، حدود الإنذار والتحذير، خرائط تحكم نيلسون"), ("قطع الغيار", "القطع المستخدمة لكل عمل وماكينة، المخزون ومراجع الشراء"),
              ("المناوبات والتسليم", "جدول الورديات من Excel، تسليم الوردية، القوى العاملة"), ("التوقفات", "حزم العمل والجاهزية والجدول"),
              ("المؤشرات والتقارير", "مؤشرات محسوبة بمستهدفات، مؤشرات الشركة، عرض PowerPoint للإدارة"), ("تحليل السبب الجذري", "لماذا × 5، عظم السمكة، الإجراءات والتحقق من الفعالية")]),
    flow=("أمر العمل", "مسار العمل",
          "كل عمل يتبع نفس المسار. من يحق له النقل لكل حالة يُحدد حسب الدور (الإدارة › سير العمل). الأعطال الطارئة يمكن أن تتجاوز الموافقة وتبدأ فورًا. "
          "قواعد السلامة لا يمكن إيقافها: لا بدء قبل اعتماد العزل / التصريح، ولا إكمال وقفل ما زال مركبًا.",
          ["طلب عمل", "فرز", "معتمد", "مخطط / مجدول", "قيد التنفيذ", "بانتظار المراجعة", "مكتمل", "مغلق"],
          ["أي شخص يبلّغ، والإنتاج أيضًا", "المشرف يقبل ← أمر عمل", "اعتماد العزل / التصريح قبل البدء", "الفني: قائمة الفحص، الساعات، القطع، الملاحظات",
           "المشرف يراجع ويكمل", "الأعمال المغلقة سجل للقراءة فقط"]),
    a1=("الجلسة أ · الجميع", "البداية",
        "اعرض الخطوات مباشرة. ثبّت من Chrome على أندرويد (وليس Samsung Internet). اختيار اللغة يتبع المستخدم على كل جهاز. "
        "العدسة (Ctrl+K) تجد المعدات وأوامر العمل والطلبات والقطع والخطط والنقاط والتحليلات والتوقفات بكلمات بأي ترتيب.",
        ["افتح app.plantpulse-cmms.com، سجّل الدخول، غيّر كلمة المرور المؤقتة", "الجوال: Chrome › تثبيت التطبيق (آيفون: مشاركة › إضافة إلى الشاشة الرئيسية)",
         "القائمة: العمل اليومي، الصيانة، الأصول والموارد، المؤشرات، الإدارة", "شارة «متصل»، الجرس للإشعارات، اللغة عربي / إنجليزي / بنغالي",
         "العدسة أو Ctrl+K: بحث واحد لكل شيء", "الأصول: شجرة المستويات، صفحة المعدة بسجلها الكامل"], "tr-assets.png"),
    a2=("الجلسة أ · الجميع", "لوحة المعلومات: مفتاح ألوان واحد وشكل تختاره",
        "أحمر = إجراء فوري، برتقالي = يحتاج انتباه أو بانتظار أحد، أخضر = لا شيء معلّق أو تحقق المستهدف، رمادي = معلومة. العداد الصفري يصبح أخضر. "
        "اضغط العداد لتفتح القائمة التي يعدّها بالضبط. «تخصيص لوحة المعلومات» يحفظ الشكل على الخادم، نفسه على الجوال والحاسوب.",
        ["أحمر إجراء فوري · برتقالي انتباه · أخضر لا شيء معلّق · رمادي معلومة", "العدادات تفتح القائمة التي تعدّها بالضبط", "مربعات المؤشرات: النتيجة، المستهدف، تحقق / قريب / لم يتحقق",
         "تخصيص لوحة المعلومات: اختر الأقسام والعدادات والمؤشرات", "يُحفظ لك على الخادم – نفس الشكل على الجوال والحاسوب"], "dashboard.png"),
    a3=("الجلسة أ · الجميع", "الإبلاغ عن مشكلة ومسح ملصق QR",
        "طلب العمل بدل الاتصال يعني أن كل عطل يُحسب في MTBF وMTTR. «عطل» = الماكينة متوقفة: يُبلَّغ مشرفو القسم فورًا. "
        "لكل ماكينة ملصق QR؛ المسح يفتح صفحتها بسجلها وزر طلب عمل جديد.",
        ["طلبات العمل › طلب عمل جديد: المعدة، العَرَض، الأولوية، صورة", "اختر «عطل» إذا توقفت الماكينة – يُبلَّغ المشرفون فورًا",
         "مسح QR: الكاميرا تفتح صفحة الماكينة وسجلها", "تابع حالة طلبك في القائمة", "استخدم التطبيق لا واتساب: كل عطل يُحسب في المؤشرات"], "tr-requests.png"),
    a4=("الجلسة أ · الجميع", "جولة الموقع بدون إنترنت",
        "جهّز مرة واحدة وأنت متصل: معدات أقسامك ورموز QR ورموز الأعطال وآخر الأعمال – ولمن ينفذ العمل: أوامر عمله وقائمة قطع الغيار. "
        "ثم امسح وابحث وأبلغ بدون تغطية. كل ما يُكتب ينتظر على الجوال ويُرسل تلقائيًا عند عودة الاتصال ولا يتكرر. "
        "إذا فُتح PlantPulse بدون إنترنت يذهب إلى جولة الموقع.",
        ["مرة واحدة وأنت متصل: جولة الموقع › تجهيز للعمل بدون إنترنت (لاحقًا: تحديث)", "مسح QR أو بحث ← بطاقة المعدة وآخر الأعمال", "طلب عمل جديد حتى 6 صور – يُحفظ على الجوال",
         "بانتظار الإرسال على هذا الهاتف ← يُرسل تلقائيًا عند الاتصال", "عطل بدون إنترنت: اتصل أيضًا أو استخدم الراديو", "تبويب أوامر العمل الخاصة بي: انظر الجلسة (ب)"], "tr-field.png"),
    b1=("الجلسة ب · الفنيون", "أعمالي على الجوال",
        "«أعمالي» تعرض الأعمال المسندة إليك حسب تاريخ الاستحقاق؛ علامة التحذير تعني عزلًا أو تصريحًا. الشريط السفلي يعطي اختصارات الفني: لوحة المعلومات، أعمالي، طلب جديد، المسح، الإشعارات.",
        ["أعمالي: أعمالك مرتبة حسب الاستحقاق", "علامة التحذير = يحتاج عزلًا أو تصريحًا", "افتح: نقل إلى قيد التنفيذ عند السماح", "الشريط السفلي: أعمالي · طلب جديد · مسح QR · الإشعارات",
         "لا توجد تغطية؟ استخدم جولة الموقع (الشرائح التالية)"], "tr-mywork.png"),
    b2=("الجلسة ب · الفنيون", "تنفيذ أمر العمل",
        "نفّذ عملًا واحدًا في DEMO: البدء، قائمة الفحص سليم / غير سليم والقراءات (خارج النطاق يُعلَّم)، الملاحظات ورموز الأعطال العَرَض / المشكلة / السبب / المعالجة، "
        "ساعات العمل، قطع الغيار، الصور، ثم بانتظار المراجعة. سجّل الساعات في كل عمل وإلا تبقى نسبة الصيانة المخططة وتكلفة العمالة غير متاحة.",
        ["نقل إلى: قيد التنفيذ (بعد اعتماد العزل / التصريح)", "قائمة الفحص: سليم / غير سليم، القراءات تُقارن بنطاقها", "الملاحظات، التوقف، العَرَض – المشكلة – السبب – المعالجة",
         "العمالة: سجّل ساعاتك في كل عمل", "المواد: القطع المستخدمة (من القائمة أو وصف)", "أزل أقفالك › نقل إلى: بانتظار المراجعة"], "tr-wo.png"),
    b3=("الجلسة ب · الفنيون", "السلامة أولًا: العزل والتصريح",
        "PlantPulse يدعم إجراء القفل والبطاقة الفعلي ولا يحل محله. النظام يرفض بدء العمل قبل الاعتماد، واعتماد تصريح منتهي، وإكمال العمل وما زال قفل مركبًا.",
        [("الفني", "• سجّل كل نقطة عزل: النقطة، نوع الطاقة، رقم القفل\n• ركّب القفل، اختبر، تحقق من انعدام الطاقة\n• في النهاية: إزالة القفل من كل نقطة", TEAL),
         ("المشرف", "• يراجع كل النقاط\n• رقم التصريح وأنواعه وصلاحيته\n• اعتماد العزل / التصريح – الآن فقط يبدأ العمل", AMBER),
         ("النظام يرفض", "• البدء قبل الاعتماد\n• اعتماد تصريح منتهي\n• الإكمال وقفل ما زال مركبًا\n• البدء على الجوال بدون إنترنت قبل الاعتماد", RED)]),
    b4=("الجلسة ب · جديد", "أوامر العمل بدون إنترنت",
        "جهّز الجوال (جولة الموقع › تحديث). من «أوامر العمل الخاصة بي» افتح العمل: زر «بدء العمل» يظهر فقط إذا كان معتمدًا، وإذا لزم بعد اعتماد العزل / التصريح. "
        "قائمة الفحص والقراءات والساعات والقطع والملاحظات والسبب الجذري والإيقاف أو الإرسال للمراجعة – كلها بدون إنترنت. المهندسون والمشرفون ينشئون أوامر العمل هنا أيضًا؛ "
        "والعطل الطارئ الذي ينفذه كاتبه يبدأ فورًا. يُرسل كل شيء تلقائيًا عند الاتصال ولا يتكرر. التمرين 18.",
        ["جولة الموقع › تحديث قبل الذهاب بدون تغطية", "أوامر العمل الخاصة بي › افتح › بدء العمل", "قائمة الفحص سليم / غير سليم، القراءات تُقارن بنطاقها", "الساعات، قطع الغيار، الملاحظات، السبب الجذري، التوقف",
         "إيقاف مؤقت أو انتهى العمل – إرسال للمراجعة", "أمر عمل جديد (المهندسون، المشرفون)؛ الطارئ يبدأ فورًا", "يُرسل تلقائيًا عند عودة الاتصال – ولا يتكرر"], "offline-wo.png", 17),
    b5=("الجلسة ب · جديد", "عندما يعرض الجوال تعارضًا",
        "إذا غيّر شخص آخر نفس البند أثناء عملك بدون إنترنت – مثلًا سجّل المشرف القراءة وهو متصل – لا يُستبدل البند. "
        "يعرض الجوال قيمتك وقيمة الخادم ومن سجّلها. اتفقا ثم «احتفظ بقيمتي» أو «احتفظ بقيمتهم». كل ما عدا ذلك حُفظ بالفعل. "
        "الإرسال للمراجعة ينتظر حتى تُحسم البنود: بعدها «أرسل مرة أخرى». التمرين 19 في ثنائيات.",
        ["شارة «بحاجة لقرار» الحمراء = بند غيّره شخص آخر في الأثناء", "اقرأ «قيمتك» و«الموجود الآن على الخادم» (ومن سجّله)", "احتفظ بقيمتي أو بقيمتهم – اتفق مع زميلك",
         "ثم «أرسل مرة أخرى» على «انتهى العمل – إرسال للمراجعة»", "أُغلق / أُلغي في الأثناء: لا يُطبَّق شيء، والبند يذكر السبب", "لا يُستبدل شيء بدون قرارك"]),
    b6=("الجلسة ب · الفنيون", "مسارات التزييت وقراءات الحالة",
        "أوامر عمل التزييت تعرض كل نقاط المسار: منفذة، أو متجاوزة بسبب، أو زيت بديل (يحتاج اعتمادًا). "
        "القراءات: قيمة فوق حد التحذير تصبح برتقالية، وفوق حد الإنذار حمراء، ويُفتح إنذار واحد ويُصعَّد ولا يتكرر.",
        [("مسار التزييت", "• افتح عمل التزييت من أعمالي\n• كل نقطة: منفذة / متجاوزة (السبب) / زيت بديل\n• أكمل: يُحسب في التزام التزييت", TEAL),
         ("قراءة الحالة", "• مراقبة الحالة › اضغط النقطة (ملء الشاشة على الجوال)\n• أدخل القيمة\n• حد التحذير = برتقالي، حد الإنذار = أحمر\n• إنذار واحد لكل نقطة، يُصعَّد ولا يتكرر", ORANGE)]),
    c1=("الجلسة ج · المشرفون والمخطِّطون", "من الطلب حتى إغلاق العمل",
        "المشرفون يفرزون الطلبات (القبول ينشئ أمر العمل، والرفض يحتاج سببًا)، ويكلفون الفنيين (تحذير من الإجازات والتعارض، وتكليف جماعي)، "
        "ويعتمدون العزل / التصاريح، ويراجعون العمل ويغلقونه. الإغلاق يُرفض حتى تكتمل قائمة الفحص ونتيجة الاختبار ورموز الأعطال، والسبب الجذري للطوارئ.",
        [("1 الفرز", "• قبول وإنشاء أمر عمل أو رفض بسبب\n• الأعطال تظهر كطوارئ مفتوحة", ORANGE), ("2 التكليف", "• المكلَّفون والفني القائد\n• تحذير: الإجازات، الأعمال المتداخلة\n• تكليف جماعي", TEAL),
         ("3 المراجعة", "• قائمة الفحص، القراءات، الساعات، القطع، الصور\n• نتيجة الاختبار عند الحاجة\n• إعادة مع ملاحظة", AMBER), ("4 الإغلاق", "• مكتمل ← مغلق\n• يُرفض ما دام شيء ناقصًا\n• تقرير PDF لكل عمل", GREEN)]),
    c2=("الجلسة ج · المشرفون والمخطِّطون", "الصيانة الوقائية",
        "خطط الوقائية (زمنية أو بالعداد) مع خطط العمل تنشئ أوامر العمل تلقائيًا حتى 7 أيام قبل الاستحقاق؛ والمجدول يعمل كل 15 دقيقة. "
        "تأجيل أو إلغاء وقائية طلب بسبب يعتمده المشرف. الخطط تُستورد من Excel مع معاينة؛ لا يُحفظ شيء حتى تصح كل الصفوف.",
        ["خطط الوقائية: التكرار، آخر تنفيذ، الاستحقاق القادم", "خطط العمل: المهام، القراءات، الساعات، السلامة", "الجدول: تواريخ الاستحقاق وأوامر عملها", "تأجيل أو إلغاء وقائية: طلب + اعتماد المشرف",
         "استيراد خطة من Excel (وقائية، تزييت، مراقبة حالة)", "الالتزام يستخدم التاريخ المعتمد"], "tr-pm.png"),
    c3=("الجلسة ج · المشرفون والمخطِّطون", "المناوبات والتسليم وقطع الغيار المستخدمة",
        "أنواع الورديات وجدول الشهر من Excel؛ والتكليف يحذر من الإجازات. التسليم يسجل ما يجب أن تعرفه الوردية التالية. "
        "القطع المستخدمة تُسجل على كل أمر عمل (من القائمة أو وصف)؛ رصيد المخزن لا يتغير لأن المخزن غير مرتبط.",
        ["أنواع الورديات (D، N، G…) واستيراد الجدول من Excel", "التسليم: الأعمال المفتوحة، ملاحظات السلامة، تأكيد الوردية التالية", "عرض القوى العاملة لكل يوم",
         "القطع المستخدمة لكل عمل وماكينة مع تصدير Excel", "الملخص اليومي للمصنع"], "tr-shifts.png"),
    d1=("الجلسة د · المهندسون والاعتمادية", "مراقبة الحالة ومستويات الإنذار",
        "نقاط القياس بحدود التحذير والإنذار والأولويات والتقنيات. حد الإنذار لا يعني توقف المصنع: يعني إجراء قريب. "
        "عداد لوحة المعلومات يساوي القائمة التي يفتحها. النقاط تُستورد من Excel، والقراءات السابقة أيضًا.",
        ["النقاط: التقنية، الوحدة، حدا التحذير والإنذار، الأولوية", "عمود المستوى: طبيعي · حد التحذير · حد الإنذار", "عمود نيلسون: القواعد المكسورة الآن",
         "التنبيهات: إقرار، إنشاء أمر عمل، حل", "استيراد النقاط والقراءات السابقة من Excel"], "tr-pdm.png"),
    d2=("الجلسة د · المهندسون والاعتمادية", "خرائط التحكم وقواعد نيلسون",
        "لكل نقطة ومؤشر خريطة تحكم: CL المتوسط، وUCL وLCL عند 3 سيجما، والمناطق A وB وC. الرقم الأحمر يعني قاعدة مكسورة؛ والجدول يعطي النمط والسبب المحتمل. "
        "القواعد حسب ورقة المصنع (نسخة 7 / 7 / 14).",
        ["CL = المتوسط · UCL / LCL = ±3σ · المناطق A وB وC", "دائرة ورقم أحمر = قاعدة مكسورة", "القاعدة 1: نقطة أبعد من 3σ – ضبط، شخص جديد", "القاعدة 2: 7 متتالية في جانب واحد – تغير العملية",
         "القاعدة 3: 7 تزيد أو تنقص – تآكل، اتجاه", "القاعدة 4: 14 متناوبة – تحكم زائد"], "control-chart.png"),
    d3=("الجلسة د · المهندسون والاعتمادية", "أنماط الأعطال وتحليل السبب الجذري",
        "باريتو أنماط الأعطال يبين أين تذهب ساعات الأعطال. العطل المكتمل الذي يطابق قواعد التحليل يُقترح تلقائيًا؛ والمدير يبدأه بقائد وفريق. "
        "الترتيب القياسي: 1 المشكلة (5W1H)، 2 الأدلة، 3 عظم السمكة، 4 لماذا × 5 (وأكثر عند الحاجة؛ السبب الجذري على آخر لماذا)، 5 الأسباب الجذرية، 6 الإجراءات. "
        "اعتماد، وإجراءات كأوامر عمل، وتحقق من الفعالية يعيد فتح التحليل إذا عاد العطل.",
        ["أنماط الأعطال: باريتو حسب النمط أو الرمز، لكل أصل", "التحليل يُقترح بالقواعد ويبدأه المدير", "1 المشكلة · 2 الأدلة · 3 عظم السمكة · 4 لماذا × 5 · 5 الأسباب الجذرية · 6 الإجراءات",
         "السبب الجذري من آخر لماذا", "اعتماد ← خطة عمل ← تحقق من الفعالية"], "tr-rca.png"),
    e1=("الجلسة هـ · المديرون", "مستهدفات المؤشرات ومؤشرات الشركة",
        "«تحديد المستهدف» على أي بطاقة مؤشر، للمصنع أو لقسم يُختار في الأعلى. قريب = لم يتحقق بفارق 10% أو أقل. نفس المستهدفات تغذي مربعات لوحة المعلومات والعرض التقديمي. "
        "مؤشرات الشركة: إضافة مؤشر وإدخال شهر في التطبيق، شهور ملونة وخريطة تحكم مع خط المستهدف.",
        ["تحديد المستهدف على كل بطاقة مؤشر (المصنع أو قسم)", "تحقق · قريب (فارق ≤ 10%) · لم يتحقق", "بيانات الإنتاج والميزانية تغذي مؤشرات التكلفة ولكل طن", "مؤشرات الشركة: إضافة مؤشر، إدخال شهر – بدون Excel",
         "اضغط اسم المؤشر: خريطة تحكم مع خط المستهدف"], "kpi-targets.png"),
    e2=("الجلسة هـ · المديرون", "تقارير الاجتماع الشهري",
        "ضغطة واحدة في صفحة المؤشرات تنشئ PowerPoint قابلًا للتعديل (عربي أو إنجليزي أو بنغالي) لفترة وقسم. قرارات التحليل الجذري: البدء، الاعتماد، متابعة الإجراءات.",
        [("العرض التقديمي للإدارة", "• الفترة والقسم ← PowerPoint\n• بطاقة المؤشرات مع المستهدف والحالة\n• الاتجاهات، أكثر المعدات أعطالًا، التكلفة مقابل الميزانية\n• مراقبة الحالة والتحليلات الجذرية", AMBER),
         ("القرارات", "• بدء أو رفض التحليلات المقترحة\n• اعتماد خطط إجراءات التحليل\n• اعتماد تأجيل الوقائية", TEAL),
         ("المتابعة", "• مربعات لوحة المعلومات مقابل المستهدف\n• عدادات المتأخر والطوارئ\n• إشعارات الاعتمادات", GREEN)]),
    f1=("الجلسة و · مسؤول النظام", "الإدارة",
        "للمستخدم دور وقسم أو أكثر؛ ويرى تلك المناطق فقط. الأدوار والصلاحيات قابلة للتعديل، وسير العمل كذلك. "
        "جرّب الاستيراد والتغييرات على النسخة التجريبية أولًا. أمر تحديث الخادم يأخذ نسخة احتياطية أولًا؛ أعد تشغيله إذا أُغلقت النافذة.",
        ["المستخدمون: الدور، الأقسام، الحرفة؛ إعادة تعيين كلمة المرور", "استيراد المستخدمين من Excel (معاينة أولًا)", "الأدوار والصلاحيات، خطوات سير العمل", "الأقسام ورموز الأعطال (Excel)",
         "النسخة التجريبية قبل تغيير المصنع الحقيقي", "تحديث الخادم والنسخ الاحتياطية اليومية"], "tr-admin.png"),
    assess=("التدريب", "كيف تُقيَّم كل جلسة",
            "لكل تمرين خانة «تحقق» يعرضها المتدرب قبل الانتقال. الاختبار 18 سؤالًا ودرجة النجاح 14. وقّع جدول الحضور في النهاية. المواد: تعليمات العمل (عربي / إنجليزي، نسختان) وكتيّب التدريب.",
            [("19 تمرينًا", "• على مصنع DEMO أو النسخة التجريبية\n• لكل تمرين «تحقق» يُعرض على المدرب\n• 18–19: أمر عمل بدون إنترنت وتعارض", TEAL),
             ("الاختبار", "• 18 سؤالًا، إجابة واحدة لكل سؤال\n• درجة النجاح 14 من 18\n• مفتاح الإجابات للمدرب", AMBER),
             ("التوقيع", "• جدول الحضور والتوقيع\n• الجلسة مكتملة عند اجتياز كل التحققات والاختبار", GREEN)]),
    rules=("قواعد ذهبية", "عشر قواعد لكل يوم",
           "اختم الدورة بهذه القواعد. هي التي تجعل البيانات – وبالتالي المؤشرات – صحيحة.",
           ["أبلغ عن كل مشكلة في PlantPulse، لا بالهاتف أو واتساب", "اختر «عطل» عندما تتوقف الماكينة – واتصل", "لا تبدأ أبدًا قبل اعتماد العزل / التصريح",
            "سجّل ساعاتك والقطع في كل عمل", "اختر العَرَض والمشكلة والسبب والمعالجة", "حدّث جولة الموقع قبل الذهاب بدون تغطية",
            "احسم التعارض مع زميلك – لا تخمّن", "المشرفون يراجعون في نفس اليوم", "المديرون يحددون المستهدفات مرة ويراجعونها شهريًا", "استخدم حسابك فقط"]),
    nxt=("الخطوات التالية", "بعد التدريب",
         "اتفق على مواعيد كل جلسة ومن يحضر. جهّز جوالات الفنيين (التطبيق مثبت وجولة الموقع محدثة). المديرون يحددون المستهدفات الرئيسية. "
         "PlantPulse على Google Play بعد الاختبار المغلق (حوالي 22 نوفمبر).",
         ["خطط الجلسات أ–و وقائمة الحضور", "ثبّت التطبيق وجهّز جوال كل فني (جولة الموقع › تحديث)", "المديرون يحددون مستهدفات المؤشرات الرئيسية",
          "كل شخص يخصص لوحة المعلومات", "أسبوعيًا: مراجعة إشارات نيلسون والتحليلات المفتوحة", "أسئلة: تعليمات العمل، جزء حل المشاكل"]),
)

C = T[LANG]
cover(*C["cover"])
k, t, n, rows = C["plan"]
sl = slide(k, t, n)
table(sl, rows, [2.3, 2.1, 1.0, 5.6, 1.1], Inches(1.85), size=12)
modules(*C["modules"])
k, t, n, steps, notes2 = C["flow"]
sl = slide(k, t, n)
flow(sl, steps, Inches(2.0))
text(sl, M, Inches(3.4), W - 2 * M, Inches(3.3), notes2, 18, bullets=True)
for key in ("a1", "a2", "a3"):
    wide_pic(*C[key])
phone_pic(*C["a4"])
phone_pic(*C["b1"])
wide_pic(*C["b2"])
k, t, n, items = C["b3"]
cards(k, t, n, items, h=Inches(3.6), bsize=17)
phone_pic(*C["b4"])
k, t, n, bl = C["b5"]
sl = slide(k, t, n)
text(sl, M, Inches(1.85), Inches(6.3), Inches(5.0), bl, 17, bullets=True)
picture(sl, img("offline-conflict.png"), Inches(7.2), Inches(1.9), w=Inches(5.55))
k, t, n, items = C["b6"]
cards(k, t, n, items, h=Inches(3.2), bsize=18)
k, t, n, items = C["c1"]
cards(k, t, n, items, cols=4, h=Inches(3.4), bsize=16)
for key in ("c2", "c3", "d1", "d2", "d3", "e1"):
    wide_pic(*C[key])
k, t, n, items = C["e2"]
cards(k, t, n, items, h=Inches(3.6), bsize=17)
wide_pic(*C["f1"])
k, t, n, items = C["assess"]
cards(k, t, n, items, h=Inches(3.4), bsize=18)
k, t, n, bl = C["rules"]
sl = slide(k, t, n, dark=True)
half = len(bl) // 2
text(sl, M, Inches(1.9), Inches(5.9), Inches(4.9), [f"{i + 1}.  {x}" for i, x in enumerate(bl[:half])], 19, color=WHITE)
text(sl, M + Inches(6.2), Inches(1.9), Inches(5.9), Inches(4.9), [f"{i + 1 + half}.  {x}" for i, x in enumerate(bl[half:])], 19, color=WHITE)
k, t, n, bl = C["nxt"]
sl = slide(k, t, n, dark=True)
text(sl, M, Inches(1.95), W - 2 * M, Inches(4.8), bl, 22, color=WHITE, bullets=True)

prs.save(OUT)
print("ok", N[0], "slides")
