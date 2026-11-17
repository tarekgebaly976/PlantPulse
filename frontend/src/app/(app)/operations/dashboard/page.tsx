"use client";

import { BarChart, LineChart } from "@mantine/charts";
import { Alert, Group, Paper, SegmentedControl, Select, SimpleGrid, Stack, Switch, Text, Title, useComputedColorScheme } from "@mantine/core";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Guard } from "@/components/AppFrame";
import { oeeColor, Tile } from "@/components/Ops";
import { Loading, PageHeader } from "@/components/ui";
import { fmtNum, useQ } from "@/lib/hooks";
import { fmtVal, hhmm, pct, type Dashboard, type DashField } from "@/lib/ops";

// Categorical slots in fixed order (validated: lightness, chroma, colour-blind separation, light and dark surface).
const SERIES = { light: ["#2a78d6", "#eb6834", "#1baf7a"], dark: ["#3987e5", "#d95926", "#199e70"] };

function ChartCard({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <Paper withBorder p="md" radius="md">
      <Text fw={600} size="sm">{title}</Text>
      {sub && <Text size="xs" c="dimmed" mb={6}>{sub}</Text>}
      {children}
    </Paper>
  );
}

const short = (d: string) => d.slice(5); // MM-DD on the axis
/** Axis ticks: compact numbers, no unit (the chart title carries it). */
const tick = (v: number) => (Math.abs(v) >= 10000 ? `${fmtNum(v / 1000, 0)}k` : fmtNum(v, Math.abs(v) < 10 ? 2 : 0));

function FieldChart({ f, perTon, color }: { f: DashField; perTon: boolean; color: string }) {
  const { t } = useTranslation();
  const src = perTon && f.per_ton_series ? f.per_ton_series : f.series;
  const unit = perTon && f.per_ton_series ? `${f.unit ?? ""}/t` : f.unit ?? "";
  const data = Object.entries(src).sort(([a], [b]) => a.localeCompare(b)).map(([d, v]) => ({ day: short(d), v }));
  const digits = perTon ? 3 : f.decimals;
  return (
    <ChartCard title={`${f.label}${unit ? ` (${unit})` : ""}`}
      sub={perTon && f.per_ton_period !== null ? t("opsDash.periodPerTon", { v: fmtVal(f.per_ton_period, 3), u: unit }) : f.total !== null && f.kind !== "number" && f.unit !== "%" ? t("opsDash.periodTotal", { v: fmtVal(f.total, 0), u: f.unit ?? "" }) : undefined}>
      {data.length === 0 ? <Text size="sm" c="dimmed">{t("common.noData")}</Text> :
        <LineChart h={150} data={data} dataKey="day" series={[{ name: "v", label: f.label, color }]} curveType="linear" strokeWidth={2} dotProps={{ r: 0 }}
          activeDotProps={{ r: 4 }} withLegend={false} gridAxis="y" valueFormatter={(x) => `${fmtVal(x, digits)} ${unit}`} yAxisProps={{ tickFormatter: tick, width: 44 }}
          referenceLines={[...(f.low !== null && !perTon ? [{ y: f.low, label: `${f.low}`, color: "gray.5" }] : []), ...(f.high !== null && !perTon ? [{ y: f.high, label: `${f.high}`, color: "gray.5" }] : [])]} />}
    </ChartCard>
  );
}

function View() {
  const { t } = useTranslation();
  const scheme = useComputedColorScheme("light");
  const c = SERIES[scheme === "dark" ? "dark" : "light"];
  const [days, setDays] = useState("30");
  const [mid, setMid] = useState<string | null>(null);
  const [perTon, setPerTon] = useState(true);
  const q = useQ<Dashboard>("/operations/dashboard", { days, machine_id: mid ?? undefined });
  if (!q.data) return <Loading />;
  const d = q.data;
  const p = d.period;
  const done = d.production.filter((x) => !x.in_progress);
  const prodData = done.map((x) => ({ day: short(x.date), a: x.a, down: Math.round(x.b * 1000) / 1000, reject: x.reject }));
  const oeeData = done.map((x) => ({ day: short(x.date), oee: x.oee !== null ? x.oee * 100 : null }));
  const apq = done.map((x) => ({ day: short(x.date), av: x.availability !== null ? x.availability * 100 : null, pe: x.performance !== null ? x.performance * 100 : null, qu: x.quality !== null ? x.quality * 100 : null }));
  const pareto = (obj: Record<string, number>) => Object.entries(obj).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ k, v: Math.round(v * 100) / 100 }));
  const perTonTiles = d.logs.flatMap((l) => l.fields.filter((f) => f.per_ton && f.per_ton_period !== null));
  return (
    <>
      <PageHeader title={t("opsDash.title")}>
        <Text size="sm" c="dimmed">{t("opsDash.subtitle", { start: d.start, end: d.end })}</Text>
      </PageHeader>
      <Group mb="md" gap="sm" wrap="wrap">
        <SegmentedControl value={days} onChange={setDays} data={[{ value: "7", label: t("opsDash.days", { n: 7 }) }, { value: "30", label: t("opsDash.days", { n: 30 }) }, { value: "90", label: t("opsDash.days", { n: 90 }) }]} />
        {d.machines.length > 1 && <Select w={220} data={d.machines.map((m) => ({ value: m.id, label: `${m.code} – ${m.name}` }))} value={mid ?? d.machine_id} onChange={setMid} />}
        <Switch label={t("opsDash.perTon")} checked={perTon} onChange={(e) => setPerTon(e.currentTarget.checked)} />
      </Group>
      {!p && d.logs.length === 0 ? <Alert color="blue">{t("ops.noMachine")}</Alert> : (
        <Stack>
          {p && (
            <SimpleGrid cols={{ base: 2, sm: 3, lg: 6 }}>
              <Tile label={t("ops.tiles.gross")} value={`${fmtNum(p.production.gross, 0)} t`} sub={`${t("opsDash.perDay")} ${fmtNum(p.production.gross / Math.max(p.days, 1), 0)} t`} />
              <Tile label={t("ops.tiles.a")} value={`${fmtNum(p.production.a, 0)} t`} sub={`B+S ${pct(p.production.b_pct)} · ${t("ops.tiles.reject")} ${pct(p.production.reject_pct)}`} />
              <Tile label={t("ops.tiles.oee")} value={pct(p.oee.oee)} color={oeeColor(p.oee.oee)} sub={`⁦${pct(p.oee.availability, 0)} × ${pct(p.oee.performance, 0)} × ${pct(p.oee.quality, 0)}⁩`} />
              <Tile label={t("ops.tiles.downtime")} value={hhmm(p.stops.downtime_hours)} sub={`${t("ops.tables.planned")} ${hhmm(p.stops.planned_hours)}`} />
              <Tile label={t("ops.tiles.breaks")} value={String(p.stops.breaks_count)} sub={hhmm(p.stops.breaks_hours)} />
              <Tile label={t("ops.tiles.trim")} value={pct(p.production.trim_pct)} sub={`${fmtNum(p.production.trim, 0)} t`} />
              {perTonTiles.map((f) => <Tile key={f.id} label={`${f.label} / t`} value={`${fmtVal(f.per_ton_period, 3)} ${f.unit ?? ""}/t`} sub={`${fmtVal(f.total, 0)} ${f.unit ?? ""}`} />)}
            </SimpleGrid>
          )}
          {p && (
            <SimpleGrid cols={{ base: 1, lg: 2 }}>
              <ChartCard title={t("opsDash.production")} sub={t("opsDash.productionSub")}>
                <BarChart h={240} data={prodData} dataKey="day" type="stacked" withLegend legendProps={{ verticalAlign: "bottom" }} gridAxis="y" barProps={{ radius: 2 }}
                  valueFormatter={(x) => `${fmtNum(x, 1)} t`} yAxisProps={{ tickFormatter: tick }} series={[{ name: "a", label: t("ops.tiles.a"), color: c[0]! }, { name: "down", label: t("opsDash.downgrade"), color: c[1]! }, { name: "reject", label: t("ops.tiles.reject"), color: c[2]! }]} />
              </ChartCard>
              <ChartCard title={t("ops.tiles.oee")} sub={t("ops.report.oeeFormula")}>
                <LineChart h={240} data={oeeData} dataKey="day" series={[{ name: "oee", label: "OEE", color: c[0]! }]} curveType="linear" strokeWidth={2}
                  dotProps={{ r: 0 }} activeDotProps={{ r: 4 }} gridAxis="y" yAxisProps={{ domain: [0, 100], tickFormatter: (v: number) => `${v}%` }} valueFormatter={(x) => `${fmtNum(x, 1)}%`}
                  referenceLines={[{ y: 75, label: "75%", color: "gray.5" }]} />
              </ChartCard>
              <ChartCard title={t("opsDash.apq")}>
                <LineChart h={200} data={apq} dataKey="day" curveType="linear" strokeWidth={2} dotProps={{ r: 0 }} activeDotProps={{ r: 4 }} gridAxis="y" withLegend
                  legendProps={{ verticalAlign: "bottom" }} yAxisProps={{ domain: [0, 100], tickFormatter: (v: number) => `${v}%` }} valueFormatter={(x) => `${fmtNum(x, 1)}%`}
                  series={[{ name: "av", label: t("ops.tiles.availability"), color: c[0]! }, { name: "pe", label: t("ops.tiles.performance"), color: c[1]! }, { name: "qu", label: t("ops.tiles.quality"), color: c[2]! }]} />
              </ChartCard>
              <ChartCard title={t("opsDash.breaksDay")}>
                <BarChart h={200} data={done.map((x) => ({ day: short(x.date), n: x.breaks }))} dataKey="day" gridAxis="y" barProps={{ radius: 2 }}
                  series={[{ name: "n", label: t("ops.tiles.breaks"), color: c[0]! }]} />
              </ChartCard>
              <ChartCard title={t("opsDash.downtimeDisc")} sub={t("opsDash.hours")}>
                <BarChart h={Math.max(160, 28 * Object.keys(p.stops.downtime_by_discipline).length + 40)} data={pareto(p.stops.downtime_by_discipline)} dataKey="k" orientation="vertical"
                  gridAxis="x" barProps={{ radius: 2 }} valueFormatter={(x) => hhmm(x)} xAxisProps={{ tickFormatter: (v: number) => `${v} h` }} series={[{ name: "v", label: t("opsDash.hours"), color: c[0]! }]} />
              </ChartCard>
              <ChartCard title={t("opsDash.breaksDisc")} sub={t("ops.tables.count")}>
                <BarChart h={Math.max(160, 28 * Object.keys(p.stops.breaks_count_by_discipline).length + 40)} data={pareto(p.stops.breaks_count_by_discipline)} dataKey="k" orientation="vertical"
                  gridAxis="x" barProps={{ radius: 2 }} series={[{ name: "v", label: t("ops.tables.count"), color: c[0]! }]} />
              </ChartCard>
            </SimpleGrid>
          )}
          {d.logs.map((l) => (
            <Stack key={l.template.id} gap="xs">
              <Title order={4} mt="sm">{l.template.name}</Title>
              <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
                {l.fields.map((f) => <FieldChart key={f.id} f={f} perTon={perTon && f.per_ton} color={c[0]!} />)}
              </SimpleGrid>
            </Stack>
          ))}
        </Stack>
      )}
    </>
  );
}

export default function DashboardPage() {
  return <Guard perm="op.view"><View /></Guard>;
}
