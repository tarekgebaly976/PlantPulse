"use client";

// Safety incident register: the report / edit form and the "Incidents of this shift / day" section shown in any
// department's shift log and in a line's daily report. Everything goes to one register per plant.

import { Badge, Button, Group, NumberInput, Paper, Select, SimpleGrid, Stack, Table, Text, Textarea, TextInput } from "@mantine/core";
import { IconFirstAidKit, IconPlus } from "@tabler/icons-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal } from "@/components/Modal";
import { DeptSelect } from "@/components/ui";
import { post, put } from "@/lib/api";
import { useMut, useQ } from "@/lib/hooks";
import { hm, INCIDENT_KINDS, type Incident, type IncidentList, type OpSettings } from "@/lib/ops";
import { useSession } from "@/lib/session";

export const kindColor = (k: string) => ({ near_miss: "blue", first_aid: "yellow", medical: "orange", lost_time: "red", property: "grape", environment: "teal" } as Record<string, string>)[k] ?? "gray";
export const sevColor = (s: string) => ({ low: "gray", medium: "yellow", high: "orange", critical: "red" } as Record<string, string>)[s] ?? "gray";

type Num = number | string;
export interface IForm {
  id?: string; occurred_at: string; department_id: string | null; machine_id: string | null; shift: string | null; kind: Incident["kind"]; severity: Incident["severity"];
  title: string; description: string; location: string; people: string; injured: Num; lost_days: Num; immediate_action: string; root_cause: string;
  status: Incident["status"]; log_id: string | null; report_id: string | null;
}

/** Local "YYYY-MM-DDTHH:mm" now (for a datetime-local input). */
export const nowLocal = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16); };
export const toLocal = (iso: string, tz?: string) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
};

export function blankIncident(p: Partial<IForm>): IForm {
  return { occurred_at: nowLocal(), department_id: null, machine_id: null, shift: null, kind: "near_miss", severity: "low", title: "", description: "", location: "", people: "",
    injured: 0, lost_days: "", immediate_action: "", root_cause: "", status: "open", log_id: null, report_id: null, ...p };
}

export function editIncident(i: Incident, tz?: string): IForm {
  return { id: i.id, occurred_at: toLocal(i.occurred_at, tz), department_id: i.department_id, machine_id: i.machine_id, shift: i.shift, kind: i.kind, severity: i.severity,
    title: i.title, description: i.description ?? "", location: i.location ?? "", people: i.people ?? "", injured: i.injured, lost_days: i.lost_days ?? "",
    immediate_action: i.immediate_action ?? "", root_cause: i.root_cause ?? "", status: i.status, log_id: i.log_id, report_id: i.report_id };
}

export function IncidentModal({ form, canClose, onClose }: { form: IForm | null; canClose: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const [f, setF] = useState<IForm | null>(form);
  const lines = useQ<OpSettings>("/operations/settings").data?.machines ?? [];
  const save = useMut(() => {
    if (!f) return Promise.resolve();
    const body = { occurred_at: `${f.occurred_at}:00`, department_id: f.department_id, machine_id: f.machine_id, shift: f.shift, kind: f.kind, severity: f.severity, title: f.title,
      description: f.description || null, location: f.location || null, people: f.people || null, injured: Number(f.injured) || 0,
      lost_days: f.kind === "lost_time" && f.lost_days !== "" ? Number(f.lost_days) : null, immediate_action: f.immediate_action || null, root_cause: f.root_cause || null,
      status: f.status, log_id: f.log_id, report_id: f.report_id };
    return f.id ? put(`/operations/incidents/${f.id}`, body) : post("/operations/incidents", body);
  }, { onDone: onClose, success: t("inc.saved") });
  if (!f) return null;
  const set = (p: Partial<IForm>) => setF({ ...f, ...p });
  return (
    <Modal opened onClose={onClose} title={f.id ? t("inc.edit") : t("inc.report")} size="lg">
      <Stack>
        <Select label={t("inc.kind")} required allowDeselect={false} value={f.kind} onChange={(v) => v && set({ kind: v as IForm["kind"] })}
          data={INCIDENT_KINDS.map((k) => ({ value: k, label: t(`inc.kinds.${k}`) }))} description={t(`inc.kindHint.${f.kind}`)} />
        <TextInput label={t("inc.title")} required value={f.title} onChange={(e) => set({ title: e.currentTarget.value })} maxLength={200} placeholder={t("inc.titleHint")} />
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <TextInput type="datetime-local" label={t("inc.when")} required value={f.occurred_at} onChange={(e) => set({ occurred_at: e.currentTarget.value })} />
          <Select label={t("inc.severity")} allowDeselect={false} value={f.severity} onChange={(v) => v && set({ severity: v as IForm["severity"] })}
            data={(["low", "medium", "high", "critical"] as const).map((x) => ({ value: x, label: t(`inc.sev.${x}`) }))} />
          <DeptSelect label={t("ops.set.dept")} value={f.department_id} onChange={(v) => set({ department_id: v })} />
          <Select label={t("kpi2.line")} clearable value={f.machine_id} onChange={(v) => set({ machine_id: v })} data={lines.map((m) => ({ value: m.id, label: `${m.code} – ${m.name}` }))} />
          <TextInput label={t("inc.location")} value={f.location} onChange={(e) => set({ location: e.currentTarget.value })} maxLength={160} />
          <TextInput label={t("inc.people")} value={f.people} onChange={(e) => set({ people: e.currentTarget.value })} maxLength={400} />
          <NumberInput label={t("inc.injured")} min={0} max={500} value={f.injured} onChange={(v) => set({ injured: v })} />
          {f.kind === "lost_time" && <NumberInput label={t("inc.lostDays")} min={0} value={f.lost_days} onChange={(v) => set({ lost_days: v })} />}
        </SimpleGrid>
        <Textarea label={t("inc.description")} autosize minRows={2} value={f.description} onChange={(e) => set({ description: e.currentTarget.value })} />
        <Textarea label={t("inc.immediate")} autosize minRows={2} value={f.immediate_action} onChange={(e) => set({ immediate_action: e.currentTarget.value })} />
        {f.id && <Textarea label={t("inc.rootCause")} autosize minRows={2} value={f.root_cause} onChange={(e) => set({ root_cause: e.currentTarget.value })} />}
        {f.id && canClose && <Select label={t("common.status")} allowDeselect={false} value={f.status} onChange={(v) => v && set({ status: v as IForm["status"] })}
          data={(["open", "investigating", "closed"] as const).map((x) => ({ value: x, label: t(`inc.status.${x}`) }))} />}
        <Button color="red" loading={save.isPending} disabled={f.title.trim().length < 3 || !f.department_id || !f.occurred_at} onClick={() => save.mutate(undefined)}>{t("common.save")}</Button>
      </Stack>
    </Modal>
  );
}

/** Incidents of a shift log or a daily report, with "Report incident" (prefilled with the area, line, shift and time). */
export function IncidentsSection({ logId, reportId, defaults }: { logId?: string; reportId?: string; defaults: Partial<IForm> }) {
  const { t } = useTranslation();
  const { plant } = useSession();
  const q = useQ<IncidentList>("/operations/incidents", logId ? { log_id: logId } : { report_id: reportId });
  const [f, setF] = useState<IForm | null>(null);
  const items = q.data?.items ?? [];
  return (
    <Paper withBorder p="md" radius="md">
      <Group justify="space-between" mb="xs">
        <Group gap={6}><IconFirstAidKit size={18} color="var(--mantine-color-red-6)" /><Text fw={600}>{logId ? t("inc.ofShift") : t("inc.ofDay")}</Text>
          {items.length > 0 && <Badge color="red" variant="light">{items.length}</Badge>}</Group>
        {q.data?.can_report && <Button size="xs" color="red" variant="light" leftSection={<IconPlus size={14} />} className="no-print"
          onClick={() => setF(blankIncident({ ...defaults, log_id: logId ?? null, report_id: reportId ?? null }))}>{t("inc.report")}</Button>}
      </Group>
      {items.length === 0 ? <Text size="sm" c="dimmed">{t("inc.noneHere")}</Text> : (
        <Table.ScrollContainer minWidth={560}><Table striped highlightOnHover>
          <Table.Tbody>
            {items.map((i) => (
              <Table.Tr key={i.id} style={{ cursor: "pointer" }} onClick={() => setF(editIncident(i, plant?.timezone))}>
                <Table.Td className="mono nowrap">{i.number}</Table.Td><Table.Td className="nowrap">{hm(i.occurred_at, plant?.timezone)}</Table.Td>
                <Table.Td className="nowrap"><Badge size="sm" variant="light" style={{ overflow: "visible" }} color={kindColor(i.kind)}>{t(`inc.kinds.${i.kind}`)}</Badge></Table.Td>
                <Table.Td>{i.title}</Table.Td>
                <Table.Td className="nowrap"><Badge size="sm" variant="outline" style={{ overflow: "visible" }} color={i.status === "closed" ? "gray" : "red"}>{t(`inc.status.${i.status}`)}</Badge></Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table></Table.ScrollContainer>
      )}
      <IncidentModal key={`i-${f?.id}-${!!f}`} form={f} canClose={!!q.data?.can_close} onClose={() => setF(null)} />
    </Paper>
  );
}
