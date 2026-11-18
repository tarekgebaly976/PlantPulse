"use client";

import { Sparkline } from "@mantine/charts";
import { Badge, Group, Paper, Stack, Text, Tooltip } from "@mantine/core";
import { IconTrendingDown, IconTrendingUp } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { fmtNum } from "@/lib/hooks";
import { statusColor, type KpiResult, type KpiValue } from "@/lib/ops";

export function kpiText(v: KpiValue, decimals: number, unit: string): string {
  return v.value === null ? "—" : `${fmtNum(v.value, decimals)}${unit ? (unit === "%" ? "%" : ` ${unit}`) : ""}`;
}

/** A KPI tile: value of the chosen period, status against target and limits, missing data, trend, sparkline. */
export function KpiCard({ k, period = "week" }: { k: KpiResult; period?: "day" | "week" | "month" | "range" }) {
  const { t } = useTranslation();
  const v = k.values[period] ?? k.values.week;
  const tr = k.trend_pct;
  const worse = tr !== null && ((k.direction === "higher" && tr < 0) || (k.direction === "lower" && tr > 0));
  return (
    <Paper withBorder p="sm" radius="md">
      <Group justify="space-between" wrap="nowrap" gap={4}>
        <Text size="xs" c="dimmed" truncate>{k.name}{k.lines.length === 1 ? ` · ${k.lines[0]}` : ""}</Text>
        <Badge size="xs" variant="light" color={statusColor(v.status)}>{t(`kpi2.status.${v.status}`)}</Badge>
      </Group>
      <Text fw={700} size="xl" c={v.status === "critical" ? "red" : v.status === "warning" ? "orange.8" : undefined}>{kpiText(v, k.decimals, k.unit ?? "")}</Text>
      <Stack gap={2}>
        {v.status === "missing" ? (
          <Text size="xs" c="dimmed">{t("kpi2.missing", { codes: v.missing.join(", ") })}</Text>
        ) : (
          <Group gap={6} wrap="nowrap">
            {k.target !== null && <Text size="xs" c="dimmed">{t("kpi2.target")} {fmtNum(k.target, k.decimals)}</Text>}
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
