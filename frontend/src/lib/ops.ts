// Production module: types and time helpers. The core is industry-independent (production lines with a production
// model, output unit and report profile; standard measures, KPIs, loss categories, alerts, actions, insights);
// "paper_machine" is the paper mill report profile (grades, runs, reels, sheet breaks).

export interface OpShift { code: string; name: string; start: string }
export interface OpGrade { id: string; machine_id: string; code: string; name: string | null; gsm: number; target_speed_mpm: number | null; ideal_mt_min: number; is_active: boolean }
export interface OpSection { id: string; name: string; asset_id: string | null; sort: number; is_active: boolean }
export interface OpMachine {
  id: string; code: string; name: string; department_id: string; asset_id: string; trim_width_m: number | null; day_start: string;
  production_model: ProductionModel; output_unit: string; report_profile: ReportProfile;
  shifts: OpShift[]; is_active: boolean; grades?: OpGrade[]; sections?: OpSection[];
}
export type ProductionModel = "continuous" | "batch" | "discrete";
export type ReportProfile = "generic" | "paper_machine";
export const PRODUCTION_MODELS: ProductionModel[] = ["continuous", "batch", "discrete"];
export const isPaper = (m: { report_profile?: string } | null | undefined) => m?.report_profile === "paper_machine";
export interface OpDiscipline { id: string; code: string; name: string; maintenance: boolean; sort: number; is_active: boolean }
export interface OpDefect { id: string; name: string; disposition: string; is_active: boolean }
export interface OpSettings { machines: OpMachine[]; disciplines: OpDiscipline[]; defects: OpDefect[] }

export interface Prod {
  reels: number; gross: number; saleable: number; net: number; a: number; b: number; s: number; reject: number; trim: number;
  b_pct: number | null; reject_pct: number | null; trim_pct: number | null;
}
export interface Oee { availability: number | null; performance: number | null; quality: number | null; oee: number | null; planned_hours: number }
export interface StopTables {
  downtime_by_discipline: Record<string, number>; planned_hours: number; other_hours: number; downtime_hours: number;
  breaks_count_by_discipline: Record<string, number>; breaks_hours_by_discipline: Record<string, number>; breaks_count: number; breaks_hours: number;
}
export interface Period { days: number; production: Prod; run_hours: number; ideal_mt: number; oee: Oee; stops: StopTables }
export interface Warning { code: string; item?: string; hours?: number; reels?: number; losses?: number }
export interface Calc {
  window: { start: string; end: string };
  shifts: (Prod & { code: string; name: string; start?: string; end?: string; supervisor?: string | null; gsm?: number[]; speed?: number[]; run_hours: number | null })[];
  day: Prod; run_hours: number; ideal_mt: number; oee: Oee; gross_by_gsm: Record<string, number>; stops: StopTables;
  losses: { reject: number; downgrade: number }; steam_per_t: number | null; in_progress: boolean; mtd: Period; ytd: Period; warnings: Warning[];
}
export interface Segment {
  id: string; started_at: string; ended_at: string; grade_id: string | null; gsm: number; speed_mpm: number | null; ideal_mt_min: number;
  reason: string | null; grade_change_hours: number | null; grade_change_reject_mt: number | null; hours: number; ideal_mt: number;
}
export interface Reel { id: string; shift: string; reel_no: string; gsm: number | null; gross_mt: number; net_mt: number; reject_mt: number; b_grade_mt: number; s_grade_mt: number; trim_mt: number; note: string | null }
export interface Stop {
  id: string; started_at: string; ended_at: string | null; hours: number | null; event_type: "breakdown" | "sheet_break" | "planned" | "other";
  section_id: string | null; asset_id: string; reason: string | null; is_failure: boolean; is_planned: boolean; production_loss_tons: number | null; loss_category_id: string | null;
  parts: { discipline_id: string; hours: number }[];
}
export interface Loss { id: string; kind: "reject" | "downgrade"; shift: string | null; defect_id: string | null; defect_text: string | null; qty_mt: number; disposition: string | null }
export interface Report {
  id: string; machine: OpMachine; report_date: string; status: "draft" | "submitted" | "confirmed"; revision: number; can_edit: boolean;
  supervisors: Record<string, string>; notes: string | null; steam_mt: number | null; water_pm_m3: number | null; water_sp_m3: number | null;
  water_ut_m3: number | null; broke_tower_pct: number | null; created_by: string | null; submitted_by: string | null; submitted_at: string | null;
  confirmed_by: string | null; confirmed_at: string | null; reopen_note: string | null;
  prev: { id: string; date: string } | null; next: { id: string; date: string } | null;
  segments: Segment[]; reels: Reel[]; stops: Stop[]; losses: Loss[]; calc: Calc; shift_logs: ShiftLogSection[]; utilities: DayUtilities[];
  outputs: Output[];
}
export interface ReportRow {
  id: string; machine_id: string; machine: string; profile: ReportProfile; unit: string; report_date: string; status: string; revision: number;
  gross: number; net: number; a: number; reject_pct: number | null; run_hours: number | null; oee: number | null; breaks: number | null; downtime_hours: number; warnings: number;
}
/** Month to date: paper profile (Period) or generic (standard measures). */
export interface GenericPeriod { days: number; measures: Record<string, number | null>; oee: Oee }
export interface ReportList { items: ReportRow[]; month: string; today: string; mtd: (Period | GenericPeriod) | null }

// ------------------------------------------------------------------ generic report profile
export interface Output {
  id: string; shift: string | null; product_id: string | null; order_ref: string | null; started_at: string | null; ended_at: string | null;
  run_hours: number | null; hours: number | null; planned_qty: number | null; input_qty: number | null; produced_qty: number; reject_qty: number;
  downgrade_qty: number; good_qty: number; ideal_rate_per_h: number | null; ideal_qty: number | null; completed: boolean; note: string | null;
}
export interface GenericTotals {
  lines: number; produced: number; good: number; reject: number; downgrade: number; net: number; run_hours: number | null; planned_qty: number | null;
  input_qty: number | null; ideal: number | null; batches: number; batches_completed: number; reject_pct: number | null; downgrade_pct: number | null;
  yield_pct: number | null; target_pct: number | null;
}
export interface LossTables { hours_by_code: Record<string, number>; count_by_code: Record<string, number>; hours_by_factor: Record<string, number>; failure_hours: number; failures: number; stops: number }
export interface GenericCalc {
  profile: "generic"; unit: string; window: { start: string; end: string };
  shifts: (GenericTotals & { code: string; name: string; supervisor?: string | null; stop_hours: number | null })[];
  day: GenericTotals; run_hours: number | null; ideal: number | null; cycle_time_s: number | null; oee: Oee; in_progress: boolean;
  by_product: Record<string, number>; stops: { downtime_hours: number; planned_hours: number; downtime_by_discipline: Record<string, number> };
  loss_categories: LossTables; losses: { reject: number; downgrade: number }; warnings: Warning[]; mtd: GenericPeriod | null; ytd: GenericPeriod | null;
  measures: Record<string, number | null>;
}

// ------------------------------------------------------------------ configuration (industry-independent)
export interface OpConfig {
  industry: string | null; template: string | null; features: Record<string, boolean>; labels: Record<string, string>; setup_done: boolean;
  templates: { key: string; name: string }[];
}
export const FEATURES = ["reports", "logs", "dashboard", "kpis", "alerts", "insights", "actions"] as const;
export interface Product {
  id: string; code: string; name: string; category: string | null; machine_id: string | null; unit: string | null; ideal_rate_per_h: number | null;
  ideal_cycle_s: number | null; attributes: Record<string, string>; is_active: boolean;
}
export type Affects = "availability" | "performance" | "quality" | "none";
export interface LossCategory {
  id: string; code: string; name: string; parent_id: string | null; affects: Affects; event_type: "breakdown" | "planned" | "other" | "sheet_break";
  planned: boolean; failure: boolean; discipline_id: string | null; department_id: string | null; sort: number; is_active: boolean;
}
export interface KpiDef {
  id: string; code: string; name: string; description: string | null; formula: string; unit: string | null; decimals: number; direction: "higher" | "lower";
  target: number | null; warn: number | null; critical: number | null; period: "day" | "week" | "month"; machine_id: string | null; department_id: string | null;
  standard: boolean; dashboard: boolean; sort: number; is_active: boolean;
}
export interface KpiVariable { code: string; kind: "measure" | "profile" | "loss" | "log"; unit: string | null; label?: string; form?: string; agg?: string }
export interface KpiLib { code: string; name: string; formula: string; unit: string; direction: "higher" | "lower"; description: string }
export type KpiStatus = "missing" | "no_target" | "ok" | "off_target" | "warning" | "critical";
export interface KpiValue { value: number | null; status: KpiStatus; missing: string[] }
export interface KpiResult extends Omit<KpiDef, "sort" | "is_active"> {
  lines: string[]; values: { day: KpiValue; week: KpiValue; month: KpiValue; today: KpiValue; range?: KpiValue }; series: { date: string; value: number }[]; trend_pct: number | null;
}
export type Condition = "below" | "above" | "outside" | "kpi_limits" | "total_above" | "trend_down" | "trend_up" | "action_overdue";
export interface AlertRule {
  id: string; code: string; name: string; source_kind: "kpi" | "measure" | "none"; source_code: string | null; condition: Condition; threshold: number | null;
  threshold_high: number | null; periods: number; lookback_days: number; severity: "info" | "warning" | "critical"; machine_id: string | null;
  department_id: string | null; notify_role: string | null; notify_email: boolean; escalate_after_days: number | null; escalate_role: string | null; is_active: boolean;
}
export interface OpAlert {
  id: string; rule: AlertRule | null; line: string | null; status: "open" | "acknowledged" | "resolved" | "closed"; severity: "info" | "warning" | "critical";
  period_date: string; value: number | null; detail: Record<string, unknown>; first_seen: string; last_seen: string; acknowledged_by: string | null;
  acknowledged_at: string | null; escalated: boolean; closed_at: string | null;
}
export interface OpAction {
  id: string; title: string; description: string | null; status: "open" | "in_progress" | "done" | "cancelled"; owner_id: string | null; owner: string | null;
  due_date: string | null; source: "manual" | "alert" | "insight" | "report"; alert_id: string | null; report_id: string | null; machine_id: string | null;
  line: string | null; result: string | null; overdue: boolean; created_at: string | null; closed_at: string | null;
}
export interface Insight { id: string; kind: string; severity: "critical" | "warning" | "info"; line: string | null; params: Record<string, unknown>; recommendation: string }
export interface SetupStatus { config: OpConfig; counts: Record<string, number>; units: string[]; models: string[] }

/** Colour of a KPI or alert status. */
export const statusColor = (s: string) => ({ critical: "red", warning: "orange", off_target: "yellow", ok: "teal", no_target: "gray", missing: "gray", info: "blue" } as Record<string, string>)[s] ?? "gray";

export const EVENT_TYPES = ["breakdown", "sheet_break", "planned", "other"] as const;

/** Local wall-clock parts of an instant in the plant's time zone. */
function parts(iso: string, tz: string | undefined): Record<string, string> {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  return Object.fromEntries(f.formatToParts(new Date(iso)).map((p) => [p.type, p.value]));
}

/** "HH:mm" in the plant's time zone. */
export function hm(iso: string | null | undefined, tz?: string): string {
  if (!iso) return "—";
  const p = parts(iso, tz);
  return `${p.hour}:${p.minute}`;
}

/** Plant-local date "YYYY-MM-DD" of an instant. */
export function localDate(iso: string, tz?: string): string {
  const p = parts(iso, tz);
  return `${p.year}-${p.month}-${p.day}`;
}

/** Times in the form are clock times of the production day: a time before the day start belongs to the next calendar
 * day (e.g. day 07:00–07:00: 00:48 is the next morning). Returns a plant-local "YYYY-MM-DDTHH:mm:00" (the server reads
 * it in the plant's time zone). */
export function atTime(reportDate: string, dayStart: string, time: string): string {
  const d = new Date(`${reportDate}T00:00:00Z`);
  if (time < dayStart) d.setUTCDate(d.getUTCDate() + 1);
  return `${d.toISOString().slice(0, 10)}T${time}:00`;
}

/** True when the instant falls on the calendar day after the report date (shown as "+1"). */
export function nextDay(iso: string, reportDate: string, tz?: string): boolean {
  return localDate(iso, tz) > reportDate;
}

/** Duration "h:mm" from hours. */
export function hhmm(hours: number | null | undefined): string {
  if (hours === null || hours === undefined) return "—";
  const m = Math.round(hours * 60);
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
}

export function pct(v: number | null | undefined, digits = 1): string {
  return v === null || v === undefined ? "—" : `${(v * 100).toFixed(digits)}%`;
}

export function t3(v: number | null | undefined): string {
  return v === null || v === undefined ? "—" : v.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 });
}

/** The production day in progress (it starts at the machine's day start, e.g. 07:00) in the plant's time zone. */
export function currentProductionDay(dayStart: string, tz?: string): string {
  const now = new Date().toISOString();
  const p = parts(now, tz);
  const date = `${p.year}-${p.month}-${p.day}`;
  if (`${p.hour}:${p.minute}` >= dayStart) return date;
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

// ------------------------------------------------------------------ daily logs (utilities, stock preparation …)
export type LogKind = "meter" | "counter" | "number" | "check" | "text" | "calc" | "select" | "multi" | "datetime" | "product" | "ref";
export const LOG_KINDS: LogKind[] = ["meter", "counter", "number", "check", "text", "calc", "select", "multi", "datetime", "product", "ref"];
export const TEXT_KINDS: LogKind[] = ["text", "select", "multi", "datetime", "product", "ref"];
export interface LogField {
  id: string; section: string; code: string; label: string; kind: LogKind; unit: string | null; decimals: number; formula: string | null;
  low: number | null; high: number | null; target: number | null; required: boolean; options: string[] | null; meter_id: string | null; chart: boolean; per_ton: boolean; day_agg: "sum" | "avg" | null; sort: number; is_active: boolean;
}
export interface LogTemplate {
  id: string; code: string; name: string; department_id: string; frequency: "day" | "shift"; day_start: string; shifts: OpShift[];
  issues: boolean; machine_id: string | null; in_pm_report: boolean; sort: number; is_active: boolean; fields?: LogField[];
}
export interface LogValue { opening: number | null; closing: number | null; value: number | null; text: string | null; flag: "low" | "high" | null }
export interface LogWarning { code: string; item: string }
export interface LogDetail {
  id: string; template: LogTemplate; log_date: string; shift: string; status: "draft" | "submitted" | "confirmed"; revision: number; notes: string | null;
  can_edit: boolean; in_progress: boolean; window: { start: string; end: string }; created_by: string | null; submitted_by: string | null;
  confirmed_by: string | null; submitted_at: string | null; confirmed_at: string | null; reopen_note: string | null;
  prev: { id: string; date: string; shift: string } | null; next: { id: string; date: string; shift: string } | null;
  fields: LogField[]; values: Record<string, LogValue>; warnings: LogWarning[]; pm_report_id: string | null;
  issues: { requests: { id: string; number: string; title: string; asset: string; breakdown: boolean; created_at: string }[];
    work_orders: { id: string; number: string; title: string; asset: string; status: string; priority: string; created_at: string }[] } | null;
}
export interface LogRow { id: string; log_date: string; shift: string; status: string; revision: number; values: Record<string, number | null>; warnings: number; in_progress: boolean }
export interface LogList { items: LogRow[]; month: string; columns: LogField[]; template: LogTemplate }

export interface DashDay {
  date: string; status: string; in_progress: boolean; gross: number; net: number; a: number; reject: number; b: number; trim: number | null; run_hours: number | null;
  oee: number | null; availability: number | null; performance: number | null; quality: number | null; breaks: number | null; breaks_hours: number | null; downtime_hours: number;
}
/** Totals of the finished days of the period in the standard measures (paper extras breaks / trim only on a paper line). */
export interface DashSummary {
  days: number; produced?: number; good?: number; reject?: number; downgrade?: number; net?: number; run_hours?: number; planned_hours?: number; ideal?: number;
  downtime_hours?: number; planned_downtime_hours?: number; failure_hours?: number; stops?: number; breaks?: number; breaks_hours?: number; trim?: number; oee: Oee;
}
export interface DashField extends LogField { series: Record<string, number>; per_ton_series: Record<string, number> | null; total: number | null; per_ton_period: number | null }
export interface Dashboard {
  start: string; end: string; machines: { id: string; code: string; name: string; profile: ReportProfile; unit: string }[]; machine_id: string | null;
  profile: ReportProfile | null; unit: string | null; production: DashDay[];
  period: { stops: Partial<StopTables> & { downtime_by_discipline: Record<string, number> }; loss_by_category: Record<string, number>;
    summary: DashSummary } | null;
  logs: { template: LogTemplate; fields: DashField[] }[]; kpis: KpiResult[];
}

/** Format a log value with the line's decimals. */
export function fmtVal(v: number | null | undefined, decimals = 1): string {
  if (v === null || v === undefined) return "—";
  return v.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: decimals });
}

/** A log form shown inside the PM daily report (e.g. stock preparation shift log): shifts side by side and the day. */
export interface ShiftLogSection {
  template: { id: string; code: string; name: string; frequency: "day" | "shift"; shifts: { code: string; name: string }[] };
  logs: Record<string, { id: string; status: string; warnings: number }>; shift_codes: string[];
  lines: { id: string; section: string; label: string; kind: LogKind; unit: string | null; decimals: number; shifts: Record<string, number | string | null>;
    flags: Record<string, "low" | "high" | null>; day: number | null }[];
}

/** Figures of the day from the utilities daily report, shown read-only in the PM & SP daily report. */
export interface DayUtilities {
  template: { id: string; name: string }; logs: { id: string; shift: string; status: string }[];
  items: { label: string; unit: string | null; decimals: number; value: number | null; per_ton: number | null }[];
}
/** Where a log form's pages live: stock preparation (shown in the PM report) under /operations/sp, the others under /operations/logs. */
export const logBase = (inPm: boolean | undefined) => (inPm ? "/operations/sp" : "/operations/logs");
