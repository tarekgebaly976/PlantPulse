"use client";

import { BarChart } from "@mantine/charts";
import { Alert, Anchor, Button, Card, FileInput, Group, Modal, NumberInput, ScrollArea, Select, SimpleGrid, Stack, Table, Tabs, Text, TextInput } from "@mantine/core";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Guard } from "@/components/AppFrame";
import { FailurePareto } from "@/components/FailureModes";
import { DeptSelect, Loading, PageHeader } from "@/components/ui";
import { IconPlus } from "@tabler/icons-react";
import { KpiControlChart, StatusLegend } from "@/components/KpiControlChart";
import { api, download, patch, post, put } from "@/lib/api";
import { status, STATUS_COLOR, type KpiCard } from "@/lib/kpiStatus";
import { fmtNum, useMut, useQ } from "@/lib/hooks";
import { useSession } from "@/lib/session";
import type { KPI } from "@/lib/types";

interface Def { code: string; name: string; unit: string; formula: string; source_data: string; inclusion_rules: string; period: string; missing_data: string }

function Drill({ code, start, end, dept, onClose }: { code: string; start: string; end: string; dept: string | null; onClose: () => void }) {
  const { t } = useTranslation();
  const q = useQ<KPI & { definition: Def; records: Record<string, unknown>[]; records_truncated: boolean }>(`/kpis/${code}`, { start, end, department_id: dept });
  const trend = useQ<{ period: string; value: number | null; available: boolean; manual: number | null; target: number | null }[]>(`/kpis/trend/${code}`, { months: 12, department_id: dept });
  const hasManual = (trend.data ?? []).some((x) => x.manual !== null && x.manual !== undefined);
  const rows = q.data?.records ?? [];
  const cols = rows[0] ? Object.keys(rows[0]).filter((k) => !k.endsWith("_id") && k !== "id") : [];
  return (
    <Modal opened onClose={onClose} size="xl" title={q.data?.definition.name ?? code}>
      {!q.data ? <Loading /> : (
        <Stack>
          <Text size="sm"><b>{t("kpi.formula")}:</b> {q.data.definition.formula}</Text>
          <Text size="xs" c="dimmed"><b>{t("kpi.rules")}:</b> {q.data.definition.inclusion_rules}</Text>
          <Text size="xs" c="dimmed"><b>{t("kpi.source")}:</b> {q.data.definition.source_data} · <b>{t("kpi.missing")}:</b> {q.data.definition.missing_data}</Text>
          <Group><Text fw={700}>{q.data.available ? `${fmtNum(q.data.value)} ${q.data.unit}` : `${t("common.unavailable")}: ${q.data.reason}`}</Text>
            {q.data.denominator !== null && <Text size="sm" c="dimmed">{t("kpi.numerator")} {fmtNum(q.data.numerator)} · {t("kpi.denominator")} {fmtNum(q.data.denominator)}</Text>}</Group>
          {Object.keys(q.data.details ?? {}).length > 0 && <Text size="xs" className="mono">{JSON.stringify(q.data.details)}</Text>}
          {trend.data && <BarChart h={180} withLegend={hasManual} dataKey="period"
            data={trend.data.map((x) => ({ period: x.period, [t("kpi.calculated")]: x.value ?? 0, [t("kpi.manualSeries")]: x.manual ?? 0, [t("kpi.target")]: x.target ?? 0 }))}
            series={[{ name: t("kpi.calculated"), color: "indigo.6" }, ...(hasManual ? [{ name: t("kpi.manualSeries"), color: "orange.5" }, { name: t("kpi.target"), color: "gray.5" }] : [])]} />}
          <Text fw={600}>{t("kpi.drill")} ({rows.length}{q.data.records_truncated ? "+" : ""})</Text>
          <ScrollArea h={300}>
            <Table fz="xs" striped>
              <Table.Thead><Table.Tr>{cols.map((c) => <Table.Th key={c}>{c}</Table.Th>)}</Table.Tr></Table.Thead>
              <Table.Tbody>{rows.map((r, i) => (
                <Table.Tr key={i}>{cols.map((c) => {
                  const v = r[c];
                  const link = c === "number" && typeof r.id === "string" ? `/work-orders/${r.id}` : null;
                  return <Table.Td key={c}>{link ? <a href={link}>{String(v)}</a> : typeof v === "object" ? JSON.stringify(v) : String(v ?? "")}</Table.Td>;
                })}</Table.Tr>))}</Table.Tbody>
            </Table>
          </ScrollArea>
        </Stack>
      )}
    </Modal>
  );
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const avg = (xs: (number | null)[]) => { const v = xs.filter((x): x is number => x !== null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };

/** Add a company KPI in the app (no Excel needed), or change its name, department, unit, direction or CMMS link. */
function KpiForm({ card, defs, onClose }: { card: KpiCard | null; defs: Def[]; onClose: () => void }) {
  const { t } = useTranslation();
  const [f, setF] = useState({
    name: card?.name ?? "", unit: card?.unit ?? "", department_id: card?.department_id ?? null, kpi_code: card?.kpi_code ?? null,
    higher_is_better: card ? card.higher_is_better : true,
  });
  const body = { ...f, name: f.name.trim(), unit: f.unit.trim() || null };
  const save = useMut(() => (card ? patch(`/kpis/scorecard/${card.id}`, body) : post("/kpis/scorecard", body)), { onDone: onClose });
  return (
    <Modal opened onClose={onClose} title={card ? t("kpi.editKpi") : t("kpi.addKpi")}>
      <Stack>
        <TextInput label={t("kpi.kpiName")} required maxLength={120} value={f.name} onChange={(e) => setF({ ...f, name: e.currentTarget.value })} data-autofocus />
        <DeptSelect value={f.department_id} onChange={(v) => setF({ ...f, department_id: v })} clearable label={`${t("common.department")} (${t("kpi.blankPlant")})`} />
        <SimpleGrid cols={2}>
          <TextInput label={t("kpi.unit")} placeholder="h, %, count" maxLength={20} value={f.unit} onChange={(e) => setF({ ...f, unit: e.currentTarget.value })} />
          <Select label={t("kpi.direction")} allowDeselect={false} value={f.higher_is_better ? "up" : "down"} onChange={(v) => setF({ ...f, higher_is_better: v === "up" })}
            data={[{ value: "up", label: `↑ ${t("kpi.higherBetter")}` }, { value: "down", label: `↓ ${t("kpi.lowerBetter")}` }]} />
        </SimpleGrid>
        <Select label={`${t("kpi.cmmsLink")} (${t("common.optional")})`} clearable searchable value={f.kpi_code} onChange={(v) => setF({ ...f, kpi_code: v })}
          data={defs.map((d) => ({ value: d.code, label: d.name }))} description={t("kpi.cmmsLinkHint")} />
        <Group justify="flex-end"><Button variant="default" onClick={onClose}>{t("common.cancel")}</Button>
          <Button disabled={!body.name} loading={save.isPending} onClick={() => save.mutate(undefined)}>{t("common.save")}</Button></Group>
      </Stack>
    </Modal>
  );
}

/** One company KPI over the last 24 months: actual vs target on a control chart with Nelson rules. */
function KpiChart({ card, year, onClose }: { card: KpiCard; year: number; onClose: () => void }) {
  const { t } = useTranslation();
  const prev = useQ<KpiCard[]>("/kpis/scorecard", { year: year - 1 });
  const now = new Date();
  const last = year === now.getFullYear() ? now.getMonth() : 11;
  const before = prev.data?.find((c) => c.id === card.id)?.months ?? [];
  const points = [
    ...before.map((m, i) => ({ period: `${year - 1}-${String(i + 1).padStart(2, "0")}`, ...m })),
    ...card.months.slice(0, last + 1).map((m, i) => ({ period: `${year}-${String(i + 1).padStart(2, "0")}`, ...m })),
  ];
  const first = points.findIndex((p) => p.actual !== null || p.target !== null);
  return (
    <Modal opened onClose={onClose} size="xl" title={card.name}>
      {!prev.data ? <Loading /> : (
        <Stack>
          <Text size="xs" c="dimmed">{[card.department, card.unit, card.higher_is_better ? `↑ ${t("kpi.higherBetter")}` : `↓ ${t("kpi.lowerBetter")}`].filter(Boolean).join(" · ")}</Text>
          <StatusLegend />
          <KpiControlChart points={first < 0 ? [] : points.slice(first)} higherIsBetter={card.higher_is_better} unit={card.unit} />
        </Stack>
      )}
    </Modal>
  );
}

type Num = number | string;
const num = (v: Num) => (v === "" ? null : Number(v));

/** Enter one month for every company KPI directly in the app (phone-friendly, no Excel). */
function MonthEntry({ cards, year, onClose }: { cards: KpiCard[]; year: number; onClose: () => void }) {
  const { t } = useTranslation();
  const now = new Date();
  const [month, setMonth] = useState<string>(String(year === now.getFullYear() ? now.getMonth() + 1 : 12));
  const m = Number(month) - 1;
  // Prefill: the stored value, or for the target the latest earlier target (targets rarely change month to month).
  const initial = (mi: number) => Object.fromEntries(cards.map((c) => {
    const prevTarget = [...c.months.slice(0, mi)].reverse().find((x) => x.target !== null)?.target ?? null;
    const cur = c.months[mi];
    return [c.id, { actual: cur?.actual ?? "", target: cur?.target ?? prevTarget ?? "" }];
  })) as Record<string, { actual: Num; target: Num }>;
  const [vals, setVals] = useState(() => initial(m));
  const get = (id: string) => vals[id] ?? { actual: "", target: "" };
  const set = (id: string, k: "actual" | "target", v: Num) => setVals({ ...vals, [id]: { ...get(id), [k]: v } });
  const save = useMut(() => put<{ changed: number }>("/kpis/scorecard/month", {
    period: `${year}-${String(m + 1).padStart(2, "0")}`,
    values: cards.map((c) => ({ id: c.id, actual: num(get(c.id).actual), target: num(get(c.id).target) })),
  }), { onDone: onClose });
  return (
    <Modal opened onClose={onClose} title={t("kpi.enterMonth")} size="lg">
      <Stack>
        <Select label={t("kpi.month")} data={MONTHS.map((n, i) => ({ value: String(i + 1), label: `${n} ${year}` }))} value={month}
          onChange={(v) => { if (v) { setMonth(v); setVals(initial(Number(v) - 1)); } }} allowDeselect={false} />
        {cards.map((c) => (
          <Card key={c.id} withBorder padding="xs">
            <Text fw={600} size="sm">{c.name} <Text span size="xs" c="dimmed">{[c.department, c.unit, c.higher_is_better ? "↑" : "↓"].filter(Boolean).join(" · ")}</Text></Text>
            <SimpleGrid cols={2} mt={4}>
              <NumberInput label={t("kpi.actual")} decimalScale={4} value={get(c.id).actual} onChange={(v) => set(c.id, "actual", v)} />
              <NumberInput label={t("kpi.target")} decimalScale={4} value={get(c.id).target} onChange={(v) => set(c.id, "target", v)} />
            </SimpleGrid>
          </Card>
        ))}
        <Group justify="flex-end"><Button variant="default" onClick={onClose}>{t("common.cancel")}</Button>
          <Button loading={save.isPending} onClick={() => save.mutate(undefined)}>{t("common.save")}</Button></Group>
      </Stack>
    </Modal>
  );
}

/** Company KPI scorecard (e.g. the management KPI sheet): target and actual per month, added and entered in the app or via Excel. */
function CompanyKPIs() {
  const { t } = useTranslation();
  const { can } = useSession();
  const [year, setYear] = useState<number | string>(new Date().getFullYear());
  const [file, setFile] = useState<File | null>(null);
  const [res, setRes] = useState<{ kpis: number; values: number; cleared: number; invalid: number; errors: { row: number; code: string | null; errors: string[] }[] } | null>(null);
  const cards = useQ<KpiCard[]>("/kpis/scorecard", { year: Number(year) });
  const fd = () => { const d = new FormData(); if (file) d.append("file", file); return d; };
  const preview = useMut(() => api<NonNullable<typeof res>>("POST", "/kpis/scorecard/preview", fd()), { success: false, onDone: setRes });
  const commit = useMut(() => api("POST", "/kpis/scorecard/commit", fd()), { onDone: () => { setFile(null); setRes(null); } });
  const remove = useMut((id: string) => api("DELETE", `/kpis/scorecard/${id}`));
  const defs = useQ<Def[]>("/kpis/definitions");
  const [entry, setEntry] = useState(false);
  const [form, setForm] = useState<KpiCard | "new" | null>(null);
  const [chart, setChart] = useState<KpiCard | null>(null);
  const cell = (c: KpiCard, a: number | null, tg: number | null) => {
    const s = status(c.higher_is_better, a, tg);
    return s ? { background: STATUS_COLOR[s].bg, color: STATUS_COLOR[s].fg } : undefined;
  };
  return (
    <Stack>
      <Text size="sm" c="dimmed">{t("kpi.manualHint")}</Text>
      <Group align="end" wrap="wrap">
        <NumberInput label={t("kpi.year")} w={110} min={2000} max={2100} value={year} onChange={setYear} />
        {can("kpi.manage") && <Button variant="light" leftSection={<IconPlus size={16} />} onClick={() => setForm("new")}>{t("kpi.addKpi")}</Button>}
        {can("kpi.manage") && <Button disabled={(cards.data ?? []).length === 0} title={(cards.data ?? []).length === 0 ? t("kpi.addFirst") : undefined} onClick={() => setEntry(true)}>{t("kpi.enterMonth")}</Button>}
        <Button variant="light" onClick={() => void download("/kpis/scorecard/template.xlsx", { year: Number(year) }, `kpi_scorecard_${year}.xlsx`)}>{t("kpi.downloadTemplate")}</Button>
      </Group>
      {can("kpi.manage") && (
        <Group align="end" wrap="wrap">
          <FileInput label={t("kpi.upload")} w={300} accept=".xlsx" clearable value={file} onChange={(f) => { setFile(f); setRes(null); }} />
          <Button disabled={!file} loading={preview.isPending} onClick={() => preview.mutate(undefined)}>{t("asset.preview")}</Button>
          <Button color="teal" disabled={!res || res.invalid > 0} loading={commit.isPending} onClick={() => commit.mutate(undefined)}>{t("asset.commit")}</Button>
        </Group>
      )}
      {res && (
        <Alert color={res.invalid ? "red" : "teal"}>
          {res.kpis} KPI · {res.values} {t("kpi.values")} · {res.cleared} {t("kpi.cleared")} · {res.invalid} {t("asset.invalid")}
          {res.errors.slice(0, 50).map((e, i) => <div key={i}>Row {e.row}: {e.errors.join("; ")}</div>)}
        </Alert>
      )}
      {form && <KpiForm card={form === "new" ? null : form} defs={defs.data ?? []} onClose={() => setForm(null)} />}
      {chart && <KpiChart card={chart} year={Number(year)} onClose={() => setChart(null)} />}
      {(cards.data ?? []).length > 0 && <StatusLegend />}
      {entry && cards.data && <MonthEntry cards={cards.data} year={Number(year)} onClose={() => setEntry(false)} />}
      {(cards.data ?? []).length === 0 ? <Text size="sm" c="dimmed">{can("kpi.manage") ? t("kpi.emptyManage") : t("common.noData")}</Text> : (
        <ScrollArea>
          <Table striped fz="sm" withColumnBorders>
            <Table.Thead><Table.Tr><Table.Th>KPI</Table.Th><Table.Th /><Table.Th>{t("kpi.ytd")}</Table.Th>{MONTHS.map((m) => <Table.Th key={m}>{m}</Table.Th>)}{can("kpi.manage") && <Table.Th />}</Table.Tr></Table.Thead>
            <Table.Tbody>{(cards.data ?? []).map((c) => {
              const ya = avg(c.months.map((m) => m.actual)), yt = avg(c.months.map((m) => m.target));
              return (
                <Table.Tr key={c.id}>
                  <Table.Td><Anchor component="button" fw={700} size="sm" ta="start" onClick={() => setChart(c)} title={t("kpi.openChart")}>{c.name}</Anchor>
                    <Text size="xs" c="dimmed">{[c.department, c.unit, c.higher_is_better ? "↑" : "↓"].filter(Boolean).join(" · ")}</Text></Table.Td>
                  <Table.Td><Text size="xs">{t("kpi.actual")}</Text><Text size="xs" c="dimmed">{t("kpi.target")}</Text></Table.Td>
                  <Table.Td style={cell(c, ya, yt)}><Text size="sm" fw={700} c="inherit">{ya === null ? "—" : fmtNum(ya)}</Text><Text size="xs" c="dimmed">{yt === null ? "—" : fmtNum(yt)}</Text></Table.Td>
                  {c.months.map((m, i) => (
                    <Table.Td key={i} style={cell(c, m.actual, m.target)}><Text size="sm" fw={600} c="inherit">{m.actual === null ? "—" : fmtNum(m.actual)}</Text>
                      <Text size="xs" c="dimmed">{m.target === null ? "" : fmtNum(m.target)}</Text></Table.Td>))}
                  {can("kpi.manage") && <Table.Td><Group gap={4} wrap="nowrap">
                    <Button size="compact-xs" variant="subtle" onClick={() => setForm(c)}>{t("common.edit")}</Button>
                    <Button size="compact-xs" variant="subtle" color="red" onClick={() => { if (window.confirm(t("kpi.deleteConfirm", { name: c.name }))) remove.mutate(c.id); }}>{t("common.delete")}</Button></Group></Table.Td>}
                </Table.Tr>);
            })}</Table.Tbody>
          </Table>
        </ScrollArea>
      )}
    </Stack>
  );
}

function KPIs() {
  const { t, i18n } = useTranslation();
  const { can } = useSession();
  const today = new Date().toISOString().slice(0, 10);
  const [start, setStart] = useState(`${today.slice(0, 7)}-01`);
  const [end, setEnd] = useState(today);
  // Public demo (instance label DEMO): open on the last six months of sample history instead of this month only.
  useEffect(() => {
    fetch("/api/v1/meta").then((r) => (r.ok ? r.json() : null)).then((m: { instance_label?: string } | null) => {
      if (!(m?.instance_label ?? "").trim().toUpperCase().startsWith("DEMO")) return;
      const monthStart = `${new Date().toISOString().slice(0, 7)}-01`;
      const sixMonths = new Date(Date.now() - 180 * 86400000).toISOString().slice(0, 10);
      setStart((s) => (s === monthStart ? sixMonths : s));
    }).catch(() => undefined);
  }, []);
  const [dept, setDept] = useState<string | null>(null);
  const [drill, setDrill] = useState<string | null>(null);
  const q = useQ<{ kpis: KPI[]; currency: string }>("/kpis", { start, end, department_id: dept });
  const defs = useQ<Def[]>("/kpis/definitions");
  const names = new Map((defs.data ?? []).map((d) => [d.code, d.name]));
  const [prod, setProd] = useState({ department_id: null as string | null, record_date: today, tons_produced: 0 as number | string, good_tons: "" as number | string, planned_production_hours: 24 as number | string, run_hours: "" as number | string, ideal_rate_tph: "" as number | string });
  const [bud, setBud] = useState({ department_id: null as string | null, year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)), amount: 0 as number | string });
  const n = (v: number | string) => (v === "" ? null : Number(v));
  const saveProd = useMut(() => put("/kpis/production", { ...prod, tons_produced: Number(prod.tons_produced), good_tons: n(prod.good_tons), planned_production_hours: n(prod.planned_production_hours), run_hours: n(prod.run_hours), ideal_rate_tph: n(prod.ideal_rate_tph) }));
  const saveBud = useMut(() => put("/kpis/budgets", { ...bud, amount: Number(bud.amount) }));
  const costDept = q.data?.kpis.find((k) => k.code === "cost_by_department")?.details.by_department as Record<string, number> | undefined;
  // Management presentation (PowerPoint) in the current interface language, for the selected period and department.
  const deck = useMut(() => download("/kpis/management-report.pptx", { start, end, department_id: dept, lang: i18n.language }), { success: false });
  return (
    <>
      <PageHeader title={t("kpi.title")} actions={<>
        {can("report.management") && <Button loading={deck.isPending} onClick={() => deck.mutate(undefined)}>{t("kpi.mgmtReport")}</Button>}
        {can("report.export") && <>
        <Button variant="default" onClick={() => void download("/exports/kpis.xlsx", { start, end, department_id: dept })}>{t("kpi.exportXlsx")}</Button>
        <Button variant="default" onClick={() => void download("/reports/kpis.pdf", { start, end })}>{t("kpi.exportPdf")}</Button></>}</>}>
        <Group align="end" wrap="wrap">
          <TextInput type="date" label={t("common.from")} value={start} onChange={(e) => setStart(e.currentTarget.value)} />
          <TextInput type="date" label={t("common.to")} value={end} onChange={(e) => setEnd(e.currentTarget.value)} />
          <DeptSelect value={dept} onChange={setDept} clearable />
        </Group>
      </PageHeader>
      <Alert color="blue" mb="md">{t("kpi.notice")}</Alert>
      <Tabs defaultValue="dash">
        <Tabs.List><Tabs.Tab value="dash">{t("nav.kpis")}</Tabs.Tab><Tabs.Tab value="manual">{t("kpi.manual")}</Tabs.Tab><Tabs.Tab value="fm">{t("fm.tab")}</Tabs.Tab>
          {can("kpi.manage") && <Tabs.Tab value="data">{t("kpi.production")} / {t("kpi.budget")}</Tabs.Tab>}</Tabs.List>
        <Tabs.Panel value="manual" pt="md"><CompanyKPIs /></Tabs.Panel>
        <Tabs.Panel value="fm" pt="md"><FailurePareto start={start} end={end} /></Tabs.Panel>
        <Tabs.Panel value="dash" pt="md">
          {!q.data ? <Loading /> : (
            <>
              <SimpleGrid cols={{ base: 2, sm: 3, lg: 5 }}>
                {q.data.kpis.map((k) => (
                  <Card key={k.code} withBorder padding="sm" style={{ cursor: "pointer" }} onClick={() => setDrill(k.code)} data-testid={`kpi-${k.code}`}>
                    <Text size="xs" c="dimmed" lineClamp={1}>{names.get(k.code) ?? k.code}</Text>
                    {k.available ? <Text fz={22} fw={700}>{fmtNum(k.value)} <Text span size="sm" c="dimmed">{k.unit}</Text></Text>
                      : <Text size="xs" c="orange" lineClamp={3} title={k.reason ?? ""}>{t("common.unavailable")}: {k.reason}</Text>}
                    {typeof k.details.note === "string" && <Text size="xs" c="dimmed" lineClamp={2} title={k.details.note}>ⓘ {k.details.note}</Text>}
                    {k.code === "backlog" && k.details.weeks !== undefined && k.details.weeks !== null && <Text size="xs" c="dimmed">≈ {String(k.details.weeks)} weeks</Text>}
                  </Card>))}
              </SimpleGrid>
              {costDept && Object.keys(costDept).length > 0 && (
                <Card withBorder mt="md"><Text fw={600} mb="xs">{names.get("cost_by_department")} ({q.data.currency})</Text>
                  <BarChart h={220} data={Object.entries(costDept).map(([d, v]) => ({ dept: d, cost: v }))} dataKey="dept" series={[{ name: "cost", color: "teal.6" }]} /></Card>
              )}
            </>
          )}
        </Tabs.Panel>
        <Tabs.Panel value="data" pt="md">
          <SimpleGrid cols={{ base: 1, md: 2 }}>
            <Card withBorder><Text fw={600} mb="sm">{t("kpi.production")}</Text><Stack>
              <DeptSelect value={prod.department_id} onChange={(v) => setProd({ ...prod, department_id: v })} />
              <TextInput type="date" label={t("common.date")} value={prod.record_date} onChange={(e) => setProd({ ...prod, record_date: e.currentTarget.value })} />
              <SimpleGrid cols={2}>
                <NumberInput label={t("kpi.tons")} min={0} value={prod.tons_produced} onChange={(v) => setProd({ ...prod, tons_produced: v })} />
                <NumberInput label={t("kpi.goodTons")} min={0} value={prod.good_tons} onChange={(v) => setProd({ ...prod, good_tons: v })} />
                <NumberInput label={t("kpi.plannedH")} min={0} max={24} value={prod.planned_production_hours} onChange={(v) => setProd({ ...prod, planned_production_hours: v })} />
                <NumberInput label={t("kpi.runH")} min={0} max={24} value={prod.run_hours} onChange={(v) => setProd({ ...prod, run_hours: v })} />
                <NumberInput label={t("kpi.ideal")} min={0} value={prod.ideal_rate_tph} onChange={(v) => setProd({ ...prod, ideal_rate_tph: v })} />
              </SimpleGrid>
              <Button disabled={!prod.department_id} onClick={() => saveProd.mutate(undefined)}>{t("common.save")}</Button></Stack></Card>
            <Card withBorder><Text fw={600} mb="sm">{t("kpi.budget")}</Text><Stack>
              <DeptSelect value={bud.department_id} onChange={(v) => setBud({ ...bud, department_id: v })} clearable label={`${t("common.department")} (${t("common.optional")})`} />
              <SimpleGrid cols={2}><NumberInput label="Year" value={bud.year} onChange={(v) => setBud({ ...bud, year: Number(v) })} />
                <NumberInput label="Month" min={1} max={12} value={bud.month} onChange={(v) => setBud({ ...bud, month: Number(v) })} /></SimpleGrid>
              <NumberInput label={t("common.cost")} min={0} value={bud.amount} onChange={(v) => setBud({ ...bud, amount: v })} />
              <Button onClick={() => saveBud.mutate(undefined)}>{t("common.save")}</Button></Stack></Card>
          </SimpleGrid>
        </Tabs.Panel>
      </Tabs>
      {drill && <Drill code={drill} start={start} end={end} dept={dept} onClose={() => setDrill(null)} />}
    </>
  );
}

export default function KPIPage() {
  return <Guard perm="kpi.view"><KPIs /></Guard>;
}
