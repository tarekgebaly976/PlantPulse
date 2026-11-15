"""PlantPulse – quick start and glossary (Arabic or English PDF): how to open and use the system (website, app on a
phone, links), the main screens, the daily path, working without internet, the basic terms with a short meaning,
statuses, roles, and the administrator's links and commands. Printed by Chromium like the Arabic guides.
argv: out.pdf ar|en [users]  – "users" leaves out the administrator's server and commands (edition for every user)"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ar_pdf import grid, page, render, steps  # noqa: E402

OUT, LANG = sys.argv[1], sys.argv[2]
USERS = len(sys.argv) > 3 and sys.argv[3] == "users"  # edition without the administrator part
AR = LANG == "ar"
APP, SITE, DEMO = "https://app.plantpulse-cmms.com", "https://plantpulse-cmms.com", "https://demo.plantpulse-cmms.com"
PLAY = "https://play.google.com/store/apps/details?id=io.plantpulse.app"
BRANCH = "claude/serene-davinci-0arq11"


def L(s):
    """Left-to-right piece (links, codes) inside Arabic text."""
    return f'<span class="ltr">{s}</span>'


def box(kind, text):
    label = ({"tip": "نصيحة", "note": "ملاحظة", "warn": "مهم"} if AR else {"tip": "Tip", "note": "Note", "warn": "Important"})[kind]
    return f'<div class="box{" warn" if kind == "warn" else ""}"><b>{label}:</b> {text}</div>'


def code(s):
    return f'<div class="code">{s}</div>'


def sec(n, title, intro=""):
    return f'<h2 class="part" style="margin-top:12px">{n}. {title}</h2>' + (f'<p class="partintro">{intro}</p>' if intro else "")


def h3(t):
    return f"<h3>{t}</h3>"


T = lambda ar, en: ar if AR else en  # noqa: E731

H = []
# ---------------- cover ----------------
H.append(f'<div class="cover"><h1 class="title">PlantPulse</h1><div class="subtitle">'
         + T("دليل البداية السريعة والمصطلحات: كيف تفتح النظام وتستخدمه، الروابط، والمصطلحات الأساسية ومعناها باختصار",
             "Quick start and glossary: how to open and use the system, the links, and the basic terms in short")
         + '</div><div class="coverbox">'
         + T(f"النظام: {L(APP)}<br>الإصدار: 15 نوفمبر 2026 · لكل المستخدمين · يُستخدم مع تعليمات العمل وكتيّب التدريب",
             f"System: {APP}<br>Edition: 15 November 2026 · for every user · use with the work instructions and the training workbook")
         + "</div>"
         + box("note", T("PlantPulse نظام لإدارة الصيانة (CMMS): كل مشكلة وكل عمل صيانة وكل قراءة وكل قطعة غيار تُسجل في مكان واحد، فيعرف الجميع ما المطلوب، ومن ينفذ، ومتى، وكم كلّف. ومن هذه البيانات تُحسب مؤشرات الأداء تلقائيًا.",
                         "PlantPulse is a maintenance management system (CMMS): every problem, job, reading and spare part is recorded in one place, so everyone knows what is needed, who does it, when and at what cost. Performance indicators are calculated from this data automatically."))
         + "</div><div class='pb'></div>")

# ---------------- 1 links ----------------
H.append(sec(1, T("الروابط", "The links"), T("احفظ هذه الروابط. كلها تعمل من الحاسوب والجوال.", "Keep these links. All work on a computer and on a phone.")))
H.append(grid([
    [T("الرابط", "Link"), T("ما هو", "What it is"), T("لمن", "For whom")],
    [L(APP), T("<b>النظام نفسه</b> (بيانات مصنعك الحقيقية). منه تسجّل الدخول وتعمل كل يوم.", "<b>The system itself</b> (your plant's real data). Sign in and work here every day."), T("كل المستخدمين", "Every user")],
    [L(SITE), T("الموقع التعريفي: ما هو PlantPulse، المميزات، طلب تجربة أو تواصل.", "The website: what PlantPulse is, features, ask for a trial or contact."), T("الجميع والعملاء الجدد", "Everyone, new customers")],
    [L(DEMO), T("<b>النسخة التجريبية (DEMO)</b>: مصنع ببيانات أمثلة للتدريب والعرض. تُعاد لحالتها كل ليلة.", "<b>The demo</b>: a sample plant for training and showing. Reset every night."), T("التدريب والعروض", "Training, demonstrations")],
    [L(PLAY), T("<b>تطبيق Google Play</b> «PlantPulse CMMS – Maintenance». متاح الآن للمختبِرين، وللجميع بعد اعتماد النشر (بعد حوالي 22 نوفمبر).", "<b>Google Play app</b> “PlantPulse CMMS – Maintenance”. Testers now; everyone after publishing is approved (after about 22 November)."), T("مستخدمو أندرويد", "Android users")],
    [L(APP + "/field"), T("<b>جولة الموقع</b>: مسح QR وطلبات وأوامر عمل بدون إنترنت.", "<b>Field round</b>: QR, requests and work orders without internet."), T("الفنيون والمهندسون والمشرفون", "Technicians, engineers, supervisors")],
    [L(APP + "/forgot-password"), T("نسيت كلمة المرور: يرسل رابطًا لتعيين كلمة جديدة (إن كان مفعّلًا، وإلا اطلب من المسؤول).", "Forgot password: sends a link to set a new one (if enabled; otherwise ask the administrator)."), T("كل المستخدمين", "Every user")],
    [L(APP + "/privacy"), T("سياسة الخصوصية.", "Privacy policy."), T("الجميع", "Everyone")],
    [L(APP + "/delete-account"), T("طلب حذف الحساب.", "Ask to delete an account."), T("الجميع", "Everyone")],
], [36, 46, 18]))
H.append(box("tip", T(f"العنوان القديم {L('https://84-8-106-22.sslip.io')} ما زال يعمل ويفتح نفس النظام، لكن استخدم {L(APP)}.",
                      f"The old address {L('https://84-8-106-22.sslip.io')} still works and opens the same system, but use {L(APP)}.")))

# ---------------- 2 how to open ----------------
H.append(sec(2, T("كيف تفتح البرنامج", "How to open the program"), T("ثلاث طرق، ونفس الحساب في كلها.", "Three ways, the same account in all of them.")))
H.append(h3(T("أ. من الحاسوب (المتصفح)", "A. On a computer (browser)")))
H.append(steps([T(f"افتح Chrome أو Edge واكتب {L(APP)}.", f"Open Chrome or Edge and go to {APP}."),
                T("أدخل البريد الإلكتروني وكلمة المرور المؤقتة من المسؤول واضغط <b>دخول</b>.", "Enter your e-mail and the temporary password from the administrator, press <b>Sign in</b>."),
                T("غيّر كلمة المرور فورًا: أيقونة الشخص (أعلى) › <b>تغيير كلمة المرور</b>.", "Change the password at once: person icon (top) › <b>Change password</b>."),
                T("اختر اللغة من زر اللغة بجانب الجرس: عربي، إنجليزي أو بنغالي.", "Choose the language with the button next to the bell: English, Arabic or Bengali.")]))
H.append(h3(T("ب. على جوال أندرويد", "B. On an Android phone")))
H.append(steps([T("<b>من Google Play</b> (عند النشر للجميع، أو إذا كنت مختبِرًا): ابحث عن <b>PlantPulse CMMS</b> أو افتح رابط Google Play أعلاه › <b>تثبيت</b> › افتح وسجّل الدخول.",
                  "<b>From Google Play</b> (when public, or if you are a tester): search <b>PlantPulse CMMS</b> or open the Google Play link above › <b>Install</b> › open and sign in."),
                T(f"<b>أو من Chrome</b>: افتح {L(APP)} في <b>Chrome</b> وسجّل الدخول › قائمة Chrome (ثلاث نقاط) › <b>تثبيت التطبيق</b> أو <b>إضافة إلى الشاشة الرئيسية</b>.",
                  f"<b>Or from Chrome</b>: open {APP} in <b>Chrome</b> and sign in › Chrome menu (three dots) › <b>Install app</b> or <b>Add to Home screen</b>."),
                T("افتح PlantPulse بعد ذلك من أيقونته (ترس مع نبضة برتقالية).", "From then on open PlantPulse from its icon (gear with an orange pulse).")]))
H.append(box("warn", T("ثبّت من Chrome وليس Samsung Internet؛ وإلا قد يظهر تحذير Google Play Protect.", "Install from Chrome, not Samsung Internet; otherwise Google Play Protect may show a warning.")))
H.append(h3(T("ج. على آيفون", "C. On an iPhone")))
H.append(steps([T(f"افتح {L(APP)} في <b>Safari</b> وسجّل الدخول.", f"Open {APP} in <b>Safari</b> and sign in."),
                T("زر <b>مشاركة</b> › <b>إضافة إلى الشاشة الرئيسية</b> › <b>إضافة</b>.", "<b>Share</b> button › <b>Add to Home Screen</b> › <b>Add</b>.")]))
H.append(box("tip", T("إذا لم يظهر زر جديد بعد تحديث، أغلق التطبيق تمامًا (قائمة التطبيقات الأخيرة) وافتحه مرة أخرى.", "If a new button is missing after an update, close the app completely (recent apps) and open it again.")))

# ---------------- 3 screens ----------------
H.append("<div class='pb'></div>" + sec(3, T("الشاشات الرئيسية في القائمة", "The main screens in the menu"), T("ترى فقط ما يسمح به دورك وأقسامك.", "You only see what your role and departments allow.")))
H.append(grid([[T("الشاشة", "Screen"), T("ماذا تفعل فيها", "What you do there")],
               [T("لوحة المعلومات", "Dashboard"), T("الصورة العامة: العدادات بالألوان، المؤشرات مقابل المستهدف، ما يحتاج انتباهك. تخصّصها لنفسك.", "The overview: coloured counters, KPIs against target, what needs your attention. You can customise it.")],
               [T("أعمالي", "My work"), T("الأعمال المسندة إليك مرتبة حسب الاستحقاق.", "The jobs assigned to you, by due date.")],
               [T("مسح رمز QR", "Scan QR"), T("الكاميرا تقرأ ملصق الماكينة وتفتح صفحتها.", "The camera reads a machine label and opens its page.")],
               [T("جولة الموقع (بدون إنترنت)", "Field round (offline)"), T("مسح QR وطلبات عمل وأوامر عمل وتنفيذها بدون تغطية.", "QR, requests, work orders and their execution without signal.")],
               [T("طلبات العمل", "Work requests"), T("الإبلاغ عن مشكلة، والمشرف يقبل أو يرفض.", "Report a problem; the supervisor accepts or rejects.")],
               [T("أوامر العمل", "Work orders"), T("كل الأعمال: الإنشاء، التكليف، التنفيذ، المراجعة، الإغلاق.", "All jobs: create, assign, carry out, review, close.")],
               [T("الصيانة الوقائية", "Preventive maintenance"), T("الخطط الدورية وخطط العمل والجدول.", "Periodic plans, job plans and the schedule.")],
               [T("التزييت", "Lubrication"), T("نقاط ومسارات التزييت والزيوت.", "Lubrication points, routes and lubricants.")],
               [T("مراقبة الحالة", "Condition monitoring"), T("نقاط القياس، القراءات، الإنذارات، خرائط التحكم.", "Measurement points, readings, alarms, control charts.")],
               [T("التوقفات", "Shutdowns"), T("التوقفات المخططة وحزم العمل والجاهزية.", "Planned shutdowns, work packages, readiness.")],
               [T("تحليل السبب الجذري", "Root cause analysis"), T("تحليل الأعطال الكبيرة ومتابعة الإجراءات.", "Analysis of major breakdowns and follow-up of actions.")],
               [T("الأصول", "Assets"), T("شجرة المعدات وصفحة كل معدة بسجلها.", "The equipment tree and each machine's page with its history.")],
               [T("قطع الغيار", "Spare parts"), T("القطع، المخزون، القطع المستخدمة.", "Parts, stock, parts used.")],
               [T("المناوبات والتسليم", "Shifts & handover"), T("جدول الورديات وتسليم الوردية والقوى العاملة.", "Roster, shift handover, manpower.")],
               [T("المؤشرات والتقارير", "KPIs & reports"), T("المؤشرات والمستهدفات ومؤشرات الشركة والعرض التقديمي للإدارة.", "KPIs, targets, company KPIs, management presentation.")],
               [T("الإدارة", "Administration"), T("المستخدمون والأقسام والأدوار والإعدادات (للمسؤول).", "Users, departments, roles, settings (administrator).")]], [30, 70]))
H.append(box("tip", T(f"في الشريط العلوي: شارة <b>متصل</b>، <b>العدسة</b> للبحث في كل شيء ({L('Ctrl+K')})، <b>الجرس</b> للإشعارات، زر <b>اللغة</b>، وأيقونة الحساب.",
                      "In the top bar: the <b>Online</b> badge, the <b>magnifier</b> to search everything (Ctrl+K), the <b>bell</b> for notifications, the <b>language</b> button and the account icon.")))

# ---------------- 4 daily path ----------------
H.append(sec(4, T("المسار اليومي باختصار", "The daily path in short")))
H.append(steps([T("<b>الإبلاغ</b>: أي شخص يكتب طلب عمل (مع صورة)، ويختار «عطل» إذا توقفت الماكينة.", "<b>Report</b>: anyone writes a work request (with a photo) and ticks Breakdown if the machine stopped."),
                T("<b>الفرز</b>: المشرف يقبل الطلب فيصبح أمر عمل، أو يرفضه بسبب.", "<b>Triage</b>: the supervisor accepts it (it becomes a work order) or rejects it with a reason."),
                T("<b>الاعتماد والتكليف</b>: يُعتمد العمل ويُسند لفني.", "<b>Approve and assign</b>: the job is approved and given to a technician."),
                T("<b>السلامة</b>: العزل والإقفال (LOTO) والتصريح يُعتمدان قبل البدء إن لزم.", "<b>Safety</b>: LOTO and the permit are signed off before the start when needed."),
                T("<b>التنفيذ</b>: الفني يبدأ، يملأ قائمة الفحص والقراءات، يسجل الساعات والقطع والملاحظات ورموز العطل، ثم يرسله للمراجعة.", "<b>Do the work</b>: the technician starts, fills the checklist and readings, books hours, parts, findings and failure codes, then sends it for review."),
                T("<b>المراجعة والإغلاق</b>: المشرف يراجع ويكمل ويغلق. الأعمال المغلقة سجل لا يتغير، ومنه تُحسب المؤشرات.", "<b>Review and close</b>: the supervisor checks, completes and closes. Closed jobs are fixed history; the KPIs come from it.")]))

# ---------------- 5 offline ----------------
H.append(sec(5, T("العمل بدون إنترنت", "Working without internet")))
H.append(steps([T("وأنت متصل: <b>جولة الموقع</b> › <b>تجهيز للعمل بدون إنترنت</b> (ثم <b>تحديث</b> كل يوم قبل الذهاب لمكان بلا تغطية).", "While online: <b>Field round</b> › <b>Prepare for offline</b> (then <b>Update</b> every day before going where there is no signal)."),
                T("بدون تغطية: امسح QR، اكتب طلبات عمل، أنشئ أو نفّذ أوامر العمل (البدء، قائمة الفحص، القراءات، الساعات، القطع، الملاحظات، الإرسال للمراجعة).", "Without signal: scan QR, write requests, create or carry out work orders (start, checklist, readings, hours, parts, findings, send for review)."),
                T("كل شيء ينتظر في <b>بانتظار الإرسال على هذا الهاتف</b> ويُرسل وحده عند عودة الاتصال، ولا يتكرر.", "Everything waits under <b>Waiting on this phone</b> and is sent by itself when the connection is back, never twice."),
                T("إذا ظهرت شارة <b>بحاجة لقرار</b>: شخص آخر غيّر نفس البند؛ اختر <b>احتفظ بقيمتي</b> أو <b>احتفظ بقيمتهم</b>.", "If a <b>Decide</b> badge shows: someone else changed the same line; choose <b>Keep mine</b> or <b>Keep theirs</b>.")]))
H.append(box("warn", T("اعتماد العزل والتصريح والموافقة والمراجعة والإغلاق تحتاج اتصالًا. العطل المكتوب بدون إنترنت لا يصل للمشرف إلا عند عودة الاتصال: اتصل أيضًا.",
                       "LOTO / permit sign-off, approval, review and closing need a connection. A breakdown written offline reaches the supervisor only when the phone is back online: also call.")))

# ---------------- 6 glossary ----------------
G = [
    (T("أساسيات", "Basics"), [
        ("CMMS", T("نظام إدارة الصيانة بالحاسوب: مكان واحد لكل أعمال الصيانة وبياناتها.", "Computerised maintenance management system: one place for all maintenance work and data.")),
        (T("أصل / معدة", "Asset / equipment"), T("أي شيء يُصان: خط إنتاج، وحدة، ماكينة، جزء. مرتبة في شجرة مستويات.", "Anything maintained: line, unit, machine, component, arranged in a tree.")),
        (T("شجرة الأصول", "Asset hierarchy"), T("خط إنتاج ← وحدة ← تجميعة ← جزء. العمل على جزء يظهر في سجل ما فوقه.", "Line → unit → assembly → component. Work on a part shows in the history above it.")),
        (T("الأهمية A / B / C", "Criticality A / B / C"), T("A حرجة للإنتاج أو السلامة، B متوسطة، C منخفضة. تحدد الأولوية.", "A critical for production or safety, B medium, C low. Drives priority.")),
        (T("ملصق QR", "QR label"), T("رمز على الماكينة؛ مسحه يفتح صفحتها مباشرة.", "Code on the machine; scanning opens its page.")),
        (T("القسم", "Department"), T("منطقة في المصنع (مثل الإنتاج، المرافق). المستخدم يرى أقسامه فقط.", "An area of the plant (e.g. production, utilities). Users see only their departments.")),
        (T("الدور", "Role"), T("مجموعة صلاحيات (فني، مشرف، مخطط، مدير…) تحدد ما يستطيع المستخدم فعله.", "A set of permissions (technician, supervisor, planner, manager…) that decides what a user may do."))]),
    (T("الأعمال", "Work"), [
        (T("طلب عمل", "Work request"), T("إبلاغ عن مشكلة من أي شخص. ليس عملًا بعد حتى يقبله المشرف.", "A problem reported by anyone. Not a job until the supervisor accepts it.")),
        (T("أمر عمل", "Work order (WO)"), T("عمل صيانة معتمد له رقم ومسؤول وحالة وتكلفة.", "An approved maintenance job with a number, owner, status and cost.")),
        (T("عطل / طارئ", "Breakdown / emergency"), T("الماكينة متوقفة. يُبلَّغ المشرفون فورًا ويمكن البدء بدون انتظار الموافقة.", "The machine has stopped. Supervisors are told at once; work may start without waiting for approval.")),
        (T("الأولوية P1–P4", "Priority P1–P4"), T("P1 طارئ فوري، P2 عالية، P3 عادية، P4 منخفضة.", "P1 emergency, P2 high, P3 normal, P4 low.")),
        (T("الفرز", "Triage"), T("قرار المشرف في الطلب: قبول (أمر عمل) أو رفض.", "The supervisor's decision on a request: accept (work order) or reject.")),
        (T("قائمة الفحص", "Checklist"), T("بنود العمل: سليم / غير سليم، أو قراءة برقم.", "The job's lines: OK / Not OK, or a reading.")),
        (T("القراءة خارج النطاق", "Out-of-range reading"), T("قيمة خارج الحد الأدنى / الأعلى للبند؛ تُعلَّم بالأحمر.", "A value outside the line's min / max; marked red.")),
        (T("رموز الأعطال", "Failure codes"), T("العَرَض (ما يُرى)، المشكلة / نمط العطل، السبب، المعالجة. أساس تحليل الأعطال.", "Symptom (what is seen), problem / failure mode, cause, remedy. The basis of failure analysis.")),
        (T("ساعات العمل", "Labour hours"), T("الوقت الذي سجّله كل فني على العمل؛ تُحسب منه تكلفة العمالة.", "Time each technician booked on the job; labour cost comes from it.")),
        (T("القطع المستخدمة", "Spare parts used"), T("القطع المركبة في العمل والماكينة؛ تضيف تكلفتها لأمر العمل.", "Parts fitted on the job and machine; their cost is added to the work order.")),
        (T("مدة التوقف", "Downtime"), T("ساعات توقف الماكينة بسبب العطل.", "Hours the machine was stopped by the failure."))]),
    (T("السلامة", "Safety"), [
        (T("العزل والإقفال LOTO", "LOTO (lock-out tag-out)"), T("عزل مصادر الطاقة بأقفال وبطاقات قبل العمل، والتحقق من انعدام الطاقة.", "Isolating energy sources with locks and tags before work, and verifying zero energy.")),
        (T("تصريح العمل", "Permit to work"), T("إذن مكتوب لعمل خطر (ساخن، كهرباء، أماكن مغلقة، ارتفاع…) له رقم وصلاحية.", "Written permission for hazardous work (hot, electrical, confined space, height…) with a number and validity.")),
        (T("اعتماد السلامة", "Safety sign-off"), T("المشرف يعتمد العزل والتصريح؛ قبله لا يبدأ العمل.", "The supervisor signs off LOTO and permit; no start before it."))]),
    (T("المخطط والوقائي", "Planned work"), [
        (T("الصيانة الوقائية PM", "Preventive maintenance (PM)"), T("أعمال دورية بالزمن أو بالعداد تمنع العطل قبل حدوثه.", "Periodic work by time or meter that prevents failures.")),
        (T("خطة العمل", "Job plan"), T("وصفة العمل: المهام، القراءات، الساعات، السلامة؛ تُنسخ لكل أمر عمل.", "The job recipe: tasks, readings, hours, safety; copied to each work order.")),
        (T("التأجيل", "Deferral"), T("نقل موعد وقائية بسبب، يعتمده المشرف.", "Moving a PM date with a reason, approved by the supervisor.")),
        (T("مسار التزييت", "Lubrication route"), T("قائمة نقاط تزييت تُنفذ في جولة واحدة.", "A list of lubrication points done in one round.")),
        (T("التوقف المخطط", "Shutdown"), T("إيقاف مخطط للمصنع أو خط لتنفيذ حزمة أعمال.", "A planned stop of the plant or a line to do a package of work.")),
        (T("تسليم الوردية", "Shift handover"), T("ما يجب أن تعرفه الوردية التالية: أعمال مفتوحة وملاحظات سلامة.", "What the next shift must know: open jobs, safety notes."))]),
    (T("مراقبة الحالة", "Condition monitoring"), [
        (T("نقطة قياس", "Measurement point"), T("مكان تُؤخذ منه قراءة (اهتزاز، حرارة، تيار…) بوحدة وحدود.", "A place where a reading is taken (vibration, temperature, current…) with unit and limits.")),
        (T("حد التحذير", "Warning limit"), T("تجاوزه = برتقالي: راقب وخطط العمل.", "Passed = amber: watch and plan the work.")),
        (T("حد الإنذار", "Alarm limit"), T("تجاوزه = أحمر: إجراء قريب. لا يعني توقف المصنع.", "Passed = red: act soon. Not a plant shutdown.")),
        (T("خريطة التحكم", "Control chart"), T("رسم القراءات مع CL (المتوسط) وUCL / LCL (±3σ) لرؤية التغير مبكرًا.", "Readings plotted with CL (average) and UCL / LCL (±3σ) to see a change early.")),
        (T("قواعد نيلسون", "Nelson rules"), T("8 أنماط في خريطة التحكم تدل على تغير في العملية (مثل 7 نقاط متتالية تزيد).", "8 patterns on a control chart that show the process changed (e.g. 7 points rising).")),
        ("σ (sigma)", T("الانحراف المعياري: مقدار تشتت القراءات حول المتوسط.", "Standard deviation: how much readings spread around the average."))]),
    (T("المؤشرات", "KPIs"), [
        (T("مؤشر الأداء KPI", "KPI"), T("رقم يقيس الأداء (مثل MTBF) ويُحسب تلقائيًا من الأعمال المسجلة.", "A number that measures performance (e.g. MTBF), calculated from recorded work.")),
        ("MTBF", T("متوسط الوقت بين الأعطال. كلما زاد كان أفضل.", "Mean time between failures. Higher is better.")),
        ("MTTR", T("متوسط وقت الإصلاح. كلما قل كان أفضل.", "Mean time to repair. Lower is better.")),
        (T("الجاهزية", "Availability"), T("نسبة الوقت الذي كانت فيه المعدة جاهزة للعمل.", "Share of time the equipment was ready to run.")),
        (T("الالتزام بالوقائية", "PM compliance"), T("نسبة الوقائيات المنفذة في موعدها.", "Share of PMs done on time.")),
        (T("الأعمال المتراكمة", "Backlog"), T("الأعمال المفتوحة التي لم تُنفذ بعد (غالبًا بالأسابيع).", "Open work not done yet (often in weeks).")),
        (T("نسبة الصيانة المخططة", "Planned maintenance %"), T("الساعات في أعمال مخططة مقابل كل الساعات؛ تحتاج تسجيل الساعات.", "Hours on planned work against all hours; needs booked hours.")),
        (T("المستهدف: تحقق / قريب / لم يتحقق", "Target: Met / Close / Missed"), T("مقارنة النتيجة بالمستهدف؛ «قريب» = بفارق 10% أو أقل.", "Result against target; Close = missed by 10 % or less.")),
        (T("مؤشرات الشركة", "Company KPIs"), T("مؤشرات المصنع الشهرية التي تُدخل يدويًا (غير المحسوبة).", "The plant's own monthly KPIs entered by hand (not calculated).")),
        (T("باريتو", "Pareto"), T("ترتيب الأسباب من الأكبر للأصغر لمعرفة القليل الذي يسبب الكثير.", "Causes ranked largest first, to find the few that cause most."))]),
    (T("تحليل السبب الجذري", "Root cause analysis"), [
        (T("تحليل السبب الجذري RCA", "RCA"), T("دراسة منظمة لعطل كبير لمعرفة سببه الحقيقي ومنع تكراره.", "A structured study of a major failure to find its real cause and stop it coming back.")),
        ("5W1H", T("وصف المشكلة: ماذا، أين، متى، من، لماذا، كيف.", "Describing the problem: what, where, when, who, why, how.")),
        (T("لماذا × 5", "5 Whys"), T("سؤال «لماذا» متكرر حتى الوصول للسبب الجذري.", "Asking “why” repeatedly until the root cause.")),
        (T("عظم السمكة", "Fishbone"), T("مخطط الأسباب حسب الفئات (الإنسان، الآلة، الطريقة، المواد، القياس، البيئة).", "Cause diagram by category (man, machine, method, material, measurement, environment).")),
        (T("التحقق من الفعالية", "Effectiveness check"), T("متابعة بعد الإجراءات؛ إذا عاد العطل يُعاد فتح التحليل.", "Follow-up after the actions; if the failure returns, the RCA reopens."))]),
    (T("الجوال والعمل بدون إنترنت", "Phone and offline"), [
        (T("التطبيق (PWA)", "App (PWA)"), T("نسخة النظام المثبتة على الجوال كتطبيق، من Google Play أو من Chrome.", "The system installed on the phone as an app, from Google Play or Chrome.")),
        (T("جولة الموقع", "Field round"), T("شاشة تعمل بدون إنترنت للمسح والطلبات وأوامر العمل.", "The screen that works without internet for QR, requests and work orders.")),
        (T("التجهيز / التحديث", "Prepare / Update"), T("تنزيل بيانات أقسامك وأعمالك على الجوال وأنت متصل.", "Downloading your departments' data and your work to the phone while online.")),
        (T("بانتظار الإرسال", "Waiting on this phone"), T("ما كُتب بدون إنترنت ولم يُرسل بعد.", "What was written offline and not sent yet.")),
        (T("التعارض", "Conflict"), T("بند غيّره شخص آخر أثناء عملك بدون إنترنت؛ تختار قيمتك أو قيمتهم.", "A line someone else changed while you were offline; you choose yours or theirs.")),
        ("DEMO", T("مصنع تجريبي ببيانات أمثلة للتدريب؛ يُعاد كل ليلة.", "A sample plant for training; reset every night.")),
        (T("النسخة التجريبية", "Test copy"), T("نسخة من النظام لتجربة التغييرات قبل المصنع الحقيقي.", "A copy of the system to try changes before the real plant."))]),
]
H.append("<div class='pb'></div>" + sec(6, T("المصطلحات الأساسية ومعناها", "Basic terms and their meaning")))
for title, rows in G:
    H.append('<div class="proc">' + h3(title) + grid([[T("المصطلح", "Term"), T("المعنى باختصار", "Meaning in short")]] + [[f"<b>{a}</b>", b] for a, b in rows], [30, 70]) + "</div>")

# ---------------- 7 statuses + colours ----------------
H.append(sec(7, T("حالات أمر العمل والألوان", "Work order statuses and colours")))
H.append(grid([[T("الحالة", "Status"), T("المعنى", "Meaning")],
               [T("فرز", "Triage"), T("جديد، بانتظار قرار المشرف.", "New, waiting for the supervisor.")],
               [T("بانتظار الموافقة", "Awaiting approval"), T("ينتظر اعتماد المسؤول.", "Waiting for approval.")],
               [T("معتمد", "Approved"), T("يمكن تخطيطه أو بدؤه.", "Can be planned or started.")],
               [T("مخطط / مجدول", "Planned / Scheduled"), T("له تاريخ ومنفذ.", "Has a date and people.")],
               [T("قيد التنفيذ", "In progress"), T("العمل جارٍ.", "Work is going on.")],
               [T("معلق", "On hold"), T("متوقف مؤقتًا (قطع، إنتاج، تصريح…).", "Paused (parts, production, permit…).")],
               [T("بانتظار المراجعة / الاختبار", "Awaiting review / test"), T("انتهى الفني، والمشرف يراجع.", "Technician finished; the supervisor checks.")],
               [T("مكتمل", "Completed"), T("العمل مقبول.", "The work is accepted.")],
               [T("مغلق", "Closed"), T("سجل نهائي لا يتغير.", "Final, read-only history.")],
               [T("ملغى", "Cancelled"), T("لن يُنفذ (بسبب مكتوب).", "Will not be done (with a reason).")]], [32, 68]))
H.append('<div class="proc">' + grid([[T("اللون", "Colour"), T("المعنى في كل الشاشات", "Meaning on every screen")],
               [f"#E03131|{T('أحمر', 'Red')}", T("إجراء فوري: طوارئ، متأخر، حد إنذار، مستهدف لم يتحقق.", "Act now: emergency, overdue, alarm limit, target missed.")],
               [f"#F08C00|{T('برتقالي', 'Amber')}", T("يحتاج انتباه أو بانتظار أحد، أو قريب من المستهدف.", "Needs attention or waiting for someone, or close to target.")],
               [f"#37B24D|{T('أخضر', 'Green')}", T("لا شيء معلّق أو تحقق المستهدف.", "All clear or target met.")],
               [f"#868E96|{T('رمادي', 'Grey')}", T("معلومة فقط.", "Information only.")]], [20, 80]) + "</div>")

# ---------------- 8 roles ----------------
H.append('<div class="proc">' + sec(8, T("الأدوار باختصار", "Roles in short")) + grid([[T("الدور", "Role"), T("ماذا يفعل", "What they do")],
               [T("مسؤول النظام", "System administrator"), T("كل شيء، ويدير المستخدمين والأقسام والإعدادات.", "Everything; manages users, departments and settings.")],
               [T("مدير الصيانة", "Maintenance manager"), T("يعتمد ويغلق، يحدد المستهدفات، يقرر التحليلات الجذرية.", "Approves and closes, sets targets, decides RCAs.")],
               [T("المخطط", "Planner"), T("يفرز ويخطط ويجدول ويكلف، يدير خطط الوقائية والاستيراد.", "Triages, plans, schedules, assigns; PM plans and imports.")],
               [T("المشرف (ميكانيك / كهرباء)", "Supervisor (mech. / elec.)"), T("يفرز ويعتمد ويكلف وينفذ ويراجع، يعتمد العزل والتصريح، يغلق.", "Triages, approves, assigns, executes, reviews, signs off LOTO / permit, closes.")],
               [T("مهندس الاعتمادية", "Reliability engineer"), T("مراقبة الحالة والإنذارات وخطط الوقائية والتحليل.", "Condition monitoring, alerts, PM plans, analysis.")],
               [T("المهندس", "Engineer"), T("ينشئ أوامر العمل وينفذ ويراجع، القراءات، تعديل الأصول.", "Creates, does and reviews work, readings, edits assets.")],
               [T("الفني", "Technician"), T("طلبات العمل، تنفيذ الأعمال، التزييت، القراءات، التسليم.", "Requests, doing the work, lubrication, readings, handover.")],
               [T("أمين المخزن", "Storekeeper"), T("قطع الغيار والمخزون والحجوزات.", "Spare parts, stock, reservations.")],
               [T("مستخدم الإنتاج", "Production user"), T("طلبات العمل فقط، ويرى الأعمال والمؤشرات.", "Work requests only; sees jobs and KPIs.")],
               [T("مشاهد الإدارة", "Management viewer"), T("يرى كل شيء للقراءة فقط ويصدّر التقارير.", "Sees everything read-only, exports reports.")]], [32, 68]) + "</div>")

# ---------------- 9 administrator ----------------
if not USERS:
    H.append("<div class='pb'></div>" + sec(9, T("للمسؤول: الخادم والأوامر", "For the administrator: server and commands"),
             T("تُشغَّل من Oracle Cloud Shell أو PowerShell. الصق الأمر كسطر واحد.", "Run from Oracle Cloud Shell or PowerShell. Paste each command as one line.")))
    H.append(grid([[T("البند", "Item"), T("القيمة", "Value")],
                   [T("الخادم", "Server"), T(f"Oracle VM {L('84.8.106.22')} · الكود في {L('/opt/cmms')} (Docker Compose)", "Oracle VM 84.8.106.22 · code in /opt/cmms (Docker Compose)")],
                   [T("الفرع الحالي", "Current branch"), L(BRANCH)],
                   [T("النسخ الاحتياطية", "Backups"), T(f"يومية، وقبل كل تحديث في {L('/opt/cmms-backups')} وفي Oracle Storage › Buckets", "Daily, and before each update in /opt/cmms-backups and in Oracle Storage › Buckets")]], [28, 72]))
    H.append(h3(T("تحديث النظام", "Update the system")))
    H.append(code(f"ssh ubuntu@84.8.106.22 'cd /opt/cmms &amp;&amp; sudo ENV_FILE=deploy/.env scripts/backup.sh /opt/cmms-backups &amp;&amp; sudo BRANCH={BRANCH} bash deploy/install-server.sh'"))
    H.append(h3(T("تحديث النسخة التجريبية DEMO ونسخ العملاء", "Update the demo and the customer copies")))
    H.append(code("ssh ubuntu@84.8.106.22 'cd /opt/cmms &amp;&amp; sudo bash scripts/demo.sh launch-update &amp;&amp; sudo bash scripts/customer.sh launch-update-all'"))
    H.append(h3(T("متابعة التقدم", "Follow the progress")))
    H.append(code("ssh ubuntu@84.8.106.22 'sudo bash /opt/cmms/scripts/demo.sh progress'\nssh ubuntu@84.8.106.22 'sudo bash /opt/cmms/scripts/customer.sh progress'"))
    H.append(h3(T("عميل جديد بتجربة 30 يومًا", "New customer with a 30-day trial")))
    H.append(code("ssh ubuntu@84.8.106.22 'cd /opt/cmms &amp;&amp; sudo bash scripts/customer.sh new NAME EMAIL COMPANY --trial 30'"))
    H.append(box("note", T(f"انتظر حتى تظهر {L('==&gt; Done')}. إذا انقطعت النافذة شغّل نفس الأمر مرة أخرى؛ هذا آمن. لا تلصق الأوامر داخل جلسة الخادم نفسها (يظهر {L('^[[200~')})، بل من Cloud Shell كسطر واحد. التفاصيل في docs/TRIAL-PLAYBOOK.md.",
                           "Wait for ==&gt; Done. If the window drops, run the same command again; it is safe. Do not paste inside the server session itself (you get ^[[200~); paste from Cloud Shell as one line. Details in docs/TRIAL-PLAYBOOK.md.")))

# ---------------- 10 help ----------------
H.append(sec(9 if USERS else 10, T("المساعدة", "Help")))
H.append(grid([[T("المشكلة", "Problem"), T("الحل", "What to do")],
               [T("نسيت كلمة المرور", "Forgot password"), T("«نسيت كلمة المرور؟» في شاشة الدخول، أو اطلب من المسؤول إعادة التعيين.", "“Forgot password?” on the sign-in page, or ask the administrator to reset it.")],
               [T("لا أرى شاشة أو زرًا", "A screen or button is missing"), T("دورك أو أقسامك لا تسمح؛ اطلب من المسؤول. أو أغلق التطبيق وافتحه بعد التحديث.", "Your role or departments do not allow it; ask the administrator. Or close and reopen the app after an update.")],
               [T("شارة «غير متصل»", "Offline badge"), T("استخدم جولة الموقع؛ يُرسل كل شيء عند عودة الاتصال.", "Use the field round; everything is sent when the connection is back.")],
               [T("لا يبدأ العمل", "A job will not start"), T("ينقص اعتماد العزل / التصريح أو الموافقة؛ الرسالة تذكر السبب.", "LOTO / permit sign-off or approval is missing; the message says which.")],
               [T("المزيد", "More"), T("تعليمات العمل (الإجراءات خطوة بخطوة وجزء حل المشاكل) وكتيّب التدريب.", "The work instructions (step-by-step procedures and troubleshooting) and the training workbook.")]], [30, 70]))

html_doc = page(T("PlantPulse – دليل البداية السريعة والمصطلحات", "PlantPulse – Quick start and glossary"), "".join(H))
if not AR:
    html_doc = html_doc.replace('lang="ar" dir="rtl"', 'lang="en" dir="ltr"')
render(html_doc, OUT, T("PlantPulse · دليل البداية السريعة والمصطلحات", "PlantPulse · Quick start and glossary"), LANG)
print("ok")
