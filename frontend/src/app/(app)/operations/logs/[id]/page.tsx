"use client";

import { ActionIcon, Alert, Badge, Button, Checkbox, Group, NumberInput, Paper, Stack, Switch, Table, Text, Textarea, TextInput, Tooltip } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { IconAlertTriangle, IconChevronLeft, IconChevronRight, IconLock, IconPlus, IconPrinter, IconTrash } from "@tabler/icons-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Guard } from "@/components/AppFrame";
import { BackLink } from "@/components/Ops";
import { Modal } from "@/components/Modal";
import { AssetPicker, ConfirmButton, Loading, PageHeader, StatusBadge } from "@/components/ui";
import { del, post, put } from "@/lib/api";
import { fmtDate, useMut, useQ } from "@/lib/hooks";
import { fmtVal, hm, type LogDetail, type LogField, type LogValue } from "@/lib/ops";
import { useSession } from "@/lib/session";

type Draft = Record<string, { opening: number | string; closing: number | string; value: number | string | boolean; text: string }>;
const n = (v: number | string | boolean | null | undefined): number | null => (v === "" || v === null || v === undefined ? null : Number(v));

function initial(d: LogDetail): Draft {
  const out: Draft = {};
  for (const f of d.fields) {
    const v = d.values[f.id];
    out[f.id] = {
      opening: v?.opening ?? "", closing: v?.closing ?? "",
      value: f.kind === "check" ? v?.value === 1 : v?.value ?? "", text: v?.text ?? "",
    };
  }
  return out;
}

function RaiseRequest({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const [asset, setAsset] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [shutdown, setShutdown] = useState(false);
  const [breakdown, setBreakdown] = useState(false);
  const save = useMut(() => post<{ number: string }>("/work-requests", {
    asset_id: asset, title: `${shutdown ? "[Shutdown] " : ""}${title.trim()}`.slice(0, 200), description: desc || null, is_breakdown: breakdown,
  }), { onDone: onClose });
  return (
    <Modal opened onClose={onClose} title={t("logs.raise")}>
      <Stack>
        <AssetPicker required value={asset} onChange={setAsset} />
        <TextInput label={t("logs.issue")} required value={title} onChange={(e) => setTitle(e.currentTarget.value)} />
        <Textarea label={t("common.details")} autosize minRows={2} value={desc} onChange={(e) => setDesc(e.currentTarget.value)} />
        <Checkbox label={t("logs.needsShutdown")} checked={shutdown} onChange={(e) => setShutdown(e.currentTarget.checked)} />
        <Checkbox label={t("logs.stopped")} checked={breakdown} onChange={(e) => setBreakdown(e.currentTarget.checked)} />
        <Button loading={save.isPending} disabled={!asset || title.trim().length < 3} onClick={() => save.mutate(undefined)}>{t("common.save")}</Button>
      </Stack>
    </Modal>
  );
}

function FieldRow({ f, v, d, ed, set }: { f: LogField; v: LogValue | undefined; d: Draft[string]; ed: boolean; set: (p: Partial<Draft[string]>) => void }) {
  const { t } = useTranslation();
  const flagged = v?.flag ? <Badge size="xs" color="red" variant="light" ms={4}>{t(`logs.flag.${v.flag}`)}</Badge> : null;
  const limits = f.kind !== "check" && (f.low !== null || f.high !== null) ? <Text span size="xs" c="dimmed">{f.low ?? "…"}–{f.high ?? "…"}</Text> : null;
  const label = <Stack gap={0}><Text size="sm">{f.label}</Text>{f.kind === "calc" && <Text size="xs" c="dimmed" className="mono">= {f.formula}</Text>}
    {f.kind === "counter" && f.meter_id && <Tooltip label={t("logs.toMeter")} multiline w={260}><Badge size="xs" variant="light" color="gray" w="fit-content">{t("logs.toMeterShort")}</Badge></Tooltip>}</Stack>;
  const numInput = (key: "opening" | "closing" | "value", aria: string) => ed ? (
    <NumberInput size="xs" w={130} hideControls decimalScale={3} aria-label={`${f.label} ${aria}`}
      value={d[key] as number | string} onChange={(x) => set({ [key]: x })} />
  ) : <Text size="sm">{fmtVal(n(d[key] as number | string), key === "value" ? f.decimals : 1)}</Text>;
  let cells;
  if (f.kind === "meter" || f.kind === "counter") {
    cells = <><Table.Td>{numInput("opening", t("logs.opening"))}</Table.Td><Table.Td>{numInput("closing", t("logs.closing"))}</Table.Td>
      <Table.Td fw={600}>{fmtVal(v?.value, f.decimals)}{flagged}</Table.Td></>;
  } else if (f.kind === "number") {
    cells = <><Table.Td colSpan={2} /><Table.Td>{numInput("value", "")}{flagged}</Table.Td></>;
  } else if (f.kind === "check") {
    cells = <><Table.Td colSpan={2} /><Table.Td><Group gap={4}><Checkbox aria-label={f.label} readOnly={!ed} checked={!!d.value} onChange={(e) => set({ value: e.currentTarget.checked })} />{flagged}</Group></Table.Td></>;
  } else if (f.kind === "text") {
    cells = <Table.Td colSpan={3}>{ed ? <TextInput size="xs" aria-label={f.label} value={d.text} onChange={(e) => set({ text: e.currentTarget.value })} /> : <Text size="sm">{d.text || "—"}</Text>}</Table.Td>;
  } else {
    cells = <><Table.Td colSpan={2} /><Table.Td fw={700}>{fmtVal(v?.value, f.decimals)}{flagged}</Table.Td></>;
  }
  return <Table.Tr bg={v?.flag ? "var(--mantine-color-red-light)" : undefined}><Table.Td>{label}</Table.Td>{cells}<Table.Td>{f.unit ?? ""}</Table.Td><Table.Td>{limits}</Table.Td></Table.Tr>;
}

/** Phone layout: one line per row, label on top and full-width inputs, so nothing hides off the right edge. */
function FieldCard({ f, v, d, ed, set }: { f: LogField; v: LogValue | undefined; d: Draft[string]; ed: boolean; set: (p: Partial<Draft[string]>) => void }) {
  const { t } = useTranslation();
  const flagged = v?.flag ? <Badge size="sm" color="red" variant="light">{t(`logs.flag.${v.flag}`)}</Badge> : null;
  const unit = f.unit ? <Text span size="sm" c="dimmed">{f.unit}</Text> : null;
  const limits = f.kind !== "check" && (f.low !== null || f.high !== null) ? <Text size="xs" c="dimmed">{t("logs.set.limits")}: {f.low ?? "…"}–{f.high ?? "…"}</Text> : null;
  const box = (key: "opening" | "closing" | "value", label: string) => ed ? (
    <NumberInput size="md" hideControls decimalScale={3} inputMode="decimal" label={label} aria-label={`${f.label} ${label}`}
      value={d[key] as number | string} onChange={(x) => set({ [key]: x })} rightSection={key === "value" ? unit : undefined} rightSectionWidth={f.unit ? 56 : undefined} />
  ) : <Stack gap={0}><Text size="xs" c="dimmed">{label}</Text><Text>{fmtVal(n(d[key] as number | string), key === "value" ? f.decimals : 1)}</Text></Stack>;
  // meters: the day value while typing (the server's figure after saving)
  const o = n(d.opening as number | string), c = n(d.closing as number | string);
  const diff = (f.kind === "meter" || f.kind === "counter") && o !== null && c !== null ? c - o : v?.value ?? null;
  return (
    <Stack gap={6} py="sm" px="xs" style={{ borderBottom: "1px solid var(--mantine-color-default-border)", background: v?.flag ? "var(--mantine-color-red-light)" : undefined, borderRadius: 4 }}>
      <Group justify="space-between" wrap="nowrap" align="flex-start">
        <Stack gap={0}>
          <Text fw={500}>{f.label}</Text>
          {f.kind === "calc" && <Text size="xs" c="dimmed" className="mono">= {f.formula}</Text>}
          {f.kind === "counter" && f.meter_id && <Badge size="xs" variant="light" color="gray" w="fit-content">{t("logs.toMeterShort")}</Badge>}
        </Stack>
        {flagged}
      </Group>
      {(f.kind === "meter" || f.kind === "counter") && <>
        <Group grow gap="xs" align="flex-end">{box("opening", t("logs.opening"))}{box("closing", t("logs.closing"))}</Group>
        <Text size="sm">{t("logs.value")}: <b>{fmtVal(diff, f.decimals)}</b> {unit}</Text>
      </>}
      {f.kind === "number" && box("value", t("logs.value"))}
      {f.kind === "check" && <Switch size="md" label={d.value ? t("common.yes") : t("common.no")} readOnly={!ed} checked={!!d.value} onChange={(e) => ed && set({ value: e.currentTarget.checked })} />}
      {f.kind === "text" && (ed ? <Textarea autosize minRows={1} size="md" aria-label={f.label} value={d.text} onChange={(e) => set({ text: e.currentTarget.value })} /> : <Text>{d.text || "—"}</Text>)}
      {f.kind === "calc" && <Text size="lg" fw={700}>{fmtVal(v?.value, f.decimals)} {unit}</Text>}
      {limits}
    </Stack>
  );
}

function LogView() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const router = useRouter();
  const { can, plant } = useSession();
  const tz = plant?.timezone;
  const q = useQ<LogDetail>(`/operations/logs/${id}`);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [notes, setNotes] = useState<string | null>(null);
  const [seen, setSeen] = useState<LogDetail | undefined>(undefined);
  const [raise, setRaise] = useState(false);
  const [reopen, setReopen] = useState(false);
  const [note, setNote] = useState("");
  const phone = useMediaQuery("(max-width: 48em)");
  if (q.data && q.data !== seen) { setSeen(q.data); setDraft(initial(q.data)); setNotes(q.data.notes ?? ""); }
  const save = useMut(() => {
    const d = q.data!;
    return put(`/operations/logs/${id}/values`, {
      notes,
      values: d.fields.filter((f) => f.kind !== "calc").map((f) => {
        const x = draft![f.id]!;
        return f.kind === "meter" || f.kind === "counter" ? { field_id: f.id, opening: n(x.opening), closing: n(x.closing) }
          : f.kind === "text" ? { field_id: f.id, text: x.text } : f.kind === "check" ? { field_id: f.id, value: x.value ? 1 : 0 } : { field_id: f.id, value: n(x.value) };
      }),
    });
  });
  const act = useMut((a: string) => post(`/operations/logs/${id}/${a}`));
  const doReopen = useMut(() => post(`/operations/logs/${id}/reopen`, { note }), { onDone: () => { setReopen(false); setNote(""); } });
  const remove = useMut(() => del(`/operations/logs/${id}`), { onDone: () => router.push("/operations/logs") });
  const d = q.data;
  if (!d || !draft) return <Loading />;
  const ed = d.can_edit;
  const sections: [string, LogField[]][] = [];
  for (const f of d.fields) {
    const last = sections[sections.length - 1];
    if (last && last[0] === f.section) last[1].push(f); else sections.push([f.section, [f]]);
  }
  const shiftName = d.template.shifts.find((s) => s.code === d.shift)?.name;
  const go = (x: { id: string } | null) => x && router.push(`/operations/logs/${x.id}`);
  return (
    <>
      {d.pm_report_id ? <BackLink href={`/operations/${d.pm_report_id}`} label={t("ops.report.title")} />
        : <BackLink href={d.template.in_pm_report ? `/operations/logs?form=${d.template.id}` : "/operations/logs"} label={d.template.in_pm_report ? d.template.name : t("logs.title")} />}
      <PageHeader title={`${d.template.name} · ${d.log_date}${shiftName ? ` · ${shiftName}` : ""}`} actions={<>
        <Button variant="default" leftSection={<IconPrinter size={16} />} onClick={() => window.print()} className="no-print">{t("ops.report.print")}</Button>
        {ed && <Button loading={save.isPending} onClick={() => save.mutate(undefined)} className="no-print">{t("common.save")}</Button>}
        {d.status === "draft" && !d.in_progress && can("op.enter") && <ConfirmButton color="blue" loading={act.isPending} onConfirm={() => act.mutate("submit")}>{t("ops.report.submit")}</ConfirmButton>}
        {d.status !== "confirmed" && !d.in_progress && can("op.confirm") && <ConfirmButton color="teal" loading={act.isPending} onConfirm={() => act.mutate("confirm")}>{t("ops.report.confirm")}</ConfirmButton>}
        {d.status !== "draft" && can("op.confirm") && <Button variant="light" color="orange" onClick={() => setReopen(true)} className="no-print">{t("ops.report.reopen")}</Button>}
        {d.status === "draft" && can("op.confirm") && <ActionIcon variant="subtle" color="red" size="lg" aria-label={t("ops.report.delete")} className="no-print"
          onClick={() => { if (window.confirm(t("ops.report.deleteConfirm"))) remove.mutate(undefined); }}><IconTrash size={18} /></ActionIcon>}
      </>}>
        <Group gap="xs">
          <Button variant="default" size="compact-sm" disabled={!d.prev} leftSection={<IconChevronLeft size={14} />} onClick={() => go(d.prev)}>{t("ops.prev")}</Button>
          <Button variant="default" size="compact-sm" disabled={!d.next} rightSection={<IconChevronRight size={14} />} onClick={() => go(d.next)}>{t("ops.next")}</Button>
          <StatusBadge value={d.status} />
          {d.revision > 1 && <Badge variant="outline" color="gray">{t("ops.report.revision", { n: d.revision })}</Badge>}
          <Text size="sm" c="dimmed">{hm(d.window.start, tz)}–{hm(d.window.end, tz)}</Text>
          {d.submitted_by && <Text size="sm" c="dimmed">· {t("ops.report.submittedBy", { who: d.submitted_by })}</Text>}
          {d.confirmed_by && <Text size="sm" c="dimmed">· {t("ops.report.confirmedBy", { who: d.confirmed_by })}</Text>}
        </Group>
      </PageHeader>
      <Stack>
        {d.status === "submitted" && <Alert color="blue" icon={<IconLock />}>{t("ops.report.readOnlySubmitted")}</Alert>}
        {d.status === "confirmed" && <Alert color="teal" icon={<IconLock />}>{t("ops.report.readOnlyConfirmed")}</Alert>}
        {d.reopen_note && d.status === "draft" && <Alert color="orange">{t("ops.report.reopened", { note: d.reopen_note })}</Alert>}
        {d.in_progress && <Alert color="gray">{t("logs.inProgress")}</Alert>}
        {d.warnings.length > 0 && !d.in_progress && (
          <Alert color="orange" icon={<IconAlertTriangle />} title={t("ops.warn.title")}>
            <Stack gap={2}>{d.warnings.map((w, i) => <Text key={i} size="sm">{t(`logs.warn.${w.code}`, { item: w.item })}</Text>)}</Stack>
          </Alert>
        )}
        {ed && <Text size="xs" c="dimmed">{t("logs.hint")}</Text>}
        <Stack>
          {sections.map(([name, fields]) => (
            <Paper key={name} withBorder p={phone ? "xs" : "md"} radius="md">
              <Text fw={600} mb="xs" px={phone ? "xs" : 0}>{name}</Text>
              {phone ? fields.map((f) => <FieldCard key={f.id} f={f} v={d.values[f.id]} d={draft[f.id]!} ed={ed}
                set={(p) => setDraft({ ...draft, [f.id]: { ...draft[f.id]!, ...p } })} />) :
              <Table.ScrollContainer minWidth={640}>
                <Table verticalSpacing={4} layout="fixed">
                  {fields.some((f) => f.kind === "meter" || f.kind === "counter") && (
                    <Table.Thead><Table.Tr><Table.Th /><Table.Th>{t("logs.opening")}</Table.Th><Table.Th>{t("logs.closing")}</Table.Th><Table.Th>{t("logs.value")}</Table.Th><Table.Th /><Table.Th /></Table.Tr></Table.Thead>
                  )}
                  <Table.Tbody>
                    {fields.map((f) => <FieldRow key={f.id} f={f} v={d.values[f.id]} d={draft[f.id]!} ed={ed}
                      set={(p) => setDraft({ ...draft, [f.id]: { ...draft[f.id]!, ...p } })} />)}
                  </Table.Tbody>
                </Table>
              </Table.ScrollContainer>}
            </Paper>
          ))}
        </Stack>
        <Textarea label={t("ops.util.notes")} autosize minRows={2} disabled={!ed} value={notes ?? ""} onChange={(e) => setNotes(e.currentTarget.value)} />
        {ed && !phone && <Group><Button loading={save.isPending} onClick={() => save.mutate(undefined)}>{t("common.save")}</Button></Group>}
        {ed && phone && <Group gap="xs" className="pp-actions"><Button size="md" loading={save.isPending} onClick={() => save.mutate(undefined)}>{t("common.save")}</Button></Group>}
        {d.issues && (
          <Paper withBorder p="md" radius="md">
            <Group justify="space-between" mb="xs">
              <Text fw={600}>{t("logs.issues")}</Text>
              {can("request.create") && <Button size="xs" leftSection={<IconPlus size={14} />} onClick={() => setRaise(true)} className="no-print">{t("logs.raise")}</Button>}
            </Group>
            <Text size="xs" c="dimmed" mb="xs">{t("logs.issuesHint")}</Text>
            <Table striped>
              <Table.Thead><Table.Tr><Table.Th>#</Table.Th><Table.Th>{t("common.asset")}</Table.Th><Table.Th>{t("logs.issue")}</Table.Th><Table.Th>{t("common.status")}</Table.Th><Table.Th>{t("common.createdAt")}</Table.Th></Table.Tr></Table.Thead>
              <Table.Tbody>
                {d.issues.requests.map((r) => (
                  <Table.Tr key={r.id} style={{ cursor: "pointer" }} onClick={() => router.push(`/requests/${r.id}`)}>
                    <Table.Td className="mono">{r.number}</Table.Td><Table.Td>{r.asset}</Table.Td>
                    <Table.Td>{r.title.startsWith("[Shutdown]") && <Badge size="xs" color="grape" variant="light" me={4}>{t("logs.shutdown")}</Badge>}{r.title.replace("[Shutdown] ", "")}</Table.Td>
                    <Table.Td><StatusBadge value="submitted" /></Table.Td><Table.Td>{fmtDate(r.created_at, tz)}</Table.Td>
                  </Table.Tr>
                ))}
                {d.issues.work_orders.map((w) => (
                  <Table.Tr key={w.id} style={{ cursor: "pointer" }} onClick={() => router.push(`/work-orders/${w.id}`)}>
                    <Table.Td className="mono">{w.number}</Table.Td><Table.Td>{w.asset}</Table.Td>
                    <Table.Td>{w.title.startsWith("[Shutdown]") && <Badge size="xs" color="grape" variant="light" me={4}>{t("logs.shutdown")}</Badge>}{w.title.replace("[Shutdown] ", "")}</Table.Td>
                    <Table.Td><StatusBadge value={w.status} /></Table.Td><Table.Td>{fmtDate(w.created_at, tz)}</Table.Td>
                  </Table.Tr>
                ))}
                {d.issues.requests.length + d.issues.work_orders.length === 0 && <Table.Tr><Table.Td colSpan={5}><Text size="sm" c="dimmed">{t("common.noData")}</Text></Table.Td></Table.Tr>}
              </Table.Tbody>
            </Table>
          </Paper>
        )}
      </Stack>
      {raise && <RaiseRequest onClose={() => setRaise(false)} />}
      <Modal opened={reopen} onClose={() => setReopen(false)} title={t("ops.report.reopen")}>
        <Stack>
          <Textarea label={t("ops.report.reopenNote")} value={note} onChange={(e) => setNote(e.currentTarget.value)} autosize minRows={2} />
          <Button color="orange" disabled={note.trim().length < 3} loading={doReopen.isPending} onClick={() => doReopen.mutate(undefined)}>{t("ops.report.reopen")}</Button>
        </Stack>
      </Modal>
    </>
  );
}

export default function LogPage() {
  return <Guard perm="op.view"><LogView /></Guard>;
}
