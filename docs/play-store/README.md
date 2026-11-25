# PlantPulse – Google Play listing kit

> **Status 2026-11-25: published.** “PlantPulse CMMS – Maintenance” (`io.plantpulse.app`), production release
> version 2 is live: https://play.google.com/store/apps/details?id=io.plantpulse.app. The app opens the real system (app.plantpulse-cmms.com) only; the demo,
> test copy and customer copies are used in the browser. The website and the real system's sign-in page (Android
> browsers only) link to the store. The sections below are kept as the record of what was submitted.

Everything Play Console asks for, ready to paste. Images are in this folder; all screenshots use the
DEMO sample organisation (no company data).

| Item | File | Size |
|---|---|---|
| App icon | `icon-512.png` | 512×512 |
| Feature graphic | `feature-graphic-1024x500.png` | 1024×500 |
| Phone screenshots (upload all 8, in order) | `1-dashboard.png` … `8-dashboard-ar.png` (home, QR, jobs offline, weekly schedule, skill matrix, vibration trend, Nelson rules, Arabic); remake with `node scripts/site-screenshots.js docs/play-store --play` | 1080×1920 |

---

## 1. Main store listing

**App name** (≤30): `PlantPulse – Maintenance`
**Category**: Business (alternative: Productivity) · **Tags**: Business, Productivity
**Contact e-mail**: a support address you are happy to show publicly (not a personal one if you can avoid it)
**Website** (optional): `https://plantpulse-cmms.com` (first submitted as `https://84-8-106-22.sslip.io`, which still works)
**Privacy policy URL**: `https://app.plantpulse-cmms.com/privacy`

### English (en-US) – default (updated 2026-11-25)

**Short description** (≤80):
```
Work orders, PM, offline jobs and weekly schedules for plant maintenance teams
```

**Full description** (≤4000):
```
PlantPulse is a maintenance management system (CMMS) for industrial plants. Work orders, preventive maintenance, lubrication, condition monitoring, spare parts and the weekly maintenance schedule in one app, on the shop floor and in the office.

PlantPulse is for organisations that run it: sign in with the account your maintenance administrator gives you.

WORK ORDERS
• Raise a work request in seconds, with standard symptoms and a photo
• Plan, assign, start and complete jobs; record labour, parts and the failure cause
• Home and "My work" show each technician what is due today

WORKS WITHOUT INTERNET
• Scan any equipment QR code and raise requests with photos with no signal
• Carry out work orders offline: checklist, readings, hours and parts
• Everything is sent when the phone is back online, with a check if a colleague changed the same job

WEEKLY MAINTENANCE SCHEDULE
• One tap proposes the week: approved jobs placed on the technicians on shift
• Matches trade, skills, valid certificates and LOTO / permit sign-off
• Jobs that need the line stopped go into the line's stop windows
• A clear reason for every deferred job; the engineer, then the manager approves

SKILL MATRIX
• Skill levels and certificate expiry dates for every technician
• Required skills on work orders and job plans
• A warning where only one person, or nobody, is qualified

PREVENTIVE MAINTENANCE & LUBRICATION
• Time- and meter-based PM plans that create work orders automatically
• Lubrication routes with points, lubricants and intervals
• Overdue and upcoming work at a glance

CONDITION MONITORING & RELIABILITY
• Vibration, temperature, oil and other readings against warning and alarm limits
• Control charts with the eight Nelson rules and their probable cause, so drift is seen before an alarm
• Root cause analysis (5W1H, 5 Whys, fishbone) with an action plan
• Failure-mode Pareto, MTBF, MTTR and KPI targets on your own dashboard

ASSETS
• Asset tree with search, QR code labels and a built-in scanner
• The full history of every machine in one place

BUILT FOR REAL PLANTS
• English, Arabic (right to left) and Bengali
• Roles for managers, planners, supervisors, engineers and technicians, each seeing their own departments
• Shift rosters, handovers and notifications by department
• Excel import and export for assets, plans, users and readings

Your organisation's data stays on its own server and is sent only over encrypted connections.
```

### Arabic (ar) (updated 2026-11-25)

**App name**: `PlantPulse – الصيانة`

**Short description**:
```
أوامر العمل والصيانة الوقائية والعمل بدون إنترنت والجدول الأسبوعي لفرق الصيانة
```

**Full description**:
```
PlantPulse نظام لإدارة الصيانة (CMMS) للمنشآت الصناعية. أوامر العمل والصيانة الوقائية والتزييت ومراقبة الحالة وقطع الغيار والجدول الأسبوعي للصيانة في تطبيق واحد، في أرض المصنع وفي المكتب.

التطبيق مخصص للمنشآت التي تستخدمه: سجّل الدخول بالحساب الذي يعطيك إياه مسؤول الصيانة.

أوامر العمل
• طلب عمل خلال ثوانٍ مع أعراض قياسية وصورة
• تخطيط وتكليف وبدء وإنهاء الأعمال مع تسجيل العمالة وقطع الغيار وسبب العطل
• الصفحة الرئيسية و"أعمالي" تعرض لكل فني المطلوب منه اليوم

يعمل بدون إنترنت
• امسح رمز QR لأي معدة وارفع طلبات بالصور بدون تغطية
• نفّذ أوامر العمل بدون إنترنت: قائمة الفحص والقراءات والساعات وقطع الغيار
• كل شيء يُرسَل عند عودة الاتصال، مع فحص إن كان زميل غيّر نفس العمل

الجدول الأسبوعي للصيانة
• بلمسة واحدة يُقترح الأسبوع: الأعمال المعتمدة توزَّع على الفنيين في الوردية
• حسب التخصص والمهارات والشهادات السارية واعتماد LOTO / تصريح العمل
• الأعمال التي تحتاج توقف الخط توضع في نوافذ توقف خطها
• سبب واضح لكل عمل مؤجَّل؛ يعتمده المهندس ثم المدير

مصفوفة المهارات
• مستوى كل فني في كل مهارة وتاريخ انتهاء شهاداته
• المهارات المطلوبة في أوامر العمل وخطط العمل
• تنبيه حين يكون شخص واحد فقط مؤهلًا أو لا أحد

الصيانة الوقائية والتزييت
• خطط صيانة حسب الوقت أو العدّاد تُنشئ أوامر العمل تلقائيًا
• مسارات تزييت بالنقاط والزيوت والفترات
• الأعمال المتأخرة والقادمة في لمحة

مراقبة الحالة والاعتمادية
• قراءات الاهتزاز والحرارة والزيت وغيرها مقابل حدود التحذير والإنذار
• خرائط تحكم بقواعد نيلسون الثمانية وسببها المحتمل، فيُكتشف الانحراف قبل الإنذار
• تحليل السبب الجذري (5W1H ولماذا الخمسة وعظم السمكة) مع خطة إجراءات
• باريتو أنماط الأعطال وMTBF وMTTR ومستهدفات المؤشرات على لوحتك الخاصة

المعدات
• شجرة معدات مع بحث وملصقات QR وماسح مدمج
• السجل الكامل لكل ماكينة في مكان واحد

مصمم للمصانع الحقيقية
• العربية (من اليمين لليسار) والإنجليزية والبنغالية
• أدوار للمدير والمخطط والمشرف والمهندس والفني، كلٌّ يرى أقسامه
• جداول الورديات والتسليم والإشعارات حسب القسم
• استيراد وتصدير Excel للمعدات والخطط والمستخدمين والقراءات

بيانات منشأتك تبقى على خادمها الخاص ولا تُنقل إلا عبر اتصال مشفّر.
```

---

## 2. App content (Policy → App content)

### Privacy policy
`https://app.plantpulse-cmms.com/privacy` (first submitted as `https://84-8-106-22.sslip.io/privacy`)

### Ads
**No, my app does not contain ads.**

### App access
**All or some functionality is restricted** → add instructions:
- Name: `Demo account`
- Username: `manager@demo.example.com`
- Password: *(the demo password you chose on the server – type it only into Play Console)*
- Other information:
  `Sign in with the account above. It belongs to a separate DEMO organisation with sample data only. No other steps are needed.`

Create the demo organisation once on the server (it is separate from the real one; you type the password, it is never shown):
```
cd /opt/cmms && sudo docker compose -f deploy/docker-compose.yml --env-file deploy/.env exec api python -m app.cli seed-demo
```

### Content rating (IARC questionnaire)
- Category: **All other app types** (Utility / Productivity / Communication / Other)
- Violence, sexual content, profanity, drugs, gambling, horror: **No** to all
- Do users interact or exchange content? **Yes** – users inside the same organisation see each other's work orders and comments. (No public chat, no strangers.)
- Shares user location? **No** · Allows purchases of digital goods? **No** · Unrestricted internet browser? **No**
- Expected result: **Everyone / PEGI 3**

### Target audience and content
- Target age: **18 and over** only
- Appeals to children? **No**

### News app: **No** · COVID-19 tracing: **No** · Government app: **No** · Financial features: **None**
### Health apps: **None**

### Data safety
Overview:
- Collects or shares required user data? **Yes**
- All data encrypted in transit? **Yes** (HTTPS only)
- Way for users to request deletion? **Yes** – "Users ask their organisation's administrator, who can deactivate the account and delete personal data. Contact: <support e-mail>."
- Data shared with third parties? **No** · Sold? **No**

Data types collected (for every one: Collected = Yes, Shared = No, Processed ephemerally = No, **Required**, purposes = **App functionality** + **Account management**; for "Other actions / diagnostics" also **Fraud prevention, security and compliance**):

| Section | Type | Why |
|---|---|---|
| Personal info | Name | user's name on work orders |
| Personal info | Email address | sign-in |
| Personal info | User IDs | account and employee number |
| Photos and videos | Photos | photos attached to requests and work orders (optional for the user) |
| App activity | Other user-generated content | work orders, comments, readings |
| App activity | Other actions | audit log of changes |
| Device or other IDs | – | **not collected** |
| Location | – | **not collected** |

(IP address and sign-in times are kept in the security log: declare under **App activity → Other actions**, purpose **Security**.)

---

## 3. Closed testing (required for new personal accounts)

1. **Testing → Closed testing → Create track** (or use "Alpha").
2. **Testers**: create a Google Group (e.g. plantpulse-testers@googlegroups.com) or an e-mail list, and add
   at least **12 people** with Google accounts who have an Android phone.
3. **Create release** → upload the `.aab` from PWABuilder → release name `1.0.0 (1)` → notes "First test release".
4. Fill **Countries**: Saudi Arabia (and any others) → **Review and roll out**.
5. Send testers the **opt-in link** shown on the track. Each one opens it, taps *Become a tester*, then installs from Play.
6. Testers must **keep the app installed for 14 days in a row** and open it now and then. Collect feedback.
7. After 14 days with ≥12 testers: **Dashboard → Apply for production** and answer the short questionnaire
   (who tested, what feedback, what changed).
8. After approval: **Production → Create release** (same or newer `.aab`) → roll out.

Before step 3 the server must serve `/.well-known/assetlinks.json` (from PWABuilder's package),
otherwise the app shows a browser address bar.
