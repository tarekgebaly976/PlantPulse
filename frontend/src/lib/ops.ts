// Operations module (paper machine daily production report): types and time helpers.

export interface OpShift { code: string; name: string; start: string }
export interface OpGrade { id: string; machine_id: string; code: string; name: string | null; gsm: number; target_speed_mpm: number | null; ideal_mt_min: number; is_active: boolean }
export interface OpSection { id: string; name: string; asset_id: string | null; sort: number; is_active: boolean }
export interface OpMachine {
  id: string; code: string; name: string; department_id: string; asset_id: string; trim_width_m: number | null; day_start: string;
  shifts: OpShift[]; is_active: boolean; grades?: OpGrade[]; sections?: OpSection[];
}
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
  section_id: string | null; asset_id: string; reason: string | null; is_failure: boolean; production_loss_tons: number | null;
  parts: { discipline_id: string; hours: number }[];
}
export interface Loss { id: string; kind: "reject" | "downgrade"; shift: string | null; defect_id: string | null; defect_text: string | null; qty_mt: number; disposition: string | null }
export interface Report {
  id: string; machine: OpMachine; report_date: string; status: "draft" | "submitted" | "confirmed"; revision: number; can_edit: boolean;
  supervisors: Record<string, string>; notes: string | null; steam_mt: number | null; water_pm_m3: number | null; water_sp_m3: number | null;
  water_ut_m3: number | null; broke_tower_pct: number | null; created_by: string | null; submitted_by: string | null; submitted_at: string | null;
  confirmed_by: string | null; confirmed_at: string | null; reopen_note: string | null;
  prev: { id: string; date: string } | null; next: { id: string; date: string } | null;
  segments: Segment[]; reels: Reel[]; stops: Stop[]; losses: Loss[]; calc: Calc;
}
export interface ReportRow {
  id: string; machine_id: string; machine: string; report_date: string; status: string; revision: number; gross: number; net: number; a: number;
  reject_pct: number | null; run_hours: number; oee: number | null; breaks: number; downtime_hours: number; warnings: number;
}
export interface ReportList { items: ReportRow[]; month: string; today: string; mtd: Period | null }

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
export type LogKind = "meter" | "counter" | "number" | "check" | "text" | "calc";
export interface LogField {
  id: string; section: string; code: string; label: string; kind: LogKind; unit: string | null; decimals: number; formula: string | null;
  low: number | null; high: number | null; meter_id: string | null; chart: boolean; per_ton: boolean; sort: number; is_active: boolean;
}
export interface LogTemplate {
  id: string; code: string; name: string; department_id: string; frequency: "day" | "shift"; day_start: string; shifts: OpShift[];
  issues: boolean; sort: number; is_active: boolean; fields?: LogField[];
}
export interface LogValue { opening: number | null; closing: number | null; value: number | null; text: string | null; flag: "low" | "high" | null }
export interface LogWarning { code: string; item: string }
export interface LogDetail {
  id: string; template: LogTemplate; log_date: string; shift: string; status: "draft" | "submitted" | "confirmed"; revision: number; notes: string | null;
  can_edit: boolean; in_progress: boolean; window: { start: string; end: string }; created_by: string | null; submitted_by: string | null;
  confirmed_by: string | null; submitted_at: string | null; confirmed_at: string | null; reopen_note: string | null;
  prev: { id: string; date: string; shift: string } | null; next: { id: string; date: string; shift: string } | null;
  fields: LogField[]; values: Record<string, LogValue>; warnings: LogWarning[];
  issues: { requests: { id: string; number: string; title: string; asset: string; breakdown: boolean; created_at: string }[];
    work_orders: { id: string; number: string; title: string; asset: string; status: string; priority: string; created_at: string }[] } | null;
}
export interface LogRow { id: string; log_date: string; shift: string; status: string; revision: number; values: Record<string, number | null>; warnings: number; in_progress: boolean }
export interface LogList { items: LogRow[]; month: string; columns: LogField[]; template: LogTemplate }

export interface DashDay {
  date: string; status: string; in_progress: boolean; gross: number; net: number; a: number; reject: number; b: number; trim: number; run_hours: number;
  oee: number | null; availability: number | null; performance: number | null; quality: number | null; breaks: number; breaks_hours: number; downtime_hours: number;
}
export interface DashField extends LogField { series: Record<string, number>; per_ton_series: Record<string, number> | null; total: number | null; per_ton_period: number | null }
export interface Dashboard {
  start: string; end: string; machines: { id: string; code: string; name: string }[]; machine_id: string | null; production: DashDay[];
  period: Period | null; logs: { template: LogTemplate; fields: DashField[] }[];
}

/** Format a log value with the line's decimals. */
export function fmtVal(v: number | null | undefined, decimals = 1): string {
  if (v === null || v === undefined) return "—";
  return v.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: decimals });
}
