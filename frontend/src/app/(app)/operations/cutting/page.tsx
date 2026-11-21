"use client";

// Paper waste, phase B: the cutting plan of the winder and the converting units after it (any number of sheeters and
// rewinders). Plans (reel and sheet orders of one machine and grade) → Calculate → the cutting patterns and how many sets
// of each, the route of each order through the units, their load, the trim, and the actual trim of the grade beside it.
// On phones the orders are cards, not a wide table.

import { ActionIcon, Alert, Badge, Button, Card, Group, NumberInput, Paper, SegmentedControl, Select, SimpleGrid, Stack, Switch, Table, Text, TextInput, Textarea, Tooltip } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { IconArrowBack, IconCalculator, IconLock, IconLockOpen, IconPencil, IconPlus, IconSettings, IconTrash } from "@tabler/icons-react";
import type { ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { useTranslation } from "react-i18next";
import { Guard } from "@/components/AppFrame";
import { Modal } from "@/components/Modal";
import { ConfirmButton, DataTable, Loading, PageHeader } from "@/components/ui";
import { del, post, put } from "@/lib/api";
import { fmtDate, fmtNum, useMut, useQ } from "@/lib/hooks";
import { pct } from "@/lib/ops";
import { useSession } from "@/lib/session";

interface Grade { id: string; code: string; gsm: number }
interface Unit { id?: string; code: string; name: string; kind: "sheeter" | "rewinder"; line_id: string | null; min_width_mm: number | string; max_width_mm: number | string;
  min_length_mm: number | string | null; max_length_mm: number | string | null; side_trim_mm: number | string; speed_mpm: number | string | null; change_minutes: number | string;
  stands: number | string; is_active: boolean; sort: number }
interface Winder { machine_id: string; code: string; name: string; saved: boolean; deckle_mm: number | null; max_reels: number; min_trim_mm: number;
  max_trim_mm: number; min_width_mm: number; change_cost_sets: number; set_length_m: number; grades: Grade[]; converters: Unit[] }
interface PlanRow { id: string; title: string; machine: string; machine_id: string; grade: string | null; gsm: number | null; status: string; orders_count: number;
  reels: number; sheets: number; trim_pct: number | null; sets: number | null; calculated_at: string | null; created_at: string; deckle_mm: number | null; grade_id: string | null; note: string | null }
interface Order { id?: string; customer: string | null; ref: string | null; kind: "reel" | "sheet"; width_mm: number | string; sheet_length_mm: number | string | null;
  converter_id: string | null; reels: number | string; tolerance_pct: number | string; due_date: string | null; made?: number | null }
interface Route { order: string; unit: string | null; unit_code: string | null; parent_width: number; across: number; reels: number; made: number; side_trim_mm: number }
interface Problem { code: string; params: Record<string, string | number> }
interface Result {
  status?: string; problems?: Problem[]; seconds?: number; patterns_considered?: number; capped?: boolean; deckle_mm?: number; sets?: number;
  patterns_used?: number; trim_mm_total?: number; trim_pct?: number | null; total_trim_pct?: number | null; converting_trim_mm_total?: number;
  patterns?: { widths: number[]; sets: number; trim_mm: number; trim_pct: number }[];
  widths?: { width: number; made: number; demand?: number; min?: number; max?: number; for?: string[] }[];
  routes?: Route[]; load?: { unit: string; code: string; kind: string; reels: number; sizes: number; hours: number | null }[];
}
interface Plan extends PlanRow { created_by: string | null; orders: Order[]; result: Result; winder: Winder;
  baseline: { from: string; to: string; machine_trim_pct: number | null; grade_trim_pct: number | null } }

const STATUS_COLOR: Record<string, string> = { draft: "gray", calculated: "blue", released: "teal" };
// one colour per width, the same in the bars and the legend
const COLORS = ["blue", "teal", "grape", "orange", "cyan", "lime", "indigo", "pink", "yellow", "violet"];

function WinderModal({ w, onClose }: { w: Winder; onClose: () => void }) {
  const { t } = useTranslation();
  const [f, setF] = useState({ deckle_mm: w.deckle_mm ?? 3000, max_reels: w.max_reels, min_trim_mm: w.min_trim_mm, max_trim_mm: w.max_trim_mm,
    min_width_mm: w.min_width_mm, change_cost_sets: w.change_cost_sets, set_length_m: w.set_length_m });
  const save = useMut(() => put(`/operations/cutting/winders/${w.machine_id}`, f), { onDone: onClose });
  const num = (k: keyof typeof f, label: string, min = 0, max = 12000, step = 1) => (
    <NumberInput label={label} value={f[k]} min={min} max={max} step={step} onChange={(v) => typeof v === "number" && setF({ ...f, [k]: v })} />
  );
  return (
    <Modal opened onClose={onClose} title={`${t("cut.winder")} · ${w.code}`}>
      <Stack>
        <Text size="sm" c="dimmed">{t("cut.winderHint")}</Text>
        <SimpleGrid cols={2}>
          {num("deckle_mm", t("cut.deckle"), 500)}
          {num("max_reels", t("cut.maxReels"), 1, 20)}
          {num("min_trim_mm", t("cut.minTrim"))}
          {num("max_trim_mm", t("cut.maxTrim"))}
          {num("min_width_mm", t("cut.minWidth"), 50)}
          {num("change_cost_sets", t("cut.changeCost"), 0, 100, 0.25)}
          {num("set_length_m", t("cut.setLength"), 0, 200000, 100)}
        </SimpleGrid>
        <Text size="xs" c="dimmed">{t("cut.setLengthHint")}</Text>
        <Button loading={save.isPending} disabled={f.max_trim_mm < f.min_trim_mm} onClick={() => save.mutate(undefined)}>{t("common.save")}</Button>
      </Stack>
    </Modal>
  );
}

const blankUnit = (kind: Unit["kind"]): Unit => ({ code: "", name: "", kind, line_id: null, min_width_mm: kind === "sheeter" ? 500 : 600, max_width_mm: kind === "sheeter" ? 1700 : 2600,
  min_length_mm: kind === "sheeter" ? 400 : null, max_length_mm: kind === "sheeter" ? 1600 : null, side_trim_mm: 10, speed_mpm: kind === "sheeter" ? 250 : 800,
  change_minutes: 30, stands: 1, is_active: true, sort: 0 });

function UnitModal({ machineId, unit, onClose }: { machineId: string; unit: Unit; onClose: () => void }) {
  const { t } = useTranslation();
  const [f, setF] = useState<Unit>(unit);
  const n = (v: number | string | null) => (v === "" || v === null ? null : Number(v));
  const body = { ...f, machine_id: machineId, min_width_mm: Number(f.min_width_mm), max_width_mm: Number(f.max_width_mm), min_length_mm: n(f.min_length_mm),
    max_length_mm: n(f.max_length_mm), side_trim_mm: Number(f.side_trim_mm), speed_mpm: n(f.speed_mpm), change_minutes: Number(f.change_minutes), stands: Number(f.stands) };
  const save = useMut(() => (f.id ? put(`/operations/cutting/converters/${f.id}`, body) : post("/operations/cutting/converters", body)), { onDone: onClose });
  const remove = useMut(() => del(`/operations/cutting/converters/${f.id}`), { onDone: onClose });
  const num = (k: keyof Unit, label: string, min = 0, max = 20000) => (
    <NumberInput label={label} value={(f[k] as number | string | null) ?? ""} min={min} max={max} onChange={(v) => setF({ ...f, [k]: v })} />
  );
  const sheeter = f.kind === "sheeter";
  return (
    <Modal opened onClose={onClose} title={f.id ? `${t("cut.unit")} · ${f.code}` : t("cut.addUnit")}>
      <Stack>
        <SegmentedControl value={f.kind} onChange={(v) => setF({ ...blankUnit(v as Unit["kind"]), id: f.id, code: f.code, name: f.name })}
          data={[{ value: "sheeter", label: t("cut.kind_sheeter") }, { value: "rewinder", label: t("cut.kind_rewinder") }]} />
        <SimpleGrid cols={2}>
          <TextInput label={t("cut.unitCode")} value={f.code} maxLength={20} onChange={(e) => setF({ ...f, code: e.currentTarget.value })} />
          <TextInput label={t("cut.unitName")} value={f.name} maxLength={120} onChange={(e) => setF({ ...f, name: e.currentTarget.value })} />
          {num("min_width_mm", t("cut.unitMinWidth"), 50)}
          {num("max_width_mm", t("cut.unitMaxWidth"), 50)}
          {sheeter && num("min_length_mm", t("cut.unitMinLength"), 50)}
          {sheeter && num("max_length_mm", t("cut.unitMaxLength"), 50)}
          {num("side_trim_mm", t("cut.unitSideTrim"))}
          {num("speed_mpm", t("cut.unitSpeed"), 1, 5000)}
          {num("change_minutes", t("cut.unitChange"), 0, 1440)}
          {num("stands", sheeter ? t("cut.unitStands") : t("cut.unitStandsRw"), 1, 12)}
        </SimpleGrid>
        <Switch label={t("cut.unitActive")} checked={f.is_active} onChange={(e) => setF({ ...f, is_active: e.currentTarget.checked })} />
        <Group justify="space-between">
          {f.id ? <ConfirmButton color="red" onConfirm={() => remove.mutate(undefined)}>{t("common.delete")}</ConfirmButton> : <span />}
          <Button loading={save.isPending} disabled={!f.code.trim() || !f.name.trim() || Number(f.max_width_mm) < Number(f.min_width_mm)} onClick={() => save.mutate(undefined)}>{t("common.save")}</Button>
        </Group>
      </Stack>
    </Modal>
  );
}

/** One label and value of an order card (phones). */
function Field({ label, children }: { label: string; children: ReactNode }) {
  return <div><Text size="xs" c="dimmed">{label}</Text>{children}</div>;
}

function PatternBar({ widths, deckle, color }: { widths: number[]; deckle: number; color: (w: number) => string }) {
  const trim = deckle - widths.reduce((a, b) => a + b, 0);
  return (
    <div dir="ltr" style={{ display: "flex", height: 26, borderRadius: 4, overflow: "hidden", border: "1px solid var(--mantine-color-default-border)" }}>
      {widths.map((w, i) => (
        <div key={i} title={`${w} mm`} style={{ width: `${(w / deckle) * 100}%`, background: `var(--mantine-color-${color(w)}-5)`, color: "white", fontSize: 11,
          display: "flex", alignItems: "center", justifyContent: "center", borderInlineEnd: "1px solid white", whiteSpace: "nowrap", overflow: "hidden" }}>{w}</div>
      ))}
      <div title={`trim ${trim} mm`} style={{ flex: 1, background: "repeating-linear-gradient(45deg, var(--mantine-color-red-2), var(--mantine-color-red-2) 4px, var(--mantine-color-red-4) 4px, var(--mantine-color-red-4) 8px)" }} />
    </div>
  );
}

function PlanView({ id, onBack }: { id: string; onBack: () => void }) {
  const { t } = useTranslation();
  const { can } = useSession();
  const q = useQ<Plan>(`/operations/cutting/plans/${id}`);
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [head, setHead] = useState<{ title: string; grade_id: string | null; deckle_mm: number | string; note: string } | null>(null);
  const saveOrders = useMut(() => put(`/operations/cutting/plans/${id}/orders`, { orders: (orders ?? []).map((o) => ({
    customer: o.customer || null, ref: o.ref || null, kind: o.kind, width_mm: Number(o.width_mm), reels: Number(o.reels), tolerance_pct: Number(o.tolerance_pct) || 0,
    due_date: o.due_date || null, sheet_length_mm: o.kind === "sheet" ? Number(o.sheet_length_mm) || null : null, converter_id: o.converter_id || null,
  })) }), { onDone: () => setOrders(null) });
  const phone = useMediaQuery("(max-width: 48em)");
  const saveHead = useMut(() => put(`/operations/cutting/plans/${id}`, { ...head, deckle_mm: head?.deckle_mm === "" ? null : Number(head?.deckle_mm) || null, note: head?.note || null }),
    { onDone: () => setHead(null) });
  const calc = useMut(() => post(`/operations/cutting/plans/${id}/calculate`));
  const release = useMut(() => post(`/operations/cutting/plans/${id}/release`));
  const reopen = useMut(() => post(`/operations/cutting/plans/${id}/reopen`));
  const remove = useMut(() => del(`/operations/cutting/plans/${id}`), { onDone: onBack });
  const p = q.data;
  if (!p) return <Loading />;
  const locked = p.status === "released";
  const edit = can("op.cut") && !locked;
  const rows = orders ?? p.orders;
  const r = p.result ?? {};
  const deckle = r.deckle_mm ?? p.deckle_mm ?? p.winder.deckle_mm ?? 0;
  const widths = [...new Set((r.widths ?? []).map((w) => w.width))];
  const color = (w: number) => COLORS[Math.max(0, widths.indexOf(w)) % COLORS.length] ?? "blue";
  const set = (i: number, patch: Partial<Order>) => setOrders(rows.map((o, j) => (j === i ? { ...o, ...patch } : o)));
  const valid = rows.every((o) => Number(o.width_mm) > 0 && Number(o.reels) > 0 && (o.kind === "reel" || Number(o.sheet_length_mm) > 0));
  const problem = (x: Problem) => t(`cut.problem.${x.code}`, x.params);
  const units = p.winder.converters;
  const unitCode = (id: string | null) => units.find((u) => u.id === id)?.code ?? null;
  const unitOpts = (o: Order) => units.filter((u) => u.is_active && (o.kind === "reel" || u.kind === "sheeter")).map((u) => ({ value: u.id as string, label: `${u.code} · ${u.name}` }));
  const size = (o: Order) => (o.kind === "sheet" ? `${o.width_mm} × ${o.sheet_length_mm ?? "?"} mm` : `${o.width_mm} mm`);
  const qtyUnit = (o: Order) => (o.kind === "sheet" ? t("cut.sheetsShort") : t("cut.reelsShort"));
  // each order's inputs (edit) or values (view), drawn as a table row on a computer and as a card on a phone
  const cells = (o: Order, i: number): { key: string; label: string; node: ReactNode }[] => edit ? [
    { key: "c", label: t("cut.customer"), node: <TextInput size="xs" value={o.customer ?? ""} onChange={(e) => set(i, { customer: e.currentTarget.value })} /> },
    { key: "r", label: t("cut.ref"), node: <TextInput size="xs" miw={90} value={o.ref ?? ""} onChange={(e) => set(i, { ref: e.currentTarget.value })} /> },
    { key: "k", label: t("cut.kind"), node: <Select size="xs" w={110} allowDeselect={false} value={o.kind} onChange={(v) => v && set(i, { kind: v as Order["kind"], converter_id: null })}
        data={[{ value: "reel", label: t("cut.kind_reel") }, { value: "sheet", label: t("cut.kind_sheet") }]} /> },
    { key: "w", label: o.kind === "sheet" ? t("cut.sheetWidth") : t("cut.width"), node: <NumberInput size="xs" w={95} min={1} allowDecimal={false} value={o.width_mm} onChange={(v) => set(i, { width_mm: v })} /> },
    { key: "l", label: t("cut.sheetLength"), node: o.kind === "sheet"
        ? <NumberInput size="xs" w={95} min={1} allowDecimal={false} value={o.sheet_length_mm ?? ""} onChange={(v) => set(i, { sheet_length_mm: v })} /> : <Text size="xs" c="dimmed">—</Text> },
    { key: "q", label: o.kind === "sheet" ? t("cut.sheets") : t("cut.reels"), node: <NumberInput size="xs" w={105} min={1} allowDecimal={false} thousandSeparator value={o.reels} onChange={(v) => set(i, { reels: v })} /> },
    { key: "t", label: t("cut.tolerance"), node: <NumberInput size="xs" w={80} min={0} max={50} value={o.tolerance_pct} onChange={(v) => set(i, { tolerance_pct: v })} suffix="%" /> },
    { key: "u", label: t("cut.onUnit"), node: <Select size="xs" w={130} clearable placeholder={t("cut.anyUnit")} value={o.converter_id} onChange={(v) => set(i, { converter_id: v })} data={unitOpts(o)} /> },
    { key: "d", label: t("cut.due"), node: <TextInput size="xs" type="date" value={o.due_date ?? ""} onChange={(e) => set(i, { due_date: e.currentTarget.value || null })} /> },
    { key: "m", label: t("cut.made"), node: orders === null && o.made != null ? <b>{fmtNum(o.made, 0)}</b> : "—" },
  ] : [
    { key: "c", label: t("cut.customer"), node: o.customer || "—" },
    { key: "r", label: t("cut.ref"), node: o.ref || "—" },
    { key: "k", label: t("cut.kind"), node: <Badge variant="light" color={o.kind === "sheet" ? "grape" : "blue"} tt="none">{t(`cut.kind_${o.kind}`)}</Badge> },
    { key: "w", label: t("cut.size"), node: <span dir="ltr">{size(o)}</span> },
    { key: "q", label: t("cut.quantity"), node: `${fmtNum(Number(o.reels), 0)} ${qtyUnit(o)}` },
    { key: "t", label: t("cut.tolerance"), node: `±${fmtNum(Number(o.tolerance_pct), 1)}%` },
    { key: "u", label: t("cut.onUnit"), node: unitCode(o.converter_id) ?? t("cut.anyUnit") },
    { key: "d", label: t("cut.due"), node: o.due_date ? fmtDate(o.due_date) : "—" },
    { key: "m", label: t("cut.made"), node: o.made != null ? <b>{fmtNum(o.made, 0)}</b> : "—" },
  ];
  const routes = r.routes ?? [];
  const orderName = (key: string) => { const o = p.orders.find((x) => x.id === key); return o ? `${o.customer || o.ref || "—"} · ${size(o)}` : key; };

  return (
    <Stack>
      <Group justify="space-between" wrap="wrap">
        <Group gap="xs">
          <ActionIcon variant="default" size="lg" onClick={onBack} aria-label={t("common.back")}><IconArrowBack size={18} /></ActionIcon>
          <Text fw={700} size="lg">{p.title}</Text>
          <Badge color={STATUS_COLOR[p.status]} variant="light">{t(`cut.status_${p.status}`)}</Badge>
        </Group>
        <Group gap="xs">
          {edit && <Button variant="default" size="xs" onClick={() => setHead({ title: p.title, grade_id: p.grade_id, deckle_mm: p.deckle_mm ?? "", note: p.note ?? "" })}>{t("cut.editPlan")}</Button>}
          {edit && <Button leftSection={<IconCalculator size={16} />} loading={calc.isPending} disabled={orders !== null || p.orders.length === 0} onClick={() => calc.mutate(undefined)}>{t("cut.calculate")}</Button>}
          {can("op.cut") && p.status === "calculated" && <Button color="teal" leftSection={<IconLock size={16} />} loading={release.isPending} onClick={() => release.mutate(undefined)}>{t("cut.release")}</Button>}
          {can("op.cut") && locked && <Button variant="default" leftSection={<IconLockOpen size={16} />} onClick={() => reopen.mutate(undefined)}>{t("cut.reopen")}</Button>}
          {edit && <ConfirmButton color="red" onConfirm={() => remove.mutate(undefined)}>{t("common.delete")}</ConfirmButton>}
        </Group>
      </Group>
      <Text size="sm" c="dimmed">{p.machine}{p.grade ? ` · ${t("cut.grade")} ${p.grade} (${p.gsm} gsm)` : ""} · {t("cut.deckle")}: <span dir="ltr">{fmtNum(deckle, 0)} mm</span>{p.note ? ` · ${p.note}` : ""}</Text>

      <Card withBorder>
        <Group justify="space-between" mb="xs">
          <Text fw={600}>{t("cut.orders")} ({rows.length})</Text>
          {edit && <Group gap="xs">
            <Button size="xs" variant="light" leftSection={<IconPlus size={14} />}
              onClick={() => setOrders([...rows, { customer: "", ref: "", kind: "reel", width_mm: "", sheet_length_mm: null, converter_id: null, reels: "", tolerance_pct: 0, due_date: null }])}>{t("cut.addOrder")}</Button>
            {orders !== null && <Button size="xs" loading={saveOrders.isPending} disabled={!valid} onClick={() => saveOrders.mutate(undefined)}>{t("common.save")}</Button>}
            {orders !== null && <Button size="xs" variant="default" onClick={() => setOrders(null)}>{t("common.cancel")}</Button>}
          </Group>}
        </Group>
        {rows.length === 0 ? <Text size="sm" c="dimmed">{t("cut.noOrders")}</Text> : phone ? (
          <Stack gap="xs">
            {rows.map((o, i) => (
              <Paper key={o.id ?? `n${i}`} withBorder p="sm" radius="md">
                <Group justify="space-between" mb={6} wrap="nowrap">
                  <Text fw={600} size="sm" lineClamp={1}>{o.customer || o.ref || t("cut.orderN", { n: i + 1 })} · <span dir="ltr">{size(o)}</span></Text>
                  {edit && <ActionIcon variant="subtle" color="red" onClick={() => setOrders(rows.filter((_, j) => j !== i))} aria-label={t("common.delete")}><IconTrash size={14} /></ActionIcon>}
                </Group>
                <SimpleGrid cols={2} spacing="xs" verticalSpacing={6}>
                  {cells(o, i).map((c) => <Field key={c.key} label={c.label}>{c.node}</Field>)}
                </SimpleGrid>
              </Paper>
            ))}
          </Stack>
        ) : (
          <Table.ScrollContainer minWidth={edit ? 1100 : 860}>
            <Table verticalSpacing={4}>
              <Table.Thead><Table.Tr>
                {cells(rows[0] as Order, 0).map((c) => <Table.Th key={c.key}>{c.key === "w" && edit ? t("cut.width") : c.key === "q" && edit ? t("cut.quantity") : c.label}</Table.Th>)}
                {edit && <Table.Th />}
              </Table.Tr></Table.Thead>
              <Table.Tbody>
                {rows.map((o, i) => (
                  <Table.Tr key={o.id ?? `n${i}`}>
                    {cells(o, i).map((c) => <Table.Td key={c.key}>{c.node}</Table.Td>)}
                    {edit && <Table.Td><ActionIcon variant="subtle" color="red" onClick={() => setOrders(rows.filter((_, j) => j !== i))} aria-label={t("common.delete")}><IconTrash size={14} /></ActionIcon></Table.Td>}
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
        {orders !== null && <Text size="xs" c="orange" mt="xs">{t("cut.unsaved")}</Text>}
      </Card>

      {r.problems && r.problems.length > 0 && (
        <Alert color="red" title={t("cut.notPossible")}>
          <Stack gap={2}>{r.problems.map((x, i) => <Text key={i} size="sm">• {problem(x)}</Text>)}</Stack>
        </Alert>
      )}
      {r.sets != null && (
        <>
          <SimpleGrid cols={{ base: 2, sm: 3, lg: 6 }}>
            <Paper withBorder p="sm"><Text size="xs" c="dimmed">{t("cut.plannedTrim")}</Text><Text fw={700} size="lg" c="grape.7">{pct(r.trim_pct, 2)}</Text>
              {r.total_trim_pct != null && r.total_trim_pct !== r.trim_pct && <Text size="xs" c="dimmed">{t("cut.withConverting", { pct: pct(r.total_trim_pct, 2) })}</Text>}</Paper>
            <Paper withBorder p="sm"><Text size="xs" c="dimmed">{t("cut.actualGrade")}</Text><Text fw={700} size="lg">{pct(p.baseline.grade_trim_pct, 2)}</Text></Paper>
            <Paper withBorder p="sm"><Text size="xs" c="dimmed">{t("cut.actualMachine")}</Text><Text fw={700} size="lg">{pct(p.baseline.machine_trim_pct, 2)}</Text></Paper>
            <Paper withBorder p="sm"><Text size="xs" c="dimmed">{t("cut.sets")}</Text><Text fw={700} size="lg">{r.sets}</Text></Paper>
            <Paper withBorder p="sm"><Text size="xs" c="dimmed">{t("cut.patternsUsed")}</Text><Text fw={700} size="lg">{r.patterns_used}</Text></Paper>
            <Paper withBorder p="sm"><Text size="xs" c="dimmed">{t("cut.trimTotal")}</Text><Text fw={700} size="lg" dir="ltr" ta="start">{fmtNum((r.trim_mm_total ?? 0) / 1000, 1)} m</Text></Paper>
          </SimpleGrid>
          <Text size="xs" c="dimmed">{t("cut.baselineNote", { from: fmtDate(p.baseline.from), to: fmtDate(p.baseline.to) })}</Text>
          <Card withBorder>
            <Text fw={600} mb="sm">{t("cut.patterns")}</Text>
            <Stack gap="sm">
              {(r.patterns ?? []).map((pt, i) => (
                <div key={i}>
                  <Group justify="space-between" gap="xs" mb={4}>
                    <Text size="sm"><b>{t("cut.patternN", { n: i + 1 })}</b> · {t("cut.setsN", { n: pt.sets })}</Text>
                    <Text size="sm" c="red.7" dir="ltr">{t("cut.trimOf", { mm: pt.trim_mm, pct: pct(pt.trim_pct, 2) })}</Text>
                  </Group>
                  <PatternBar widths={pt.widths} deckle={deckle} color={color} />
                </div>
              ))}
            </Stack>
          </Card>
          <Card withBorder>
            <Text fw={600} mb="xs">{t("cut.byWidth")}</Text>
            <DataTable rows={r.widths ?? []} rowKey={(w) => String(w.width)} columns={[
              { key: "w", label: t("cut.width"), render: (w) => <Badge color={color(w.width)} variant="filled" tt="none">{w.width} mm</Badge> },
              { key: "m", label: t("cut.reelsCut"), render: (w) => <b>{w.made}</b> },
              ...(r.routes ? [{ key: "f", label: t("cut.goesTo"), render: (w: NonNullable<Result["widths"]>[number]) => (w.for ?? []).map((u) => u || t("cut.customerReel")).join(", ") }]
                : [{ key: "d", label: t("cut.demand"), render: (w: NonNullable<Result["widths"]>[number]) => w.demand ?? "—" }]),
            ]} />
            <Text size="xs" c="dimmed" mt="xs">{t("cut.solverNote", { n: r.patterns_considered, s: r.seconds })}{r.capped ? ` ${t("cut.capped")}` : ""}</Text>
          </Card>
          {routes.some((rt) => rt.unit) && (
            <Card withBorder>
              <Text fw={600} mb="xs">{t("cut.converting")}</Text>
              <DataTable rows={routes.filter((rt) => rt.unit)} rowKey={(rt, i) => `${rt.order}-${rt.unit}-${rt.parent_width}-${i}`} columns={[
                { key: "o", label: t("cut.order"), render: (rt: Route) => orderName(rt.order) },
                { key: "u", label: t("cut.unit"), render: (rt: Route) => <b>{rt.unit_code}</b> },
                { key: "p", label: t("cut.parentReel"), render: (rt: Route) => <Badge color={color(rt.parent_width)} variant="filled" tt="none">{rt.parent_width} mm</Badge> },
                { key: "a", label: t("cut.across"), render: (rt: Route) => `${rt.across} ×` },
                { key: "r", label: t("cut.reels"), render: (rt: Route) => rt.reels },
                { key: "m", label: t("cut.made"), render: (rt: Route) => fmtNum(rt.made, 0) },
                { key: "t", label: t("cut.sideTrim"), render: (rt: Route) => <span dir="ltr">{rt.side_trim_mm} mm</span> },
              ]} />
              <Text fw={600} mt="md" mb="xs">{t("cut.load")}</Text>
              <DataTable rows={r.load ?? []} rowKey={(l) => l.unit} columns={[
                { key: "u", label: t("cut.unit"), render: (l) => <b>{l.code}</b> },
                { key: "k", label: t("cut.kind"), render: (l) => t(`cut.kind_${l.kind}`) },
                { key: "r", label: t("cut.reels"), render: (l) => l.reels },
                { key: "s", label: t("cut.sizes"), render: (l) => l.sizes },
                { key: "h", label: t("cut.hours"), render: (l) => (l.hours != null ? fmtNum(l.hours, 1) : "—") },
              ]} />
              <Text size="xs" c="dimmed" mt="xs">{t("cut.loadNote")}</Text>
            </Card>
          )}
        </>
      )}

      {head && (
        <Modal opened onClose={() => setHead(null)} title={t("cut.editPlan")}>
          <Stack>
            <TextInput label={t("cut.title")} value={head.title} onChange={(e) => setHead({ ...head, title: e.currentTarget.value })} />
            <Select label={t("cut.grade")} clearable value={head.grade_id} onChange={(v) => setHead({ ...head, grade_id: v })}
              data={p.winder.grades.map((g) => ({ value: g.id, label: `${g.code} (${g.gsm} gsm)` }))} />
            <NumberInput label={t("cut.planDeckle")} description={t("cut.planDeckleHint", { mm: p.winder.deckle_mm ?? "—" })} value={head.deckle_mm} min={500} max={12000}
              onChange={(v) => setHead({ ...head, deckle_mm: v })} />
            <Textarea label={t("cut.note")} autosize minRows={2} value={head.note} onChange={(e) => setHead({ ...head, note: e.currentTarget.value })} />
            <Button loading={saveHead.isPending} disabled={head.title.trim().length < 2} onClick={() => saveHead.mutate(undefined)}>{t("common.save")}</Button>
          </Stack>
        </Modal>
      )}
    </Stack>
  );
}

function View() {
  const { t } = useTranslation();
  const { can } = useSession();
  const router = useRouter();
  const params = useSearchParams();
  const planId = params.get("plan");
  const open = (id: string | null) => router.replace(id ? `/operations/cutting?plan=${id}` : "/operations/cutting");
  const winders = useQ<Winder[]>("/operations/cutting/winders");
  const plans = useQ<PlanRow[]>(planId ? null : "/operations/cutting/plans");
  const [editW, setEditW] = useState<Winder | null>(null);
  const [unit, setUnit] = useState<{ machineId: string; unit: Unit } | null>(null);
  const [nw, setNw] = useState<{ machine_id: string | null; grade_id: string | null; title: string } | null>(null);
  const create = useMut(() => post<PlanRow>("/operations/cutting/plans", nw), { onDone: (r) => { setNw(null); open(r.id); } });
  const ws = winders.data ?? [];
  const grades = ws.find((w) => w.machine_id === nw?.machine_id)?.grades ?? [];

  return (
    <>
      <PageHeader title={t("cut.pageTitle")}><Text size="sm" c="dimmed">{t("cut.hint")}</Text></PageHeader>
      {planId ? <PlanView id={planId} onBack={() => open(null)} /> : !winders.data ? <Loading /> : ws.length === 0 ? <Alert color="gray">{t("cut.noMachine")}</Alert> : (
        <Stack>
          <SimpleGrid cols={{ base: 1, md: 2 }}>
            {ws.map((w) => (
              <Card key={w.machine_id} withBorder>
                <Group justify="space-between" mb={4}>
                  <Text fw={600}>{t("cut.winder")} · {w.code}</Text>
                  {can("op.manage") && <Tooltip label={t("cut.editWinder")}><ActionIcon variant="default" onClick={() => setEditW(w)} aria-label={t("cut.editWinder")}><IconSettings size={16} /></ActionIcon></Tooltip>}
                </Group>
                <Text size="sm" dir="auto">{t("cut.winderLine", { deckle: w.deckle_mm ?? "—", n: w.max_reels, min: w.min_trim_mm, max: w.max_trim_mm, w: w.min_width_mm })}</Text>
                {!w.saved && <Text size="xs" c="orange" mt={4}>{t("cut.winderDefault")}</Text>}
                {w.set_length_m > 0 && <Text size="xs" c="dimmed" mt={2}>{t("cut.setLengthLine", { m: fmtNum(w.set_length_m, 0) })}</Text>}
                <Group justify="space-between" mt="sm" mb={4}>
                  <Text size="sm" fw={600}>{t("cut.units")} ({w.converters.length})</Text>
                  {can("op.manage") && <Button size="compact-xs" variant="light" leftSection={<IconPlus size={12} />} onClick={() => setUnit({ machineId: w.machine_id, unit: blankUnit("sheeter") })}>{t("cut.addUnit")}</Button>}
                </Group>
                {w.converters.length === 0 ? <Text size="xs" c="dimmed">{t("cut.noUnits")}</Text> : (
                  <Stack gap={4}>
                    {w.converters.map((u) => (
                      <Group key={u.id} justify="space-between" gap="xs" wrap="nowrap">
                        <Text size="sm" c={u.is_active ? undefined : "dimmed"} lineClamp={1}>
                          <b>{u.code}</b> · {t(`cut.kind_${u.kind}`)} · <span dir="ltr">{u.min_width_mm}–{u.max_width_mm} mm</span>
                          {u.kind === "sheeter" && u.min_length_mm ? <> · <span dir="ltr">L {u.min_length_mm}–{u.max_length_mm}</span></> : null}{u.is_active ? "" : ` · ${t("cut.off")}`}
                        </Text>
                        {can("op.manage") && <ActionIcon size="sm" variant="subtle" onClick={() => setUnit({ machineId: w.machine_id, unit: u })} aria-label={t("cut.editUnit")}><IconPencil size={14} /></ActionIcon>}
                      </Group>
                    ))}
                  </Stack>
                )}
              </Card>
            ))}
          </SimpleGrid>
          <Group justify="space-between">
            <Text fw={600}>{t("cut.plans")}</Text>
            {can("op.cut") && <Button leftSection={<IconPlus size={16} />} onClick={() => setNw({ machine_id: ws[0]?.machine_id ?? null, grade_id: null, title: "" })}>{t("cut.newPlan")}</Button>}
          </Group>
          <DataTable rows={plans.data} onRow={(r) => open(r.id)} empty={t("cut.noPlans")} columns={[
            { key: "t", label: t("cut.title"), render: (r: PlanRow) => <b>{r.title}</b> },
            { key: "m", label: t("cut.machine"), render: (r: PlanRow) => r.machine },
            { key: "g", label: t("cut.grade"), render: (r: PlanRow) => r.grade ?? "—" },
            { key: "o", label: t("cut.orders"), render: (r: PlanRow) => [`${r.orders_count}`, r.reels ? `${fmtNum(r.reels, 0)} ${t("cut.reelsShort")}` : null,
              r.sheets ? `${fmtNum(r.sheets, 0)} ${t("cut.sheetsShort")}` : null].filter(Boolean).join(" · ") },
            { key: "p", label: t("cut.plannedTrim"), render: (r: PlanRow) => pct(r.trim_pct, 2) },
            { key: "s", label: t("common.status"), render: (r: PlanRow) => <Badge color={STATUS_COLOR[r.status]} variant="light">{t(`cut.status_${r.status}`)}</Badge> },
            { key: "d", label: t("cut.created"), render: (r: PlanRow) => fmtDate(r.created_at) },
          ]} />
        </Stack>
      )}
      {editW && <WinderModal w={editW} onClose={() => setEditW(null)} />}
      {unit && <UnitModal machineId={unit.machineId} unit={unit.unit} onClose={() => setUnit(null)} />}
      {nw && (
        <Modal opened onClose={() => setNw(null)} title={t("cut.newPlan")}>
          <Stack>
            <TextInput label={t("cut.title")} placeholder={t("cut.titleHint")} value={nw.title} onChange={(e) => setNw({ ...nw, title: e.currentTarget.value })} />
            <Select label={t("cut.machine")} allowDeselect={false} value={nw.machine_id} onChange={(v) => setNw({ ...nw, machine_id: v, grade_id: null })}
              data={ws.map((w) => ({ value: w.machine_id, label: `${w.code} · ${w.name}` }))} />
            <Select label={t("cut.grade")} clearable value={nw.grade_id} onChange={(v) => setNw({ ...nw, grade_id: v })}
              data={grades.map((g) => ({ value: g.id, label: `${g.code} (${g.gsm} gsm)` }))} />
            <Button loading={create.isPending} disabled={!nw.machine_id || nw.title.trim().length < 2} onClick={() => create.mutate(undefined)}>{t("cut.create")}</Button>
          </Stack>
        </Modal>
      )}
    </>
  );
}

export default function Page() {
  return <Guard perm="op.view"><Suspense fallback={<Loading />}><View /></Suspense></Guard>;
}
