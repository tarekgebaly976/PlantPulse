/** Company KPI helpers shared by the KPI page and the dashboard: status colours and Nelson rules (control chart checks). */

export interface KpiCard {
  id: string; name: string; unit: string | null; department: string | null; department_id: string | null; kpi_code: string | null;
  higher_is_better: boolean; frequency: string; months: { target: number | null; actual: number | null }[];
}

export type Status = "met" | "near" | "miss";
/** "near" = missed the target by no more than this share of the target. */
export const NEAR = 0.1;

export function status(higherIsBetter: boolean, actual: number | null, target: number | null): Status | null {
  if (actual === null || target === null) return null;
  if (higherIsBetter ? actual >= target : actual <= target) return "met";
  const gap = Math.abs(actual - target), base = Math.abs(target);
  return base > 0 && gap <= base * NEAR ? "near" : "miss";
}

/** Strong colour (text, dots) and light background per status: green = target met, amber = just missed, red = missed. */
export const STATUS_COLOR: Record<Status, { fg: string; bg: string; mantine: string }> = {
  met: { fg: "#2b8a3e", bg: "#d3f9d8", mantine: "green" },
  near: { fg: "#e67700", bg: "#fff3bf", mantine: "yellow" },
  miss: { fg: "#c92a2a", bg: "#ffe3e3", mantine: "red" },
};

/** Latest month (0-11) that has an actual, or null. */
export function latestMonth(c: KpiCard, upTo = 11): number | null {
  for (let i = Math.min(upTo, 11); i >= 0; i--) if (c.months[i]?.actual !== null && c.months[i]?.actual !== undefined) return i;
  return null;
}

export interface Limits { mean: number; sigma: number }
/** triggers[i] = rules whose pattern ends at point i (the number written next to that point on the chart). */
export interface NelsonResult { limits: Limits | null; triggers: number[][]; flags: number[][]; hits: { rule: number; points: number[] }[] }

/** The plant's control-chart sheet: pattern and probable cause per rule (texts in kpi.nelsonN / kpi.causeN). */
export const NELSON_RULES = [1, 2, 3, 4, 5, 6, 7, 8] as const;

/** Nelson rules on an individuals (XmR) chart: CL = mean, sigma = average moving range / 1.128. Same rules as the
 *  backend (app/services/nelson.py): 1 point beyond 3σ; 7 on one side; 7 rising or falling; 14 alternating; 2 of 3
 *  beyond 2σ (same side); 4 of 5 beyond 1σ (same side); 14 within 1σ; 8 beyond 1σ (either side).
 *  `values` may contain nulls (no data); the rules run over the points that exist, in order. */
export function nelson(values: (number | null)[]): NelsonResult {
  const idx: number[] = [];
  const x: number[] = [];
  values.forEach((v, i) => { if (v !== null) { idx.push(i); x.push(v); } });
  const triggers: number[][] = values.map(() => []);
  const flags: number[][] = values.map(() => []);
  if (x.length < 3) return { limits: null, triggers, flags, hits: [] };
  const at = (j: number) => x[j] ?? 0;
  const mean = x.reduce((a, b) => a + b, 0) / x.length;
  const mr = x.slice(1).map((v, j) => Math.abs(v - at(j)));
  const sigma = mr.reduce((a, b) => a + b, 0) / mr.length / 1.128;
  const hits: { rule: number; points: number[] }[] = [];
  const add = (rule: number, pts: number[]) => {
    const real = pts.map((p) => idx[p] ?? 0);
    const end = real[real.length - 1] ?? 0;
    if (!triggers[end]?.includes(rule)) triggers[end]?.push(rule);
    const h = hits.find((y) => y.rule === rule); // one entry per rule, with every point in its patterns
    if (h) h.points = [...new Set([...h.points, ...real])].sort((a, b) => a - b);
    else hits.push({ rule, points: real });
    for (const p of real) if (!flags[p]?.includes(rule)) flags[p]?.push(rule);
  };
  if (sigma === 0) return { limits: { mean, sigma }, triggers, flags, hits };
  const z = (j: number) => (at(j) - mean) / sigma;
  const range = (s: number, n: number) => Array.from({ length: n }, (_, k) => s + k);
  const step = (j: number) => Math.sign(at(j) - at(j - 1));
  for (let i = 0; i < x.length; i++) {
    const zi = z(i);
    if (Math.abs(zi) > 3) add(1, [i]);
    if (i >= 6 && zi !== 0 && range(i - 6, 7).every((j) => z(j) !== 0 && z(j) > 0 === zi > 0)) add(2, range(i - 6, 7));
    if (i >= 6) {
      const d = range(i - 5, 6).map(step);
      if (d.every((v) => v > 0) || d.every((v) => v < 0)) add(3, range(i - 6, 7));
    }
    if (i >= 13) {
      const d = range(i - 12, 13).map(step);
      if (d.every((v, k) => v !== 0 && (k === 0 || v === -(d[k - 1] ?? 0)))) add(4, range(i - 13, 14));
    }
    for (const [rule, n, need, lim] of [[5, 3, 2, 2], [6, 5, 4, 1]] as const) {
      if (i < n - 1) continue;
      for (const sd of [1, -1]) {
        const w = range(i - n + 1, n).filter((j) => z(j) * sd > lim);
        if (w.length >= need && w.includes(i)) { add(rule, w); break; }
      }
    }
    if (i >= 13 && range(i - 13, 14).every((j) => Math.abs(z(j)) < 1)) add(7, range(i - 13, 14));
    if (i >= 7 && range(i - 7, 8).every((j) => Math.abs(z(j)) > 1)) add(8, range(i - 7, 8));
  }
  return { limits: { mean, sigma }, triggers, flags, hits };
}
