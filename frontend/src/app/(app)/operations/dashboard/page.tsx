"use client";

import { BarChart, LineChart } from "@mantine/charts";
import { Alert, Group, Paper, SegmentedControl, Select, SimpleGrid, Stack, Switch, Text, Title, useComputedColorScheme } from "@mantine/core";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Guard } from "@/components/AppFrame";
import { oeeColor, Tile } from "@/components/Ops";
import { KpiCard } from "@/components/OpsKpi";
import { Loading, PageHeader } from "@/components/ui";
import { fmtNum, useQ } from "@/lib/hooks";
import { fmtVal, hhmm, pct, type Dashboard, type DashField } from "@/lib/ops";

// Categorical slots in fixed order (validated: lightness, chroma, colour-blind separation, light and dark surface).
const SERIES = { light: ["#2a78d6", "#eb6834", "#1baf7a"], dark: ["#3987e5", "#d95926", "#199e70"] };

function ChartCard({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <Paper withBorder p="md" radius="md">
      <Text fw={600} size="sm">{title}</Text>
      {sub ? <Text size="xs" c="dimmed" mb={6}>{sub}</Text> : <div style={{ height: 14 }} />}
      {children}
    </Paper>
  );
}

const short = (d: string) => d.slice(5); // MM-DD on the axis
/** Decimals for a ratio: 0.554 → 3, 2.04 → 2, 14.3 → 1, 215.8 → 0. */
const sig = (v: number | null | undefined) => (v === null || v === undefined ? 0 : Math.abs(v) < 1 ? 3 : Math.abs(v) < 10 ? 2 : Math.abs(v) < 100 ? 1 : 0);
/** Axis ticks: compact numbers, no unit (the chart title carries it). */
const tick = (v: number) => (Math.abs(v) >= 10000 ? `${fmtNum(v / 1000, 0)}k` : fmtNum(v, Math.abs(v) < 10 ? 2 : 0));

function FieldChart({ f, perTon, color, out }: { f: DashField; perTon: boolean; color: string; out: string }) {
  const { t } = useTranslation();
  const src = perTon && f.per_ton_series ? f.per_ton_series : f.series;
  const unit = perTon && f.per_ton_series ? `${f.unit ?? ""}/${out}` : f.unit ?? "";
  const data = Object.entries(src).sort(([a], [b]) => a.localeCompare(b)).map(([d, v]) => ({ day: short(d), v }));
  const digits = perTon ? 3 : f.decimals;
  return (
    <ChartCard title={`${f.label}${unit ? ` (${unit})` : ""}`}
      sub={perTon && f.per_ton_period !== null ? t("opsDash.periodPerTon", { v: fmtVal(f.per_ton_period, 3), u: unit }) : f.total !== null && f.kind !== "number" && f.unit !== "%" ? t("opsDash.periodTotal", { v: fmtVal(f.total, 0), u: f.unit ?? "" }) : undefined}>
      {data.length === 0 ? <Text size="sm" c="dimmed">{t("common.noData")}</Text> :
        <LineChart h={150} data={data} dataKey="day" series={[{ name: "v", label: f.label, color }]} curveType="linear" strokeWidth={2} dotProps={{ r: 0 }}
          activeDotProps={{ r: 4 }} withLegend={false} gridAxis="y" valueFormatter={(x) => `${fmtVal(x, digits)} ${unit}`} yAxisProps={{ tickFormatter: tick, width: 48, tickCount: 5, interval: 0, domain: [0, "auto"] }}
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
  const sm = p?.summary;
  const u = d.unit ?? "";
  const paper = d.profile === "paper_machine";
  const oeeTarget = d.kpis.find((k) => k.code === "OEE")?.target ?? null;
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
        <Switch label={t("gen.dash.perUnit", { u })} checked={perTon} onChange={(e) => setPerTon(e.currentTarget.checked)} />
      </Group>
      {!p && d.logs.length === 0 ? <Alert color="blue">{t("ops.noMachine")}</Alert> : (
        <Stack>
          {d.kpis.length > 0 && (
            <SimpleGrid cols={{ base: 2, sm: 3, lg: 6 }}>
              {d.kpis.map((k) => <KpiCard key={`${k.id}-${k.lines.join()}`} k={k} period="range" showLine={false} />)}
            </SimpleGrid>
          )}
          {sm && (
            <SimpleGrid cols={{ base: 2, sm: 3, lg: 6 }}>
              <Tile label={t("gen.tiles.produced")} value={`${fmtNum(sm.produced ?? 0, 0)} ${u}`} sub={`${t("opsDash.perDay")} ${fmtNum((sm.produced ?? 0) / Math.max(sm.days, 1), 0)} ${u}`} />
              <Tile label={t("gen.tiles.good")} value={`${fmtNum(sm.good ?? 0, 0)} ${u}`}
                sub={`${t("gen.tiles.downgrade")} ${pct(sm.net ? (sm.downgrade ?? 0) / sm.net : null)} · ${t("ops.tiles.reject")} ${pct(sm.net ? (sm.reject ?? 0) / sm.net : null)}`} />
              <Tile label={t("ops.tiles.oee")} value={pct(sm.oee.oee)} color={oeeColor(sm.oee.oee)} sub={`⁦${pct(sm.oee.availability, 0)} × ${pct(sm.oee.performance, 0)} × ${pct(sm.oee.quality, 0)}⁩`} />
              <Tile label={t("ops.tiles.downtime")} value={hhmm(sm.downtime_hours ?? 0)} sub={`${t("ops.tables.planned")} ${hhmm(sm.planned_downtime_hours ?? 0)}`} />
              {paper ? <Tile label={t("ops.tiles.breaks")} value={String(sm.breaks ?? 0)} sub={hhmm(sm.breaks_hours ?? 0)} />
                : <Tile label={t("gen.tiles.stops")} value={String(sm.stops ?? 0)} sub={`${t("gen.tiles.failures")} ${hhmm(sm.failure_hours ?? 0)}`} />}
              {paper && <Tile label={t("ops.tiles.trim")} value={pct(sm.produced ? (sm.trim ?? 0) / sm.produced : null)} sub={`${fmtNum(sm.trim ?? 0, 0)} ${u}`} />}
              {perTonTiles.map((f) => perTon
                ? <Tile key={f.id} label={`${f.label} / ${u}`} value={fmtVal(f.per_ton_period, sig(f.per_ton_period))} unit={`${f.unit ?? ""}/${u}`} sub={`${t("gen.dash.total")} ${fmtVal(f.total, 0)} ${f.unit ?? ""}`} />
                : <Tile key={f.id} label={f.label} value={fmtVal(f.total, 0)} unit={f.unit ?? ""} sub={`${fmtVal(f.per_ton_period, sig(f.per_ton_period))} ${f.unit ?? ""}/${u}`} />)}
            </SimpleGrid>
          )}
          {p && (
            <SimpleGrid cols={{ base: 1, lg: 2 }}>
              <ChartCard title={`${t("gen.dash.production")}, ${u}`} sub={t("gen.dash.productionSub")}>
                <BarChart h={240} data={prodData} dataKey="day" type="stacked" withLegend legendProps={{ verticalAlign: "bottom" }} gridAxis="y" barProps={{ radius: 2 }}
                  valueFormatter={(x) => `${fmtNum(x, 1)} ${u}`} yAxisProps={{ tickFormatter: tick }} series={[{ name: "a", label: t("gen.tiles.good"), color: c[0]! }, { name: "down", label: t("gen.tiles.downgrade"), color: c[1]! }, { name: "reject", label: t("ops.tiles.reject"), color: c[2]! }]} />
              </ChartCard>
              <ChartCard title={t("ops.tiles.oee")} sub={paper ? t("ops.report.oeeFormula") : t("gen.dash.oeeFormula")}>
                <LineChart h={240} data={oeeData} dataKey="day" series={[{ name: "oee", label: "OEE", color: c[0]! }]} curveType="linear" strokeWidth={2}
                  dotProps={{ r: 0 }} activeDotProps={{ r: 4 }} gridAxis="y" yAxisProps={{ domain: [0, 100], tickFormatter: (v: number) => `${v}%` }} valueFormatter={(x) => `${fmtNum(x, 1)}%`}
                  referenceLines={oeeTarget !== null ? [{ y: oeeTarget, label: `${t("kpi2.target")} ${oeeTarget}%`, color: "gray.5" }] : []} />
              </ChartCard>
              <ChartCard title={t("opsDash.apq")}>
                <LineChart h={200} data={apq} dataKey="day" curveType="linear" strokeWidth={2} dotProps={{ r: 0 }} activeDotProps={{ r: 4 }} gridAxis="y" withLegend
                  legendProps={{ verticalAlign: "bottom" }} yAxisProps={{ domain: [0, 100], tickFormatter: (v: number) => `${v}%` }} valueFormatter={(x) => `${fmtNum(x, 1)}%`}
                  series={[{ name: "av", label: t("ops.tiles.availability"), color: c[0]! }, { name: "pe", label: t("ops.tiles.performance"), color: c[1]! }, { name: "qu", label: t("ops.tiles.quality"), color: c[2]! }]} />
              </ChartCard>
              {paper ? (
                <ChartCard title={t("opsDash.breaksDay")}>
                  <BarChart h={200} data={done.map((x) => ({ day: short(x.date), n: x.breaks }))} dataKey="day" gridAxis="y" barProps={{ radius: 2 }}
                    series={[{ name: "n", label: t("ops.tiles.breaks"), color: c[0]! }]} />
                </ChartCard>
              ) : (
                <ChartCard title={t("gen.dash.downtimeDay")}>
                  <BarChart h={200} data={done.map((x) => ({ day: short(x.date), n: x.downtime_hours }))} dataKey="day" gridAxis="y" barProps={{ radius: 2 }}
                    valueFormatter={(x) => hhmm(x)} series={[{ name: "n", label: t("ops.tiles.downtime"), color: c[0]! }]} />
                </ChartCard>
              )}
              <ChartCard title={t("gen.dash.lossCat")} sub={t("opsDash.hours")}>
                <BarChart h={Math.max(160, 28 * Object.keys(p.loss_by_category).length + 40)} data={pareto(p.loss_by_category)} dataKey="k" orientation="vertical"
                  gridAxis="x" barProps={{ radius: 2 }} valueFormatter={(x) => hhmm(x)} yAxisProps={{ width: 150 }} xAxisProps={{ tickFormatter: (v: number) => `${v} h` }} series={[{ name: "v", label: t("opsDash.hours"), color: c[1]! }]} />
              </ChartCard>
              <ChartCard title={t("opsDash.downtimeDisc")} sub={t("opsDash.hours")}>
                <BarChart h={Math.max(160, 28 * Object.keys(p.stops.downtime_by_discipline).length + 40)} data={pareto(p.stops.downtime_by_discipline)} dataKey="k" orientation="vertical"
                  gridAxis="x" barProps={{ radius: 2 }} valueFormatter={(x) => hhmm(x)} xAxisProps={{ tickFormatter: (v: number) => `${v} h` }} series={[{ name: "v", label: t("opsDash.hours"), color: c[0]! }]} />
              </ChartCard>
              {paper && p.stops.breaks_count_by_discipline && (
                <ChartCard title={t("opsDash.breaksDisc")} sub={t("ops.tables.count")}>
                  <BarChart h={Math.max(160, 28 * Object.keys(p.stops.breaks_count_by_discipline).length + 40)} data={pareto(p.stops.breaks_count_by_discipline)} dataKey="k" orientation="vertical"
                    gridAxis="x" barProps={{ radius: 2 }} series={[{ name: "v", label: t("ops.tables.count"), color: c[0]! }]} />
                </ChartCard>
              )}
            </SimpleGrid>
          )}
          {d.logs.map((l) => (
            <Stack key={l.template.id} gap="xs">
              <Title order={4} mt="sm">{l.template.name}</Title>
              <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
                {l.fields.map((f) => <FieldChart key={f.id} f={f} perTon={perTon && f.per_ton} color={c[0]!} out={u} />)}
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
