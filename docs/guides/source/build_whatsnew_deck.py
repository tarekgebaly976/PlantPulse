"""PlantPulse – "What is new, November 2026" PowerPoint (update to the modules and benefits presentation), with
speaker notes. Same colours as the modules deck. argv: out.pptx"""

import os
import sys

from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import MSO_ANCHOR, PP_ALIGN
from pptx.util import Emu, Inches, Pt

OUT = sys.argv[1]
IMG = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "img")
NAVY, TEAL, AMBER, PAPER, INK2, WHITE = (RGBColor.from_string(x) for x in ("102A33", "23616D", "E3A72F", "F4F6F3", "5E6E73", "FFFFFF"))
RED, ORANGE, GREEN, GREY = (RGBColor.from_string(x) for x in ("E03131", "F08C00", "37B24D", "868E96"))
FONT = "Arial"

prs = Presentation()
prs.slide_width, prs.slide_height = Inches(13.333), Inches(7.5)
BLANK = prs.slide_layouts[6]
W, H = prs.slide_width, prs.slide_height
M = Inches(0.6)
N = [0]


def text(sl, x, y, w, h, s, size=18, bold=False, color=NAVY, align=None, bullets=False, anchor=None):
    tb = sl.shapes.add_textbox(x, y, w, h)
    tf = tb.text_frame
    tf.word_wrap = True
    if anchor:
        tf.vertical_anchor = anchor
    lines = s if isinstance(s, list) else [s]
    for i, line in enumerate(lines):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        run = p.add_run()
        run.text = ("•  " if bullets else "") + line
        run.font.size, run.font.bold, run.font.name = Pt(size), bold, FONT
        run.font.color.rgb = color
        if align:
            p.alignment = align
        if bullets:
            p.space_after = Pt(8)
    return tb


def rect(sl, x, y, w, h, fill, line=None, shape=MSO_SHAPE.ROUNDED_RECTANGLE):
    r = sl.shapes.add_shape(shape, x, y, w, h)
    r.fill.solid()
    r.fill.fore_color.rgb = fill
    if line is None:
        r.line.fill.background()
    else:
        r.line.color.rgb = line
    if shape == MSO_SHAPE.ROUNDED_RECTANGLE:
        r.adjustments[0] = 0.08
    r.shadow.inherit = False
    return r


def slide(kicker, title, notes, dark=False):
    N[0] += 1
    sl = prs.slides.add_slide(BLANK)
    rect(sl, 0, 0, W, H, NAVY if dark else PAPER, shape=MSO_SHAPE.RECTANGLE)
    if kicker:
        text(sl, M, Inches(0.45), Inches(10), Inches(0.4), kicker.upper(), 13, True, AMBER if dark else TEAL)
    if title:
        text(sl, M, Inches(0.8), W - 2 * M, Inches(0.9), title, 34, True, WHITE if dark else NAVY)
    foot = INK2 if not dark else RGBColor.from_string("9FB3B8")
    text(sl, M, H - Inches(0.55), Inches(9), Inches(0.35), "PlantPulse · What is new · November 2026", 11, color=foot)
    text(sl, W - M - Inches(1), H - Inches(0.55), Inches(1), Inches(0.35), str(N[0]), 11, color=foot, align=PP_ALIGN.RIGHT)
    sl.notes_slide.notes_text_frame.text = notes
    return sl


def picture(sl, name, x, y, w=None, h=None):
    return sl.shapes.add_picture(os.path.join(IMG, name), x, y, w, h)


def card(sl, x, y, w, h, title, body, fill=WHITE, accent=TEAL, tsize=18, bsize=14):
    rect(sl, x, y, w, h, fill)
    rect(sl, x, y, Inches(0.09), h, accent, shape=MSO_SHAPE.RECTANGLE)
    text(sl, x + Inches(0.25), y + Inches(0.15), w - Inches(0.4), Inches(0.5), title, tsize, True, NAVY)
    text(sl, x + Inches(0.25), y + Inches(0.62), w - Inches(0.4), h - Inches(0.7), body, bsize, color=INK2)


# 1 cover
sl = slide("", "", "Update to the PlantPulse modules and benefits presentation: what changed since the last session. "
           "Everything shown is live on the server (app.plantpulse-cmms.com).", dark=True)
text(sl, M, Inches(2.1), Inches(11), Inches(1.2), "PlantPulse", 60, True, WHITE)
text(sl, M, Inches(3.25), Inches(11), Inches(0.8), "What is new · November 2026", 30, False, AMBER)
text(sl, M, Inches(4.2), Inches(11), Inches(1.2),
     "Clear colours, targets for every KPI, control charts with Nelson rules, a dashboard each person chooses, and root cause analysis", 20, color=RGBColor.from_string("DCE6E8"))
text(sl, M, Inches(5.9), Inches(11), Inches(0.5), "Maintenance management for industrial plants · updated 12 November 2026", 14, color=RGBColor.from_string("9FB3B8"))

# 2 overview
sl = slide("Overview", "What is new", "Eight changes. The next slides show each one with the screen and the benefit.")
items = [("One colour code", "Red act now · amber attention · green all clear · grey information"), ("Customise dashboard", "Each person chooses sections, counters and KPIs; same on phone and PC"),
         ("KPI targets", "Set a target on any KPI, for the plant or a department"), ("Result vs target", "KPI tiles: result, target, Met / Close / Missed"),
         ("Nelson control charts", "8 rules with probable cause on readings and KPIs"), ("Clear alarm levels", "“Alarm limit” / “Warning limit” instead of “Critical”; counts match lists"),
         ("Company KPIs in the app", "Add a KPI and enter months without Excel"), ("RCA, search, presentation", "Root cause analysis, one search box, PowerPoint per period")]
cw, ch = (W - 2 * M - Inches(0.75)) / 4, Inches(2.25)
for i, (a, b) in enumerate(items):
    x = M + (cw + Inches(0.25)) * (i % 4)
    y = Inches(1.95) + (ch + Inches(0.3)) * (i // 4)
    rect(sl, x, y, cw, ch, NAVY)
    text(sl, x + Inches(0.25), y + Inches(0.2), cw - Inches(0.5), Inches(0.8), a, 20, True, AMBER)
    text(sl, x + Inches(0.25), y + Inches(1.05), cw - Inches(0.5), ch - Inches(1.1), b, 14, color=RGBColor.from_string("DCE6E8"))

# 3 colour code
sl = slide("Dashboard", "One colour code for the whole dashboard",
           "Before, each counter had a fixed colour by type, even at zero. Now colour means one thing everywhere. "
           "The key is shown on the dashboard itself. Counters at zero turn green with a tick. "
           "The condition monitoring counter counts every open alarm, so the number matches the list it opens, and the line under it splits alarm limit and warning limit.")
rows = [(RED, "Red", "Act now", "Emergencies, overdue work, alarm limit, KPI target missed"),
        (ORANGE, "Amber", "Needs attention / waiting", "New requests, approvals, warning limit, KPI close to target"),
        (GREEN, "Green", "All clear / target met", "Counter at zero, target met, reading normal"),
        (GREY, "Grey", "Information", "My open work, open work orders, KPI without target")]
for i, (c, name, mean, ex) in enumerate(rows):
    y = Inches(1.95) + i * Inches(1.15)
    r = rect(sl, M, y, Inches(1.5), Inches(0.95), c)
    r.text_frame.text = name
    r.text_frame.paragraphs[0].runs[0].font.size, r.text_frame.paragraphs[0].runs[0].font.bold = Pt(20), True
    r.text_frame.paragraphs[0].runs[0].font.color.rgb = WHITE
    r.text_frame.paragraphs[0].alignment = PP_ALIGN.CENTER
    r.text_frame.vertical_anchor = MSO_ANCHOR.MIDDLE
    text(sl, M + Inches(1.7), y + Inches(0.05), Inches(3.2), Inches(0.5), mean, 18, True)
    text(sl, M + Inches(1.7), y + Inches(0.48), Inches(3.4), Inches(0.5), ex, 12, color=INK2)
picture(sl, "dashboard.png", Inches(6.05), Inches(1.85), w=Inches(6.7))

# 4 customise
sl = slide("Dashboard", "Each person chooses their dashboard",
           "Customise dashboard, top right. Sections, counters, calculated KPIs and company KPIs can be switched on and off. "
           "The choice is saved on the server for that person and plant, so the phone app and the computer show the same. Reset to default restores the standard layout.")
steps = ["Press Customise dashboard (top right)", "Tick the sections: quick actions, counters, needs attention, work orders per week, KPIs vs target, condition monitoring",
         "Untick counters you do not need", "Pick the calculated KPIs and company KPIs to show as tiles", "Save – the same layout on phone and computer"]
text(sl, M, Inches(1.95), Inches(7), Inches(4.5), [f"{i}.  {s}" for i, s in enumerate(steps, 1)], 18)
card(sl, Inches(8.2), Inches(1.95), Inches(4.5), Inches(1.5), "Manager", "KPIs vs target, alarms, approvals – no technician lists", accent=AMBER)
card(sl, Inches(8.2), Inches(3.65), Inches(4.5), Inches(1.5), "Technician", "My work, emergencies, quick report and scan", accent=TEAL)
card(sl, Inches(8.2), Inches(5.35), Inches(4.5), Inches(1.3), "Reliability", "Condition monitoring signals and alarms first", accent=RED)

# 5 targets
sl = slide("KPIs", "Result against target, for every KPI",
           "Any calculated KPI can have a target: press Set target on the KPI card. The direction is preset (higher is better for PM compliance, MTBF and availability; lower for MTTR, backlog, cost). "
           "Choose a department at the top of the page to set a department target; otherwise it applies to the whole plant. "
           "Close means missed by no more than 10 percent. The same targets drive the dashboard tiles and the management presentation.")
picture(sl, "kpi-targets.png", M, Inches(1.85), w=Inches(8.0))
card(sl, Inches(8.9), Inches(1.85), Inches(3.85), Inches(1.45), "Met", "Result at or better than target", accent=GREEN)
card(sl, Inches(8.9), Inches(3.45), Inches(3.85), Inches(1.45), "Close", "Missed by up to 10 %", accent=ORANGE)
card(sl, Inches(8.9), Inches(5.05), Inches(3.85), Inches(1.45), "Missed", "More than 10 % off target", accent=RED)

# 6 Nelson
sl = slide("Control charts", "Nelson rules: see a change early",
           "Every measurement point and every KPI now has a control chart like the plant's control-chart sheet: CL the average, UCL and LCL at 3 sigma, zones A, B and C. "
           "An open red circle marks a point inside a broken rule and the red number is the rule. The table lists pattern, probable cause and where it was found. "
           "In the point list a Nelson column shows the rules broken now, and the dashboard lists those points.")
picture(sl, "control-chart.png", M, Inches(1.75), h=Inches(5.1))
rules = [("1", "1 point more than 3σ from CL", "New person, wrong setup"), ("2", "7 in a row on the same side of CL", "Setup or process change"),
         ("3", "7 in a row all rising or all falling", "Trend, tool wear"), ("4", "14 in a row alternating up and down", "Over-control, tampering"),
         ("5", "2 of 3 beyond 2σ (same side)", "New person, wrong setup"), ("6", "4 of 5 beyond 1σ (same side)", "Small shift"),
         ("7", "14 in a row within 1σ", "Process change"), ("8", "8 in a row beyond 1σ (either side)", "Process change")]
tx, tw = Inches(4.3), Inches(8.45)
tbl = sl.shapes.add_table(len(rules) + 1, 3, tx, Inches(1.8), tw, Inches(4.6)).table
for j, (hd, wd) in enumerate((("Rule", 0.9), ("Pattern", 4.4), ("Probable cause", 3.15))):
    tbl.columns[j].width = Inches(wd)
    tbl.cell(0, j).text = hd
for i, r in enumerate(rules, 1):
    for j, v in enumerate(r):
        tbl.cell(i, j).text = v
for i in range(len(rules) + 1):
    for j in range(3):
        c = tbl.cell(i, j)
        c.fill.solid()
        c.fill.fore_color.rgb = RGBColor.from_string("2C7FB8") if i == 0 else (WHITE if i % 2 else RGBColor.from_string("EEF4F6"))
        for p in c.text_frame.paragraphs:
            for run in p.runs:
                run.font.size, run.font.name = Pt(14), FONT
                run.font.bold = i == 0
                run.font.color.rgb = WHITE if i == 0 else NAVY

# 7 condition monitoring
sl = slide("Condition monitoring", "Alarm levels in plain words",
           "Management read Critical alerts as a plant emergency, and the counter showed only critical while the list showed all alarms. "
           "Now: the level says Alarm limit (red) or Warning limit (amber); the counter counts every open alarm with the split under it; the Alerts tab filters by level; "
           "and the dashboard counter only covers the departments a person may see, like the list.")
card(sl, M, Inches(1.95), Inches(3.8), Inches(2.2), "Alarm limit", "The reading passed the alarm limit set for the point: act soon. Not a plant shutdown.", accent=RED)
card(sl, M + Inches(4.05), Inches(1.95), Inches(3.8), Inches(2.2), "Warning limit", "The reading passed the warning limit: watch and plan the work.", accent=ORANGE)
card(sl, M + Inches(8.1), Inches(1.95), Inches(3.8), Inches(2.2), "Normal", "Inside the limits. Nelson rules still warn about trends.", accent=GREEN)
text(sl, M, Inches(4.5), W - 2 * M, Inches(2.3),
     ["Dashboard counter = the list it opens (e.g. 3 = 1 alarm limit + 2 warning limit)", "Alerts tab: All open / Alarm limit exceeded / Warning limit exceeded",
      "Point list: Level and Nelson columns; the chart shows warning and alarm limit lines"], 18, bullets=True)

# 8 company KPIs + RCA
sl = slide("KPIs and reliability", "Company KPIs in the app, and root cause analysis",
           "Company KPIs: Add KPI and Enter month, no Excel needed (Excel still works). Each month is coloured and the name opens the control chart. "
           "RCA: major breakdowns are proposed automatically by rules; the manager starts it; the team uses 5 Whys and fishbone; actions are followed and an effectiveness check reopens the RCA if the failure returns.")
card(sl, M, Inches(1.95), Inches(5.6), Inches(4.6), "Company KPIs",
     "• Add KPI: name, department, unit, better when higher / lower\n• Enter month: actual and target, phone friendly\n• Coloured months, YTD average\n• Control chart with target line\n• Link to a calculated KPI to show its target", bsize=16)
flow = ["Waiting for decision", "Investigation (5 Whys, fishbone)", "Approval", "Action plan", "Effectiveness check"]
for i, f in enumerate(flow):
    y = Inches(1.95) + i * Inches(0.93)
    r = rect(sl, Inches(6.75), y, Inches(5.95), Inches(0.75), WHITE, line=TEAL)
    text(sl, Inches(6.95), y + Inches(0.12), Inches(5.6), Inches(0.5), f"{i + 1}.  {f}", 17, True)

# 9 search + presentation
sl = slide("Everyday use", "Search everywhere, report in one click",
           "Search: magnifier or Ctrl+K, finds equipment, work orders, requests, parts, plans, points, RCAs and shutdowns. "
           "Management presentation: one click on the KPI page builds an editable PowerPoint in English, Arabic or Bengali; the scorecard now shows target and On target / Close / Off target, "
           "and the condition slide shows alarm levels and points breaking a Nelson rule.")
card(sl, M, Inches(1.95), Inches(5.8), Inches(4.4), "Search everywhere",
     "• Magnifier in the top bar, or Ctrl+K\n• Words in any order: “crusher motor”, “MIX bearing”\n• Finds work by its equipment code or name\n• Arabic spelling variants treated alike", bsize=16)
card(sl, M + Inches(6.1), Inches(1.95), Inches(6.0), Inches(4.4), "Management presentation",
     "• Period and department → PowerPoint in one click\n• Scorecard: this period, previous, target, status\n• Trends, bad actors, cost vs budget, RCAs\n• Condition monitoring: alarm levels, Nelson signals\n• Native charts – edit before the meeting", accent=AMBER, bsize=16)

# 10 next steps
sl = slide("Next steps", "To get the full benefit",
           "Targets are the one thing the system cannot know by itself: the manager sets them once. Then train each group with the workbook (sessions A to F). "
           "Google Play: closed testing ends around 22 November; then the production application is submitted.", dark=True)
nxt = ["Manager sets targets for the main KPIs (PM compliance, MTBF, MTTR, availability, backlog)", "Each person customises the dashboard for their job",
       "Train with the workbook: sessions A–F, exercises and quiz", "Reliability engineer reviews points with Nelson signals every week",
       "Use the management presentation in the monthly meeting", "PlantPulse on Google Play after closed testing (about 22 November)"]
text(sl, M, Inches(1.95), W - 2 * M, Inches(4.8), nxt, 22, color=WHITE, bullets=True)

prs.save(OUT)
print("ok", N[0], "slides")
