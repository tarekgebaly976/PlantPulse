"""PlantPulse – training workbook (English PDF): training plan per role, hands-on exercises with the expected result,
a quiz with answer key and an attendance / sign-off sheet. argv: out.pdf

Exercises use the DEMO organisation (sample plant) or the test copy, never the real plant data."""

import os
import sys

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import CondPageBreak, Image, KeepTogether, PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

OUT = sys.argv[1]
IMG = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "img")
URL = "https://app.plantpulse-cmms.com"

NAVY, TEAL, AMBER, SOFT, LINE = (colors.HexColor(x) for x in ("#102A33", "#23616D", "#B9781A", "#44535A", "#D5DDDF"))
TIP_BG, WARN_BG = colors.HexColor("#E6F0F1"), colors.HexColor("#FBF0DC")
S = {
    "title": ParagraphStyle("title", fontName="Helvetica-Bold", fontSize=30, leading=36, textColor=NAVY),
    "subtitle": ParagraphStyle("subtitle", fontName="Helvetica", fontSize=15, leading=21, textColor=SOFT),
    "h1": ParagraphStyle("h1", fontName="Helvetica-Bold", fontSize=20, leading=26, textColor=NAVY, spaceBefore=4, spaceAfter=6),
    "h2": ParagraphStyle("h2", fontName="Helvetica-Bold", fontSize=13.5, leading=18, textColor=TEAL, spaceBefore=10, spaceAfter=3),
    "meta": ParagraphStyle("meta", fontName="Helvetica", fontSize=9.5, leading=13, textColor=SOFT, spaceAfter=4),
    "body": ParagraphStyle("body", fontName="Helvetica", fontSize=10.5, leading=15, textColor=NAVY),
    "cell": ParagraphStyle("cell", fontName="Helvetica", fontSize=9.6, leading=13.4, textColor=NAVY),
    "cap": ParagraphStyle("cap", fontName="Helvetica-Oblique", fontSize=9, leading=12, textColor=SOFT, spaceBefore=2, spaceAfter=8),
}


def table(rows, widths, head=True, bg=None):
    data = [[Paragraph(f"<b>{c}</b>" if head and i == 0 else c, S["cell"]) for c in r] for i, r in enumerate(rows)]
    t = Table(data, colWidths=[w * mm for w in widths], repeatRows=1 if head else 0)
    st = [("GRID", (0, 0), (-1, -1), 0.5, LINE), ("VALIGN", (0, 0), (-1, -1), "TOP"), ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 5)]
    if head:
        st.append(("BACKGROUND", (0, 0), (-1, 0), TIP_BG))
    st += bg or []
    t.setStyle(TableStyle(st))
    return t


def box(text, warn=False):
    t = Table([[Paragraph(text, S["cell"])]], colWidths=[170 * mm])
    t.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), WARN_BG if warn else TIP_BG), ("LINEBEFORE", (0, 0), (0, -1), 3, AMBER if warn else TEAL),
                           ("LEFTPADDING", (0, 0), (-1, -1), 8), ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 6)]))
    return t


def shot(name, width_mm, caption):
    from reportlab.lib.utils import ImageReader

    path = os.path.join(IMG, name)
    w, h = ImageReader(path).getSize()
    return [Image(path, width=width_mm * mm, height=width_mm * mm * h / w), Paragraph(caption, S["cap"])]


# ---- Content ---------------------------------------------------------------------------------------------------------
PLAN = [
    ["Session", "Who", "Time", "Contents (work instructions part)", "Exercises"],
    ["A. Everyone", "All users, production", "45 min", "Sign in, install the app, menu, search, dashboard colour key, customise the dashboard (1); report a problem, scan QR (2.1–2.2)", "1–4"],
    ["B. Technicians", "Technicians, lubricators", "90 min", "Carry out a work order, LOTO and permit, spare parts, lubrication route, condition reading (2.5–2.7, 3.4–3.5)", "5–8"],
    ["C. Supervisors and planners", "Supervisors, planners", "2 h", "Accept requests, assign, review and close; PM schedule, deferrals, imports; alarm levels (2.3–2.8, 3.1–3.3, 3.5)", "5–10"],
    ["D. Engineers and reliability", "Engineers, reliability engineers", "2 h", "Control charts and Nelson rules, measurement points and priorities, failure modes, RCA (3.5–3.9, 6.3, 7)", "9–13"],
    ["E. Managers", "Maintenance manager, management", "90 min", "KPI targets, company KPIs, colour code, management presentation, RCA decisions and approval (6, 7)", "11–16"],
    ["F. Administrator", "PlantPulse administrator", "60 min", "Users and departments, user import, test copy, server update, backups (9)", "17"],
]

EX = [
    # (no, title, who, steps, check)
    (1, "Sign in and find your way", "Everyone",
     ["Sign in to the DEMO plant with the training account the trainer gives you; change the password.",
      "Switch the language to Arabic and back to English.",
      "Use the magnifier to find <i>crusher motor</i>. Open the result."],
     "You land on the equipment page of the crusher motor; the menu is right-to-left in Arabic."),
    (2, "Read the dashboard colours", "Everyone",
     ["Open the Dashboard and find the colour key under the quick buttons.",
      "Name one red, one amber and one green counter and say why each has that colour.",
      "Tap <b>Condition monitoring alarms (open)</b>: count the rows in the list."],
     "The number of rows equals the number on the counter; the line under the counter splits alarm limit / warning limit."),
    (3, "Customise your dashboard", "Everyone",
     ["Press <b>Customise dashboard</b>; untick <i>Work orders per week</i> and the <i>Overdue lubrication</i> counter.",
      "Under Calculated KPIs tick <i>Work Order Backlog</i>; Save.",
      "Open PlantPulse on your phone (or another browser) with the same account."],
     "The same layout appears on both devices; <b>Reset to default</b> brings back the standard dashboard."),
    (4, "Report a problem with a photo", "Everyone",
     ["Scan (or search) a DEMO pump; press <b>New work request</b>.",
      "Describe the problem, take a photo, choose a priority and submit."],
     "The request appears under Work requests with status <i>Submitted</i>; the area supervisor is notified."),
    (5, "Do a work order safely", "Technicians, supervisors",
     ["Open a DEMO job assigned to you in <b>My work</b>.",
      "Try to start it before LOTO is signed off; read the message.",
      "Record the isolation, have the supervisor sign off, start, record parts used, findings and the failure code, and complete it."],
     "The job cannot start before sign-off; after completion it waits in <i>Awaiting review</i>."),
    (6, "Lubrication route", "Technicians",
     ["Open a lubrication work order in My work.",
      "Mark each point done, skipped (with reason) or alternative lubricant; complete."],
     "Lubrication compliance on the KPI page counts the route."),
    (7, "Enter a condition reading", "Technicians, engineers",
     ["Condition monitoring › click a DEMO vibration point.",
      "Record a value above its warning limit, then one above its alarm limit."],
     "The level changes to <b>Warning limit</b> (amber) then <b>Alarm limit</b> (red); one alarm is opened and escalated, not duplicated."),
    (8, "Review and close", "Supervisors",
     ["Open a work order in <i>Awaiting review</i>; check checklist, test result and codes.",
      "Close it, or send it back with a note."],
     "A closed job cannot be edited; the asset history shows it."),
    (9, "Handle an alarm", "Engineers, supervisors",
     ["Alerts tab › filter <b>Alarm limit exceeded</b>; open the alarm from exercise 7.",
      "Acknowledge with a defect description, create a work order, then resolve."],
     "The alarm moves from Open to Acknowledged to Resolved and links to the new work order."),
    (10, "Defer a PM", "Supervisors, planners",
     ["Preventive maintenance › Schedule: request to move one PM by a week, with a reason.",
      "As supervisor, approve it."],
     "The PM shows the new due date; PM compliance uses the deferred date."),
    (11, "Read a control chart", "Engineers, managers",
     ["Condition monitoring › open a point with a <b>Nelson</b> badge in the list.",
      "Find CL, UCL and LCL; find a red rule number on the chart.",
      "In the rule table, read the pattern and probable cause of each broken rule."],
     "You can explain, for one broken rule, what pattern was seen and what to check first (see the probable cause)."),
    (12, "Failure modes Pareto", "Engineers, reliability",
     ["KPIs and reports › Failure modes; set the last 6 months.",
      "Switch By failure mode / By code; choose an asset to narrow."],
     "You can name the top failure mode and its share of breakdown hours."),
    (13, "Start and run an RCA", "Manager, engineers",
     ["Root cause analysis › open an RCA <i>Waiting for decision</i>; press <b>Start RCA</b> with a leader and team.",
      "As leader fill 5 Whys (two branches), a fishbone cause per category, root causes and two actions; submit.",
      "As manager approve it; create a work order from one action."],
     "The RCA reaches <i>Action plan</i>; completing the work order finishes the action."),
    (14, "Set KPI targets", "Managers",
     ["KPIs and reports: press <b>Set target</b> on MTTR (lower is better) and on PM compliance.",
      "Choose a department at the top and set a department target for PM compliance."],
     "Cards turn green, amber or red; the dashboard tiles show the targets; the department target is used only for that department."),
    (15, "Company KPIs without Excel", "Managers",
     ["Company KPIs › <b>Add KPI</b>: <i>Safety incidents</i>, unit count, better when lower.",
      "<b>Enter month</b>: type actual and target for the last two months; click the KPI name."],
     "The months are coloured; the KPI name opens the control chart with the target line."),
    (16, "Management presentation", "Managers, planners",
     ["Set last month as the period; press <b>Management presentation</b>.",
      "Open the PowerPoint: find the scorecard and the condition monitoring slide."],
     "The scorecard shows target and status (On target / Close to target / Off target); figures match the KPI page."),
    (17, "Administrator routine", "Administrator",
     ["Add a user with two departments; reset a password.",
      "On the test copy, import users from Excel.",
      "Run the server update command (on the test day) and check the containers."],
     "The new user sees only the two departments; the update ends with ==&gt; Done and all containers Up."),
]

QUIZ = [
    ("On the dashboard, a counter is green with a tick. What does it mean?", ["Something needs action now", "The count is zero: all clear", "It is information only"], 1),
    ("What does amber mean on the dashboard?", ["Act now", "Needs attention or waiting for someone (or a KPI close to target)", "Target met"], 1),
    ("A KPI tile shows “Close”. What does that mean?", ["The target was missed by no more than 10 %", "The KPI is not available", "The target is met"], 0),
    ("The condition monitoring counter shows 3 and the line “1 alarm limit · 2 warning limit”. How many rows does its list show?", ["1", "2", "3"], 2),
    ("“Alarm limit exceeded” on a measurement point means…", ["The plant is shut down", "The reading passed the alarm limit set for this point", "The sensor is broken"], 1),
    ("On a control chart, what is CL?", ["The average of the values", "The alarm limit", "The target"], 0),
    ("Nelson rule 2 (this plant’s sheet) is…", ["1 point beyond 3σ", "7 points in a row on the same side of CL", "14 points alternating up and down"], 1),
    ("7 points in a row all rising (rule 3). Probable cause?", ["Over-control", "Trend, tool or component wear", "New person"], 1),
    ("14 points alternating up and down (rule 4) usually means…", ["Over-control or tampering", "A stable process", "A new setup"], 0),
    ("Which target does PlantPulse use for a department KPI?", ["Always the plant target", "The department target, else the plant target, else a linked company KPI", "Last year’s value"], 1),
    ("Who can set KPI targets?", ["Any technician", "Users with KPI management (maintenance manager)", "Nobody, they are fixed"], 1),
    ("Where do you change what your dashboard shows?", ["Administration › Users", "Dashboard › Customise dashboard", "It cannot be changed"], 1),
    ("Your customised dashboard is saved…", ["Only on this phone", "On the server, for you and this plant", "For all users"], 1),
    ("Can a job start before LOTO is signed off?", ["Yes", "No, the app refuses", "Only emergencies"], 1),
    ("When is an RCA proposed automatically?", ["Every work order", "When a completed breakdown matches the RCA rules", "Only when production asks"], 1),
    ("The management presentation compares October with…", ["October last year", "September", "The whole year"], 1),
]


# ---- Build -------------------------------------------------------------------------------------------------------------
def on_page(c, doc):
    c.saveState()
    if doc.page > 1:
        c.setFont("Helvetica", 8.5)
        c.setFillColor(SOFT)
        c.drawString(20 * mm, 12 * mm, "PlantPulse · Training workbook")
        c.drawRightString(190 * mm, 12 * mm, f"Page {doc.page}")
        c.setStrokeColor(LINE)
        c.line(20 * mm, 16 * mm, 190 * mm, 16 * mm)
    c.restoreState()


st = [Spacer(1, 50 * mm), Paragraph("PlantPulse", S["title"]), Spacer(1, 4),
      Paragraph("Training workbook: sessions per role, hands-on exercises, quiz and sign-off sheet", S["subtitle"]), Spacer(1, 10 * mm)]
cov = Table([[Paragraph(f"System: {URL} (exercises on the DEMO plant or the test copy)<br/>Version: 12 November 2026<br/>"
                        "Use with: PlantPulse work instructions (the numbers in brackets point to its procedures)", S["body"])]], colWidths=[170 * mm])
cov.setStyle(TableStyle([("LINEBEFORE", (0, 0), (0, -1), 4, AMBER), ("LEFTPADDING", (0, 0), (-1, -1), 12), ("TOPPADDING", (0, 0), (-1, -1), 6), ("BOTTOMPADDING", (0, 0), (-1, -1), 6)]))
st += [cov, Spacer(1, 10 * mm),
       box("<b>For the trainer:</b> give each trainee a DEMO training account (one per role) or use the test copy, never the real plant. "
           "Run session A for everyone first. Each exercise has a <b>Check</b>: the trainee shows it before moving on. "
           "Finish with the quiz (pass mark 12 of 16) and the sign-off sheet."),
       PageBreak()]

st += [Paragraph("1. Training plan", S["h1"]), table(PLAN, [30, 30, 14, 71, 25]), Spacer(1, 6),
       box("Order: A → (B or C or D) → E → F. A session is complete when every exercise check is signed and the quiz is passed."), PageBreak()]

st += [Paragraph("2. What is new (November 2026)", S["h1"]),
       Paragraph("Show these three screens in every session; they answer most questions about colours, targets and alarms.", S["body"]), Spacer(1, 6)]
st += shot("dashboard.png", 170, "Dashboard: colour key, counters (zero = green), KPIs as tiles with result, target and Met / Close / Missed.")
st += [CondPageBreak(120 * mm)]
st += shot("kpi-targets.png", 170, "KPIs and reports: cards coloured against their target; Set target / Change for managers.")
st += [PageBreak()]
st += shot("control-chart.png", 105, "Condition monitoring: control chart with CL, UCL/LCL, zones A–B–C, red rule numbers, and the Nelson rule table.")
st += [PageBreak(), Paragraph("3. Hands-on exercises", S["h1"]),
       Paragraph("Work on the DEMO plant. Tick the Check box when the trainee has shown the result.", S["body"])]
for no, title, who, steps_, check in EX:
    rows = [[f"{i}. {s}"] for i, s in enumerate(steps_, 1)]
    t = table([["Steps"], *rows], [170])
    tick = Table([[""]], colWidths=[5 * mm], rowHeights=[5 * mm])
    tick.setStyle(TableStyle([("BOX", (0, 0), (-1, -1), 1, colors.HexColor("#2B8A3E")), ("BACKGROUND", (0, 0), (-1, -1), colors.white)]))
    chk = Table([[tick, Paragraph(f"<b>Check:</b> {check}", S["cell"])]], colWidths=[10 * mm, 160 * mm])
    chk.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#EBFBEE")), ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#37B24D")),
                             ("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 5)]))
    st.append(KeepTogether([Paragraph(f"Exercise {no}: {title}", S["h2"]), Paragraph(f"<b>Who:</b> {who}", S["meta"]), t, Spacer(1, 3), chk, Spacer(1, 4)]))

st += [PageBreak(), Paragraph("4. Quiz", S["h1"]), Paragraph("Circle one answer per question. Pass mark: 12 of 16.", S["body"]), Spacer(1, 4)]
for i, (q, opts, _) in enumerate(QUIZ, 1):
    st.append(KeepTogether([Paragraph(f"<b>{i}.</b> {q}", S["body"]),
                            Paragraph("&nbsp;&nbsp;&nbsp;&nbsp;" + "&nbsp;&nbsp;&nbsp;&nbsp;".join(f"<b>{'abc'[j]})</b> {o}" for j, o in enumerate(opts)), S["cell"]), Spacer(1, 6)]))
st += [Spacer(1, 6), Paragraph("Name: ______________________________ &nbsp;&nbsp; Score: ______ / 16 &nbsp;&nbsp; Date: ____________", S["body"])]

st += [PageBreak(), Paragraph("5. Quiz answer key (trainer)", S["h1"]),
       table([["Q", "Answer", "Q", "Answer"]] + [[str(i), f"{'abc'[QUIZ[i - 1][2]]}) {QUIZ[i - 1][1][QUIZ[i - 1][2]]}", str(i + 8), f"{'abc'[QUIZ[i + 7][2]]}) {QUIZ[i + 7][1][QUIZ[i + 7][2]]}"] for i in range(1, 9)],
             [10, 75, 10, 75])]

st += [Spacer(1, 10), Paragraph("6. Attendance and sign-off", S["h1"]),
       table([["Name", "Role / department", "Session(s)", "Exercises signed", "Quiz", "Trainee signature", "Trainer"]] + [[""] * 7 for _ in range(14)],
             [32, 28, 18, 24, 12, 30, 26],
             bg=[("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F8FAFB")]), ("TOPPADDING", (0, 1), (-1, -1), 9), ("BOTTOMPADDING", (0, 1), (-1, -1), 9)])]

doc = SimpleDocTemplate(OUT, pagesize=A4, leftMargin=20 * mm, rightMargin=20 * mm, topMargin=20 * mm, bottomMargin=24 * mm,
                        title="PlantPulse – Training workbook", author="PlantPulse")
doc.build(st, onFirstPage=on_page, onLaterPages=on_page)
print("ok")
