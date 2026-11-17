"use client";

import {
  ActionIcon, Alert, Badge, Button, Group, NumberInput, Paper, SegmentedControl, Select, SimpleGrid, Stack, Table, Text, Textarea, TextInput,
} from "@mantine/core";
import { IconAlertTriangle, IconArrowLeft, IconArrowRight, IconLock, IconPencil, IconPlus, IconPrinter, IconTool, IconTrash } from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Guard } from "@/components/AppFrame";
import { Modal } from "@/components/Modal";
import { oeeColor, PeriodTiles, Tile } from "@/components/Ops";
import { ConfirmButton, Loading, PageHeader, Section, StatusBadge } from "@/components/ui";
import { del, patch, post, put } from "@/lib/api";
import { fmtNum, useMut, useQ } from "@/lib/hooks";
import {
  atTime, EVENT_TYPES, hhmm, hm, nextDay, pct, t3, type Loss, type OpSettings, type Reel, type Report, type Segment, type Stop,
} from "@/lib/ops";
import { useSession } from "@/lib/session";

type Num = number | string;
const num = (v: Num | null | undefined): number | null => (v === "" || v === null || v === undefined ? null : Number(v));

function Time({ iso, date, tz }: { iso: string | null; date: string; tz?: string }) {
  if (!iso) return <>—</>;
  return <span className="nowrap">{hm(iso, tz)}{nextDay(iso, date, tz) && <Text span size="xs" c="dimmed"> +1</Text>}</span>;
}

function RowActions({ edit, remove, extra }: { edit?: () => void; remove?: () => void; extra?: ReactNode }) {
  const { t } = useTranslation();
  return (
    <Group gap={2} wrap="nowrap" justify="flex-end">
      {extra}
      {edit && <ActionIcon variant="subtle" aria-label={t("common.edit")} onClick={edit}><IconPencil size={16} /></ActionIcon>}
      {remove && <ActionIcon variant="subtle" color="red" aria-label={t("common.delete")} onClick={() => { if (window.confirm(t("common.delete") + "?")) remove(); }}><IconTrash size={16} /></ActionIcon>}
    </Group>
  );
}

// ------------------------------------------------------------------ runs
interface RunForm { id?: string; start: string; end: string; grade_id: string | null; speed: Num; reason: string; gc_h: Num; gc_rej: Num }

function RunModal({ r, s, form, onClose }: { r: Report; s: OpSettings; form: RunForm | null; onClose: () => void }) {
  const { t } = useTranslation();
  const [f, setF] = useState<RunForm | null>(form);
  const grades = (s.machines.find((m) => m.id === r.machine.id)?.grades ?? []).filter((g) => g.is_active || g.id === f?.grade_id);
  const g = grades.find((x) => x.id === f?.grade_id);
  const save = useMut(() => {
    if (!f) return Promise.resolve();
    const body = {
      started_at: atTime(r.report_date, r.machine.day_start, f.start), ended_at: atTime(r.report_date, r.machine.day_start, f.end), grade_id: f.grade_id,
      speed_mpm: num(f.speed), reason: f.reason || null, grade_change_hours: num(f.gc_h), grade_change_reject_mt: num(f.gc_rej),
    };
    return f.id ? put(`/operations/segments/${f.id}`, body) : post(`/operations/reports/${r.id}/segments`, body);
  }, { onDone: onClose });
  if (!f) return null;
  const set = (p: Partial<RunForm>) => setF({ ...f, ...p });
  return (
    <Modal opened onClose={onClose} title={t("ops.runs.title")}>
      <Stack>
        <Text size="xs" c="dimmed">{t("ops.runs.hint", { start: r.machine.day_start })}</Text>
        <SimpleGrid cols={2}>
          <TextInput type="time" label={t("ops.runs.start")} value={f.start} onChange={(e) => set({ start: e.currentTarget.value })} required />
          <TextInput type="time" label={t("ops.runs.end")} value={f.end} onChange={(e) => set({ end: e.currentTarget.value })} required />
        </SimpleGrid>
        {grades.length === 0 ? <Alert color="orange">{t("ops.runs.noGrade")}</Alert> :
          <Select label={t("ops.runs.grade")} required searchable value={f.grade_id} onChange={(v) => set({ grade_id: v })}
            data={grades.map((x) => ({ value: x.id, label: `${x.gsm} gsm${x.name ? ` – ${x.name}` : ""} (${x.ideal_mt_min} t/min)` }))} />}
        <NumberInput label={t("ops.runs.speed")} min={1} value={f.speed} onChange={(v) => set({ speed: v })}
          placeholder={g?.target_speed_mpm ? t("ops.runs.targetSpeed", { v: g.target_speed_mpm }) : undefined} />
        <TextInput label={t("ops.runs.reason")} value={f.reason} onChange={(e) => set({ reason: e.currentTarget.value })} />
        <SimpleGrid cols={2}>
          <NumberInput label={t("ops.runs.gcHours")} min={0} step={0.25} decimalScale={2} value={f.gc_h} onChange={(v) => set({ gc_h: v })} />
          <NumberInput label={t("ops.runs.gcReject")} min={0} decimalScale={3} value={f.gc_rej} onChange={(v) => set({ gc_rej: v })} />
        </SimpleGrid>
        <Button loading={save.isPending} disabled={!f.start || !f.end || !f.grade_id} onClick={() => save.mutate(undefined)}>{t("common.save")}</Button>
      </Stack>
    </Modal>
  );
}

// ------------------------------------------------------------------ reels
interface ReelForm { id?: string; shift: string | null; reel_no: string; gsm: Num; gross: Num; net: Num; reject: Num; b: Num; s: Num; note: string }

function nextReelNo(no: string): string {
  const m = no.match(/^(.*?)(\d+)$/);
  const head = m?.[1] ?? "";
  const digits = m?.[2];
  return digits ? `${head}${String(Number(digits) + 1).padStart(digits.length, "0")}` : "";
}

function ReelModal({ r, form, onClose }: { r: Report; form: ReelForm | null; onClose: () => void }) {
  const { t } = useTranslation();
  const [f, setF] = useState<ReelForm | null>(form);
  const [again, setAgain] = useState(false);
  const save = useMut(() => {
    if (!f) return Promise.resolve();
    const body = {
      shift: f.shift, reel_no: f.reel_no.trim(), gsm: num(f.gsm), gross_mt: num(f.gross), net_mt: num(f.net), reject_mt: num(f.reject) ?? 0,
      b_grade_mt: num(f.b) ?? 0, s_grade_mt: num(f.s) ?? 0, note: f.note || null,
    };
    return f.id ? put(`/operations/reels/${f.id}`, body) : post(`/operations/reports/${r.id}/reels`, body);
  }, {
    onDone: () => {
      if (again && f) setF({ ...f, reel_no: nextReelNo(f.reel_no), gross: "", net: "", reject: "", b: "", s: "", note: "" });
      else onClose();
    },
  });
  if (!f) return null;
  const set = (p: Partial<ReelForm>) => setF({ ...f, ...p });
  const trim = (num(f.gross) ?? 0) - (num(f.net) ?? 0) - (num(f.reject) ?? 0);
  const go = (next: boolean) => { setAgain(next); save.mutate(undefined); };
  return (
    <Modal opened onClose={onClose} title={t("ops.reels.title")}>
      <Stack>
        <Text size="xs" c="dimmed">{t("ops.reels.hint")}</Text>
        <SimpleGrid cols={3}>
          <Select label={t("ops.reels.shift")} required data={r.machine.shifts.map((x) => ({ value: x.code, label: `${x.code} – ${x.name}` }))} value={f.shift} onChange={(v) => set({ shift: v })} />
          <TextInput label={t("ops.reels.reelNo")} required value={f.reel_no} onChange={(e) => set({ reel_no: e.currentTarget.value })} />
          <NumberInput label={t("ops.reels.gsm")} min={10} value={f.gsm} onChange={(v) => set({ gsm: v })} />
        </SimpleGrid>
        <SimpleGrid cols={3}>
          <NumberInput label={t("ops.reels.gross")} required min={0} decimalScale={3} value={f.gross} onChange={(v) => set({ gross: v })} data-autofocus />
          <NumberInput label={t("ops.reels.net")} required min={0} decimalScale={3} value={f.net} onChange={(v) => set({ net: v })} />
          <NumberInput label={t("ops.reels.reject")} min={0} decimalScale={3} value={f.reject} onChange={(v) => set({ reject: v })} />
          <NumberInput label={t("ops.reels.b")} min={0} decimalScale={3} value={f.b} onChange={(v) => set({ b: v })} />
          <NumberInput label={t("ops.reels.s")} min={0} decimalScale={3} value={f.s} onChange={(v) => set({ s: v })} />
          <TextInput label={t("ops.reels.trim")} readOnly value={num(f.gross) !== null ? t3(trim) : ""} c={trim < -0.01 ? "red" : undefined} />
        </SimpleGrid>
        <TextInput label={t("ops.reels.note")} value={f.note} onChange={(e) => set({ note: e.currentTarget.value })} />
        <Group grow>
          {!f.id && <Button variant="light" loading={save.isPending && again} disabled={!f.shift || !f.reel_no || num(f.gross) === null || num(f.net) === null} onClick={() => go(true)}>{t("ops.reels.saveNext")}</Button>}
          <Button loading={save.isPending && !again} disabled={!f.shift || !f.reel_no || num(f.gross) === null || num(f.net) === null} onClick={() => go(false)}>{t("common.save")}</Button>
        </Group>
      </Stack>
    </Modal>
  );
}

// ------------------------------------------------------------------ stops
interface StopForm { id?: string; type: Stop["event_type"]; start: string; end: string; section_id: string | null; reason: string; parts: { discipline_id: string | null; hours: Num }[] }

function StopModal({ r, s, form, onClose }: { r: Report; s: OpSettings; form: StopForm | null; onClose: () => void }) {
  const { t } = useTranslation();
  const [f, setF] = useState<StopForm | null>(form);
  const sections = (s.machines.find((m) => m.id === r.machine.id)?.sections ?? []).filter((x) => x.is_active || x.id === f?.section_id);
  const discs = s.disciplines.filter((d) => d.is_active || f?.parts.some((p) => p.discipline_id === d.id));
  const save = useMut(() => {
    if (!f) return Promise.resolve();
    const parts = f.parts.filter((p) => p.discipline_id).map((p) => ({ discipline_id: p.discipline_id, hours: f.parts.length > 1 ? num(p.hours) : null }));
    const body = {
      event_type: f.type, started_at: atTime(r.report_date, r.machine.day_start, f.start),
      ended_at: f.end ? atTime(r.report_date, r.machine.day_start, f.end) : null, section_id: f.section_id, reason: f.reason || null, parts,
    };
    return f.id ? put(`/operations/stops/${f.id}`, body) : post(`/operations/reports/${r.id}/stops`, body);
  }, { onDone: onClose });
  if (!f) return null;
  const set = (p: Partial<StopForm>) => setF({ ...f, ...p });
  const dur = f.start && f.end ? (() => {
    const a = new Date(atTime(r.report_date, r.machine.day_start, f.start)).getTime();
    const b = new Date(atTime(r.report_date, r.machine.day_start, f.end)).getTime();
    return (b - a) / 3_600_000;
  })() : null;
  const split = f.parts.length > 1;
  const sum = f.parts.reduce((a, p) => a + (num(p.hours) ?? 0), 0);
  const maint = f.parts.some((p) => discs.find((d) => d.id === p.discipline_id)?.maintenance);
  return (
    <Modal opened onClose={onClose} title={t("ops.stops.title")} size="lg">
      <Stack>
        <SegmentedControl value={f.type} onChange={(v) => set({ type: v as Stop["event_type"] })} data={EVENT_TYPES.map((x) => ({ value: x, label: t(`ops.stops.types.${x}`) }))} />
        <SimpleGrid cols={3}>
          <TextInput type="time" label={t("ops.stops.start")} required value={f.start} onChange={(e) => set({ start: e.currentTarget.value })} />
          <TextInput type="time" label={t("ops.stops.end")} value={f.end} onChange={(e) => set({ end: e.currentTarget.value })} />
          <TextInput label={t("ops.stops.duration")} readOnly value={dur !== null && dur > 0 ? hhmm(dur) : ""} />
        </SimpleGrid>
        <Select label={t("ops.stops.section")} clearable searchable value={f.section_id} onChange={(v) => set({ section_id: v })} data={sections.map((x) => ({ value: x.id, label: x.name }))} />
        <Textarea label={t("ops.stops.details")} autosize minRows={2} value={f.reason} onChange={(e) => set({ reason: e.currentTarget.value })} />
        <Stack gap={6}>
          <Text size="sm" fw={500}>{t("ops.stops.who")}</Text>
          {f.parts.map((p, i) => (
            <Group key={i} gap="xs" wrap="nowrap" align="flex-end">
              <Select style={{ flex: 1 }} searchable value={p.discipline_id} aria-label={t("ops.stops.who")}
                data={discs.map((d) => ({ value: d.id, label: `${d.code} – ${d.name}` }))}
                onChange={(v) => set({ parts: f.parts.map((x, j) => (j === i ? { ...x, discipline_id: v } : x)) })} />
              {split && <NumberInput w={110} min={0} step={0.25} decimalScale={2} aria-label={t("ops.stops.hours")} placeholder={t("ops.stops.hours")} value={p.hours}
                onChange={(v) => set({ parts: f.parts.map((x, j) => (j === i ? { ...x, hours: v } : x)) })} />}
              {split && <ActionIcon variant="subtle" color="red" aria-label={t("common.delete")} onClick={() => set({ parts: f.parts.filter((_, j) => j !== i) })}><IconTrash size={16} /></ActionIcon>}
            </Group>
          ))}
          <Group justify="space-between">
            <Button size="xs" variant="subtle" leftSection={<IconPlus size={14} />} onClick={() => set({ parts: [...f.parts, { discipline_id: null, hours: "" }] })}>{t("ops.stops.split")}</Button>
            {split ? <Text size="xs" c={dur !== null && Math.abs(sum - dur) > 0.02 ? "red" : "dimmed"}>{hhmm(sum)} / {hhmm(dur)}</Text> : <Text size="xs" c="dimmed">{t("ops.stops.oneDiscipline")}</Text>}
          </Group>
        </Stack>
        {f.type === "breakdown" && <Text size="xs" c={maint ? "orange.8" : "dimmed"}>{maint ? `${t("ops.stops.failure")}: ${t("ops.stops.failureHint")}` : t("ops.stops.hint")}</Text>}
        <Button loading={save.isPending} disabled={!f.start || ((f.type === "breakdown" || f.type === "sheet_break") && !f.parts.some((p) => p.discipline_id))} onClick={() => save.mutate(undefined)}>{t("common.save")}</Button>
      </Stack>
    </Modal>
  );
}

// ------------------------------------------------------------------ quality losses
interface LossForm { id?: string; kind: Loss["kind"]; shift: string | null; defect_id: string | null; defect_text: string; qty: Num; disposition: string }

function LossModal({ r, s, form, onClose }: { r: Report; s: OpSettings; form: LossForm | null; onClose: () => void }) {
  const { t } = useTranslation();
  const [f, setF] = useState<LossForm | null>(form);
  const save = useMut(() => {
    if (!f) return Promise.resolve();
    const body = { kind: f.kind, shift: f.shift, defect_id: f.defect_id, defect_text: f.defect_text || null, qty_mt: num(f.qty), disposition: f.disposition || null };
    return f.id ? put(`/operations/losses/${f.id}`, body) : post(`/operations/reports/${r.id}/losses`, body);
  }, { onDone: onClose });
  if (!f) return null;
  const set = (p: Partial<LossForm>) => setF({ ...f, ...p });
  return (
    <Modal opened onClose={onClose} title={t("ops.losses.title")}>
      <Stack>
        <Text size="xs" c="dimmed">{t("ops.losses.explained", { r: t3(r.calc.day.reject), d: t3(r.calc.day.b + r.calc.day.s) })}</Text>
        <SegmentedControl value={f.kind} onChange={(v) => set({ kind: v as Loss["kind"] })} data={(["reject", "downgrade"] as const).map((k) => ({ value: k, label: t(`ops.losses.kinds.${k}`) }))} />
        <SimpleGrid cols={2}>
          <Select label={t("ops.reels.shift")} clearable data={r.machine.shifts.map((x) => ({ value: x.code, label: `${x.code} – ${x.name}` }))} value={f.shift} onChange={(v) => set({ shift: v })} />
          <NumberInput label={t("ops.losses.qty")} required min={0} decimalScale={3} value={f.qty} onChange={(v) => set({ qty: v })} />
        </SimpleGrid>
        <Select label={t("ops.losses.defect")} clearable searchable value={f.defect_id}
          onChange={(v) => set({ defect_id: v, disposition: s.defects.find((d) => d.id === v)?.disposition ?? f.disposition })}
          data={s.defects.filter((d) => d.is_active || d.id === f.defect_id).map((d) => ({ value: d.id, label: `${d.name} (${d.disposition})` }))} />
        <TextInput label={t("ops.losses.defectText")} value={f.defect_text} onChange={(e) => set({ defect_text: e.currentTarget.value })} />
        <TextInput label={t("ops.losses.disposition")} placeholder="R/P, F/H" value={f.disposition} onChange={(e) => set({ disposition: e.currentTarget.value })} maxLength={10} />
        <Button loading={save.isPending} disabled={num(f.qty) === null || (!f.defect_id && !f.defect_text.trim())} onClick={() => save.mutate(undefined)}>{t("common.save")}</Button>
      </Stack>
    </Modal>
  );
}

// ------------------------------------------------------------------ header fields
function Utilities({ r }: { r: Report }) {
  const { t } = useTranslation();
  const [f, setF] = useState({ steam_mt: r.steam_mt ?? "", water_pm_m3: r.water_pm_m3 ?? "", water_sp_m3: r.water_sp_m3 ?? "", water_ut_m3: r.water_ut_m3 ?? "",
    broke_tower_pct: r.broke_tower_pct ?? "", notes: r.notes ?? "" } as Record<string, Num>);
  const save = useMut(() => patch(`/operations/reports/${r.id}`, {
    steam_mt: num(f.steam_mt), water_pm_m3: num(f.water_pm_m3), water_sp_m3: num(f.water_sp_m3), water_ut_m3: num(f.water_ut_m3),
    broke_tower_pct: num(f.broke_tower_pct), notes: String(f.notes ?? "").trim() || null,
  }));
  const field = (k: string, label: string, scale = 1) => (
    <NumberInput label={label} min={0} decimalScale={scale} value={f[k]} disabled={!r.can_edit} onChange={(v) => setF({ ...f, [k]: v })} />
  );
  return (
    <Section title={t("ops.util.title")} actions={r.can_edit ? <Button size="xs" loading={save.isPending} onClick={() => save.mutate(undefined)}>{t("common.save")}</Button> : undefined}>
      <SimpleGrid cols={{ base: 2, sm: 3, lg: 5 }}>
        {field("steam_mt", t("ops.util.steam"))}
        {field("water_pm_m3", t("ops.util.waterPm"))}
        {field("water_sp_m3", t("ops.util.waterSp"))}
        {field("water_ut_m3", t("ops.util.waterUt"))}
        {field("broke_tower_pct", t("ops.util.broke"))}
      </SimpleGrid>
      {r.calc.steam_per_t !== null && <Text size="sm" mt="xs">{t("ops.util.steamPerT")}: <b>{fmtNum(r.calc.steam_per_t, 3)}</b> t/t</Text>}
      <Textarea mt="sm" label={t("ops.util.notes")} autosize minRows={2} value={String(f.notes ?? "")} disabled={!r.can_edit} onChange={(e) => setF({ ...f, notes: e.currentTarget.value })} />
    </Section>
  );
}

function Supervisor({ r, code }: { r: Report; code: string }) {
  const [v, setV] = useState(r.supervisors[code] ?? "");
  const save = useMut((val: string) => patch(`/operations/reports/${r.id}`, { supervisors: { ...r.supervisors, [code]: val } }), { success: false });
  if (!r.can_edit) return <>{r.supervisors[code] ?? "—"}</>;
  return <TextInput size="xs" w={150} value={v} onChange={(e) => setV(e.currentTarget.value)} onBlur={() => { if (v !== (r.supervisors[code] ?? "")) save.mutate(v); }} />;
}

// ------------------------------------------------------------------ page
function ReportView() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const router = useRouter();
  const { can, plant } = useSession();
  const tz = plant?.timezone;
  const q = useQ<Report>(`/operations/reports/${id}`);
  const st = useQ<OpSettings>("/operations/settings");
  const [run, setRun] = useState<RunForm | null>(null);
  const [reel, setReel] = useState<ReelForm | null>(null);
  const [stop, setStop] = useState<StopForm | null>(null);
  const [loss, setLoss] = useState<LossForm | null>(null);
  const [reopen, setReopen] = useState(false);
  const [note, setNote] = useState("");
  const act = useMut((a: string) => post(`/operations/reports/${id}/${a}`));
  const doReopen = useMut(() => post(`/operations/reports/${id}/reopen`, { note }), { onDone: () => { setReopen(false); setNote(""); } });
  const remove = useMut(() => del(`/operations/reports/${id}`), { onDone: () => router.push("/operations") });
  const rm = useMut((path: string) => del(path), { success: false });
  const request = useMut((x: Stop) => post<{ number: string }>("/work-requests", {
    asset_id: x.asset_id, title: (x.reason || t(`ops.stops.types.${x.event_type}`)).slice(0, 200),
    description: `${r?.machine.code} ${r?.report_date} ${hm(x.started_at, tz)}–${hm(x.ended_at, tz)}: ${x.reason ?? ""}`, is_breakdown: x.event_type === "breakdown" && x.ended_at === null,
  }), { success: false, onDone: (w) => notifications.show({ color: "teal", message: t("ops.stops.requestDone", { n: w.number }) }) });
  const r = q.data;
  const s = st.data;
  if (!r || !s) return <Loading />;
  const c = r.calc;
  const ed = r.can_edit;
  const discName = (did: string) => s.disciplines.find((d) => d.id === did)?.code ?? (did === "none" ? t("ops.tables.none") : "?");
  const secName = (sid: string | null) => s.machines.find((m) => m.id === r.machine.id)?.sections?.find((x) => x.id === sid)?.name ?? "—";
  const machineGrades = s.machines.find((m) => m.id === r.machine.id)?.grades ?? [];
  const lastSeg = r.segments[r.segments.length - 1];
  const lastReel = r.reels[r.reels.length - 1];
  const inProgress = c.in_progress;
  const discIds = [...new Set([...Object.keys(c.stops.downtime_by_discipline), ...Object.keys(c.stops.breaks_count_by_discipline)])];
  const orderedDiscs = [...s.disciplines.filter((d) => discIds.includes(d.id)).map((d) => d.id), ...discIds.filter((x) => !s.disciplines.some((d) => d.id === x))];
  const newRun = (): RunForm => ({
    start: lastSeg ? hm(lastSeg.ended_at, tz) : r.machine.day_start, end: "", grade_id: lastSeg?.grade_id ?? null, speed: lastSeg?.speed_mpm ?? "", reason: "", gc_h: "", gc_rej: "",
  });
  const editRun = (x: Segment): RunForm => ({
    id: x.id, start: hm(x.started_at, tz), end: hm(x.ended_at, tz), grade_id: x.grade_id, speed: x.speed_mpm ?? "", reason: x.reason ?? "",
    gc_h: x.grade_change_hours ?? "", gc_rej: x.grade_change_reject_mt ?? "",
  });
  const newReel = (): ReelForm => ({
    shift: lastReel?.shift ?? r.machine.shifts[0]?.code ?? null, reel_no: lastReel ? nextReelNo(lastReel.reel_no) : "", gsm: lastReel?.gsm ?? lastSeg?.gsm ?? "",
    gross: "", net: "", reject: "", b: "", s: "", note: "",
  });
  const editReel = (x: Reel): ReelForm => ({
    id: x.id, shift: x.shift, reel_no: x.reel_no, gsm: x.gsm ?? "", gross: x.gross_mt, net: x.net_mt, reject: x.reject_mt || "", b: x.b_grade_mt || "", s: x.s_grade_mt || "", note: x.note ?? "",
  });
  const editStop = (x: Stop): StopForm => ({
    id: x.id, type: x.event_type, start: hm(x.started_at, tz), end: x.ended_at ? hm(x.ended_at, tz) : "", section_id: x.section_id, reason: x.reason ?? "",
    parts: x.parts.length ? x.parts.map((p) => ({ discipline_id: p.discipline_id, hours: p.hours })) : [{ discipline_id: null, hours: "" }],
  });
  const editLoss = (x: Loss): LossForm => ({
    id: x.id, kind: x.kind, shift: x.shift, defect_id: x.defect_id, defect_text: x.defect_text ?? "", qty: x.qty_mt, disposition: x.disposition ?? "",
  });
  const warnText = (w: { code: string; item?: string; hours?: number; reels?: number; losses?: number }) => t(`ops.warn.${w.code}`, { hours: w.hours, reels: w.reels, losses: w.losses, item: w.item });
  return (
    <>
      <PageHeader title={`${t("ops.report.title")} · ${r.machine.code} · ${r.report_date}`} actions={<>
        <Button variant="default" component={Link} href={`/operations/${id}/print`} leftSection={<IconPrinter size={16} />}>{t("ops.report.print")}</Button>
        {r.status === "draft" && !inProgress && can("op.enter") && <ConfirmButton color="blue" loading={act.isPending} onConfirm={() => act.mutate("submit")}>{t("ops.report.submit")}</ConfirmButton>}
        {r.status !== "confirmed" && !inProgress && can("op.confirm") && <ConfirmButton color="teal" loading={act.isPending} onConfirm={() => act.mutate("confirm")}>{t("ops.report.confirm")}</ConfirmButton>}
        {r.status !== "draft" && can("op.confirm") && <Button variant="light" color="orange" onClick={() => setReopen(true)}>{t("ops.report.reopen")}</Button>}
        {r.status === "draft" && can("op.confirm") && <ActionIcon variant="subtle" color="red" size="lg" aria-label={t("ops.report.delete")}
          onClick={() => { if (window.confirm(t("ops.report.deleteConfirm"))) remove.mutate(undefined); }}><IconTrash size={18} /></ActionIcon>}
      </>}>
        <Group gap="xs">
          <ActionIcon variant="default" disabled={!r.prev} aria-label={t("common.prev")} onClick={() => r.prev && router.push(`/operations/${r.prev.id}`)}><IconArrowLeft size={16} /></ActionIcon>
          <ActionIcon variant="default" disabled={!r.next} aria-label={t("common.next")} onClick={() => r.next && router.push(`/operations/${r.next.id}`)}><IconArrowRight size={16} /></ActionIcon>
          <StatusBadge value={r.status} />
          {r.revision > 1 && <Badge variant="outline" color="gray">{t("ops.report.revision", { n: r.revision })}</Badge>}
          <Text size="sm" c="dimmed">{r.machine.name} · {hm(c.window.start, tz)}–{hm(c.window.end, tz)}</Text>
          {r.submitted_by && <Text size="sm" c="dimmed">· {t("ops.report.submittedBy", { who: r.submitted_by })}</Text>}
          {r.confirmed_by && <Text size="sm" c="dimmed">· {t("ops.report.confirmedBy", { who: r.confirmed_by })}</Text>}
          <Button variant="subtle" size="compact-sm" component={Link} href="/operations">{t("ops.title")}</Button>
        </Group>
      </PageHeader>
      <Stack>
        {r.status === "submitted" && <Alert color="blue" icon={<IconLock />}>{t("ops.report.readOnlySubmitted")}</Alert>}
        {r.status === "confirmed" && <Alert color="teal" icon={<IconLock />}>{t("ops.report.readOnlyConfirmed")}</Alert>}
        {r.reopen_note && r.status === "draft" && <Alert color="orange">{t("ops.report.reopened", { note: r.reopen_note })}</Alert>}
        {inProgress && <Alert color="gray">{t("ops.report.inProgress")}</Alert>}
        {c.warnings.length > 0 && !inProgress && (
          <Alert color="orange" icon={<IconAlertTriangle />} title={t("ops.warn.title")}>
            <Stack gap={2}>{c.warnings.map((w, i) => <Text key={i} size="sm">{warnText(w)}</Text>)}</Stack>
          </Alert>
        )}
        <SimpleGrid cols={{ base: 2, sm: 3, lg: 6 }}>
          <Tile label={t("ops.tiles.gross")} value={`${t3(c.day.gross)} t`} sub={`${t("ops.tiles.reels")}: ${c.day.reels}`} />
          <Tile label={t("ops.tiles.net")} value={`${t3(c.day.net)} t`} sub={`${t("ops.tiles.trim")} ${t3(c.day.trim)} t (${pct(c.day.trim_pct)})`} />
          <Tile label={t("ops.tiles.a")} value={`${t3(c.day.a)} t`} sub={`B ${t3(c.day.b)} · S ${t3(c.day.s)} · ${t("ops.tiles.reject")} ${t3(c.day.reject)}`} />
          <Tile label={t("ops.tiles.oee")} value={pct(c.oee.oee)} color={inProgress ? undefined : oeeColor(c.oee.oee)}
            sub={`\u2066${pct(c.oee.availability)} × ${pct(c.oee.performance)} × ${pct(c.oee.quality)}\u2069`} />
          <Tile label={t("ops.tiles.run")} value={hhmm(c.run_hours)} sub={`${t("ops.tiles.ideal")} ${t3(c.ideal_mt)} t`} />
          <Tile label={t("ops.tiles.breaks")} value={String(c.stops.breaks_count)} sub={`${hhmm(c.stops.breaks_hours)} · ${t("ops.tiles.downtime")} ${hhmm(c.stops.downtime_hours)}`} />
        </SimpleGrid>
        <Text size="xs" c="dimmed">{t("ops.report.oeeFormula")}</Text>

        <Section title={t("ops.shifts.title")}>
          <Table.ScrollContainer minWidth={760}>
            <Table striped>
              <Table.Thead><Table.Tr>
                <Table.Th>{t("ops.shifts.shift")}</Table.Th><Table.Th>{t("ops.shifts.supervisor")}</Table.Th><Table.Th>{t("ops.shifts.gsm")}</Table.Th>
                <Table.Th>{t("ops.shifts.speed")}</Table.Th><Table.Th>{t("ops.shifts.run")}</Table.Th><Table.Th>{t("ops.tiles.gross")}</Table.Th>
                <Table.Th>{t("ops.tiles.net")}</Table.Th><Table.Th>{t("ops.tiles.a")}</Table.Th><Table.Th>B</Table.Th><Table.Th>S</Table.Th>
                <Table.Th>{t("ops.tiles.reject")}</Table.Th><Table.Th>{t("ops.tiles.trim")}</Table.Th><Table.Th>B %</Table.Th><Table.Th>{t("ops.cols.rejectPct")}</Table.Th>
              </Table.Tr></Table.Thead>
              <Table.Tbody>
                {c.shifts.map((x) => (
                  <Table.Tr key={x.code}>
                    <Table.Td className="nowrap">{x.name}</Table.Td><Table.Td><Supervisor key={`${r.id}-${x.code}`} r={r} code={x.code} /></Table.Td>
                    <Table.Td>{x.gsm?.join(" / ") || "—"}</Table.Td><Table.Td>{x.speed?.join(" / ") || "—"}</Table.Td><Table.Td>{hhmm(x.run_hours)}</Table.Td>
                    <Table.Td>{t3(x.gross)}</Table.Td><Table.Td>{t3(x.net)}</Table.Td><Table.Td>{t3(x.a)}</Table.Td><Table.Td>{t3(x.b)}</Table.Td><Table.Td>{t3(x.s)}</Table.Td>
                    <Table.Td>{t3(x.reject)}</Table.Td><Table.Td>{t3(x.trim)}</Table.Td><Table.Td>{pct(x.b_pct, 2)}</Table.Td><Table.Td>{pct(x.reject_pct, 2)}</Table.Td>
                  </Table.Tr>
                ))}
                <Table.Tr fw={700}>
                  <Table.Td>{t("ops.tables.total")}</Table.Td><Table.Td /><Table.Td /><Table.Td /><Table.Td>{hhmm(c.run_hours)}</Table.Td>
                  <Table.Td>{t3(c.day.gross)}</Table.Td><Table.Td>{t3(c.day.net)}</Table.Td><Table.Td>{t3(c.day.a)}</Table.Td><Table.Td>{t3(c.day.b)}</Table.Td><Table.Td>{t3(c.day.s)}</Table.Td>
                  <Table.Td>{t3(c.day.reject)}</Table.Td><Table.Td>{t3(c.day.trim)}</Table.Td><Table.Td>{pct(c.day.b_pct, 2)}</Table.Td><Table.Td>{pct(c.day.reject_pct, 2)}</Table.Td>
                </Table.Tr>
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        </Section>

        <Section title={t("ops.runs.title")} actions={ed ? <Button size="xs" leftSection={<IconPlus size={14} />} onClick={() => setRun(newRun())}>{t("ops.runs.add")}</Button> : undefined}>
          <Table.ScrollContainer minWidth={700}>
            <Table striped>
              <Table.Thead><Table.Tr>
                <Table.Th>{t("ops.runs.start")}</Table.Th><Table.Th>{t("ops.runs.end")}</Table.Th><Table.Th>{t("ops.runs.duration")}</Table.Th><Table.Th>GSM</Table.Th>
                <Table.Th>{t("ops.runs.speed")}</Table.Th><Table.Th>{t("ops.runs.rate")}</Table.Th><Table.Th>{t("ops.runs.ideal")}</Table.Th><Table.Th>{t("ops.runs.reason")}</Table.Th><Table.Th />
              </Table.Tr></Table.Thead>
              <Table.Tbody>
                {r.segments.map((x) => (
                  <Table.Tr key={x.id}>
                    <Table.Td><Time iso={x.started_at} date={r.report_date} tz={tz} /></Table.Td><Table.Td><Time iso={x.ended_at} date={r.report_date} tz={tz} /></Table.Td>
                    <Table.Td>{hhmm(x.hours)}</Table.Td><Table.Td>{x.gsm}</Table.Td><Table.Td>{x.speed_mpm ?? "—"}</Table.Td><Table.Td>{x.ideal_mt_min}</Table.Td><Table.Td>{t3(x.ideal_mt)}</Table.Td>
                    <Table.Td>{x.reason}{x.grade_change_hours ? ` · ${t("ops.runs.gcHours")} ${x.grade_change_hours}` : ""}{x.grade_change_reject_mt ? ` · ${t("ops.runs.gcReject")} ${x.grade_change_reject_mt}` : ""}</Table.Td>
                    <Table.Td>{ed && <RowActions edit={() => setRun(editRun(x))} remove={() => rm.mutate(`/operations/segments/${x.id}`)} />}</Table.Td>
                  </Table.Tr>
                ))}
                <Table.Tr fw={700}><Table.Td colSpan={2}>{t("ops.tables.total")}</Table.Td><Table.Td>{hhmm(c.run_hours)}</Table.Td><Table.Td colSpan={3} /><Table.Td>{t3(c.ideal_mt)}</Table.Td><Table.Td colSpan={2} /></Table.Tr>
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
          {machineGrades.length === 0 && <Text size="sm" c="orange">{t("ops.runs.noGrade")}</Text>}
        </Section>

        <Section title={t("ops.stops.title")} actions={ed ? <Button size="xs" leftSection={<IconPlus size={14} />}
          onClick={() => setStop({ type: "breakdown", start: "", end: "", section_id: null, reason: "", parts: [{ discipline_id: null, hours: "" }] })}>{t("ops.stops.add")}</Button> : undefined}>
          <Table.ScrollContainer minWidth={760}>
            <Table striped>
              <Table.Thead><Table.Tr>
                <Table.Th>{t("ops.stops.type")}</Table.Th><Table.Th>{t("ops.stops.start")}</Table.Th><Table.Th>{t("ops.stops.end")}</Table.Th><Table.Th>{t("ops.stops.duration")}</Table.Th>
                <Table.Th>{t("ops.stops.section")}</Table.Th><Table.Th>{t("ops.stops.who")}</Table.Th><Table.Th>{t("ops.stops.details")}</Table.Th><Table.Th />
              </Table.Tr></Table.Thead>
              <Table.Tbody>
                {r.stops.map((x) => (
                  <Table.Tr key={x.id}>
                    <Table.Td><Group gap={4} wrap="nowrap"><Badge variant="light" color={x.event_type === "sheet_break" ? "grape" : x.event_type === "planned" ? "gray" : x.event_type === "breakdown" ? "red" : "yellow"}>{t(`ops.stops.types.${x.event_type}`)}</Badge>
                      {x.is_failure && <IconTool size={14} title={t("ops.stops.failure")} />}</Group></Table.Td>
                    <Table.Td><Time iso={x.started_at} date={r.report_date} tz={tz} /></Table.Td>
                    <Table.Td>{x.ended_at ? <Time iso={x.ended_at} date={r.report_date} tz={tz} /> : <Text size="sm" c="red">{t("ops.stops.noEnd")}</Text>}</Table.Td>
                    <Table.Td>{hhmm(x.hours)}</Table.Td><Table.Td>{secName(x.section_id)}</Table.Td>
                    <Table.Td className="nowrap">{x.parts.map((p) => `${discName(p.discipline_id)}${x.parts.length > 1 ? ` ${hhmm(p.hours)}` : ""}`).join(" + ") || "—"}</Table.Td>
                    <Table.Td>{x.reason}</Table.Td>
                    <Table.Td><RowActions edit={ed ? () => setStop(editStop(x)) : undefined} remove={ed ? () => rm.mutate(`/operations/stops/${x.id}`) : undefined}
                      extra={x.event_type === "breakdown" && can("request.create") ? <Button size="compact-xs" variant="light" loading={request.isPending} onClick={() => request.mutate(x)}>{t("ops.stops.request")}</Button> : undefined} /></Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
          {orderedDiscs.length + c.stops.planned_hours + c.stops.other_hours > 0 && (
            <Table.ScrollContainer minWidth={500} mt="sm">
              <Table withTableBorder withColumnBorders>
                <Table.Thead><Table.Tr><Table.Th />{orderedDiscs.map((d) => <Table.Th key={d}>{discName(d)}</Table.Th>)}<Table.Th>{t("ops.tables.planned")}</Table.Th><Table.Th>{t("ops.tables.other")}</Table.Th><Table.Th>{t("ops.tables.total")}</Table.Th></Table.Tr></Table.Thead>
                <Table.Tbody>
                  <Table.Tr><Table.Td className="nowrap">{t("ops.tables.downtime")}</Table.Td>{orderedDiscs.map((d) => <Table.Td key={d}>{hhmm(c.stops.downtime_by_discipline[d] ?? 0)}</Table.Td>)}
                    <Table.Td>{hhmm(c.stops.planned_hours)}</Table.Td><Table.Td>{hhmm(c.stops.other_hours)}</Table.Td><Table.Td fw={700}>{hhmm(c.stops.downtime_hours)}</Table.Td></Table.Tr>
                  <Table.Tr><Table.Td className="nowrap">{t("ops.tables.breaks")} ({t("ops.tables.count")})</Table.Td>{orderedDiscs.map((d) => <Table.Td key={d}>{c.stops.breaks_count_by_discipline[d] ?? 0}</Table.Td>)}<Table.Td /><Table.Td /><Table.Td fw={700}>{c.stops.breaks_count}</Table.Td></Table.Tr>
                  <Table.Tr><Table.Td className="nowrap">{t("ops.tables.breaks")} ({t("ops.tables.hours")})</Table.Td>{orderedDiscs.map((d) => <Table.Td key={d}>{hhmm(c.stops.breaks_hours_by_discipline[d] ?? 0)}</Table.Td>)}<Table.Td /><Table.Td /><Table.Td fw={700}>{hhmm(c.stops.breaks_hours)}</Table.Td></Table.Tr>
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          )}
        </Section>

        <Section title={`${t("ops.reels.title")} (${r.reels.length})`} actions={ed ? <Button size="xs" leftSection={<IconPlus size={14} />} onClick={() => setReel(newReel())}>{t("ops.reels.add")}</Button> : undefined}>
          <Table.ScrollContainer minWidth={700}>
            <Table striped>
              <Table.Thead><Table.Tr>
                <Table.Th>{t("ops.reels.shift")}</Table.Th><Table.Th>{t("ops.reels.reelNo")}</Table.Th><Table.Th>GSM</Table.Th><Table.Th>{t("ops.reels.gross")}</Table.Th>
                <Table.Th>{t("ops.reels.net")}</Table.Th><Table.Th>{t("ops.reels.reject")}</Table.Th><Table.Th>{t("ops.reels.b")}</Table.Th><Table.Th>{t("ops.reels.s")}</Table.Th>
                <Table.Th>{t("ops.reels.trim")}</Table.Th><Table.Th>{t("ops.reels.note")}</Table.Th><Table.Th />
              </Table.Tr></Table.Thead>
              <Table.Tbody>
                {r.reels.map((x) => (
                  <Table.Tr key={x.id}>
                    <Table.Td>{x.shift}</Table.Td><Table.Td className="mono">{x.reel_no}</Table.Td><Table.Td>{x.gsm ?? "—"}</Table.Td><Table.Td>{t3(x.gross_mt)}</Table.Td><Table.Td>{t3(x.net_mt)}</Table.Td>
                    <Table.Td>{x.reject_mt ? t3(x.reject_mt) : ""}</Table.Td><Table.Td>{x.b_grade_mt ? t3(x.b_grade_mt) : ""}</Table.Td><Table.Td>{x.s_grade_mt ? t3(x.s_grade_mt) : ""}</Table.Td>
                    <Table.Td>{t3(x.trim_mt)}</Table.Td><Table.Td>{x.note}</Table.Td>
                    <Table.Td>{ed && <RowActions edit={() => setReel(editReel(x))} remove={() => rm.mutate(`/operations/reels/${x.id}`)} />}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
          {Object.keys(c.gross_by_gsm).length > 0 && <Text size="sm" mt="xs">{t("ops.tables.byGsm")}: {Object.entries(c.gross_by_gsm).map(([g, v]) => `${g} gsm ${t3(v)}`).join(" · ")}</Text>}
        </Section>

        <Section title={t("ops.losses.title")} actions={ed ? <Button size="xs" leftSection={<IconPlus size={14} />}
          onClick={() => setLoss({ kind: "reject", shift: null, defect_id: null, defect_text: "", qty: "", disposition: "" })}>{t("ops.losses.add")}</Button> : undefined}>
          <Table striped>
            <Table.Thead><Table.Tr><Table.Th>{t("ops.losses.kind")}</Table.Th><Table.Th>{t("ops.reels.shift")}</Table.Th><Table.Th>{t("ops.losses.defect")}</Table.Th>
              <Table.Th>{t("ops.losses.qty")}</Table.Th><Table.Th>{t("ops.losses.disposition")}</Table.Th><Table.Th /></Table.Tr></Table.Thead>
            <Table.Tbody>
              {r.losses.map((x) => (
                <Table.Tr key={x.id}>
                  <Table.Td>{t(`ops.losses.kinds.${x.kind}`)}</Table.Td><Table.Td>{x.shift ?? "—"}</Table.Td>
                  <Table.Td>{[s.defects.find((d) => d.id === x.defect_id)?.name, x.defect_text].filter(Boolean).join(" – ")}</Table.Td>
                  <Table.Td>{t3(x.qty_mt)}</Table.Td><Table.Td>{x.disposition}</Table.Td>
                  <Table.Td>{ed && <RowActions edit={() => setLoss(editLoss(x))} remove={() => rm.mutate(`/operations/losses/${x.id}`)} />}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
          <Text size="xs" c="dimmed" mt="xs">{t("ops.losses.explained", { r: t3(c.day.reject), d: t3(c.day.b + c.day.s) })}</Text>
        </Section>

        <Utilities key={`${r.id}-${r.status}`} r={r} />

        <Paper withBorder p="md" radius="md"><Stack><PeriodTiles p={c.mtd} title={t("ops.tiles.mtd")} /><PeriodTiles p={c.ytd} title={t("ops.tiles.ytd")} /></Stack></Paper>
      </Stack>
      <RunModal key={`run-${run?.id ?? "new"}-${String(!!run)}`} r={r} s={s} form={run} onClose={() => setRun(null)} />
      <ReelModal key={`reel-${reel?.id ?? "new"}-${String(!!reel)}`} r={r} form={reel} onClose={() => setReel(null)} />
      <StopModal key={`stop-${stop?.id ?? "new"}-${String(!!stop)}`} r={r} s={s} form={stop} onClose={() => setStop(null)} />
      <LossModal key={`loss-${loss?.id ?? "new"}-${String(!!loss)}`} r={r} s={s} form={loss} onClose={() => setLoss(null)} />
      <Modal opened={reopen} onClose={() => setReopen(false)} title={t("ops.report.reopenTitle")}>
        <Stack>
          <Textarea label={t("ops.report.reopenNote")} value={note} onChange={(e) => setNote(e.currentTarget.value)} autosize minRows={2} />
          <Button color="orange" disabled={note.trim().length < 3} loading={doReopen.isPending} onClick={() => doReopen.mutate(undefined)}>{t("ops.report.reopen")}</Button>
        </Stack>
      </Modal>
    </>
  );
}

export default function OperationsReportPage() {
  return <Guard perm="op.view"><ReportView /></Guard>;
}
