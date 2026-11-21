"use client";

// Paper waste (trim loss), phase A: the waste already in the production reports, per paper machine and sheeter, by
// grade / sheet size, week, shift and supervisor, with the top causes and the worst days. A baseline, no optimisation.

import { BarChart } from "@mantine/charts";
import { Alert, Badge, Card, Group, Paper, Select, SimpleGrid, Stack, Text, TextInput, Title } from "@mantine/core";
import { IconInfoCircle } from "@tabler/icons-react";
import Link from "next/link";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Guard } from "@/components/AppFrame";
import { DataTable, Loading, PageHeader, Section } from "@/components/ui";
import { fmtDate, fmtNum, useQ } from "@/lib/hooks";
import { pct, type OpSettings } from "@/lib/ops";

interface PaperRow { reels: number; gross: number; saleable: number; trim: number; reject: number; downgrade: number; waste: number;
  trim_pct: number | null; reject_pct: number | null; waste_pct: number | null }
interface ConvRow { lines: number; produced: number; reject: number; downgrade: number; input: number | null; waste: number;
  waste_pct: number | null; downgrade_pct: number | null; changes: number }
interface Cause { kind: "trim" | "reject" | "downgrade"; cause: string | null; qty: number; pct: number | null }
interface Day { date: string; report_id: string; notes: string | null; waste_pct: number | null }
interface Base { id: string; code: string; name: string; unit: string; days: number; causes: Cause[]; gaps: string[] }
interface PaperBlock extends Base {
  kind: "paper"; deckle_m: number | null; totals: PaperRow;
  by_grade: (PaperRow & { grade: string | null; name: string | null; gsm: number; changes: number })[];
  by_week: (PaperRow & { week: string })[]; by_shift: (PaperRow & { shift: string })[]; by_supervisor: (PaperRow & { supervisor: string })[];
  worst_days: (Day & PaperRow)[];
}
interface ConvBlock extends Base {
  kind: "converting"; totals: ConvRow;
  by_product: (ConvRow & { product: string | null; name: string | null; size: string | null })[];
  by_week: (ConvRow & { week: string })[]; by_shift: (ConvRow & { shift: string })[]; worst_days: (Day & ConvRow)[];
}
interface TrimView { from: string; to: string; machines: (PaperBlock | ConvBlock)[] }

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <Paper withBorder p="sm" radius="md">
      <Text size="xs" c="dimmed">{label}</Text>
      <Text fw={700} size="lg" c={color} dir="ltr" ta="start">{value}</Text>
    </Paper>
  );
}

function Causes({ rows, unit }: { rows: Cause[]; unit: string }) {
  const { t } = useTranslation();
  return (
    <Section title={t("trim.causes")}>
      <DataTable rows={rows} empty={t("trim.noCauses")} rowKey={(r, i) => `${r.kind}-${r.cause}-${i}`} columns={[
        { key: "c", label: t("trim.cause"), render: (r: Cause) => r.kind === "trim" ? <b>{t("trim.trimCause")}</b> : r.cause },
        { key: "k", label: t("trim.kind"), render: (r: Cause) => <Badge variant="light" color={r.kind === "downgrade" ? "yellow" : r.kind === "trim" ? "grape" : "red"}>{t(`trim.kind_${r.kind}`)}</Badge> },
        { key: "q", label: unit, render: (r: Cause) => fmtNum(r.qty) },
        { key: "p", label: "%", render: (r: Cause) => pct(r.pct, 2) },
      ]} />
    </Section>
  );
}

function Gaps({ gaps }: { gaps: string[] }) {
  const { t } = useTranslation();
  if (!gaps.length) return null;
  return (
    <Alert color="gray" icon={<IconInfoCircle size={18} />} title={t("trim.gapsTitle")}>
      <Stack gap={2}>{gaps.map((g) => <Text key={g} size="sm">• {t(`trim.gap_${g}`)}</Text>)}</Stack>
    </Alert>
  );
}

function PaperView({ m }: { m: PaperBlock }) {
  const { t } = useTranslation();
  const tt = m.totals;
  const week = m.by_week.map((w) => ({ week: fmtDate(w.week).slice(5), trim: +((w.trim_pct ?? 0) * 100).toFixed(2), reject: +((w.reject_pct ?? 0) * 100).toFixed(2) }));
  const pctCols = <R extends PaperRow>() => [
    { key: "g", label: t("trim.gross"), render: (r: R) => fmtNum(r.gross, 1) },
    { key: "t", label: t("trim.trimPct"), render: (r: R) => pct(r.trim_pct, 2) },
    { key: "r", label: t("trim.rejectPct"), render: (r: R) => pct(r.reject_pct, 2) },
    { key: "w", label: t("trim.wastePct"), render: (r: R) => <b>{pct(r.waste_pct, 2)}</b> },
  ];
  return (
    <Stack>
      <SimpleGrid cols={{ base: 2, sm: 3, lg: 6 }}>
        <Stat label={t("trim.gross")} value={`${fmtNum(tt.gross, 1)} t`} />
        <Stat label={t("trim.reels")} value={fmtNum(tt.reels, 0)} />
        <Stat label={t("trim.trimPct")} value={pct(tt.trim_pct, 2)} color="grape.7" />
        <Stat label={t("trim.rejectPct")} value={pct(tt.reject_pct, 2)} color="red.7" />
        <Stat label={t("trim.wastePct")} value={pct(tt.waste_pct, 2)} color="orange.8" />
        <Stat label={t("trim.deckle")} value={m.deckle_m ? `${fmtNum(m.deckle_m, 3)} m` : "—"} />
      </SimpleGrid>
      {week.length > 0 && (
        <Card withBorder>
          <Text fw={600} mb="xs">{t("trim.byWeek")}</Text>
          <BarChart h={240} data={week} dataKey="week" type="stacked" unit="%"
            series={[{ name: "trim", label: t("trim.trimPct"), color: "grape.6" }, { name: "reject", label: t("trim.rejectPct"), color: "red.6" }]} withLegend />
        </Card>
      )}
      <Section title={t("trim.byGrade")}>
        <DataTable rows={m.by_grade} rowKey={(r, i) => `${r.grade ?? r.gsm}-${i}`} columns={[
          { key: "n", label: t("trim.grade"), render: (r) => <b>{r.grade ?? `${r.gsm} gsm`}</b> },
          { key: "s", label: "GSM", render: (r) => r.gsm },
          { key: "c", label: t("trim.reels"), render: (r) => r.reels },
          ...pctCols<PaperBlock["by_grade"][number]>(),
          { key: "x", label: t("trim.gradeChanges"), render: (r) => r.changes || "—" },
        ]} />
      </Section>
      <SimpleGrid cols={{ base: 1, xl: 2 }}>
        <Section title={t("trim.byShift")}>
          <DataTable rows={m.by_shift} rowKey={(r) => r.shift} columns={[{ key: "s", label: t("trim.shift"), render: (r) => <b>{r.shift}</b> }, ...pctCols<PaperBlock["by_shift"][number]>()]} />
        </Section>
        <Section title={t("trim.bySupervisor")}>
          <DataTable rows={m.by_supervisor} rowKey={(r) => r.supervisor} columns={[{ key: "s", label: t("trim.supervisor"), render: (r) => <b>{r.supervisor}</b> }, ...pctCols<PaperBlock["by_supervisor"][number]>()]} />
        </Section>
      </SimpleGrid>
      <SimpleGrid cols={{ base: 1, xl: 2 }}>
        <Causes rows={m.causes} unit="t" />
        <Worst rows={m.worst_days} />
      </SimpleGrid>
      <Gaps gaps={m.gaps} />
    </Stack>
  );
}

function Worst({ rows }: { rows: Day[] }) {
  const { t } = useTranslation();
  return (
    <Section title={t("trim.worstDays")}>
      <DataTable rows={rows} rowKey={(r) => r.report_id} columns={[
        { key: "d", label: t("trim.day"), render: (r: Day) => <Link href={`/operations/${r.report_id}`}>{fmtDate(r.date)}</Link> },
        { key: "w", label: t("trim.wastePct"), render: (r: Day) => <b>{pct(r.waste_pct, 2)}</b> },
        { key: "n", label: t("trim.notes"), render: (r: Day) => <Text size="sm" lineClamp={2}>{r.notes || "—"}</Text> },
      ]} />
    </Section>
  );
}

function ConvView({ m }: { m: ConvBlock }) {
  const { t } = useTranslation();
  const tt = m.totals;
  const week = m.by_week.map((w) => ({ week: fmtDate(w.week).slice(5), waste: +((w.waste_pct ?? 0) * 100).toFixed(2) }));
  const cols = <R extends ConvRow>() => [
    { key: "p", label: `${t("trim.produced")} (${m.unit})`, render: (r: R) => fmtNum(r.produced, 0) },
    { key: "r", label: t("trim.reject"), render: (r: R) => fmtNum(r.reject, 0) },
    { key: "w", label: t("trim.wastePct"), render: (r: R) => <b>{pct(r.waste_pct, 2)}</b> },
    { key: "c", label: t("trim.sizeChanges"), render: (r: R) => r.changes || "—" },
  ];
  return (
    <Stack>
      <SimpleGrid cols={{ base: 2, sm: 4 }}>
        <Stat label={`${t("trim.produced")} (${m.unit})`} value={fmtNum(tt.produced, 0)} />
        <Stat label={t("trim.reject")} value={fmtNum(tt.reject, 0)} />
        <Stat label={t("trim.wastePct")} value={pct(tt.waste_pct, 2)} color="orange.8" />
        <Stat label={t("trim.sizeChanges")} value={fmtNum(tt.changes, 0)} />
      </SimpleGrid>
      {week.length > 0 && (
        <Card withBorder>
          <Text fw={600} mb="xs">{t("trim.byWeek")}</Text>
          <BarChart h={220} data={week} dataKey="week" unit="%" series={[{ name: "waste", label: t("trim.wastePct"), color: "orange.6" }]} />
        </Card>
      )}
      <Section title={t("trim.bySize")}>
        <DataTable rows={m.by_product} rowKey={(r, i) => `${r.product}-${i}`} columns={[
          { key: "s", label: t("trim.size"), render: (r) => <b>{r.size ?? r.name ?? r.product ?? "—"}</b> },
          { key: "n", label: t("trim.product"), render: (r) => r.product ?? "—" },
          ...cols<ConvBlock["by_product"][number]>(),
        ]} />
      </Section>
      <SimpleGrid cols={{ base: 1, xl: 2 }}>
        <Section title={t("trim.byShift")}>
          <DataTable rows={m.by_shift} rowKey={(r) => r.shift} columns={[{ key: "s", label: t("trim.shift"), render: (r) => <b>{r.shift}</b> }, ...cols<ConvBlock["by_shift"][number]>()]} />
        </Section>
        <Causes rows={m.causes} unit={m.unit} />
      </SimpleGrid>
      <Worst rows={m.worst_days} />
      <Gaps gaps={m.gaps} />
    </Stack>
  );
}

function View() {
  const { t } = useTranslation();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [line, setLine] = useState<string | null>(null);
  const lines = useQ<OpSettings>("/operations/settings").data?.machines ?? [];
  const q = useQ<TrimView>("/operations/trim-loss", { ...(from ? { from } : {}), ...(to ? { to } : {}), ...(line ? { machine_id: line } : {}) });
  return (
    <>
      <PageHeader title={t("trim.title")}><Text size="sm" c="dimmed">{t("trim.hint")}</Text></PageHeader>
      <Group mb="md" align="end" wrap="wrap">
        <TextInput type="date" label={t("trim.from")} value={from || q.data?.from || ""} onChange={(e) => setFrom(e.currentTarget.value)} />
        <TextInput type="date" label={t("trim.to")} value={to || q.data?.to || ""} onChange={(e) => setTo(e.currentTarget.value)} />
        <Select label={t("kpi2.line")} clearable placeholder={t("trim.allLines")} w={260} value={line} onChange={setLine}
          data={lines.filter((m) => m.report_profile === "paper_machine" || m.production_model === "discrete").map((m) => ({ value: m.id, label: `${m.code} – ${m.name}` }))} />
      </Group>
      {!q.data ? <Loading /> : q.data.machines.length === 0 ? <Alert color="gray">{t("trim.none")}</Alert> : (
        <Stack gap="xl">
          {q.data.machines.map((m) => (
            <Stack key={m.id} gap="sm">
              <Group gap="xs">
                <Title order={4}>{m.code} · {m.name}</Title>
                <Badge variant="light">{t(m.kind === "paper" ? "trim.paperMachine" : "trim.sheeter")}</Badge>
                <Text size="sm" c="dimmed">{t("trim.days", { n: m.days })}</Text>
              </Group>
              {m.kind === "paper" ? <PaperView m={m} /> : <ConvView m={m} />}
            </Stack>
          ))}
        </Stack>
      )}
    </>
  );
}

export default function Page() {
  return <Guard perm="op.view"><View /></Guard>;
}
