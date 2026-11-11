"use client";

import { Badge, Group, Stack, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { CartesianGrid, ComposedChart, Legend, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fmtNum } from "@/lib/hooks";
import { NEAR, nelson, status, STATUS_COLOR } from "@/lib/kpiStatus";

export interface Point { period: string; actual: number | null; target: number | null }

interface DotProps { cx?: number; cy?: number; index?: number; payload?: Point & { flags?: number[] } }

/** Actual value: red and larger when a Nelson rule flags it, otherwise coloured by target status. */
function Dot({ cx, cy, payload, higherIsBetter }: DotProps & { higherIsBetter: boolean }) {
  if (cx === undefined || cy === undefined || !payload || payload.actual === null) return <g />;
  const broken = (payload.flags ?? []).length > 0;
  const s = status(higherIsBetter, payload.actual, payload.target);
  const fill = broken ? "#c92a2a" : s ? STATUS_COLOR[s].fg : "#4c6ef5";
  return <circle cx={cx} cy={cy} r={broken ? 6 : 4} fill={fill} stroke={broken ? "#fff" : "none"} strokeWidth={2} />;
}

/** Actual against target per month on a control chart (mean and 1/2/3 sigma), with Nelson rule breaks marked in red. */
export function KpiControlChart({ points, higherIsBetter, unit }: { points: Point[]; higherIsBetter: boolean; unit?: string | null }) {
  const { t } = useTranslation();
  const n = nelson(points.map((p) => p.actual));
  const L = n.limits;
  const data = points.map((p, i) => ({ ...p, flags: n.flags[i] }));
  const band = L && L.sigma > 0 ? [-3, -2, -1, 1, 2, 3].map((k) => ({ k, y: L.mean + k * L.sigma })) : [];
  return (
    <Stack gap="xs">
      <div style={{ width: "100%", height: 260 }} data-testid="kpi-control-chart">
        <ResponsiveContainer>
          <ComposedChart data={data} margin={{ top: 10, right: 48, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e9ecef" />
            <XAxis dataKey="period" fontSize={11} />
            <YAxis fontSize={11} width={48} domain={["auto", "auto"]} />
            <Tooltip formatter={(v) => fmtNum(v as number)} />
            <Legend verticalAlign="top" height={24} iconType="plainline" wrapperStyle={{ fontSize: 12 }} />
            {L && <ReferenceLine y={L.mean} stroke="#495057" label={{ value: t("kpi.mean"), position: "right", fontSize: 10 }} />}
            {band.map((b) => <ReferenceLine key={b.k} y={b.y} stroke={Math.abs(b.k) === 3 ? "#fa5252" : Math.abs(b.k) === 2 ? "#fd7e14" : "#adb5bd"}
              strokeDasharray="4 4" label={{ value: `${b.k > 0 ? "+" : "−"}${Math.abs(b.k)}σ`, position: "right", fontSize: 10 }} />)}
            <Line dataKey="target" name={t("kpi.target")} stroke="#868e96" strokeDasharray="6 3" dot={false} connectNulls type="stepAfter" />
            <Line dataKey="actual" name={t("kpi.actual")} stroke="#4c6ef5" strokeWidth={2} dot={(p: DotProps) => <Dot key={p.index} {...p} higherIsBetter={higherIsBetter} />} connectNulls isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <Group gap="xs">
        <Text size="xs" c="dimmed">{t("kpi.nelson")}{L ? ` · ${t("kpi.mean")} ${fmtNum(L.mean)}${unit ? ` ${unit}` : ""} · σ ${fmtNum(L.sigma)}` : ""}</Text>
      </Group>
      {!L ? <Text size="sm" c="dimmed">{t("kpi.nelsonFew")}</Text> : n.hits.length === 0 ? (
        <Badge color="green" variant="light">{t("kpi.nelsonOk")}</Badge>
      ) : (
        <Stack gap={6}>{[...n.hits].sort((a, b) => a.rule - b.rule).map((h) => (
          <div key={h.rule} style={{ borderInlineStart: "3px solid #c92a2a", paddingInlineStart: 8 }}>
            <Group gap={6} wrap="nowrap"><Badge color="red" size="sm" style={{ flexShrink: 0 }}>{t("kpi.rule")} {h.rule}</Badge><Text size="sm">{t(`kpi.nelson${h.rule}`)}</Text></Group>
            <Text size="xs" c="dimmed" mt={2}>{h.points.map((i) => points[i]?.period ?? "").join(" · ")}</Text>
          </div>))}</Stack>
      )}
    </Stack>
  );
}

/** Clear colour key for the scorecard, the charts and the dashboard. */
export function StatusLegend() {
  const { t } = useTranslation();
  return (
    <Group gap="md">
      {(["met", "near", "miss"] as const).map((k) => (
        <Group key={k} gap={6}><span style={{ width: 14, height: 14, borderRadius: 3, background: STATUS_COLOR[k].bg, border: `2px solid ${STATUS_COLOR[k].fg}` }} />
          <Text size="xs">{t(`kpi.status_${k}`, { pct: NEAR * 100 })}</Text></Group>))}
      <Group gap={6}><span style={{ width: 14, height: 14, borderRadius: 3, border: "2px solid #ced4da" }} /><Text size="xs">{t("kpi.status_none")}</Text></Group>
    </Group>
  );
}
