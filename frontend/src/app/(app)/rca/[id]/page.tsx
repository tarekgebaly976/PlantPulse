"use client";

import {
  ActionIcon, Alert, Anchor, Badge, Button, Group, Modal, MultiSelect, Paper, Select, SimpleGrid, Stack, Table, Tabs, Text, TextInput, Textarea,
} from "@mantine/core";
import { IconPlus, IconPrinter, IconTrash } from "@tabler/icons-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Attachments } from "@/components/Attachments";
import {
  FishboneDiagram, FishboneEditor, ReasonBadges, WhysEditor, uid, type Bone, type Reason, type RootCause, type Why,
} from "@/components/Rca";
import { KV, Loading, PageHeader, Section, StatusBadge } from "@/components/ui";
import { del, patch, post, put } from "@/lib/api";
import { fmtDate, fmtMoney, fmtNum, toLocalInput, useMut, useQ } from "@/lib/hooks";
import { useSession } from "@/lib/session";
import type { Member } from "@/lib/types";

type Problem = { what?: string; where?: string; when?: string; who?: string; which?: string; how?: string };
type Ev = { id: string; at: string | null; text: string };
interface Action {
  id: string; seq: number; description: string; kind: "containment" | "corrective" | "preventive"; root_cause_ref: string | null; owner_id: string | null; owner: string | null;
  due_date: string | null; status: string; overdue: boolean; completion_note: string | null; done_at: string | null; done_by: string | null;
  work_order: { id: string; number: string; status: string } | null; pm_plan: { id: string; code: string; name: string } | null; can_update: boolean;
}
export interface RcaDetail {
  rca: {
    id: string; number: string; title: string; status: string; source: string; trigger_reasons: Reason[]; request_note: string | null; requested_by: string | null;
    created_at: string; decided_by: string | null; decided_at: string | null; decision_note: string | null; leader_id: string | null; leader: string | null;
    started_at: string | null; due_date: string | null; overdue: boolean; problem: Problem; problem_statement: string | null; timeline: Ev[]; whys: Why[];
    fishbone: Bone[]; root_causes: RootCause[]; analysis_summary: string | null; lessons_learned: string | null; submitted_at: string | null;
    approved_by: string | null; approved_at: string | null; review_note: string | null; actions_done_at: string | null; effectiveness_due: string | null;
    effectiveness_result: string | null; effectiveness_note: string | null; recurrence_count: number; closed_at: string | null; closed_by: string | null;
  };
  asset: { id: string; code: string; name: string; criticality: string; location: string | null } | null;
  failure_mode: { id: string; code: string; description: string } | null;
  work_orders: {
    id: string; number: string; title: string; type: string; status: string; created_at: string; actual_start: string | null; completed_at: string | null;
    downtime_hours: number | null; production_loss_tons: number | null; cost: number; currency: string; symptoms: string | null; findings: string | null;
    root_cause: string | null; corrective_action: string | null; problem: string | null; cause: string | null; remedy: string | null; safety_event: boolean; note: string | null;
  }[];
  totals: { downtime_hours: number; production_loss_tons: number; cost: number; currency: string };
  team: { user_id: string; name: string; role_note: string | null }[];
  actions: Action[];
  me: { can_edit: boolean; can_approve: boolean; is_leader: boolean; can_create_wo: boolean };
}
type Draft = Pick<RcaDetail["rca"], "problem" | "problem_statement" | "timeline" | "whys" | "fishbone" | "root_causes" | "analysis_summary" | "lessons_learned">;
const W_KEYS = ["what", "where", "when", "who", "which", "how"] as const;
const ACTIVE = ["candidate", "investigation", "awaiting_approval", "action_plan", "monitoring"];
const draftOf = (r: RcaDetail["rca"]): Draft => ({
  problem: r.problem ?? {}, problem_statement: r.problem_statement, timeline: r.timeline ?? [], whys: r.whys ?? [], fishbone: r.fishbone ?? [],
  root_causes: r.root_causes ?? [], analysis_summary: r.analysis_summary, lessons_learned: r.lessons_learned,
});

/** Start (manager) or name the leader of an RCA started by the rules. */
function StartModal({ d, opened, onClose }: { d: RcaDetail; opened: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const leaders = useQ<{ id: string; full_name: string; role: string }[]>(opened ? "/rca/leaders" : null);
  const users = useQ<Member[]>(opened ? "/users" : null);
  const [f, setF] = useState({ leader_id: null as string | null, member_ids: [] as string[], due_date: "", note: "" });
  const m = useMut(() => post(`/rca/${d.rca.id}/start`, { ...f, due_date: f.due_date || null, note: f.note || null }), { onDone: onClose });
  return (
    <Modal opened={opened} onClose={onClose} title={t("rca.flow.startTitle")}>
      <Stack>
        <Select label={t("rca.flow.leader")} required searchable value={f.leader_id} onChange={(v) => setF({ ...f, leader_id: v })}
          data={(leaders.data ?? []).map((u) => ({ value: u.id, label: `${u.full_name} · ${u.role}` }))} />
        <MultiSelect label={t("rca.flow.team")} description={t("rca.flow.teamHint")} searchable value={f.member_ids} onChange={(v) => setF({ ...f, member_ids: v })}
          data={(users.data ?? []).filter((u) => u.is_active && u.user.id !== f.leader_id).map((u) => ({ value: u.user.id, label: `${u.user.full_name}${u.user.trade ? ` (${u.user.trade})` : ""}` }))} />
        <TextInput type="date" label={t("rca.flow.dueDate")} value={f.due_date} onChange={(e) => setF({ ...f, due_date: e.currentTarget.value })} />
        {d.rca.status === "candidate" && <Textarea label={t("rca.flow.note")} autosize value={f.note} onChange={(e) => setF({ ...f, note: e.currentTarget.value })} />}
        <Button loading={m.isPending} disabled={!f.leader_id} onClick={() => m.mutate(undefined)}>{t("rca.flow.start")}</Button>
      </Stack>
    </Modal>
  );
}

/** A workflow step that takes a note (required unless `optional`). */
function NoteAction({ label, color, path, optional, hint, variant }: { label: string; color?: string; path: string; optional?: boolean; hint?: string; variant?: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const m = useMut(() => post(path, { note: note || null }), { onDone: () => { setOpen(false); setNote(""); } });
  return (
    <>
      <Button color={color} variant={variant ?? "filled"} onClick={() => setOpen(true)}>{label}</Button>
      <Modal opened={open} onClose={() => setOpen(false)} title={label}>
        <Stack>
          {hint && <Text size="sm" c="dimmed">{hint}</Text>}
          <Textarea label={optional ? t("rca.flow.note") : t("rca.flow.reason")} autosize minRows={3} value={note} onChange={(e) => setNote(e.currentTarget.value)} required={!optional} />
          <Button color={color} loading={m.isPending} disabled={!optional && note.trim().length < 3} onClick={() => m.mutate(undefined)}>{label}</Button>
        </Stack>
      </Modal>
    </>
  );
}

function TeamModal({ d, opened, onClose }: { d: RcaDetail; opened: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const leaders = useQ<{ id: string; full_name: string; role: string }[]>(opened ? "/rca/leaders" : null);
  const users = useQ<Member[]>(opened ? "/users" : null);
  const [leader, setLeader] = useState<string | null>(d.rca.leader_id);
  const [members, setMembers] = useState<{ user_id: string; role_note: string | null }[]>(d.team.map((m) => ({ user_id: m.user_id, role_note: m.role_note })));
  const m = useMut(() => put(`/rca/${d.rca.id}/team`, { ...(d.me.can_approve ? { leader_id: leader } : {}), members }), { onDone: onClose });
  const names = new Map((users.data ?? []).map((u) => [u.user.id, u.user.full_name]));
  return (
    <Modal opened={opened} onClose={onClose} title={t("rca.info.teamEdit")} size="lg">
      <Stack>
        <Select label={t("rca.flow.leader")} disabled={!d.me.can_approve} value={leader} onChange={setLeader}
          data={(leaders.data ?? []).map((u) => ({ value: u.id, label: `${u.full_name} · ${u.role}` }))} />
        <MultiSelect label={t("rca.flow.team")} description={t("rca.flow.teamHint")} searchable value={members.map((x) => x.user_id)}
          onChange={(v) => setMembers(v.map((uid) => members.find((x) => x.user_id === uid) ?? { user_id: uid, role_note: null }))}
          data={(users.data ?? []).filter((u) => u.is_active && u.user.id !== leader).map((u) => ({ value: u.user.id, label: u.user.full_name }))} />
        {members.map((x) => (
          <TextInput key={x.user_id} size="xs" label={`${names.get(x.user_id) ?? ""} – ${t("rca.info.roleNote")}`} value={x.role_note ?? ""}
            onChange={(e) => { const v = e.currentTarget.value; setMembers(members.map((y) => (y.user_id === x.user_id ? { ...y, role_note: v || null } : y))); }} />
        ))}
        <Button loading={m.isPending} onClick={() => m.mutate(undefined)}>{t("common.save")}</Button>
      </Stack>
    </Modal>
  );
}

function ActionRow({ d, a, pmPlans }: { d: RcaDetail; a: Action; pmPlans: { id: string; code: string; name: string }[] }) {
  const { t } = useTranslation();
  const [note, setNote] = useState(a.completion_note ?? "");
  const rid = d.rca.id;
  const upd = useMut((body: object) => patch(`/rca/${rid}/actions/${a.id}`, body));
  const mkWo = useMut(() => post<{ number: string }>(`/rca/${rid}/actions/${a.id}/work-order`), { success: false });
  const rm = useMut(() => del(`/rca/${rid}/actions/${a.id}`));
  const open = ["investigation", "awaiting_approval", "action_plan"].includes(d.rca.status);
  const can = a.can_update && open;
  const rc = d.rca.root_causes.find((c) => c.id === a.root_cause_ref);
  const kindColor = { containment: "orange", corrective: "blue", preventive: "teal" }[a.kind];
  return (
    <Paper withBorder p="sm" radius="md" style={a.overdue ? { borderColor: "var(--mantine-color-red-6)" } : undefined}>
      <Group justify="space-between" align="start" wrap="nowrap">
        <Stack gap={4} style={{ flex: 1 }}>
          <Group gap={6}><Badge color={kindColor} variant="light">{a.seq}. {t(`rca.act.kinds.${a.kind}`)}</Badge><StatusBadge value={a.status} />
            {a.overdue && <Badge color="red">{t("status.delayed")}</Badge>}</Group>
          <Text fw={500}>{a.description}</Text>
          {rc && <Text size="xs" c="dimmed">{t("rca.act.forCause")}: {rc.text}</Text>}
          <Group gap="lg">
            <Text size="sm">{t("rca.act.owner")}: <b>{a.owner ?? "—"}</b></Text>
            <Text size="sm">{t("rca.act.due")}: <b>{a.due_date ?? "—"}</b></Text>
            {a.work_order && <Anchor component={Link} href={`/work-orders/${a.work_order.id}`} size="sm">{a.work_order.number} <StatusBadge value={a.work_order.status} size="xs" /></Anchor>}
            {a.pm_plan && <Anchor component={Link} href="/pm" size="sm">PM {a.pm_plan.code}</Anchor>}
          </Group>
          {a.done_at && <Text size="xs" c="dimmed">✓ {a.done_by} · {fmtDate(a.done_at)}</Text>}
          {a.completion_note && !a.can_update && <Text size="sm">{t("rca.act.result")}: {a.completion_note}</Text>}
        </Stack>
        {d.me.can_edit && d.rca.status === "investigation" && <ActionIcon variant="subtle" color="red" aria-label={t("common.delete")} onClick={() => rm.mutate(undefined)}><IconTrash size={16} /></ActionIcon>}
      </Group>
      {can && ["done", "cancelled"].includes(a.status) && (
        <Group gap="xs" mt="xs">
          {a.completion_note && <Text size="sm" style={{ flex: 1 }}>{t("rca.act.result")}: {a.completion_note}</Text>}
          <Button size="xs" variant="subtle" onClick={() => upd.mutate({ status: "in_progress" })}>{t("rca.act.reopen")}</Button>
        </Group>
      )}
      {can && !["done", "cancelled"].includes(a.status) && (
        <Stack gap="xs" mt="xs">
          <Textarea size="xs" label={t("rca.act.result")} autosize value={note} onChange={(e) => setNote(e.currentTarget.value)} />
          <Group gap="xs">
            <Button size="xs" color="teal" loading={upd.isPending} onClick={() => upd.mutate({ status: "done", completion_note: note || null })}>{t("rca.act.markDone")}</Button>
            {a.status === "open" && <Button size="xs" variant="light" onClick={() => upd.mutate({ status: "in_progress", completion_note: note || null })}>{t("status.in_progress")}</Button>}
            <Button size="xs" variant="subtle" color="gray" disabled={note.trim().length < 3} title={t("rca.act.cancelReason")} onClick={() => upd.mutate({ status: "cancelled", completion_note: note })}>{t("common.cancel")}</Button>
            {note !== (a.completion_note ?? "") && <Button size="xs" variant="default" onClick={() => upd.mutate({ completion_note: note || null })}>{t("common.save")}</Button>}
            {d.me.can_create_wo && !a.work_order && (
              <Button size="xs" variant="outline" loading={mkWo.isPending} title={t("rca.act.woHint")} onClick={() => mkWo.mutate(undefined)}>{t("rca.act.createWo")}</Button>)}
            {d.me.can_edit && pmPlans.length > 0 && (
              <Select size="xs" w={220} clearable placeholder={t("rca.act.pmPlan")} value={a.pm_plan?.id ?? null} onChange={(v) => upd.mutate({ pm_plan_id: v })}
                data={pmPlans.map((p) => ({ value: p.id, label: `${p.code} ${p.name}` }))} />)}
          </Group>
        </Stack>
      )}
    </Paper>
  );
}

function AddAction({ d, users }: { d: RcaDetail; users: Member[] }) {
  const { t } = useTranslation();
  const empty = { description: "", kind: "corrective", root_cause_ref: null as string | null, owner_id: null as string | null, due_date: "" };
  const [f, setF] = useState(empty);
  const m = useMut(() => post(`/rca/${d.rca.id}/actions`, { ...f, due_date: f.due_date || null }), { onDone: () => setF(empty) });
  return (
    <Paper withBorder p="sm" radius="md" bg="var(--pp-page-bg)">
      <Stack gap="xs">
        <Textarea label={t("rca.act.description")} autosize value={f.description} onChange={(e) => setF({ ...f, description: e.currentTarget.value })} />
        <SimpleGrid cols={{ base: 1, sm: 4 }}>
          <Select label={t("rca.act.kind")} allowDeselect={false} value={f.kind} onChange={(v) => v && setF({ ...f, kind: v })}
            data={(["containment", "corrective", "preventive"] as const).map((k) => ({ value: k, label: t(`rca.act.kinds.${k}`) }))} />
          <Select label={t("rca.act.forCause")} clearable value={f.root_cause_ref} onChange={(v) => setF({ ...f, root_cause_ref: v })}
            data={d.rca.root_causes.map((c) => ({ value: c.id, label: c.text.slice(0, 60) }))} />
          <Select label={t("rca.act.owner")} searchable clearable value={f.owner_id} onChange={(v) => setF({ ...f, owner_id: v })}
            data={users.filter((u) => u.is_active).map((u) => ({ value: u.user.id, label: u.user.full_name }))} />
          <TextInput type="date" label={t("rca.act.due")} value={f.due_date} onChange={(e) => setF({ ...f, due_date: e.currentTarget.value })} />
        </SimpleGrid>
        <Button w="fit-content" leftSection={<IconPlus size={16} />} loading={m.isPending} disabled={f.description.trim().length < 3} onClick={() => m.mutate(undefined)}>{t("rca.act.add")}</Button>
      </Stack>
    </Paper>
  );
}

export default function RcaDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const { plant } = useSession();
  const q = useQ<RcaDetail>(`/rca/${id}`);
  const related = useQ<{ work_orders: { id: string; number: string; title: string; status: string; downtime_hours: number | null }[]; pm_plans: { id: string; code: string; name: string }[] }>(q.data ? `/rca/${id}/related` : null);
  const users = useQ<Member[]>(q.data?.me.can_edit ? "/users" : null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [seeded, setSeeded] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [start, setStart] = useState(false);
  const [team, setTeam] = useState(false);
  const [linkWo, setLinkWo] = useState<string | null>(null);
  const d = q.data;
  const serverKey = d ? JSON.stringify(draftOf(d.rca)) : null;
  if (d && !dirty && serverKey !== seeded) { setSeeded(serverKey); setDraft(draftOf(d.rca)); }
  const edit = (p: Partial<Draft>) => { if (draft) { setDraft({ ...draft, ...p }); setDirty(true); } };

  const editable = !!d && d.me.can_edit && (d.rca.status === "investigation" || (d.me.can_approve && d.rca.status === "awaiting_approval"));
  const lessonsEditable = !!d && d.me.can_edit && ACTIVE.includes(d.rca.status);
  const save = useMut(() => patch(`/rca/${id}`, editable ? draft : { lessons_learned: draft?.lessons_learned ?? null }), { onDone: () => setDirty(false) });
  const submit = useMut(async () => { if (dirty) { await patch(`/rca/${id}`, draft); setDirty(false); } return post(`/rca/${id}/submit`); });
  const approve = useMut(() => post(`/rca/${id}/approve`, {}));
  const link = useMut(() => post(`/rca/${id}/work-orders`, { work_order_id: linkWo }), { onDone: () => setLinkWo(null) });
  const unlink = useMut((woId: string) => del(`/rca/${id}/work-orders/${woId}`));

  if (!d || !draft) return <Loading />;
  const r = d.rca;
  const s = r.status;
  const me = d.me;
  const tz = plant?.timezone;
  const rootWhys = draft.whys.filter((w) => w.is_root && w.text.trim() && !draft.root_causes.some((c) => c.text === w.text));
  const early = r.effectiveness_due && new Date(`${r.effectiveness_due}T00:00:00`) > new Date();

  return (
    <>
      <PageHeader title={`${r.number} · ${r.title}`} actions={<>
        {me.can_approve && s === "candidate" && <><Button color="grape" onClick={() => setStart(true)}>{t("rca.flow.start")}</Button>
          <NoteAction label={t("rca.flow.notRequired")} color="gray" variant="light" path={`/rca/${id}/not-required`} /></>}
        {me.can_approve && s === "investigation" && !r.leader_id && <Button color="grape" onClick={() => setStart(true)}>{t("rca.flow.chooseLeader")}</Button>}
        {(dirty && (editable || lessonsEditable)) && <Button color="teal" loading={save.isPending} onClick={() => save.mutate(undefined)}>{t("common.save")}</Button>}
        {s === "investigation" && (me.is_leader || me.can_approve) && <Button loading={submit.isPending} onClick={() => submit.mutate(undefined)}>{t("rca.flow.submit")}</Button>}
        {me.can_approve && s === "awaiting_approval" && <><Button color="teal" loading={approve.isPending} onClick={() => approve.mutate(undefined)}>{t("rca.flow.approve")}</Button>
          <NoteAction label={t("rca.flow.return")} color="orange" variant="light" path={`/rca/${id}/return`} /></>}
        {me.can_approve && s === "monitoring" && <NoteAction label={t("rca.flow.close")} color="teal" path={`/rca/${id}/close`} optional={!early}
          hint={early ? t("rca.flow.closeEarly", { date: r.effectiveness_due }) : undefined} />}
        {me.can_approve && ["action_plan", "monitoring", "closed"].includes(s) && <NoteAction label={t("rca.flow.reopen")} color="orange" variant="light" path={`/rca/${id}/reopen`} />}
        {me.can_approve && ACTIVE.includes(s) && s !== "candidate" && <NoteAction label={t("rca.flow.cancel")} color="red" variant="subtle" path={`/rca/${id}/cancel`} />}
        <Button component={Link} href={`/rca/${id}/print`} variant="default" leftSection={<IconPrinter size={16} />}>{t("rca.flow.print")}</Button>
      </>}>
        <Group gap="xs">
          <StatusBadge value={s} size="lg" />
          {d.asset && <Anchor component={Link} href={`/assets/${d.asset.id}`} size="sm">{d.asset.code} — {d.asset.name}</Anchor>}
          {d.asset && <StatusBadge value={d.asset.criticality} />}
          {r.recurrence_count > 0 && <Badge color="red">{t("rca.eff.recurrences", { n: r.recurrence_count })}</Badge>}
        </Group>
        <ReasonBadges reasons={r.trigger_reasons} />
      </PageHeader>
      <StartModal d={d} opened={start} onClose={() => setStart(false)} />
      {team && <TeamModal d={d} opened={team} onClose={() => setTeam(false)} />}

      {s === "candidate" && <Alert color="yellow" mb="md">{t("rca.flow.candidateHint")}</Alert>}
      {s === "investigation" && !r.leader_id && <Alert color="yellow" mb="md">{t("rca.flow.noLeader")}</Alert>}
      {s === "investigation" && r.review_note && <Alert color="orange" mb="md" title={t("rca.flow.returned")}>{r.review_note}</Alert>}
      {s === "investigation" && r.overdue && <Alert color="red" mb="md">{t("rca.flow.overdue")}: {r.due_date}</Alert>}
      {s === "awaiting_approval" && <Alert color="blue" mb="md">{t("rca.flow.awaiting")}</Alert>}
      {s === "monitoring" && <Alert color="teal" mb="md" title={t("rca.eff.title")}>{t("rca.eff.hint", { date: r.effectiveness_due })}</Alert>}
      {s === "closed" && r.effectiveness_result && <Alert color="teal" mb="md">{t(`rca.eff.${r.effectiveness_result}`)}{r.effectiveness_note ? ` – ${r.effectiveness_note}` : ""}</Alert>}
      {["not_required", "cancelled"].includes(s) && r.decision_note && <Alert color="gray" mb="md">{r.decided_by ? `${r.decided_by}: ` : ""}{r.decision_note}</Alert>}

      <Tabs defaultValue={s === "action_plan" || s === "monitoring" ? "actions" : "overview"}>
        <Tabs.List>
          {(["overview", "problem", "whys", "fishbone", "rootCauses", "actions", "evidence"] as const).map((k) => (
            <Tabs.Tab key={k} value={k}>{t(`rca.tabs.${k}`)}{k === "actions" && d.actions.length ? ` (${d.actions.filter((a) => a.status === "done").length}/${d.actions.filter((a) => a.status !== "cancelled").length})` : ""}</Tabs.Tab>
          ))}
        </Tabs.List>

        <Tabs.Panel value="overview" pt="md">
          <Stack>
            <SimpleGrid cols={{ base: 2, sm: 3, lg: 6 }}>
              <KV label={t("rca.cols.failureMode")}>{d.failure_mode ? `${d.failure_mode.code} ${d.failure_mode.description}` : "—"}</KV>
              <KV label={t("rca.cols.leader")}>{r.leader ?? "—"}</KV>
              <KV label={t("rca.info.started")}>{fmtDate(r.started_at, tz)}</KV>
              <KV label={t("rca.cols.due")}><Text c={r.overdue ? "red" : undefined} fw={r.overdue ? 700 : undefined}>{r.due_date ?? "—"}</Text></KV>
              <KV label={t("rca.info.requestedBy")}>{r.requested_by ?? (r.source === "auto" ? t("rca.info.auto") : "—")} · {fmtDate(r.created_at, tz)}</KV>
              <KV label={t("rca.info.approvedBy")}>{r.approved_by ? `${r.approved_by} · ${fmtDate(r.approved_at, tz)}` : "—"}</KV>
            </SimpleGrid>
            {r.request_note && <Text size="sm"><b>{t("rca.requestWhy")}</b> {r.request_note}</Text>}
            {r.decision_note && ACTIVE.includes(s) && <Text size="sm"><b>{t("rca.info.decidedBy")} {r.decided_by}:</b> {r.decision_note}</Text>}
            <Section title={t("rca.info.totals")}>
              <SimpleGrid cols={{ base: 2, sm: 4 }}>
                <KV label={t("rca.cols.downtime")}>{fmtNum(d.totals.downtime_hours)}</KV>
                <KV label={t("rca.info.loss")}>{fmtNum(d.totals.production_loss_tons)}</KV>
                <KV label={t("common.cost")}>{fmtMoney(d.totals.cost, d.totals.currency)}</KV>
                <KV label={t("rca.info.workOrders")}>{d.work_orders.length}</KV>
              </SimpleGrid>
            </Section>
            <Section title={t("rca.info.workOrders")}>
              <Table.ScrollContainer minWidth={700}><Table fz="sm" striped>
                <Table.Thead><Table.Tr><Table.Th>WO</Table.Th><Table.Th>{t("common.description")}</Table.Th><Table.Th>{t("common.status")}</Table.Th>
                  <Table.Th>{t("rca.cols.downtime")}</Table.Th><Table.Th>{t("common.cost")}</Table.Th><Table.Th>{t("common.date")}</Table.Th><Table.Th /></Table.Tr></Table.Thead>
                <Table.Tbody>{d.work_orders.map((w) => (
                  <Table.Tr key={w.id}>
                    <Table.Td><Anchor component={Link} href={`/work-orders/${w.id}`}>{w.number}</Anchor></Table.Td>
                    <Table.Td>{w.title}{w.note && <Text size="xs" c="red">{w.note}</Text>}{w.safety_event && <Badge ms={4} size="xs" color="red">{t("rca.safetyShort")}</Badge>}</Table.Td>
                    <Table.Td><StatusBadge value={w.status} /></Table.Td><Table.Td>{fmtNum(w.downtime_hours)}</Table.Td><Table.Td>{fmtMoney(w.cost, w.currency)}</Table.Td>
                    <Table.Td>{fmtDate(w.actual_start ?? w.created_at, tz, true)}</Table.Td>
                    <Table.Td>{me.can_edit && ACTIVE.includes(s) && d.work_orders.length > 1 && <ActionIcon variant="subtle" color="red" aria-label={t("common.delete")} onClick={() => unlink.mutate(w.id)}><IconTrash size={14} /></ActionIcon>}</Table.Td>
                  </Table.Tr>))}
                </Table.Tbody></Table></Table.ScrollContainer>
              {me.can_edit && ACTIVE.includes(s) && (related.data?.work_orders.length ?? 0) > 0 && (
                <Group mt="sm" align="end">
                  <Select label={t("rca.info.addWo")} description={t("rca.info.addWoHint")} w={420} searchable clearable value={linkWo} onChange={setLinkWo}
                    data={(related.data?.work_orders ?? []).map((w) => ({ value: w.id, label: `${w.number} · ${w.title}${w.downtime_hours ? ` · ${w.downtime_hours} h` : ""}` }))} />
                  <Button variant="light" disabled={!linkWo} loading={link.isPending} onClick={() => link.mutate(undefined)}>{t("common.add")}</Button>
                </Group>)}
            </Section>
            {d.work_orders.some((w) => w.findings || w.root_cause || w.symptoms) && (
              <Section title={t("rca.info.techNotes")}>
                <Stack gap="xs">{d.work_orders.filter((w) => w.findings || w.root_cause || w.symptoms).map((w) => (
                  <Text key={w.id} size="sm"><b>{w.number}</b>{w.problem ? ` · ${w.problem}` : ""}{w.cause ? ` · ${w.cause}` : ""}{w.remedy ? ` · ${w.remedy}` : ""}
                    {w.symptoms ? <><br />{t("wo.symptoms")}: {w.symptoms}</> : null}{w.findings ? <><br />{t("wo.findings")}: {w.findings}</> : null}
                    {w.root_cause ? <><br />{t("wo.rootCause")}: {w.root_cause}</> : null}</Text>))}</Stack>
              </Section>)}
            <Section title={t("rca.flow.team")} actions={(me.can_approve || me.is_leader) && ACTIVE.includes(s) && s !== "candidate" ? <Button size="xs" variant="light" onClick={() => setTeam(true)}>{t("rca.info.teamEdit")}</Button> : null}>
              <Group gap="xs">
                {r.leader && <Badge size="lg" color="grape" tt="none">{r.leader} · {t("rca.cols.leader")}</Badge>}
                {d.team.map((m) => <Badge key={m.user_id} size="lg" variant="light" tt="none">{m.name}{m.role_note ? ` · ${m.role_note}` : ""}</Badge>)}
                {!r.leader && !d.team.length && <Text size="sm" c="dimmed">—</Text>}
              </Group>
            </Section>
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="problem" pt="md">
          <Stack>
            <SimpleGrid cols={{ base: 1, md: 2 }}>
              {W_KEYS.map((k) => (
                <Textarea key={k} label={t(`rca.w.${k}`)} description={t(`rca.w.${k}Hint`)} autosize minRows={2} readOnly={!editable}
                  value={draft.problem[k] ?? ""} onChange={(e) => edit({ problem: { ...draft.problem, [k]: e.currentTarget.value } })} />
              ))}
            </SimpleGrid>
            <Textarea label={t("rca.w.statement")} description={t("rca.w.statementHint")} autosize minRows={2} readOnly={!editable}
              value={draft.problem_statement ?? ""} onChange={(e) => edit({ problem_statement: e.currentTarget.value })} />
            <Section title={t("rca.w.timeline")} actions={editable ? <Button size="xs" variant="light" leftSection={<IconPlus size={14} />}
              onClick={() => edit({ timeline: [...draft.timeline, { id: uid(), at: null, text: "" }] })}>{t("rca.w.addEvent")}</Button> : null}>
              <Stack gap={6}>
                {[...draft.timeline].sort((a, b) => (a.at ?? "").localeCompare(b.at ?? "")).map((ev) => (
                  <Group key={ev.id} gap="xs" wrap="nowrap">
                    <TextInput type="datetime-local" size="xs" w={210} readOnly={!editable} value={toLocalInput(ev.at)}
                      onChange={(e) => { const v = e.currentTarget.value; edit({ timeline: draft.timeline.map((x) => (x.id === ev.id ? { ...x, at: v ? new Date(v).toISOString() : null } : x)) }); }} />
                    <TextInput size="xs" style={{ flex: 1 }} readOnly={!editable} value={ev.text}
                      onChange={(e) => { const v = e.currentTarget.value; edit({ timeline: draft.timeline.map((x) => (x.id === ev.id ? { ...x, text: v } : x)) }); }} />
                    {editable && <ActionIcon variant="subtle" color="red" aria-label={t("common.delete")} onClick={() => edit({ timeline: draft.timeline.filter((x) => x.id !== ev.id) })}><IconTrash size={16} /></ActionIcon>}
                  </Group>
                ))}
                {!draft.timeline.length && <Text size="sm" c="dimmed">{t("common.noData")}</Text>}
              </Stack>
            </Section>
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="whys" pt="md">
          <Text size="sm" c="dimmed" mb="sm">{t("rca.whys.hint")}</Text>
          {draft.problem_statement || draft.problem.what ? <Paper withBorder p="xs" mb="sm" bg="var(--pp-page-bg)"><Text size="sm" fw={600}>{draft.problem_statement || draft.problem.what}</Text></Paper> : null}
          <WhysEditor value={draft.whys} onChange={(v) => edit({ whys: v })} readOnly={!editable} />
        </Tabs.Panel>

        <Tabs.Panel value="fishbone" pt="md">
          <Text size="sm" c="dimmed" mb="sm">{t("rca.fish.hint")}</Text>
          <Paper withBorder p="xs" mb="md" style={{ overflowX: "auto" }}><div style={{ minWidth: 720 }}><FishboneDiagram bones={draft.fishbone} problem={draft.problem_statement || draft.problem.what || r.title} /></div></Paper>
          <FishboneEditor value={draft.fishbone} onChange={(v) => edit({ fishbone: v })} readOnly={!editable} />
        </Tabs.Panel>

        <Tabs.Panel value="rootCauses" pt="md">
          <Stack>
            <Text size="sm" c="dimmed">{t("rca.rc.hint")}</Text>
            {editable && rootWhys.length > 0 && (
              <Paper withBorder p="xs" bg="var(--pp-page-bg)">
                <Text size="sm" fw={600} mb={4}>{t("rca.rc.fromWhys")}</Text>
                {rootWhys.map((w) => (
                  <Group key={w.id} gap="xs"><Text size="sm" style={{ flex: 1 }}>{w.text}</Text>
                    <Button size="compact-xs" variant="light" onClick={() => edit({ root_causes: [...draft.root_causes, { id: uid(), type: "latent", text: w.text }] })}>{t("rca.rc.use")}</Button></Group>
                ))}
              </Paper>)}
            {draft.root_causes.map((c) => (
              <Group key={c.id} gap="xs" wrap="nowrap" align="start">
                <Select w={240} allowDeselect={false} disabled={!editable} value={c.type}
                  onChange={(v) => v && edit({ root_causes: draft.root_causes.map((x) => (x.id === c.id ? { ...x, type: v as RootCause["type"] } : x)) })}
                  data={(["physical", "human", "latent"] as const).map((k) => ({ value: k, label: t(`rca.rc.type.${k}`) }))} />
                <Textarea style={{ flex: 1 }} autosize minRows={1} readOnly={!editable} value={c.text}
                  onChange={(e) => { const v = e.currentTarget.value; edit({ root_causes: draft.root_causes.map((x) => (x.id === c.id ? { ...x, text: v } : x)) }); }} />
                {editable && <ActionIcon mt={6} variant="subtle" color="red" aria-label={t("common.delete")} onClick={() => edit({ root_causes: draft.root_causes.filter((x) => x.id !== c.id) })}><IconTrash size={16} /></ActionIcon>}
              </Group>
            ))}
            {editable && <Button w="fit-content" variant="light" leftSection={<IconPlus size={16} />} onClick={() => edit({ root_causes: [...draft.root_causes, { id: uid(), type: "physical", text: "" }] })}>{t("rca.rc.add")}</Button>}
            <Textarea label={t("rca.rc.summary")} autosize minRows={3} readOnly={!editable} value={draft.analysis_summary ?? ""} onChange={(e) => edit({ analysis_summary: e.currentTarget.value })} />
            <Textarea label={t("rca.rc.lessons")} autosize minRows={2} readOnly={!lessonsEditable} value={draft.lessons_learned ?? ""} onChange={(e) => edit({ lessons_learned: e.currentTarget.value })} />
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="actions" pt="md">
          <Stack>
            {d.actions.length === 0 && <Text size="sm" c="dimmed">{t("rca.act.none")}</Text>}
            {d.actions.map((a) => <ActionRow key={a.id} d={d} a={a} pmPlans={related.data?.pm_plans ?? []} />)}
            {me.can_edit && ["investigation", "awaiting_approval", "action_plan"].includes(s) && <AddAction d={d} users={users.data ?? []} />}
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="evidence" pt="md">
          <Attachments entityType="rca" entityId={r.id} defaultCategory="photo" />
        </Tabs.Panel>
      </Tabs>
    </>
  );
}
