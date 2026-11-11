"use client";

import { useQ } from "@/lib/hooks";
import type { KpiCard } from "@/lib/kpiStatus";

export interface KpiTarget { kpi_code: string; department_id: string | null; target: number; higher_is_better: boolean }
export interface Resolved { target: number; hib: boolean; source: "department" | "plant" | "company" }

/** Target of a calculated KPI: the department's own target, else the plant target, else the latest target of a company
 *  KPI linked to it (same department or whole plant). */
export function useKpiTargets(year: number, month: number) {
  const tq = useQ<KpiTarget[]>("/kpis/targets", undefined, { staleTime: 300_000 });
  const sc = useQ<KpiCard[]>("/kpis/scorecard", { year }, { staleTime: 300_000 });
  const resolve = (code: string, dept: string | null = null): Resolved | null => {
    const own = (tq.data ?? []).filter((x) => x.kpi_code === code);
    const d = dept ? own.find((x) => x.department_id === dept) : undefined;
    const p = own.find((x) => x.department_id === null);
    if (d) return { target: d.target, hib: d.higher_is_better, source: "department" };
    if (p) return { target: p.target, hib: p.higher_is_better, source: "plant" };
    const c = (sc.data ?? []).find((x) => x.kpi_code === code && (x.department_id ?? null) === dept)
      ?? (sc.data ?? []).find((x) => x.kpi_code === code && !x.department_id);
    const m = c ? [...c.months.slice(0, month + 1)].reverse().find((x) => x.target !== null) : undefined;
    return c && m ? { target: m.target as number, hib: c.higher_is_better, source: "company" } : null;
  };
  return { resolve, targets: tq.data ?? [], cards: sc.data ?? [], loaded: !!tq.data && !!sc.data };
}

/** Usual direction per KPI (lower is better for times, costs, backlog, failures). */
export const LOWER_IS_BETTER = new Set(["backlog", "overdue_work_orders", "emergency_pct", "mttr", "cost_per_ton", "cost_by_department",
  "repeat_failure_rate", "breakdown_downtime", "pdm_alerts", "stockout_rate", "budget_vs_actual"]);
