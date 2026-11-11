"""PlantPulse – «ما الجديد، نوفمبر 2026» PowerPoint بالعربية (من اليمين لليسار) مع ملاحظات المتحدث.
Same slides as build_whatsnew_deck.py; layout mirrored for right-to-left reading, Arabic screenshots. argv: out.pptx"""

import os
import sys

from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import MSO_ANCHOR, PP_ALIGN
from pptx.oxml.ns import qn
from pptx.util import Inches, Pt

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


def mx(x, w):
    """Mirror a left position for right-to-left layout."""
    return W - x - w


def rtl(p, align=PP_ALIGN.RIGHT):
    p.alignment = align
    p._p.get_or_add_pPr().set("rtl", "1")


def text(sl, x, y, w, h, s, size=18, bold=False, color=NAVY, align=PP_ALIGN.RIGHT, bullets=False):
    tb = sl.shapes.add_textbox(mx(x, w), y, w, h)
    tf = tb.text_frame
    tf.word_wrap = True
    lines = s if isinstance(s, list) else [s]
    for i, line in enumerate(lines):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        run = p.add_run()
        run.text = ("•  " if bullets else "") + line
        run.font.size, run.font.bold, run.font.name = Pt(size), bold, FONT
        run._r.get_or_add_rPr().set("lang", "ar-SA")
        rpr = run._r.get_or_add_rPr()
        cs = rpr.makeelement(qn("a:cs"), {"typeface": FONT})
        rpr.append(cs)
        run.font.color.rgb = color
        rtl(p, align)
        if bullets:
            p.space_after = Pt(8)
    return tb


def rect(sl, x, y, w, h, fill, line=None, shape=MSO_SHAPE.ROUNDED_RECTANGLE):
    r = sl.shapes.add_shape(shape, mx(x, w), y, w, h)
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
        text(sl, M, Inches(0.45), Inches(10), Inches(0.4), kicker, 14, True, AMBER if dark else TEAL)
    if title:
        text(sl, M, Inches(0.8), W - 2 * M, Inches(0.9), title, 34, True, WHITE if dark else NAVY)
    foot = INK2 if not dark else RGBColor.from_string("9FB3B8")
    text(sl, M, H - Inches(0.55), Inches(9), Inches(0.35), "PlantPulse · ما الجديد · نوفمبر 2026", 11, color=foot)
    text(sl, W - M - Inches(1), H - Inches(0.55), Inches(1), Inches(0.35), str(N[0]), 11, color=foot, align=PP_ALIGN.LEFT)
    sl.notes_slide.notes_text_frame.text = notes
    for p in sl.notes_slide.notes_text_frame.paragraphs:
        rtl(p)
    return sl


def picture(sl, name, x, y, w=None, h=None):
    pic = sl.shapes.add_picture(os.path.join(IMG, name), 0, y, w, h)
    pic.left = mx(x, pic.width)
    return pic


def card(sl, x, y, w, h, title, body, fill=WHITE, accent=TEAL, tsize=18, bsize=14):
    rect(sl, x, y, w, h, fill)
    rect(sl, x, y, Inches(0.09), h, accent, shape=MSO_SHAPE.RECTANGLE)
    text(sl, x + Inches(0.25), y + Inches(0.15), w - Inches(0.4), Inches(0.5), title, tsize, True, NAVY)
    lines = [ln.lstrip("• ").strip() for ln in body.split("\n")] if "\n" in body else body
    text(sl, x + Inches(0.25), y + Inches(0.62), w - Inches(0.4), h - Inches(0.7), lines, bsize, color=INK2, bullets="\n" in body)


# 1 cover
sl = slide("", "", "تحديث للعرض التقديمي «وحدات PlantPulse وفوائدها»: ما الذي تغيّر منذ آخر جلسة. كل ما يُعرض يعمل الآن على الخادم (app.plantpulse-cmms.com).", dark=True)
text(sl, M, Inches(2.1), Inches(11), Inches(1.2), "PlantPulse", 60, True, WHITE)
text(sl, M, Inches(3.25), Inches(11), Inches(0.8), "ما الجديد · نوفمبر 2026", 30, False, AMBER)
text(sl, M, Inches(4.2), Inches(11), Inches(1.2), "ألوان واضحة، مستهدف لكل مؤشر، خرائط تحكم بقواعد نيلسون، لوحة معلومات يختارها كل شخص، وتحليل السبب الجذري", 20, color=RGBColor.from_string("DCE6E8"))
text(sl, M, Inches(5.9), Inches(11), Inches(0.5), "إدارة الصيانة للمصانع · تحديث 12 نوفمبر 2026", 14, color=RGBColor.from_string("9FB3B8"))

# 2 overview
sl = slide("نظرة عامة", "ما الجديد", "ثمانية تغييرات. الشرائح التالية تعرض كل واحد مع الشاشة والفائدة.")
items = [("مفتاح ألوان واحد", "أحمر إجراء فوري · برتقالي انتباه · أخضر لا شيء معلّق · رمادي معلومة"), ("تخصيص لوحة المعلومات", "كل شخص يختار الأقسام والعدادات والمؤشرات؛ نفس الشكل على الجوال والكمبيوتر"),
         ("مستهدفات المؤشرات", "مستهدف لأي مؤشر، للمصنع أو لقسم"), ("النتيجة مقابل المستهدف", "مربعات المؤشرات: النتيجة، المستهدف، تحقق / قريب / لم يتحقق"),
         ("قواعد نيلسون", "8 قواعد مع السبب المحتمل للقراءات والمؤشرات"), ("مستويات إنذار واضحة", "«حد الإنذار» / «حد التحذير» بدل «حرج»؛ العدادات تطابق القوائم"),
         ("مؤشرات الشركة", "إضافة مؤشر وإدخال الشهور في التطبيق بدون Excel"), ("التحليل والبحث والعرض", "تحليل السبب الجذري، بحث واحد، PowerPoint لكل فترة")]
cw, ch = (W - 2 * M - Inches(0.75)) / 4, Inches(2.25)
for i, (a, b) in enumerate(items):
    x = M + (cw + Inches(0.25)) * (i % 4)
    y = Inches(1.95) + (ch + Inches(0.3)) * (i // 4)
    rect(sl, x, y, cw, ch, NAVY)
    text(sl, x + Inches(0.25), y + Inches(0.2), cw - Inches(0.5), Inches(0.8), a, 17, True, AMBER)
    text(sl, x + Inches(0.25), y + Inches(1.05), cw - Inches(0.5), ch - Inches(1.1), b, 14, color=RGBColor.from_string("DCE6E8"))

# 3 colour code
sl = slide("لوحة المعلومات", "مفتاح ألوان واحد للوحة كلها",
           "سابقًا كان لكل عداد لون ثابت حسب نوعه حتى لو كان صفرًا. الآن اللون له معنى واحد في كل مكان، والمفتاح ظاهر على اللوحة. العداد الصفري يصبح أخضر مع علامة ✓. "
           "عداد مراقبة الحالة يعدّ كل الإنذارات المفتوحة فيطابق القائمة التي يفتحها، والسطر تحته يقسمها إلى حد إنذار وحد تحذير.")
rows = [(RED, "أحمر", "إجراء فوري", "طوارئ، أعمال متأخرة، حد الإنذار، مستهدف لم يتحقق"),
        (ORANGE, "برتقالي", "يحتاج انتباه / بانتظار أحد", "طلبات جديدة، اعتمادات، حد التحذير، قريب من المستهدف"),
        (GREEN, "أخضر", "كله تمام / تحقق المستهدف", "عداد على صفر، مستهدف متحقق، قراءة طبيعية"),
        (GREY, "رمادي", "معلومة", "أعمالي المفتوحة، أوامر العمل المفتوحة، مؤشر بلا مستهدف")]
for i, (c, name, mean, ex) in enumerate(rows):
    y = Inches(1.95) + i * Inches(1.15)
    r = rect(sl, M, y, Inches(1.5), Inches(0.95), c)
    r.text_frame.text = name
    run = r.text_frame.paragraphs[0].runs[0]
    run.font.size, run.font.bold, run.font.color.rgb = Pt(20), True, WHITE
    r.text_frame.paragraphs[0].alignment = PP_ALIGN.CENTER
    r.text_frame.vertical_anchor = MSO_ANCHOR.MIDDLE
    text(sl, M + Inches(1.7), y + Inches(0.05), Inches(3.9), Inches(0.5), mean, 16, True)
    text(sl, M + Inches(1.7), y + Inches(0.48), Inches(3.4), Inches(0.5), ex, 12, color=INK2)
picture(sl, "ar-dashboard.png", Inches(6.05), Inches(1.85), w=Inches(6.7))

# 4 customise
sl = slide("لوحة المعلومات", "كل شخص يختار لوحته",
           "زر تخصيص لوحة المعلومات أعلى اللوحة. يمكن إظهار أو إخفاء الأقسام والعدادات والمؤشرات المحسوبة ومؤشرات الشركة. "
           "الاختيار يُحفظ على الخادم للشخص والمصنع، فيظهر نفسه على الجوال والكمبيوتر. استعادة الافتراضي يعيد الشكل الأصلي.")
steps = ["اضغط تخصيص لوحة المعلومات (أعلى اللوحة)", "اختر الأقسام: الإجراءات السريعة، العدادات، يحتاج انتباه، أوامر العمل أسبوعيًا، المؤشرات مقابل المستهدف، مراقبة الحالة",
         "أزل العدادات التي لا تحتاجها", "اختر المؤشرات المحسوبة ومؤشرات الشركة التي تظهر كمربعات", "احفظ – نفس الشكل على الجوال والكمبيوتر"]
text(sl, M, Inches(1.95), Inches(7), Inches(4.5), [f"{i}.  {s}" for i, s in enumerate(steps, 1)], 18)
card(sl, Inches(8.2), Inches(1.95), Inches(4.5), Inches(1.5), "المدير", "المؤشرات مقابل المستهدف، الإنذارات، الاعتمادات", accent=AMBER)
card(sl, Inches(8.2), Inches(3.65), Inches(4.5), Inches(1.5), "الفني", "أعمالي، الطوارئ، البلاغ السريع والمسح", accent=TEAL)
card(sl, Inches(8.2), Inches(5.35), Inches(4.5), Inches(1.3), "الاعتمادية", "إشارات وإنذارات مراقبة الحالة أولًا", accent=RED)

# 5 targets
sl = slide("المؤشرات", "النتيجة مقابل المستهدف لكل مؤشر",
           "أي مؤشر محسوب يمكن أن يكون له مستهدف: اضغط تحديد المستهدف على بطاقة المؤشر. الاتجاه مضبوط مسبقًا (الأعلى أفضل للالتزام بالوقائية وMTBF والجاهزية؛ الأقل أفضل لـ MTTR والمتراكم والتكلفة). "
           "اختر قسمًا أعلى الصفحة لتحديد مستهدف القسم؛ وإلا يُطبق على المصنع كله. «قريب» يعني لم يتحقق بفارق 10% أو أقل. نفس المستهدفات تظهر في لوحة المعلومات والعرض التقديمي للإدارة.")
picture(sl, "ar-kpi-targets.png", M, Inches(1.85), w=Inches(8.0))
card(sl, Inches(8.9), Inches(1.85), Inches(3.85), Inches(1.45), "تحقق", "النتيجة تساوي المستهدف أو أفضل", accent=GREEN)
card(sl, Inches(8.9), Inches(3.45), Inches(3.85), Inches(1.45), "قريب", "لم يتحقق بفارق 10% أو أقل", accent=ORANGE)
card(sl, Inches(8.9), Inches(5.05), Inches(3.85), Inches(1.45), "لم يتحقق", "بعيد عن المستهدف أكثر من 10%", accent=RED)

# 6 Nelson
sl = slide("خرائط التحكم", "قواعد نيلسون: اكتشف التغيير مبكرًا",
           "كل نقطة قياس وكل مؤشر لهما الآن خريطة تحكم مثل ورقة خرائط التحكم في المصنع: CL المتوسط، UCL وLCL عند 3 سيجما، والمناطق A وB وC. "
           "الدائرة الحمراء المفرغة نقطة داخل قاعدة مكسورة، والرقم الأحمر هو رقم القاعدة. الجدول يعرض النمط والسبب المحتمل ومكان ظهوره. "
           "في قائمة النقاط عمود نيلسون يعرض القواعد المكسورة الآن، ولوحة المعلومات تعرض هذه النقاط.")
picture(sl, "ar-control-chart.png", M, Inches(1.75), h=Inches(5.1))
rules = [("1", "نقطة أبعد من 3σ عن خط المركز", "شخص جديد، ضبط خاطئ"), ("2", "7 متتالية في نفس الجانب", "تغيير في الضبط أو العملية"),
         ("3", "7 متتالية كلها تزيد أو تقل", "اتجاه، تآكل الأداة"), ("4", "14 متتالية تتناوب صعودًا وهبوطًا", "تحكم زائد، عبث بالضبط"),
         ("5", "2 من 3 أبعد من 2σ (نفس الجانب)", "شخص جديد، ضبط خاطئ"), ("6", "4 من 5 أبعد من 1σ (نفس الجانب)", "انحراف بسيط"),
         ("7", "14 متتالية داخل 1σ", "تغيير في العملية"), ("8", "8 متتالية أبعد من 1σ (أي جانب)", "تغيير في العملية")]
tw = Inches(7.2)
gt = sl.shapes.add_table(len(rules) + 1, 3, M, Inches(1.8), tw, Inches(4.6))
tbl = gt.table
tbl._tbl.tblPr.set("rtl", "1")
for j, (hd, wd) in enumerate((("القاعدة", 0.9), ("النمط", 3.7), ("السبب المحتمل", 2.6))):
    tbl.columns[j].width = Inches(wd)
    tbl.cell(0, j).text = hd
for i, r in enumerate(rules, 1):
    for j, val in enumerate(r):
        tbl.cell(i, j).text = val
for i in range(len(rules) + 1):
    for j in range(3):
        c = tbl.cell(i, j)
        c.fill.solid()
        c.fill.fore_color.rgb = RGBColor.from_string("2C7FB8") if i == 0 else (WHITE if i % 2 else RGBColor.from_string("EEF4F6"))
        for p in c.text_frame.paragraphs:
            rtl(p)
            for run in p.runs:
                run.font.size, run.font.name, run.font.bold = Pt(14), FONT, i == 0
                run.font.color.rgb = WHITE if i == 0 else NAVY

# 7 condition monitoring
sl = slide("مراقبة الحالة", "مستويات الإنذار بكلمات واضحة",
           "الإدارة فهمت «تنبيهات حرجة» كطوارئ في المصنع، والعداد كان يعرض الحرج فقط والقائمة تعرض كل الإنذارات. "
           "الآن: المستوى يقول حد الإنذار (أحمر) أو حد التحذير (برتقالي)؛ العداد يعدّ كل الإنذارات المفتوحة مع التقسيم تحته؛ تبويب التنبيهات يصفّي حسب المستوى؛ "
           "وعداد لوحة المعلومات يغطي فقط الأقسام المسموح للشخص رؤيتها مثل القائمة.")
card(sl, M, Inches(1.95), Inches(3.8), Inches(2.2), "حد الإنذار", "القراءة تعدّت حد الإنذار المحدد للنقطة: إجراء قريب. لا يعني توقف المصنع.", accent=RED)
card(sl, M + Inches(4.05), Inches(1.95), Inches(3.8), Inches(2.2), "حد التحذير", "القراءة تعدّت حد التحذير: متابعة وتخطيط العمل.", accent=ORANGE)
card(sl, M + Inches(8.1), Inches(1.95), Inches(3.8), Inches(2.2), "طبيعي", "داخل الحدود. قواعد نيلسون ما زالت تنبه للاتجاهات.", accent=GREEN)
text(sl, M, Inches(4.5), W - 2 * M, Inches(2.3),
     ["عداد لوحة المعلومات = القائمة التي يفتحها (مثال: 3 = 1 حد إنذار + 2 حد تحذير)", "تبويب التنبيهات: كل المفتوحة / تجاوز حد الإنذار / تجاوز حد التحذير",
      "قائمة النقاط: عمودا المستوى ونيلسون؛ والخريطة تعرض خطَّي حد التحذير والإنذار"], 18, bullets=True)

# 8 company KPIs + RCA
sl = slide("المؤشرات والاعتمادية", "مؤشرات الشركة وتحليل السبب الجذري",
           "مؤشرات الشركة: إضافة مؤشر وإدخال شهر بدون Excel (Excel ما زال يعمل). كل شهر ملون، واسم المؤشر يفتح خريطة التحكم. "
           "تحليل السبب الجذري: الأعطال الكبيرة تُقترح تلقائيًا حسب القواعد؛ المدير يبدأ التحليل؛ الفريق يستخدم لماذا × 5 وعظم السمكة؛ الإجراءات تُتابع، والتحقق من الفعالية يعيد فتح التحليل إذا عاد العطل.")
card(sl, M, Inches(1.95), Inches(5.6), Inches(4.6), "مؤشرات الشركة",
     "• إضافة مؤشر: الاسم، القسم، الوحدة، الأفضل أعلى / أقل\n• إدخال شهر: الفعلي والمستهدف، مناسب للجوال\n• شهور ملونة، ومتوسط السنة\n• خريطة تحكم مع خط المستهدف\n• ربط بمؤشر محسوب لعرض مستهدفه", bsize=16)
flow = ["بانتظار القرار", "التحليل (لماذا × 5، عظم السمكة)", "الاعتماد", "خطة العمل", "التحقق من الفعالية"]
for i, f in enumerate(flow):
    y = Inches(1.95) + i * Inches(0.93)
    rect(sl, Inches(6.75), y, Inches(5.95), Inches(0.75), WHITE, line=TEAL)
    text(sl, Inches(6.95), y + Inches(0.12), Inches(5.6), Inches(0.5), f"{i + 1}.  {f}", 17, True)

# 9 search + presentation
sl = slide("الاستخدام اليومي", "بحث في كل مكان، وتقرير بضغطة واحدة",
           "البحث: العدسة أو Ctrl+K، يجد المعدات وأوامر العمل والطلبات والقطع والخطط والنقاط وتحليلات السبب الجذري والتوقفات. "
           "العرض التقديمي للإدارة: ضغطة واحدة في صفحة المؤشرات تنشئ PowerPoint قابلًا للتعديل بالعربية أو الإنجليزية أو البنغالية؛ بطاقة المؤشرات تعرض الآن المستهدف ومحقق / قريب / غير محقق، "
           "وشريحة مراقبة الحالة تعرض مستويات الإنذار والنقاط التي تكسر قاعدة نيلسون.")
card(sl, M, Inches(1.95), Inches(5.8), Inches(4.4), "البحث في كل مكان",
     "• العدسة في الشريط العلوي، أو Ctrl+K\n• الكلمات بأي ترتيب: «crusher motor»\n• يجد الأعمال برمز معداتها أو اسمها\n• يعامل اختلافات الإملاء العربية (أ/إ/ا، ة/ه، ى/ي) كحرف واحد", bsize=16)
card(sl, M + Inches(6.1), Inches(1.95), Inches(6.0), Inches(4.4), "العرض التقديمي للإدارة",
     "• الفترة والقسم ← PowerPoint بضغطة واحدة\n• بطاقة المؤشرات: هذه الفترة، السابقة، المستهدف، الحالة\n• الاتجاهات، أكثر المعدات أعطالًا، التكلفة مقابل الميزانية، التحليلات الجذرية\n• مراقبة الحالة: مستويات الإنذار، إشارات نيلسون\n• رسوم حقيقية – عدّلها قبل الاجتماع", accent=AMBER, bsize=16)

# 10 next steps
sl = slide("الخطوات التالية", "للحصول على الفائدة كاملة",
           "المستهدفات هي الشيء الوحيد الذي لا يعرفه النظام وحده: يحددها المدير مرة واحدة. ثم درّب كل فئة بالكتيّب (الجلسات أ إلى و). "
           "Google Play: الاختبار المغلق ينتهي حوالي 22 نوفمبر، ثم يُقدَّم طلب النشر.", dark=True)
nxt = ["المدير يحدد مستهدفات المؤشرات الرئيسية (الالتزام بالوقائية، MTBF، MTTR، الجاهزية، المتراكم)", "كل شخص يخصص لوحة المعلومات لعمله",
       "التدريب بالكتيّب: الجلسات أ–و، التمارين والاختبار", "مهندس الاعتمادية يراجع النقاط ذات إشارات نيلسون كل أسبوع",
       "استخدام العرض التقديمي للإدارة في الاجتماع الشهري", "PlantPulse على Google Play بعد الاختبار المغلق (حوالي 22 نوفمبر)"]
text(sl, M, Inches(1.95), W - 2 * M, Inches(4.8), nxt, 22, color=WHITE, bullets=True)

prs.save(OUT)
print("ok", N[0], "slides")
