"use client";

import { Paper, SimpleGrid, Stack, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { fmtNum } from "@/lib/hooks";
import { hhmm, pct, type Period } from "@/lib/ops";

export function Tile({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <Paper withBorder p="sm" radius="md">
      <Text size="xs" c="dimmed">{label}</Text>
      <Text fw={700} size="xl" c={color}>{value}</Text>
      {sub && <Text size="xs" c="dimmed">{sub}</Text>}
    </Paper>
  );
}

export function oeeColor(v: number | null | undefined): string | undefined {
  if (v === null || v === undefined) return undefined;
  return v >= 0.75 ? "teal" : v >= 0.6 ? "yellow.8" : "red";
}

export function PeriodTiles({ p, title }: { p: Period; title: string }) {
  const { t } = useTranslation();
  return (
    <Stack gap={6}>
      <Text fw={600} size="sm">{title} · {t("ops.tiles.days", { n: p.days })}</Text>
      <SimpleGrid cols={{ base: 2, sm: 3, lg: 6 }}>
        <Tile label={t("ops.tiles.gross")} value={`${fmtNum(p.production.gross, 1)} t`} />
        <Tile label={t("ops.tiles.a")} value={`${fmtNum(p.production.a, 1)} t`} sub={`${t("ops.tiles.b")} ${pct(p.production.b_pct)} · ${t("ops.tiles.reject")} ${pct(p.production.reject_pct)}`} />
        <Tile label={t("ops.tiles.oee")} value={pct(p.oee.oee)} color={oeeColor(p.oee.oee)}
          sub={`\u2066${pct(p.oee.availability, 0)} × ${pct(p.oee.performance, 0)} × ${pct(p.oee.quality, 0)}\u2069`} />
        <Tile label={t("ops.tiles.run")} value={hhmm(p.run_hours)} sub={`${t("ops.tiles.ideal")} ${fmtNum(p.ideal_mt, 0)} t`} />
        <Tile label={t("ops.tiles.downtime")} value={hhmm(p.stops.downtime_hours)} sub={`${t("ops.tables.planned")} ${hhmm(p.stops.planned_hours)}`} />
        <Tile label={t("ops.tiles.breaks")} value={String(p.stops.breaks_count)} sub={hhmm(p.stops.breaks_hours)} />
      </SimpleGrid>
    </Stack>
  );
}

