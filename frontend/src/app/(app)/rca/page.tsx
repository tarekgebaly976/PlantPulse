"use client";

import { Badge, Button, Checkbox, Group, Modal, MultiSelect, NumberInput, Paper, SegmentedControl, SimpleGrid, Stack, Switch, Text, TextInput } from "@mantine/core";
import { IconDownload, IconSettings } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Guard } from "@/components/AppFrame";
import { ReasonBadges, RequestRca, type Reason } from "@/components/Rca";
import { DataTable, PageHeader, Pager, StatusBadge } from "@/components/ui";
import { download, put } from "@/lib/api";
import { fmtDate, fmtNum, useMut, useQ } from "@/lib/hooks";
import { useSession } from "@/lib/session";
import { SearchBox, useSearch } from "@/components/Search";
import type { FailureCode, Page } from "@/lib/types";

export interface RcaRow {
  id: string; number: string; title: string; status: string; source: string;
  asset: { id: string; code: string; name: string; criticality: string } | null;
  failure_mode: { id: string; code: string; description: string } | null;
  leader: string | null; due_date: string | null; created_at: string; closed_at: string | null; effectiveness_due: string | null;
  trigger_reasons: Reason[]; work_orders: number; downtime_hours: number; actions_total: number; actions_done: number; actions_overdue: number;
  overdue: boolean; recurrence_count: number;
}
interface Stats { opened: number; closed: number; avg_days_to_close: number | null; open_now: number; candidates_now: number; overdue_analyses: number; actions_open: number; actions_overdue: number; recurrence_pct: number | null }
export interface Rules {
  enabled: boolean; auto_open: boolean; wo_types: string[]; downtime_hours: { A: number | null; B: number | null; C: number | null };
  repeat_enabled: boolean; repeat_count: number; repeat_days: number; failure_mode_ids: string[]; production_loss_tons: number | null; cost: number | null;
  safety_event: boolean; analysis_days: number; effectiveness_days: number;
}

const WO_TYPES = ["corrective", "emergency", "inspection", "predictive", "preventive", "improvement", "shutdown"];

function Stat({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <Paper withBorder p="sm" radius="md">
      <Text size="xs" c="dimmed">{label}</Text>
      <Text fw={700} size="xl" c={color}>{value}</Text>
    </Paper>
  );
}

function RulesModal({ opened, onClose }: { opened: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const { plant } = useSession();
  const q = useQ<Rules>(opened ? "/rca/rules" : null);
  const codes = useQ<FailureCode[]>(opened ? "/failure-codes" : null);
  const [f, setF] = useState<Rules | null>(null);
  const [seeded, setSeeded] = useState<Rules | undefined>(undefined);
  if (q.data && q.data !== seeded) { setSeeded(q.data); setF(q.data); }
  const save = useMut(() => put<Rules>("/rca/rules", f), { onDone: onClose });
  const num = (v: number | string) => (v === "" || v === null ? null : Number(v));
  const set = (p: Partial<Rules>) => f && setF({ ...f, ...p });
  return (
    <Modal opened={opened} onClose={onClose} title={t("rca.rules.title")} size="lg">
      {!f ? null : (
        <Stack>
          <Text size="sm" c="dimmed">{t("rca.rules.hint")}</Text>
          <Switch label={t("rca.rules.enabled")} checked={f.enabled} onChange={(e) => set({ enabled: e.currentTarget.checked })} />
          <MultiSelect label={t("rca.rules.woTypes")} data={WO_TYPES.map((w) => ({ value: w, label: t(`woType.${w}`) }))} value={f.wo_types} onChange={(v) => set({ wo_types: v })} />
          <div>
            <Text size="sm" fw={500}>{t("rca.rules.downtime")}</Text>
            <Text size="xs" c="dimmed" mb={4}>{t("rca.rules.downtimeHint")}</Text>
            <SimpleGrid cols={3}>
              {(["A", "B", "C"] as const).map((c) => (
                <NumberInput key={c} label={t("rca.rules.crit", { c })} min={0} step={0.5} placeholder={t("rca.rules.off")} value={f.downtime_hours[c] ?? ""}
                  onChange={(v) => set({ downtime_hours: { ...f.downtime_hours, [c]: num(v) } })} />
              ))}
            </SimpleGrid>
          </div>
          <div>
            <Checkbox label={t("rca.rules.repeat")} checked={f.repeat_enabled} onChange={(e) => set({ repeat_enabled: e.currentTarget.checked })} mb={4} />
            <SimpleGrid cols={2}>
              <NumberInput label={t("rca.rules.repeatCount")} min={2} max={20} value={f.repeat_count} disabled={!f.repeat_enabled} onChange={(v) => set({ repeat_count: Number(v) || 2 })} />
              <NumberInput label={t("rca.rules.repeatDays")} min={1} max={730} value={f.repeat_days} disabled={!f.repeat_enabled} onChange={(v) => set({ repeat_days: Number(v) || 30 })} />
            </SimpleGrid>
          </div>
          <MultiSelect label={t("rca.rules.modes")} searchable clearable value={f.failure_mode_ids} onChange={(v) => set({ failure_mode_ids: v })}
            data={(codes.data ?? []).filter((c) => c.kind === "problem").map((c) => ({ value: c.id, label: `${c.code} — ${c.description}${c.equipment_type ? ` (${c.equipment_type})` : ""}` }))} />
          <SimpleGrid cols={2}>
            <NumberInput label={t("rca.rules.loss")} min={0} placeholder={t("rca.rules.off")} value={f.production_loss_tons ?? ""} onChange={(v) => set({ production_loss_tons: num(v) })} />
            <NumberInput label={`${t("rca.rules.cost")} (${plant?.currency ?? ""})`} min={0} placeholder={t("rca.rules.off")} value={f.cost ?? ""} onChange={(v) => set({ cost: num(v) })} />
          </SimpleGrid>
          <Checkbox label={t("rca.rules.safety")} checked={f.safety_event} onChange={(e) => set({ safety_event: e.currentTarget.checked })} />
          <SimpleGrid cols={2}>
            <NumberInput label={t("rca.rules.analysisDays")} min={1} max={180} value={f.analysis_days} onChange={(v) => set({ analysis_days: Number(v) || 7 })} />
            <NumberInput label={t("rca.rules.effDays")} min={0} max={730} value={f.effectiveness_days} onChange={(v) => set({ effectiveness_days: Number(v) || 0 })} />
          </SimpleGrid>
          <Text size="xs" c="dimmed">{t("rca.rules.effHint")}</Text>
          <Switch label={t("rca.rules.autoOpen")} checked={f.auto_open} onChange={(e) => set({ auto_open: e.currentTarget.checked })} />
          <Button loading={save.isPending} disabled={!f.wo_types.length} onClick={() => save.mutate(undefined)}>{t("common.save")}</Button>
        </Stack>
      )}
    </Modal>
  );
}

function List() {
  const { t } = useTranslation();
  const router = useRouter();
  const { can, plant } = useSession();
  const [status, setStatus] = useState("active");
  const [mine, setMine] = useState(false);
  const [search, setSearch, dsearch] = useSearch();
  const [page, setPage] = useState(0);
  const [rules, setRules] = useState(false);
  const query = { status: status === "all" ? undefined : status, mine, q: dsearch || undefined, limit: 50, offset: page * 50 };
  const q = useQ<Page<RcaRow>>("/rca", query);
  const st = useQ<Stats>("/rca/stats");
  const s = st.data;
  return (
    <>
      <PageHeader title={t("rca.title")} actions={<>
        {can("rca.edit") && <RequestRca />}
        <Button variant="default" leftSection={<IconDownload size={16} />} onClick={() => void download("/rca/export.xlsx", { status: status === "all" ? undefined : status }, "rca-register.xlsx")}>{t("common.export")}</Button>
        {can("rca.settings") && <Button variant="default" leftSection={<IconSettings size={16} />} onClick={() => setRules(true)}>{t("rca.rules.button")}</Button>}
      </>}>
        <Text size="sm" c="dimmed">{t("rca.flow.steps")}</Text>
      </PageHeader>
      <RulesModal opened={rules} onClose={() => setRules(false)} />
      {s && (
        <SimpleGrid cols={{ base: 2, sm: 4, lg: 7 }} mb="md">
          <Stat label={t("rca.stats.candidates")} value={s.candidates_now} color={s.candidates_now ? "yellow.8" : undefined} />
          <Stat label={t("rca.stats.openNow")} value={s.open_now - s.candidates_now} />
          <Stat label={t("rca.stats.overdue")} value={s.overdue_analyses} color={s.overdue_analyses ? "red" : undefined} />
          <Stat label={t("rca.stats.actionsOverdue")} value={`${s.actions_overdue} / ${s.actions_open}`} color={s.actions_overdue ? "red" : undefined} />
          <Stat label={t("rca.stats.closed")} value={s.closed} />
          <Stat label={t("rca.stats.avgDays")} value={fmtNum(s.avg_days_to_close, 1)} />
          <Stat label={t("rca.stats.recurrence")} value={s.recurrence_pct === null ? "—" : `${fmtNum(s.recurrence_pct, 1)}%`} />
        </SimpleGrid>
      )}
      <Group mb="sm" gap="sm" wrap="wrap">
        <SegmentedControl value={status} onChange={(v) => { setStatus(v); setPage(0); }} data={[
          { value: "active", label: `${t("rca.filters.candidate")} + ${t("rca.filters.open")}` },
          { value: "candidate", label: t("rca.filters.candidate") }, { value: "open", label: t("rca.filters.open") },
          { value: "closed", label: t("rca.filters.closed") }, { value: "all", label: t("rca.filters.all") }]} />
        <SearchBox value={search} onChange={(v) => { setSearch(v); setPage(0); }} w={240} />
        <Checkbox label={t("rca.filters.mine")} checked={mine} onChange={(e) => { setMine(e.currentTarget.checked); setPage(0); }} />
      </Group>
      <DataTable rows={q.data?.items} onRow={(r) => router.push(`/rca/${r.id}`)} columns={[
        { key: "n", label: t("rca.cols.number"), render: (r) => <><span className="nowrap">{r.number}</span>{r.recurrence_count > 0 && <Badge ms={6} size="xs" color="red">↻ {r.recurrence_count}</Badge>}</> },
        { key: "t", label: t("common.description"), render: (r) => <Stack gap={2}><Text size="sm">{r.title}</Text><ReasonBadges reasons={r.trigger_reasons} /></Stack> },
        { key: "a", label: t("common.asset"), render: (r) => r.asset ? <>{r.asset.code} <StatusBadge value={r.asset.criticality} size="xs" /></> : "—" },
        { key: "f", label: t("rca.cols.failureMode"), render: (r) => r.failure_mode ? `${r.failure_mode.code} ${r.failure_mode.description}` : "—", hideOnMobile: true },
        { key: "d", label: t("rca.cols.downtime"), render: (r) => fmtNum(r.downtime_hours), hideOnMobile: true },
        { key: "l", label: t("rca.cols.leader"), render: (r) => r.leader ?? "—" },
        { key: "due", label: t("rca.cols.due"), render: (r) => <Text size="sm" c={r.overdue ? "red" : undefined} fw={r.overdue ? 700 : undefined}>{r.due_date ?? "—"}</Text> },
        { key: "ac", label: t("rca.cols.actions"), render: (r) => r.actions_total ? <Text size="sm" c={r.actions_overdue ? "red" : undefined}>{r.actions_done} / {r.actions_total}</Text> : "—" },
        { key: "s", label: t("common.status"), render: (r) => <StatusBadge value={r.status} /> },
        { key: "c", label: t("common.createdAt"), render: (r) => fmtDate(r.created_at, plant?.timezone), hideOnMobile: true },
      ]} />
      <Pager page={q.data} setPage={(p) => setPage(p - 1)} />
    </>
  );
}

export default function RcaPage() {
  return <Guard perm="rca.view"><List /></Guard>;
}
