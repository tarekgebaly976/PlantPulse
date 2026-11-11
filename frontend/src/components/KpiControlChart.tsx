"use client";

import { Badge, Group, Stack, Table, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { CartesianGrid, ComposedChart, Legend, Line, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fmtNum } from "@/lib/hooks";
import { NEAR, nelson, NELSON_RULES, status, STATUS_COLOR } from "@/lib/kpiStatus";

/** One point of a control chart: x label, value, optional target and optional dot colour (status). */
export interface CPoint { label: string; value: number | null; target?: number | null; color?: string }
export interface SpecLine { y: number; label: string; color: string }

const CL = "#2b8a3e", LIMIT = "#a61e4d", S2 = "#74c0fc", S1 = "#b197fc";

interface DotProps { cx?: number; cy?: number; index?: number; payload?: CPoint & { trig: number[]; flag: boolean } }

/** Value dot: open red circle when a rule flags it, rule numbers in red next to the point where a pattern ends. */
function Dot({ cx, cy, payload }: DotProps) {
  if (cx === undefined || cy === undefined || !payload || payload.value === null) return <g />;
  const fill = payload.color ?? "#1c2a8c";
  return (
    <g>
      {payload.flag ? <circle cx={cx} cy={cy} r={6} fill="#fff" stroke="#e03131" strokeWidth={2} /> : <circle cx={cx} cy={cy} r={4.5} fill={fill} />}
      {payload.flag && <circle cx={cx} cy={cy} r={2.5} fill={fill} />}
      {payload.trig.length > 0 && <text x={cx + 8} y={cy - 6} fill="#e03131" fontSize={12} fontWeight={700}>{payload.trig.join(",")}</text>}
    </g>
  );
}

/** Individuals control chart with Nelson rules, laid out like the plant's control-chart sheet: green centre line (CL),
 *  UCL/LCL at ±3σ, zones A (2-3σ), B (1-2σ), C (within 1σ), and under it the eight rules with probable cause. */
export function ControlChart({ points, unit, specs = [], showTarget = false, height = 300 }: {
  points: CPoint[]; unit?: string | null; specs?: SpecLine[]; showTarget?: boolean; height?: number;
}) {
  const { t } = useTranslation();
  const n = nelson(points.map((p) => p.value));
  const L = n.limits && n.limits.sigma > 0 ? n.limits : null;
  // Write a rule number once per run (where a pattern first completes), as on the control-chart sheet.
  const data = points.map((p, i) => ({ ...p, trig: (n.triggers[i] ?? []).filter((r) => !(n.triggers[i - 1] ?? []).includes(r)), flag: (n.flags[i] ?? []).length > 0 }));
  const lim = (k: number) => (L ? L.mean + k * L.sigma : 0);
  const zones: [number, number, string][] = L ? [[2, 3, "A"], [1, 2, "B"], [0, 1, "C"], [-1, 0, "C"], [-2, -1, "B"], [-3, -2, "A"]] : [];
  const ys = [...points.flatMap((p) => [p.value, showTarget ? p.target ?? null : null]), ...specs.map((s) => s.y), ...(L ? [lim(-3.3), lim(3.3)] : [])]
    .filter((v): v is number => v !== null && v !== undefined);
  const lo = Math.min(...ys), hi = Math.max(...ys), pad = (hi - lo) * 0.05 || 1;
  // "Found at": consecutive points shown as one range (first → last).
  const ranges = (idx: number[]) => {
    const out: string[] = [];
    for (let k = 0; k < idx.length; k++) {
      const a = idx[k] ?? 0;
      let b = a;
      while (k + 1 < idx.length && idx[k + 1] === b + 1) { b = idx[k + 1] ?? b; k++; }
      out.push(a === b ? points[a]?.label ?? "" : `${points[a]?.label ?? ""} → ${points[b]?.label ?? ""}`);
    }
    return out.join(", ");
  };
  const broken = new Map(n.hits.map((h) => [h.rule, ranges(h.points)]));
  return (
    <Stack gap="xs">
      <div style={{ width: "100%", height }} data-testid="control-chart" dir="ltr">{/* time runs left to right, also in Arabic */}
        <ResponsiveContainer>
          <ComposedChart data={data} margin={{ top: 12, right: 64, bottom: 4, left: 4 }}>
            <CartesianGrid strokeDasharray="2 4" stroke="#f1f3f5" />
            {zones.map(([a, b, z], i) => (
              <ReferenceArea key={i} y1={lim(a)} y2={lim(b)} fill={z === "A" ? "#fff5f5" : z === "B" ? "#f8f0fc" : "#ebfbee"} fillOpacity={0.6}
                label={{ value: z, position: "insideLeft", fontSize: 13, fontWeight: 700, fontStyle: "italic", fill: "#495057" }} />
            ))}
            <XAxis dataKey="label" fontSize={11} angle={-35} textAnchor="end" height={48} interval="preserveStartEnd" />
            <YAxis fontSize={11} width={52} domain={[lo - pad, hi + pad]} tickFormatter={(v: number) => fmtNum(v, 1)} />
            <Tooltip formatter={(v) => fmtNum(v as number)} />
            <Legend verticalAlign="top" height={24} iconType="plainline" wrapperStyle={{ fontSize: 12 }} />
            {L && <>
              <ReferenceLine y={lim(3)} stroke={LIMIT} strokeWidth={2.5} label={{ value: `UCL ${fmtNum(lim(3))}`, position: "right", fontSize: 10 }} />
              <ReferenceLine y={lim(2)} stroke={S2} />
              <ReferenceLine y={lim(1)} stroke={S1} />
              <ReferenceLine y={L.mean} stroke={CL} strokeWidth={3} label={{ value: `CL ${fmtNum(L.mean)}`, position: "right", fontSize: 10 }} />
              <ReferenceLine y={lim(-1)} stroke={S1} />
              <ReferenceLine y={lim(-2)} stroke={S2} />
              <ReferenceLine y={lim(-3)} stroke={LIMIT} strokeWidth={2.5} label={{ value: `LCL ${fmtNum(lim(-3))}`, position: "right", fontSize: 10 }} />
            </>}
            {specs.map((s) => <ReferenceLine key={s.label} y={s.y} stroke={s.color} strokeDasharray="8 4" strokeWidth={1.5} label={{ value: s.label, position: "insideTopRight", fontSize: 10, fill: s.color }} />)}
            {showTarget && <Line dataKey="target" name={t("kpi.target")} stroke="#868e96" strokeDasharray="6 3" dot={false} connectNulls type="stepAfter" isAnimationActive={false} />}
            <Line dataKey="value" name={unit ? `${t("kpi.actual")} (${unit})` : t("kpi.actual")} stroke="#1c2a8c" strokeWidth={1.5} connectNulls isAnimationActive={false}
              dot={(p: DotProps) => <Dot key={p.index} {...p} />} activeDot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      {!L ? <Text size="sm" c="dimmed">{t("kpi.nelsonFew")}</Text> : (
        <>
          <Group gap="md">
            <Text size="xs" c="dimmed">{t("kpi.nelson")} · CL {fmtNum(L.mean)}{unit ? ` ${unit}` : ""} · σ {fmtNum(L.sigma)}</Text>
            {n.hits.length === 0 ? <Badge color="green" variant="light">{t("kpi.nelsonOk")}</Badge>
              : <Badge color="red" variant="light">{t("kpi.nelsonBroken", { n: n.hits.length })}</Badge>}
          </Group>
          <Table fz="xs" withTableBorder withColumnBorders verticalSpacing={4} data-testid="nelson-table">
            <Table.Thead style={{ background: "#2c7fb8", color: "#fff" }}>
              <Table.Tr><Table.Th w={50}>{t("kpi.rule")}</Table.Th><Table.Th>{t("kpi.pattern")}</Table.Th><Table.Th>{t("kpi.cause")}</Table.Th><Table.Th>{t("kpi.found")}</Table.Th></Table.Tr>
            </Table.Thead>
            <Table.Tbody>{NELSON_RULES.map((r) => {
              const at = broken.get(r);
              return (
                <Table.Tr key={r} style={at ? { background: "#ffe3e3" } : undefined}>
                  <Table.Td fw={700} c={at ? "red.8" : undefined}>{r}</Table.Td>
                  <Table.Td>{t(`kpi.nelson${r}`)}</Table.Td>
                  <Table.Td c="dimmed">{t(`kpi.cause${r}`)}</Table.Td>
                  <Table.Td>{at ? <Text size="xs" c="red.8" fw={600}>{at}</Text>
                    : <Text size="xs" c="green.8">✓</Text>}</Table.Td>
                </Table.Tr>);
            })}</Table.Tbody>
          </Table>
        </>
      )}
    </Stack>
  );
}

export interface Point { period: string; actual: number | null; target: number | null }

/** Company KPI: actual against target per month; dots coloured by target status. */
export function KpiControlChart({ points, higherIsBetter, unit }: { points: Point[]; higherIsBetter: boolean; unit?: string | null }) {
  return (
    <ControlChart unit={unit} showTarget points={points.map((p) => {
      const s = status(higherIsBetter, p.actual, p.target);
      return { label: p.period, value: p.actual, target: p.target, color: s ? STATUS_COLOR[s].fg : undefined };
    })} />
  );
}

/** Clear colour key for the scorecard, the charts and the dashboard. */
export function StatusLegend({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation();
  return (
    <Group gap={compact ? "xs" : "md"} data-testid="status-legend">
      {(["met", "near", "miss"] as const).map((k) => (
        <Group key={k} gap={6}><span style={{ width: 14, height: 14, borderRadius: 3, background: STATUS_COLOR[k].bg, border: `2px solid ${STATUS_COLOR[k].fg}` }} />
          <Text size="xs">{t(`kpi.status_${k}`, { pct: NEAR * 100 })}</Text></Group>))}
      {!compact && <Group gap={6}><span style={{ width: 14, height: 14, borderRadius: 3, border: "2px solid #ced4da" }} /><Text size="xs">{t("kpi.status_none")}</Text></Group>}
    </Group>
  );
}

/** Condition monitoring colour key: reading status and the Nelson rule marks. */
export const CM_COLOR: Record<string, string> = { normal: "#2b8a3e", warning: "#e67700", critical: "#c92a2a", unknown: "#868e96" };

export function ConditionLegend() {
  const { t } = useTranslation();
  return (
    <Group gap="md" data-testid="condition-legend">
      {(["normal", "warning", "critical"] as const).map((k) => (
        <Group key={k} gap={6}><span style={{ width: 12, height: 12, borderRadius: 6, background: CM_COLOR[k] }} /><Text size="xs">{t(`pdm.level_${k}`)}</Text></Group>))}
      <Group gap={6}><span style={{ width: 12, height: 12, borderRadius: 6, border: "2px solid #e03131" }} /><Text size="xs">{t("kpi.nelsonMark")}</Text></Group>
    </Group>
  );
}

/** Condition-monitoring level in plain words: "Alarm limit exceeded" / "Warning limit exceeded" / "Normal", not "Critical". */
export function LevelBadge({ value, size = "sm" }: { value: string; size?: "xs" | "sm" | "md" }) {
  const { t } = useTranslation();
  const color = value === "critical" ? "red" : value === "warning" ? "orange" : value === "normal" ? "green" : "gray";
  return <Badge color={color} variant={value === "critical" ? "filled" : "light"} size={size} styles={{ root: { textTransform: "none", overflow: "visible", maxWidth: "none", flexShrink: 0 }, label: { overflow: "visible", textOverflow: "clip" } }}>{t(`pdm.short_${value}`, { defaultValue: value })}</Badge>;
}
