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
export interface NelsonResult { limits: Limits | null; flags: number[][]; hits: { rule: number; points: number[] }[] }

export const NELSON_RULES = [1, 2, 3, 4, 5, 6, 7, 8] as const;

/** Nelson's eight rules on an individuals (XmR) chart: centre line = mean, sigma = average moving range / 1.128.
 *  `values` may contain nulls (months without data); rules run over the points that exist, in order. */
export function nelson(values: (number | null)[]): NelsonResult {
  const idx: number[] = [];
  const x: number[] = [];
  values.forEach((v, i) => { if (v !== null) { idx.push(i); x.push(v); } });
  const flags: number[][] = values.map(() => []);
  if (x.length < 3) return { limits: null, flags, hits: [] };
  const at = (j: number) => x[j] ?? 0;
  const mean = x.reduce((a, b) => a + b, 0) / x.length;
  const mr = x.slice(1).map((v, j) => Math.abs(v - at(j)));
  const sigma = mr.reduce((a, b) => a + b, 0) / mr.length / 1.128;
  const hits: { rule: number; points: number[] }[] = [];
  const add = (rule: number, pts: number[]) => {
    const real = pts.map((p) => idx[p] ?? 0);
    const h = hits.find((y) => y.rule === rule); // one entry per rule, with every point it flags
    if (h) h.points = [...new Set([...h.points, ...real])].sort((a, b) => a - b);
    else hits.push({ rule, points: real });
    for (const p of real) if (!flags[p]?.includes(rule)) flags[p]?.push(rule);
  };
  if (sigma === 0) return { limits: { mean, sigma }, flags, hits };
  const z = (j: number) => (at(j) - mean) / sigma;
  const range = (s: number, n: number) => Array.from({ length: n }, (_, k) => s + k);
  const step = (j: number) => Math.sign(at(j) - at(j - 1));
  for (let i = 0; i < x.length; i++) {
    const zi = z(i);
    if (Math.abs(zi) > 3) add(1, [i]); // 1: a point beyond 3 sigma
    if (i >= 8 && zi !== 0 && range(i - 8, 9).every((j) => Math.sign(z(j)) === Math.sign(zi))) add(2, range(i - 8, 9)); // 2: nine on one side
    if (i >= 5) { // 3: six in a row steadily rising or falling
      const d = range(i - 4, 5).map(step);
      if (d.every((v) => v > 0) || d.every((v) => v < 0)) add(3, range(i - 5, 6));
    }
    if (i >= 13) { // 4: fourteen in a row alternating up and down
      const d = range(i - 12, 13).map(step);
      if (d.every((v, k) => v !== 0 && (k === 0 || v === -(d[k - 1] ?? 0)))) add(4, range(i - 13, 14));
    }
    for (const [rule, n, need, lim] of [[5, 3, 2, 2], [6, 5, 4, 1]] as const) { // 5: 2 of 3 beyond 2 sigma; 6: 4 of 5 beyond 1 sigma (same side)
      if (i < n - 1) continue;
      for (const sd of [1, -1]) {
        const w = range(i - n + 1, n).filter((j) => z(j) * sd > lim);
        if (w.length >= need && w.includes(i)) add(rule, w);
      }
    }
    if (i >= 14 && range(i - 14, 15).every((j) => Math.abs(z(j)) < 1)) add(7, range(i - 14, 15)); // 7: fifteen within 1 sigma
    const w8 = range(i - 7, 8);
    if (i >= 7 && w8.every((j) => Math.abs(z(j)) > 1) && w8.some((j) => z(j) > 0) && w8.some((j) => z(j) < 0)) add(8, w8); // 8: eight outside 1 sigma, both sides
  }
  return { limits: { mean, sigma }, flags, hits };
}
