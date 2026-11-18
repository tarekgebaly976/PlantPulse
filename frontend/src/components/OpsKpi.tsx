"use client";

import { Sparkline } from "@mantine/charts";
import { Badge, Group, Paper, Stack, Text, Tooltip } from "@mantine/core";
import { IconTrendingDown, IconTrendingUp } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { fmtNum } from "@/lib/hooks";
import { hhmm, statusColor, type KpiResult, type KpiValue } from "@/lib/ops";

export function kpiNum(x: number, decimals: number, unit: string): string {
  if (unit === "h") return hhmm(x); // hours as h:mm, like the rest of the production pages
  return `${fmtNum(x, decimals)}${unit ? (unit === "%" ? "%" : ` ${unit}`) : ""}`;
}

export function kpiText(v: KpiValue, decimals: number, unit: string): string {
  return v.value === null ? "—" : kpiNum(v.value, decimals, unit);
}

/** A KPI tile: value of the chosen period, status against target and limits, missing data, trend, sparkline. */
export function KpiCard({ k, period = "week", showLine = true }: { k: KpiResult; period?: "day" | "week" | "month" | "range"; showLine?: boolean }) {
  const { t } = useTranslation();
  const v = k.values[period] ?? k.values.week;
  const tr = k.trend_pct;
  const worse = tr !== null && ((k.direction === "higher" && tr < 0) || (k.direction === "lower" && tr > 0));
  return (
    <Paper withBorder p="sm" radius="md">
      <Tooltip label={`${k.name}${k.lines.length === 1 ? ` · ${k.lines[0]}` : ""}`} openDelay={400}>
        <Text size="xs" c="dimmed" lineClamp={1}>{k.name}{showLine && k.lines.length === 1 ? ` · ${k.lines[0]}` : ""}</Text>
      </Tooltip>
      <Group justify="space-between" wrap="nowrap" gap={4} align="center">
        <Text fw={700} size="xl" className="nowrap" c={v.status === "critical" ? "red" : v.status === "warning" ? "orange.8" : undefined}>{kpiText(v, k.decimals, k.unit ?? "")}</Text>
        <Badge size="xs" variant="light" color={statusColor(v.status)} style={{ flexShrink: 0 }}>{t(`kpi2.status.${v.status}`)}</Badge>
      </Group>
      {v.per_period !== undefined && <Text size="xs" c="dimmed">≈ {kpiNum(v.per_period, Math.max(k.decimals, 1), k.unit ?? "")} / {t(`kpi2.periods.${k.period}`).toLowerCase()}</Text>}
      <Stack gap={2}>
        {v.status === "missing" ? (
          <Text size="xs" c="dimmed">{t("kpi2.missing", { codes: v.missing.join(", ") })}</Text>
        ) : (
          <Group gap={6} wrap="nowrap">
            {k.target !== null && <Text size="xs" c="dimmed">{t("kpi2.target")} {kpiNum(k.target, k.decimals, k.unit === "%" ? "" : k.unit === "h" ? "h" : "")}{v.per_period !== undefined ? ` / ${t(`kpi2.periods.${k.period}`).toLowerCase()}` : ""}</Text>}
            {tr !== null && (
              <Tooltip label={t("kpi2.trendHint")}><Group gap={2} wrap="nowrap" c={worse ? "red" : "teal"}>
                {tr >= 0 ? <IconTrendingUp size={14} /> : <IconTrendingDown size={14} />}<Text size="xs">{tr > 0 ? "+" : ""}{fmtNum(tr, 1)}%</Text>
              </Group></Tooltip>
            )}
          </Group>
        )}
        {k.series.length > 2 && <Sparkline h={32} data={k.series.map((x) => x.value)} curveType="linear" color={statusColor(v.status) === "gray" ? "blue" : statusColor(v.status)} fillOpacity={0.15} strokeWidth={1.5} />}
      </Stack>
    </Paper>
  );
}
