"use client";

// Paper waste, phase B: the winder's cutting plan. Plans (orders of one machine and grade) → Calculate → the cutting
// patterns and how many sets of each, the trim, and the actual trim of the grade over the last 4 weeks beside it.

import { ActionIcon, Alert, Badge, Button, Card, Group, NumberInput, Paper, Select, SimpleGrid, Stack, Table, Text, TextInput, Textarea, Tooltip } from "@mantine/core";
import { IconArrowBack, IconCalculator, IconLock, IconLockOpen, IconPlus, IconSettings, IconTrash } from "@tabler/icons-react";
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
interface Winder { machine_id: string; code: string; name: string; saved: boolean; deckle_mm: number | null; max_reels: number; min_trim_mm: number;
  max_trim_mm: number; min_width_mm: number; change_cost_sets: number; grades: Grade[] }
interface PlanRow { id: string; title: string; machine: string; machine_id: string; grade: string | null; gsm: number | null; status: string; orders_count: number;
  reels: number; trim_pct: number | null; sets: number | null; calculated_at: string | null; created_at: string; deckle_mm: number | null; grade_id: string | null; note: string | null }
interface Order { id?: string; customer: string | null; ref: string | null; width_mm: number | string; reels: number | string; tolerance_pct: number | string; due_date: string | null; made?: number | null }
interface Problem { code: string; params: Record<string, string | number> }
interface Result {
  status?: string; problems?: Problem[]; seconds?: number; patterns_considered?: number; capped?: boolean; deckle_mm?: number; sets?: number;
  patterns_used?: number; trim_mm_total?: number; trim_pct?: number | null;
  patterns?: { widths: number[]; sets: number; trim_mm: number; trim_pct: number }[];
  widths?: { width: number; demand: number; min: number; max: number; made: number }[];
}
interface Plan extends PlanRow { created_by: string | null; orders: Order[]; result: Result; winder: Winder;
  baseline: { from: string; to: string; machine_trim_pct: number | null; grade_trim_pct: number | null } }

const STATUS_COLOR: Record<string, string> = { draft: "gray", calculated: "blue", released: "teal" };
// one colour per width, the same in the bars and the legend
const COLORS = ["blue", "teal", "grape", "orange", "cyan", "lime", "indigo", "pink", "yellow", "violet"];

function WinderModal({ w, onClose }: { w: Winder; onClose: () => void }) {
  const { t } = useTranslation();
  const [f, setF] = useState({ deckle_mm: w.deckle_mm ?? 3000, max_reels: w.max_reels, min_trim_mm: w.min_trim_mm, max_trim_mm: w.max_trim_mm,
    min_width_mm: w.min_width_mm, change_cost_sets: w.change_cost_sets });
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
        </SimpleGrid>
        <Button loading={save.isPending} disabled={f.max_trim_mm < f.min_trim_mm} onClick={() => save.mutate(undefined)}>{t("common.save")}</Button>
      </Stack>
    </Modal>
  );
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
    customer: o.customer || null, ref: o.ref || null, width_mm: Number(o.width_mm), reels: Number(o.reels), tolerance_pct: Number(o.tolerance_pct) || 0, due_date: o.due_date || null,
  })) }), { onDone: () => setOrders(null) });
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
  const valid = rows.every((o) => Number(o.width_mm) > 0 && Number(o.reels) > 0);
  const problem = (x: Problem) => t(`cut.problem.${x.code}`, x.params);

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
              onClick={() => setOrders([...rows, { customer: "", ref: "", width_mm: "", reels: "", tolerance_pct: 0, due_date: null }])}>{t("cut.addOrder")}</Button>
            {orders !== null && <Button size="xs" loading={saveOrders.isPending} disabled={!valid} onClick={() => saveOrders.mutate(undefined)}>{t("common.save")}</Button>}
            {orders !== null && <Button size="xs" variant="default" onClick={() => setOrders(null)}>{t("common.cancel")}</Button>}
          </Group>}
        </Group>
        {rows.length === 0 ? <Text size="sm" c="dimmed">{t("cut.noOrders")}</Text> : (
          <Table.ScrollContainer minWidth={760}>
            <Table verticalSpacing={4}>
              <Table.Thead><Table.Tr>
                <Table.Th>{t("cut.customer")}</Table.Th><Table.Th>{t("cut.ref")}</Table.Th><Table.Th>{t("cut.width")}</Table.Th><Table.Th>{t("cut.reels")}</Table.Th>
                <Table.Th>{t("cut.tolerance")}</Table.Th><Table.Th>{t("cut.due")}</Table.Th><Table.Th>{t("cut.made")}</Table.Th>{edit && <Table.Th />}
              </Table.Tr></Table.Thead>
              <Table.Tbody>
                {rows.map((o, i) => edit ? (
                  <Table.Tr key={o.id ?? `n${i}`}>
                    <Table.Td><TextInput size="xs" value={o.customer ?? ""} onChange={(e) => set(i, { customer: e.currentTarget.value })} /></Table.Td>
                    <Table.Td><TextInput size="xs" w={100} value={o.ref ?? ""} onChange={(e) => set(i, { ref: e.currentTarget.value })} /></Table.Td>
                    <Table.Td><NumberInput size="xs" w={100} min={1} allowDecimal={false} value={o.width_mm} onChange={(v) => set(i, { width_mm: v })} /></Table.Td>
                    <Table.Td><NumberInput size="xs" w={90} min={1} allowDecimal={false} value={o.reels} onChange={(v) => set(i, { reels: v })} /></Table.Td>
                    <Table.Td><NumberInput size="xs" w={80} min={0} max={50} value={o.tolerance_pct} onChange={(v) => set(i, { tolerance_pct: v })} suffix="%" /></Table.Td>
                    <Table.Td><TextInput size="xs" type="date" value={o.due_date ?? ""} onChange={(e) => set(i, { due_date: e.currentTarget.value || null })} /></Table.Td>
                    <Table.Td>{orders === null && o.made != null ? <b>{o.made}</b> : "—"}</Table.Td>
                    <Table.Td><ActionIcon variant="subtle" color="red" onClick={() => setOrders(rows.filter((_, j) => j !== i))} aria-label={t("common.delete")}><IconTrash size={14} /></ActionIcon></Table.Td>
                  </Table.Tr>
                ) : (
                  <Table.Tr key={o.id ?? i}>
                    <Table.Td>{o.customer || "—"}</Table.Td><Table.Td>{o.ref || "—"}</Table.Td><Table.Td dir="ltr">{o.width_mm} mm</Table.Td><Table.Td>{o.reels}</Table.Td>
                    <Table.Td>±{fmtNum(Number(o.tolerance_pct), 1)}%</Table.Td><Table.Td>{o.due_date ? fmtDate(o.due_date) : "—"}</Table.Td>
                    <Table.Td>{o.made != null ? <b>{o.made}</b> : "—"}</Table.Td>
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
            <Paper withBorder p="sm"><Text size="xs" c="dimmed">{t("cut.plannedTrim")}</Text><Text fw={700} size="lg" c="grape.7">{pct(r.trim_pct, 2)}</Text></Paper>
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
              { key: "d", label: t("cut.demand"), render: (w) => w.demand },
              { key: "r", label: t("cut.allowed"), render: (w) => <span dir="ltr">{w.min}–{w.max}</span> },
              { key: "m", label: t("cut.made"), render: (w) => <Text span fw={700} c={w.made < w.demand ? "orange" : w.made > w.demand ? "blue" : undefined}>{w.made}</Text> },
            ]} />
            <Text size="xs" c="dimmed" mt="xs">{t("cut.solverNote", { n: r.patterns_considered, s: r.seconds })}{r.capped ? ` ${t("cut.capped")}` : ""}</Text>
          </Card>
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
            { key: "o", label: t("cut.orders"), render: (r: PlanRow) => `${r.orders_count} · ${r.reels} ${t("cut.reelsShort")}` },
            { key: "p", label: t("cut.plannedTrim"), render: (r: PlanRow) => pct(r.trim_pct, 2) },
            { key: "s", label: t("common.status"), render: (r: PlanRow) => <Badge color={STATUS_COLOR[r.status]} variant="light">{t(`cut.status_${r.status}`)}</Badge> },
            { key: "d", label: t("cut.created"), render: (r: PlanRow) => fmtDate(r.created_at) },
          ]} />
        </Stack>
      )}
      {editW && <WinderModal w={editW} onClose={() => setEditW(null)} />}
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
