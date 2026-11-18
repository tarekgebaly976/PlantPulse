"use client";

import { Alert, Badge, Button, Group, Paper, SegmentedControl, Select, SimpleGrid, Stack, Table, Text, Textarea, TextInput } from "@mantine/core";
import { IconBell, IconBulb, IconChecklist, IconPlus, IconRefresh } from "@tabler/icons-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Guard } from "@/components/AppFrame";
import { Modal } from "@/components/Modal";
import { Loading, PageHeader, Section } from "@/components/ui";
import { post, put } from "@/lib/api";
import { fmtDate, fmtNum, useMut, useQ } from "@/lib/hooks";
import { statusColor, type Insight, type OpAction, type OpAlert, type OpSettings } from "@/lib/ops";
import { useSession } from "@/lib/session";

/** Text of an insight: numbers formatted, factor / affects names translated. */
function useInsightText() {
  const { t } = useTranslation();
  return (x: Insight) => {
    const p: Record<string, unknown> = { ...x.params };
    for (const [k, v] of Object.entries(p)) if (typeof v === "number") p[k] = fmtNum(v, 2);
    if (typeof p.factor === "string") p.factor = t(`gen.factor.${p.factor}`);
    if (typeof p.affects === "string") p.affects = t(`gen.factor.${p.affects}`);
    return { title: t(`ins.kinds.${x.kind}`, p), rec: t(`ins.rec.${x.recommendation}`, p) };
  };
}

interface AForm { id?: string; title: string; description: string; status: OpAction["status"]; owner_id: string | null; due_date: string; source: OpAction["source"]; alert_id: string | null;
  machine_id: string | null; result: string }

function ActionModal({ form, people, lines, onClose }: { form: AForm | null; people: { id: string; name: string }[]; lines: OpSettings["machines"]; onClose: () => void }) {
  const { t } = useTranslation();
  const [f, setF] = useState<AForm | null>(form);
  const save = useMut(() => {
    if (!f) return Promise.resolve();
    const body = { title: f.title, description: f.description || null, status: f.status, owner_id: f.owner_id, due_date: f.due_date || null, source: f.source, alert_id: f.alert_id,
      machine_id: f.machine_id, result: f.result || null };
    return f.id ? put(`/operations/actions/${f.id}`, body) : post("/operations/actions", body);
  }, { onDone: onClose });
  if (!f) return null;
  const set = (p: Partial<AForm>) => setF({ ...f, ...p });
  return (
    <Modal opened onClose={onClose} title={f.id ? t("ins.act.edit") : t("ins.act.new")} size="lg">
      <Stack>
        <TextInput label={t("ins.act.title")} required value={f.title} onChange={(e) => set({ title: e.currentTarget.value })} maxLength={200} />
        <Textarea label={t("ins.act.description")} autosize minRows={2} value={f.description} onChange={(e) => set({ description: e.currentTarget.value })} />
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <Select label={t("ins.act.owner")} searchable clearable data={people.map((p) => ({ value: p.id, label: p.name }))} value={f.owner_id} onChange={(v) => set({ owner_id: v })} />
          <TextInput type="date" label={t("ins.act.due")} value={f.due_date} onChange={(e) => set({ due_date: e.currentTarget.value })} />
          <Select label={t("kpi2.line")} clearable data={lines.map((m) => ({ value: m.id, label: `${m.code} – ${m.name}` }))} value={f.machine_id} onChange={(v) => set({ machine_id: v })} />
          <Select label={t("common.status")} allowDeselect={false} value={f.status} onChange={(v) => v && set({ status: v as AForm["status"] })}
            data={(["open", "in_progress", "done", "cancelled"] as const).map((x) => ({ value: x, label: t(`ins.act.status.${x}`) }))} />
        </SimpleGrid>
        {f.id && <Textarea label={t("ins.act.result")} autosize minRows={2} value={f.result} onChange={(e) => set({ result: e.currentTarget.value })} />}
        <Button loading={save.isPending} disabled={f.title.trim().length < 3} onClick={() => save.mutate(undefined)}>{t("common.save")}</Button>
      </Stack>
    </Modal>
  );
}

function View() {
  const { t } = useTranslation();
  const { can, plant } = useSession();
  const text = useInsightText();
  const [alertsAll, setAlertsAll] = useState("active");
  const [actsAll, setActsAll] = useState("active");
  const [af, setAf] = useState<AForm | null>(null);
  const ins = useQ<{ recent: string[]; baseline: string[]; items: Insight[] }>("/operations/insights");
  const alerts = useQ<OpAlert[]>("/operations/alerts", { status: alertsAll });
  const acts = useQ<{ items: OpAction[]; people: { id: string; name: string }[] }>("/operations/actions", { status: actsAll });
  const lines = useQ<OpSettings>("/operations/settings").data?.machines ?? [];
  const ack = useMut((id: string) => post(`/operations/alerts/${id}/ack`));
  const close = useMut((id: string) => post(`/operations/alerts/${id}/close`));
  const check = useMut(() => post<Record<string, number>>("/operations/alerts/evaluate"), { success: t("ins.checked") });
  const lineId = (code: string | null) => lines.find((m) => m.code === code)?.id ?? null;
  const blank = (p: Partial<AForm>): AForm => ({ title: "", description: "", status: "open", owner_id: null, due_date: "", source: "manual", alert_id: null, machine_id: null, result: "", ...p });
  const edit = (a: OpAction): AForm => ({ id: a.id, title: a.title, description: a.description ?? "", status: a.status, owner_id: a.owner_id, due_date: a.due_date ?? "", source: a.source,
    alert_id: a.alert_id, machine_id: a.machine_id, result: a.result ?? "" });
  if (!ins.data) return <Loading />;
  return (
    <>
      <PageHeader title={t("ins.title")} actions={can("op.manage") ? <Button variant="default" leftSection={<IconRefresh size={16} />} loading={check.isPending} onClick={() => check.mutate(undefined)}>{t("ins.checkNow")}</Button> : undefined}>
        <Text size="sm" c="dimmed">{t("ins.subtitle", { r0: ins.data.recent[0], r1: ins.data.recent[1], b0: ins.data.baseline[0], b1: ins.data.baseline[1] })}</Text>
      </PageHeader>
      <Stack>
        <Section title={t("ins.insights")}>
          {ins.data.items.length === 0 ? <Alert color="teal" icon={<IconBulb />}>{t("ins.none")}</Alert> : (
            <SimpleGrid cols={{ base: 1, md: 2 }}>
              {ins.data.items.map((x) => {
                const tx = text(x);
                return (
                  <Paper key={x.id} withBorder p="sm" radius="md" style={{ borderInlineStartWidth: 4, borderInlineStartColor: `var(--mantine-color-${statusColor(x.severity)}-6)` }}>
                    <Group justify="space-between" wrap="nowrap" align="flex-start">
                      <Stack gap={2}>
                        <Group gap={6}><Badge size="xs" color={statusColor(x.severity)} variant="light">{t(`ins.sev.${x.severity}`)}</Badge>{x.line && <Badge size="xs" variant="outline" color="gray">{x.line}</Badge>}</Group>
                        <Text size="sm" fw={600}>{tx.title}</Text>
                        <Text size="xs" c="dimmed">{tx.rec}</Text>
                      </Stack>
                      {can("op.enter") && <Button size="compact-xs" variant="light" onClick={() => setAf(blank({ title: tx.title.slice(0, 200), description: tx.rec, source: "insight", machine_id: lineId(x.line) }))}>{t("ins.act.make")}</Button>}
                    </Group>
                  </Paper>
                );
              })}
            </SimpleGrid>
          )}
        </Section>

        <Section title={t("ins.alerts")} actions={<SegmentedControl size="xs" value={alertsAll} onChange={setAlertsAll} data={[{ value: "active", label: t("ins.active") }, { value: "all", label: t("ins.all") }]} />}>
          {(alerts.data ?? []).length === 0 ? <Text size="sm" c="dimmed">{t("ins.noAlerts")}</Text> : (
            <Table.ScrollContainer minWidth={720}><Table striped>
              <Table.Thead><Table.Tr><Table.Th>{t("ins.rule")}</Table.Th><Table.Th>{t("ins.value")}</Table.Th><Table.Th>{t("common.status")}</Table.Th><Table.Th>{t("ins.since")}</Table.Th><Table.Th /></Table.Tr></Table.Thead>
              <Table.Tbody>
                {(alerts.data ?? []).map((a) => (
                  <Table.Tr key={a.id}>
                    <Table.Td><Group gap={6} wrap="nowrap"><IconBell size={14} color={`var(--mantine-color-${statusColor(a.severity)}-6)`} /><Text size="sm">{a.rule?.name}</Text>
                      {a.escalated && <Badge size="xs" color="red" variant="light">{t("ins.escalated")}</Badge>}
                      {Array.isArray(a.detail.lines) && <Text size="xs" c="dimmed">{(a.detail.lines as string[]).join(", ")}</Text>}</Group></Table.Td>
                    <Table.Td>{a.value === null ? "—" : fmtNum(a.value, 2)} <Text span size="xs" c="dimmed">{a.rule ? t(`ins.cond.${a.rule.condition}`) : ""}</Text></Table.Td>
                    <Table.Td><Badge size="sm" variant="light" color={a.status === "open" ? statusColor(a.severity) : "gray"}>{t(`ins.alertStatus.${a.status}`)}</Badge>
                      {a.acknowledged_by && <Text size="xs" c="dimmed">{a.acknowledged_by}</Text>}</Table.Td>
                    <Table.Td className="nowrap">{fmtDate(a.first_seen, plant?.timezone)}</Table.Td>
                    <Table.Td><Group gap={4} wrap="nowrap" justify="flex-end">
                      {a.status === "open" && can("op.enter") && <Button size="compact-xs" variant="light" loading={ack.isPending} onClick={() => ack.mutate(a.id)}>{t("ins.ack")}</Button>}
                      {(a.status === "open" || a.status === "acknowledged") && can("op.enter") && <Button size="compact-xs" variant="light" color="teal"
                        onClick={() => setAf(blank({ title: a.rule?.name ?? "", source: "alert", alert_id: a.id, machine_id: lineId(a.line) }))}>{t("ins.act.make")}</Button>}
                      {(a.status === "open" || a.status === "acknowledged") && can("op.confirm") && <Button size="compact-xs" variant="subtle" color="gray" onClick={() => close.mutate(a.id)}>{t("ins.close")}</Button>}
                    </Group></Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table></Table.ScrollContainer>
          )}
        </Section>

        <Section title={t("ins.actions")} actions={<Group gap="xs">
          <SegmentedControl size="xs" value={actsAll} onChange={setActsAll} data={[{ value: "active", label: t("ins.active") }, { value: "all", label: t("ins.all") }]} />
          {can("op.enter") && <Button size="xs" leftSection={<IconPlus size={14} />} onClick={() => setAf(blank({}))}>{t("ins.act.new")}</Button>}
        </Group>}>
          {(acts.data?.items ?? []).length === 0 ? <Text size="sm" c="dimmed">{t("ins.noActions")}</Text> : (
            <Table.ScrollContainer minWidth={680}><Table striped highlightOnHover>
              <Table.Thead><Table.Tr><Table.Th>{t("ins.act.title")}</Table.Th><Table.Th>{t("ins.act.owner")}</Table.Th><Table.Th>{t("ins.act.due")}</Table.Th><Table.Th>{t("common.status")}</Table.Th><Table.Th>{t("kpi2.line")}</Table.Th></Table.Tr></Table.Thead>
              <Table.Tbody>
                {(acts.data?.items ?? []).map((a) => (
                  <Table.Tr key={a.id} style={{ cursor: "pointer" }} onClick={() => setAf(edit(a))}>
                    <Table.Td><Group gap={6} wrap="nowrap"><IconChecklist size={14} /><Text size="sm">{a.title}</Text>{a.source !== "manual" && <Badge size="xs" variant="outline" color="gray">{t(`ins.act.source.${a.source}`)}</Badge>}</Group></Table.Td>
                    <Table.Td>{a.owner ?? "—"}</Table.Td>
                    <Table.Td className="nowrap"><Text size="sm" c={a.overdue ? "red" : undefined} fw={a.overdue ? 600 : undefined}>{a.due_date ?? "—"}</Text></Table.Td>
                    <Table.Td><Badge size="sm" variant="light" color={a.status === "done" ? "teal" : a.status === "cancelled" ? "gray" : a.overdue ? "red" : "blue"}>{t(`ins.act.status.${a.status}`)}</Badge></Table.Td>
                    <Table.Td>{a.line ?? "—"}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table></Table.ScrollContainer>
          )}
        </Section>
      </Stack>
      <ActionModal key={`a-${af?.id}-${af?.title}-${!!af}`} form={af} people={acts.data?.people ?? []} lines={lines} onClose={() => setAf(null)} />
    </>
  );
}

export default function InsightsPage() {
  return <Guard perm="op.view"><View /></Guard>;
}
