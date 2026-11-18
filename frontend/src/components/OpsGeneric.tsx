"use client";

// Daily production report of a line with the generic report profile (any continuous, batch or discrete line):
// output lines (product, batch / order, produced, reject, downgrade, run time), stops classified by loss category,
// quality losses, shift totals and KPIs. Paper machines use their own profile page.

import { ActionIcon, Alert, Badge, Button, Checkbox, Group, NumberInput, SegmentedControl, Select, SimpleGrid, Stack, Table, Text, Textarea, TextInput } from "@mantine/core";
import { IconAlertTriangle, IconLock, IconPencil, IconPlus, IconTool, IconTrash } from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";
import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Modal } from "@/components/Modal";
import { oeeColor, Tile } from "@/components/Ops";
import { Section } from "@/components/ui";
import { del, patch, post, put } from "@/lib/api";
import { fmtNum, useMut, useQ } from "@/lib/hooks";
import { atTime, hhmm, hm, pct, type GenericCalc, type Loss, type LossCategory, type OpSettings, type Output, type Product, type Report, type Stop } from "@/lib/ops";
import { useSession } from "@/lib/session";

type Num = number | string;
const num = (v: Num | null | undefined): number | null => (v === "" || v === null || v === undefined ? null : Number(v));

function RowActions({ edit, remove, extra }: { edit?: () => void; remove?: () => void; extra?: ReactNode }) {
  const { t } = useTranslation();
  return (
    <Group gap={2} wrap="nowrap" justify="flex-end">
      {extra}
      {edit && <ActionIcon variant="subtle" aria-label={t("common.edit")} onClick={edit}><IconPencil size={16} /></ActionIcon>}
      {remove && <ActionIcon variant="subtle" color="red" aria-label={t("common.delete")} onClick={() => { if (window.confirm(t("common.confirm"))) remove(); }}><IconTrash size={16} /></ActionIcon>}
    </Group>
  );
}

// ---------------- output lines
interface OutForm { id?: string; shift: string | null; product_id: string | null; order_ref: string; run_hours: Num; planned: Num; input: Num; produced: Num; reject: Num; downgrade: Num; completed: boolean; note: string }

function OutputModal({ r, products, form, onClose }: { r: Report; products: Product[]; form: OutForm | null; onClose: () => void }) {
  const { t } = useTranslation();
  const [f, setF] = useState<OutForm | null>(form);
  const u = r.machine.output_unit;
  const batch = r.machine.production_model !== "continuous";
  const save = useMut(() => {
    if (!f) return Promise.resolve();
    const body = { shift: f.shift, product_id: f.product_id, order_ref: f.order_ref.trim() || null, run_hours: num(f.run_hours), planned_qty: num(f.planned), input_qty: num(f.input),
      produced_qty: num(f.produced) ?? 0, reject_qty: num(f.reject) ?? 0, downgrade_qty: num(f.downgrade) ?? 0, completed: f.completed, note: f.note || null };
    return f.id ? put(`/operations/outputs/${f.id}`, body) : post(`/operations/reports/${r.id}/outputs`, body);
  }, { onDone: onClose });
  if (!f) return null;
  const set = (p: Partial<OutForm>) => setF({ ...f, ...p });
  const prods = products.filter((p) => (p.is_active || p.id === f.product_id) && (!p.machine_id || p.machine_id === r.machine.id));
  const good = (num(f.produced) ?? 0) - (num(f.reject) ?? 0) - (num(f.downgrade) ?? 0);
  return (
    <Modal opened onClose={onClose} title={t("gen.out.title")} size="lg">
      <Stack>
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <Select label={t("ops.reels.shift")} clearable data={r.machine.shifts.map((x) => ({ value: x.code, label: `${x.code} – ${x.name}` }))} value={f.shift} onChange={(v) => set({ shift: v })} />
          <Select label={t("gen.out.product")} clearable searchable data={prods.map((p) => ({ value: p.id, label: `${p.code} – ${p.name}` }))} value={f.product_id} onChange={(v) => set({ product_id: v })} />
          <TextInput label={batch ? t("gen.out.batch") : t("gen.out.order")} value={f.order_ref} onChange={(e) => set({ order_ref: e.currentTarget.value })} maxLength={60} />
          <NumberInput label={t("gen.out.runHours")} description={t("gen.out.runHint")} min={0} max={24} decimalScale={2} value={f.run_hours} onChange={(v) => set({ run_hours: v })} />
        </SimpleGrid>
        <SimpleGrid cols={{ base: 2, sm: 3 }}>
          <NumberInput label={`${t("gen.out.produced")} (${u})`} required min={0} decimalScale={3} value={f.produced} onChange={(v) => set({ produced: v })} />
          <NumberInput label={`${t("ops.tiles.reject")} (${u})`} min={0} decimalScale={3} value={f.reject} onChange={(v) => set({ reject: v })} />
          <NumberInput label={`${t("gen.tiles.downgrade")} (${u})`} min={0} decimalScale={3} value={f.downgrade} onChange={(v) => set({ downgrade: v })} />
          <NumberInput label={`${t("gen.out.planned")} (${u})`} min={0} decimalScale={3} value={f.planned} onChange={(v) => set({ planned: v })} />
          <NumberInput label={`${t("gen.out.input")}`} description={t("gen.out.inputHint")} min={0} decimalScale={3} value={f.input} onChange={(v) => set({ input: v })} />
          <TextInput label={`${t("gen.tiles.good")} (${u})`} readOnly value={fmtNum(good, 3)} c={good < 0 ? "red" : undefined} />
        </SimpleGrid>
        {batch && <Checkbox label={t("gen.out.completed")} checked={f.completed} onChange={(e) => set({ completed: e.currentTarget.checked })} />}
        <TextInput label={t("ops.reels.note")} value={f.note} onChange={(e) => set({ note: e.currentTarget.value })} maxLength={300} />
        <Button loading={save.isPending} disabled={num(f.produced) === null || good < 0} onClick={() => save.mutate(undefined)}>{t("common.save")}</Button>
      </Stack>
    </Modal>
  );
}

// ---------------- stops (by loss category)
interface StopForm { id?: string; cat: string | null; start: string; end: string; section_id: string | null; reason: string; parts: { discipline_id: string | null; hours: Num }[] }

function StopModal({ r, s, cats, form, onClose }: { r: Report; s: OpSettings; cats: LossCategory[]; form: StopForm | null; onClose: () => void }) {
  const { t } = useTranslation();
  const [f, setF] = useState<StopForm | null>(form);
  const sections = (s.machines.find((m) => m.id === r.machine.id)?.sections ?? []).filter((x) => x.is_active || x.id === f?.section_id);
  const discs = s.disciplines.filter((d) => d.is_active || f?.parts.some((p) => p.discipline_id === d.id));
  const save = useMut(() => {
    if (!f) return Promise.resolve();
    const parts = f.parts.filter((p) => p.discipline_id).map((p) => ({ discipline_id: p.discipline_id, hours: f.parts.length > 1 ? num(p.hours) : null }));
    const body = { loss_category_id: f.cat, started_at: atTime(r.report_date, r.machine.day_start, f.start), ended_at: f.end ? atTime(r.report_date, r.machine.day_start, f.end) : null,
      section_id: f.section_id, reason: f.reason || null, parts };
    return f.id ? put(`/operations/stops/${f.id}`, body) : post(`/operations/reports/${r.id}/stops`, body);
  }, { onDone: onClose });
  if (!f) return null;
  const set = (p: Partial<StopForm>) => setF({ ...f, ...p });
  const cat = cats.find((c) => c.id === f.cat);
  const parent = (c: LossCategory) => cats.find((x) => x.id === c.parent_id);
  const options = cats.filter((c) => c.is_active || c.id === f.cat).map((c) => ({ value: c.id, label: parent(c) ? `${parent(c)!.name} › ${c.name}` : c.name }));
  const needWho = !!cat && (cat.failure || cat.event_type === "breakdown") && !cat.discipline_id;
  const split = f.parts.length > 1;
  return (
    <Modal opened onClose={onClose} title={t("ops.stops.title")} size="lg">
      <Stack>
        <Select label={t("gen.stop.category")} required searchable data={options} value={f.cat} onChange={(v) => set({ cat: v })}
          description={cat ? t(`gen.affects.${cat.affects}`) + (cat.failure ? ` · ${t("ops.stops.failure")}` : "") + (cat.planned ? ` · ${t("ops.tables.planned")}` : "") : undefined} />
        <SimpleGrid cols={2}>
          <TextInput type="time" label={t("ops.stops.start")} required value={f.start} onChange={(e) => set({ start: e.currentTarget.value })} />
          <TextInput type="time" label={t("ops.stops.end")} value={f.end} onChange={(e) => set({ end: e.currentTarget.value })} />
        </SimpleGrid>
        {sections.length > 0 && <Select label={t("ops.stops.section")} clearable searchable value={f.section_id} onChange={(v) => set({ section_id: v })} data={sections.map((x) => ({ value: x.id, label: x.name }))} />}
        <Textarea label={t("ops.stops.details")} autosize minRows={2} value={f.reason} onChange={(e) => set({ reason: e.currentTarget.value })} />
        <Stack gap={6}>
          <Text size="sm" fw={500}>{t("ops.stops.who")}</Text>
          {f.parts.map((p, i) => (
            <Group key={i} gap="xs" wrap="nowrap" align="flex-end">
              <Select style={{ flex: 1 }} searchable clearable value={p.discipline_id} aria-label={t("ops.stops.who")} data={discs.map((d) => ({ value: d.id, label: `${d.code} – ${d.name}` }))}
                onChange={(v) => set({ parts: f.parts.map((x, j) => (j === i ? { ...x, discipline_id: v } : x)) })} />
              {split && <NumberInput w={110} min={0} step={0.25} decimalScale={2} aria-label={t("ops.stops.hours")} placeholder={t("ops.stops.hours")} value={p.hours}
                onChange={(v) => set({ parts: f.parts.map((x, j) => (j === i ? { ...x, hours: v } : x)) })} />}
              {split && <ActionIcon variant="subtle" color="red" aria-label={t("common.delete")} onClick={() => set({ parts: f.parts.filter((_, j) => j !== i) })}><IconTrash size={16} /></ActionIcon>}
            </Group>
          ))}
          <Button size="xs" variant="subtle" w="fit-content" leftSection={<IconPlus size={14} />} onClick={() => set({ parts: [...f.parts, { discipline_id: null, hours: "" }] })}>{t("ops.stops.split")}</Button>
        </Stack>
        <Button loading={save.isPending} disabled={!f.start || !f.cat || (needWho && !f.parts.some((p) => p.discipline_id))} onClick={() => save.mutate(undefined)}>{t("common.save")}</Button>
      </Stack>
    </Modal>
  );
}

// ---------------- quality losses
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
        <SegmentedControl value={f.kind} onChange={(v) => set({ kind: v as Loss["kind"] })} data={(["reject", "downgrade"] as const).map((k) => ({ value: k, label: t(`gen.lossKinds.${k}`) }))} />
        <SimpleGrid cols={2}>
          <Select label={t("ops.reels.shift")} clearable data={r.machine.shifts.map((x) => ({ value: x.code, label: `${x.code} – ${x.name}` }))} value={f.shift} onChange={(v) => set({ shift: v })} />
          <NumberInput label={`${t("ops.losses.qty").replace(/, t$/, "")} (${r.machine.output_unit})`} required min={0} decimalScale={3} value={f.qty} onChange={(v) => set({ qty: v })} />
        </SimpleGrid>
        <Select label={t("ops.losses.defect")} clearable searchable value={f.defect_id} onChange={(v) => set({ defect_id: v, disposition: s.defects.find((d) => d.id === v)?.disposition ?? f.disposition })}
          data={s.defects.filter((d) => d.is_active || d.id === f.defect_id).map((d) => ({ value: d.id, label: `${d.name} (${d.disposition})` }))} />
        <TextInput label={t("ops.losses.defectText")} value={f.defect_text} onChange={(e) => set({ defect_text: e.currentTarget.value })} />
        <TextInput label={t("gen.lossDisposition")} value={f.disposition} onChange={(e) => set({ disposition: e.currentTarget.value })} maxLength={10} />
        <Button loading={save.isPending} disabled={num(f.qty) === null || (!f.defect_id && !f.defect_text.trim())} onClick={() => save.mutate(undefined)}>{t("common.save")}</Button>
      </Stack>
    </Modal>
  );
}

function Notes({ r }: { r: Report }) {
  const { t } = useTranslation();
  const [notes, setNotes] = useState(r.notes ?? "");
  const save = useMut(() => patch(`/operations/reports/${r.id}`, { notes: notes || null }));
  return (
    <Section title={t("gen.notes")} actions={r.can_edit ? <Button size="xs" loading={save.isPending} onClick={() => save.mutate(undefined)}>{t("common.save")}</Button> : undefined}>
      <Textarea autosize minRows={2} readOnly={!r.can_edit} value={notes} onChange={(e) => setNotes(e.currentTarget.value)} />
    </Section>
  );
}

/** The body of a generic report (the page keeps the header, workflow buttons and navigation). */
export function GenericReport({ r, s, extras }: { r: Report; s: OpSettings; extras?: ReactNode }) {
  const { t } = useTranslation();
  const { can, plant } = useSession();
  const tz = plant?.timezone;
  const c = r.calc as unknown as GenericCalc;
  const ed = r.can_edit;
  const u = r.machine.output_unit;
  const batch = r.machine.production_model !== "continuous";
  const products = useQ<Product[]>("/operations/products").data ?? [];
  const cats = useQ<LossCategory[]>("/operations/loss-categories").data ?? [];
  const [out, setOut] = useState<OutForm | null>(null);
  const [stop, setStop] = useState<StopForm | null>(null);
  const [loss, setLoss] = useState<LossForm | null>(null);
  const rm = useMut((path: string) => del(path), { success: false });
  const request = useMut((x: Stop) => post<{ number: string }>("/work-requests", {
    asset_id: x.asset_id, title: (x.reason || t("gen.stop.title")).slice(0, 200), description: `${r.machine.code} ${r.report_date} ${hm(x.started_at, tz)}–${hm(x.ended_at, tz)}: ${x.reason ?? ""}`,
    is_breakdown: x.ended_at === null,
  }), { success: false, onDone: (w) => notifications.show({ color: "teal", message: t("ops.stops.requestDone", { n: w.number }) }) });
  const prodName = (id: string | null) => products.find((p) => p.id === id)?.code ?? "—";
  const catName = (id: string | null) => cats.find((x) => x.id === id)?.name ?? "—";
  const discName = (did: string) => s.disciplines.find((d) => d.id === did)?.code ?? "?";
  const lastOut = r.outputs[r.outputs.length - 1];
  const newOut = (): OutForm => ({ shift: lastOut?.shift ?? r.machine.shifts[0]?.code ?? null, product_id: lastOut?.product_id ?? null, order_ref: "", run_hours: "", planned: "", input: "",
    produced: "", reject: "", downgrade: "", completed: true, note: "" });
  const editOut = (x: Output): OutForm => ({ id: x.id, shift: x.shift, product_id: x.product_id, order_ref: x.order_ref ?? "", run_hours: x.run_hours ?? "", planned: x.planned_qty ?? "",
    input: x.input_qty ?? "", produced: x.produced_qty, reject: x.reject_qty || "", downgrade: x.downgrade_qty || "", completed: x.completed, note: x.note ?? "" });
  const editStop = (x: Stop): StopForm => ({ id: x.id, cat: x.loss_category_id, start: hm(x.started_at, tz), end: x.ended_at ? hm(x.ended_at, tz) : "", section_id: x.section_id,
    reason: x.reason ?? "", parts: x.parts.length ? x.parts.map((p) => ({ discipline_id: p.discipline_id, hours: p.hours })) : [{ discipline_id: null, hours: "" }] });
  const warnText = (w: { code: string; item?: string; hours?: number; reels?: number; losses?: number }) => t(`gen.warn.${w.code}`, { hours: w.hours, reels: w.reels, losses: w.losses, item: w.item, defaultValue: t(`ops.warn.${w.code}`, { hours: w.hours, reels: w.reels, losses: w.losses, item: w.item }) });
  const q = (v: number | null | undefined) => (v === null || v === undefined ? "—" : fmtNum(v, 2));
  const lossCodes = Object.entries(c.loss_categories.hours_by_code).sort((a, b) => b[1] - a[1]);
  return (
    <Stack>
      {r.status === "submitted" && <Alert color="blue" icon={<IconLock />}>{t("ops.report.readOnlySubmitted")}</Alert>}
      {r.status === "confirmed" && <Alert color="teal" icon={<IconLock />}>{t("ops.report.readOnlyConfirmed")}</Alert>}
      {r.reopen_note && r.status === "draft" && <Alert color="orange">{t("ops.report.reopened", { note: r.reopen_note })}</Alert>}
      {c.in_progress && <Alert color="gray">{t("ops.report.inProgress")}</Alert>}
      {c.warnings.length > 0 && !c.in_progress && (
        <Alert color="orange" icon={<IconAlertTriangle />} title={t("ops.warn.title")}><Stack gap={2}>{c.warnings.map((w, i) => <Text key={i} size="sm">{warnText(w)}</Text>)}</Stack></Alert>
      )}
      <SimpleGrid cols={{ base: 2, sm: 3, lg: 6 }}>
        <Tile label={t("gen.tiles.produced")} value={`${q(c.day.produced)} ${u}`} sub={c.day.target_pct !== null ? `${t("gen.tiles.target")} ${pct(c.day.target_pct)}` : `${t("gen.tiles.lines")}: ${c.day.lines}`} />
        <Tile label={t("gen.tiles.good")} value={`${q(c.day.good)} ${u}`} sub={`${t("ops.tiles.reject")} ${q(c.day.reject)} · ${t("gen.tiles.downgrade")} ${q(c.day.downgrade)}`} />
        <Tile label={t("ops.tiles.oee")} value={pct(c.oee.oee)} color={c.in_progress ? undefined : oeeColor(c.oee.oee)}
          sub={c.oee.oee === null ? t("gen.tiles.oeeMissing") : `⁦${pct(c.oee.availability)} × ${pct(c.oee.performance)} × ${pct(c.oee.quality)}⁩`} />
        <Tile label={t("ops.tiles.run")} value={hhmm(c.run_hours)} sub={c.ideal !== null ? `${t("ops.tiles.ideal")} ${q(c.ideal)} ${u}` : t("gen.tiles.noRate")} />
        <Tile label={t("ops.tiles.downtime")} value={hhmm(c.stops.downtime_hours)} sub={`${t("ops.tables.planned")} ${hhmm(c.stops.planned_hours)} · ${t("gen.tiles.failures")} ${hhmm(c.loss_categories.failure_hours)}`} />
        {batch ? <Tile label={t("gen.tiles.batches")} value={`${c.day.batches_completed} / ${c.day.batches}`} sub={c.day.yield_pct !== null ? `${t("gen.tiles.yield")} ${pct(c.day.yield_pct)}` : undefined} />
          : <Tile label={t("gen.tiles.cycle")} value={c.cycle_time_s !== null ? `${fmtNum(c.cycle_time_s, 1)} s` : "—"} sub={c.day.yield_pct !== null ? `${t("gen.tiles.yield")} ${pct(c.day.yield_pct)}` : undefined} />}
      </SimpleGrid>

      <Section title={t("ops.shifts.title")}>
        <Table.ScrollContainer minWidth={620}><Table striped>
          <Table.Thead><Table.Tr><Table.Th>{t("ops.shifts.shift")}</Table.Th><Table.Th>{t("gen.tiles.produced")}</Table.Th><Table.Th>{t("gen.tiles.good")}</Table.Th>
            <Table.Th>{t("ops.tiles.reject")}</Table.Th><Table.Th>{t("gen.tiles.downgrade")}</Table.Th><Table.Th>{t("ops.shifts.run")}</Table.Th><Table.Th>{t("ops.tiles.downtime")}</Table.Th><Table.Th>{t("gen.tiles.target")}</Table.Th></Table.Tr></Table.Thead>
          <Table.Tbody>
            {c.shifts.map((x) => (
              <Table.Tr key={x.code}><Table.Td className="nowrap">{x.name}</Table.Td><Table.Td>{q(x.produced)}</Table.Td><Table.Td>{q(x.good)}</Table.Td><Table.Td>{q(x.reject)}</Table.Td>
                <Table.Td>{q(x.downgrade)}</Table.Td><Table.Td>{hhmm(x.run_hours)}</Table.Td><Table.Td>{hhmm(x.stop_hours)}</Table.Td><Table.Td>{pct(x.target_pct)}</Table.Td></Table.Tr>
            ))}
            <Table.Tr fw={700}><Table.Td>{t("ops.tables.total")}</Table.Td><Table.Td>{q(c.day.produced)}</Table.Td><Table.Td>{q(c.day.good)}</Table.Td><Table.Td>{q(c.day.reject)}</Table.Td>
              <Table.Td>{q(c.day.downgrade)}</Table.Td><Table.Td>{hhmm(c.run_hours)}</Table.Td><Table.Td>{hhmm(c.stops.downtime_hours)}</Table.Td><Table.Td>{pct(c.day.target_pct)}</Table.Td></Table.Tr>
          </Table.Tbody>
        </Table></Table.ScrollContainer>
      </Section>

      <Section title={t("gen.out.section")} actions={ed ? <Button size="xs" leftSection={<IconPlus size={14} />} onClick={() => setOut(newOut())}>{t("gen.out.add")}</Button> : undefined}>
        {products.length === 0 && <Text size="sm" c="dimmed" mb="xs">{t("gen.out.noProducts")}</Text>}
        <Table.ScrollContainer minWidth={760}><Table striped>
          <Table.Thead><Table.Tr><Table.Th>{t("ops.reels.shift")}</Table.Th><Table.Th>{t("gen.out.product")}</Table.Th><Table.Th>{batch ? t("gen.out.batch") : t("gen.out.order")}</Table.Th>
            <Table.Th>{t("gen.out.produced")}</Table.Th><Table.Th>{t("ops.tiles.reject")}</Table.Th><Table.Th>{t("gen.tiles.downgrade")}</Table.Th><Table.Th>{t("gen.tiles.good")}</Table.Th>
            <Table.Th>{t("ops.shifts.run")}</Table.Th><Table.Th>{t("ops.tiles.ideal")}</Table.Th><Table.Th>{t("gen.out.planned")}</Table.Th><Table.Th /></Table.Tr></Table.Thead>
          <Table.Tbody>
            {r.outputs.map((x) => (
              <Table.Tr key={x.id}>
                <Table.Td>{x.shift ?? "—"}</Table.Td><Table.Td>{prodName(x.product_id)}</Table.Td>
                <Table.Td className="mono">{x.order_ref ?? "—"}{batch && !x.completed && <Badge ms={4} size="xs" color="orange" variant="light">{t("gen.out.open")}</Badge>}</Table.Td>
                <Table.Td>{q(x.produced_qty)}</Table.Td><Table.Td>{x.reject_qty ? q(x.reject_qty) : ""}</Table.Td><Table.Td>{x.downgrade_qty ? q(x.downgrade_qty) : ""}</Table.Td>
                <Table.Td>{q(x.good_qty)}</Table.Td><Table.Td>{hhmm(x.hours)}</Table.Td><Table.Td>{q(x.ideal_qty)}</Table.Td><Table.Td>{q(x.planned_qty)}</Table.Td>
                <Table.Td>{ed && <RowActions edit={() => setOut(editOut(x))} remove={() => rm.mutate(`/operations/outputs/${x.id}`)} />}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table></Table.ScrollContainer>
        {Object.keys(c.by_product).length > 1 && <Text size="sm" mt="xs">{t("gen.out.byProduct")}: {Object.entries(c.by_product).map(([p, v]) => `${p} ${fmtNum(v, 1)} ${u}`).join(" · ")}</Text>}
      </Section>

      <Section title={t("gen.stop.title")} actions={ed ? <Button size="xs" leftSection={<IconPlus size={14} />}
        onClick={() => setStop({ cat: null, start: "", end: "", section_id: null, reason: "", parts: [{ discipline_id: null, hours: "" }] })}>{t("ops.stops.add")}</Button> : undefined}>
        {cats.length === 0 && <Text size="sm" c="orange" mb="xs">{t("gen.stop.noCats")}</Text>}
        <Table.ScrollContainer minWidth={700}><Table striped>
          <Table.Thead><Table.Tr><Table.Th>{t("gen.stop.category")}</Table.Th><Table.Th>{t("ops.stops.start")}</Table.Th><Table.Th>{t("ops.stops.end")}</Table.Th><Table.Th>{t("ops.stops.duration")}</Table.Th>
            <Table.Th>{t("ops.stops.who")}</Table.Th><Table.Th>{t("ops.stops.details")}</Table.Th><Table.Th /></Table.Tr></Table.Thead>
          <Table.Tbody>
            {r.stops.map((x) => (
              <Table.Tr key={x.id}>
                <Table.Td><Group gap={4} wrap="nowrap"><Badge variant="light" color={x.is_planned ? "gray" : x.is_failure ? "red" : "yellow"}>{catName(x.loss_category_id)}</Badge>{x.is_failure && <IconTool size={14} />}</Group></Table.Td>
                <Table.Td>{hm(x.started_at, tz)}</Table.Td><Table.Td>{x.ended_at ? hm(x.ended_at, tz) : <Text size="sm" c="red">{t("ops.stops.noEnd")}</Text>}</Table.Td><Table.Td>{hhmm(x.hours)}</Table.Td>
                <Table.Td className="nowrap">{x.parts.map((p) => `${discName(p.discipline_id)}${x.parts.length > 1 ? ` ${hhmm(p.hours)}` : ""}`).join(" + ") || "—"}</Table.Td>
                <Table.Td>{x.reason}</Table.Td>
                <Table.Td><RowActions edit={ed ? () => setStop(editStop(x)) : undefined} remove={ed ? () => rm.mutate(`/operations/stops/${x.id}`) : undefined}
                  extra={x.is_failure && can("request.create") ? <Button size="compact-xs" variant="light" loading={request.isPending} onClick={() => request.mutate(x)}>{t("ops.stops.request")}</Button> : undefined} /></Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table></Table.ScrollContainer>
        {lossCodes.length > 0 && <Text size="sm" mt="xs">{t("gen.stop.byCategory")}: {lossCodes.map(([code, h]) => `${cats.find((x) => x.code === code)?.name ?? "—"} ${hhmm(h)}`).join(" · ")}</Text>}
      </Section>

      <Section title={t("ops.losses.title")} actions={ed ? <Button size="xs" leftSection={<IconPlus size={14} />}
        onClick={() => setLoss({ kind: "reject", shift: null, defect_id: null, defect_text: "", qty: "", disposition: "" })}>{t("ops.losses.add")}</Button> : undefined}>
        <Table.ScrollContainer minWidth={460}><Table striped>
          <Table.Tbody>
            {r.losses.map((x) => (
              <Table.Tr key={x.id}><Table.Td>{t(`gen.lossKinds.${x.kind}`)}</Table.Td><Table.Td>{x.shift ?? "—"}</Table.Td>
                <Table.Td>{[s.defects.find((d) => d.id === x.defect_id)?.name, x.defect_text].filter(Boolean).join(" – ")}</Table.Td><Table.Td>{q(x.qty_mt)} {u}</Table.Td><Table.Td>{x.disposition}</Table.Td>
                <Table.Td>{ed && <RowActions edit={() => setLoss({ id: x.id, kind: x.kind, shift: x.shift, defect_id: x.defect_id, defect_text: x.defect_text ?? "", qty: x.qty_mt, disposition: x.disposition ?? "" })}
                  remove={() => rm.mutate(`/operations/losses/${x.id}`)} />}</Table.Td></Table.Tr>
            ))}
          </Table.Tbody>
        </Table></Table.ScrollContainer>
        <Text size="xs" c="dimmed" mt="xs">{t("gen.lossExplained", { r: q(c.day.reject), d: q(c.day.downgrade), u })}</Text>
      </Section>

      {extras}
      <Notes key={`${r.id}-${r.status}`} r={r} />
      {c.mtd && (
        <Section title={t("ops.tiles.mtd")}>
          <Group gap="lg">
            <Text size="sm">{t("gen.days", { n: c.mtd.days })}</Text>
            <Text size="sm">{t("gen.tiles.produced")}: <b>{q(c.mtd.measures.produced)} {u}</b></Text>
            <Text size="sm">{t("gen.tiles.good")}: <b>{q(c.mtd.measures.good)} {u}</b></Text>
            <Text size="sm">OEE: <b>{pct(c.mtd.oee.oee)}</b></Text>
            <Text size="sm">{t("ops.tiles.downtime")}: <b>{hhmm(c.mtd.measures.downtime_hours)}</b></Text>
          </Group>
        </Section>
      )}
      <OutputModal key={`o-${out?.id ?? "new"}-${String(!!out)}`} r={r} products={products} form={out} onClose={() => setOut(null)} />
      <StopModal key={`s-${stop?.id ?? "new"}-${String(!!stop)}`} r={r} s={s} cats={cats} form={stop} onClose={() => setStop(null)} />
      <LossModal key={`l-${loss?.id ?? "new"}-${String(!!loss)}`} r={r} s={s} form={loss} onClose={() => setLoss(null)} />
    </Stack>
  );
}
