"use client";

import { Badge, Button, Checkbox, Group, Menu, NumberInput, ScrollArea, SegmentedControl, Select, SimpleGrid, Stack, Table, Text, Textarea, TextInput } from "@mantine/core";
import { IconBooks, IconPencil, IconPlus } from "@tabler/icons-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Guard } from "@/components/AppFrame";
import { Modal } from "@/components/Modal";
import { KpiCard } from "@/components/OpsKpi";
import { DeptSelect, Loading, PageHeader, Section } from "@/components/ui";
import { post, put } from "@/lib/api";
import { fmtNum, useMut, useQ } from "@/lib/hooks";
import type { KpiDef, KpiLib, KpiResult, KpiVariable, OpSettings } from "@/lib/ops";
import { useSession } from "@/lib/session";

type Num = number | string;
const n = (v: Num | null | undefined) => (v === "" || v === null || v === undefined ? null : Number(v));
interface KForm { id?: string; code: string; name: string; description: string; formula: string; unit: string; decimals: Num; direction: "higher" | "lower"; target: Num; warn: Num; critical: Num;
  period: "day" | "week" | "month"; machine_id: string | null; department_id: string | null; dashboard: boolean; sort: Num; is_active: boolean }

function KpiModal({ form, vars, lines, onClose }: { form: KForm | null; vars: KpiVariable[]; lines: OpSettings["machines"]; onClose: () => void }) {
  const { t } = useTranslation();
  const [f, setF] = useState<KForm | null>(form);
  const save = useMut(() => {
    if (!f) return Promise.resolve();
    const body = { code: f.code, name: f.name, description: f.description || null, formula: f.formula, unit: f.unit || null, decimals: n(f.decimals) ?? 1, direction: f.direction,
      target: n(f.target), warn: n(f.warn), critical: n(f.critical), period: f.period, machine_id: f.machine_id, department_id: f.machine_id ? null : f.department_id,
      dashboard: f.dashboard, sort: n(f.sort) ?? 0, is_active: f.is_active };
    return f.id ? put(`/operations/kpis/${f.id}`, body) : post("/operations/kpis", body);
  }, { onDone: onClose });
  if (!f) return null;
  const set = (p: Partial<KForm>) => setF({ ...f, ...p });
  const add = (code: string) => set({ formula: `${f.formula}${f.formula && !f.formula.endsWith(" ") ? " " : ""}${code}` });
  return (
    <Modal opened onClose={onClose} title={f.id ? f.code : t("kpi2.new")} size="xl">
      <Stack>
        <SimpleGrid cols={{ base: 1, sm: 3 }}>
          <TextInput label={t("ops.set.code")} required value={f.code} onChange={(e) => set({ code: e.currentTarget.value.toUpperCase().replace(/[^A-Z0-9_]/g, "_") })} />
          <TextInput style={{ gridColumn: "span 2" }} label={t("ops.set.name")} required value={f.name} onChange={(e) => set({ name: e.currentTarget.value })} />
        </SimpleGrid>
        <TextInput label={t("kpi2.description")} value={f.description} onChange={(e) => set({ description: e.currentTarget.value })} />
        <Textarea label={t("kpi2.formula")} description={t("kpi2.formulaHint")} required className="mono" autosize minRows={2} value={f.formula} onChange={(e) => set({ formula: e.currentTarget.value })} />
        <ScrollArea h={130} type="auto"><Group gap={4}>
          {vars.map((v) => (
            <Badge key={v.code} variant="light" color={v.kind === "log" ? "teal" : v.kind === "loss" ? "orange" : v.kind === "profile" ? "grape" : "blue"} style={{ cursor: "pointer", textTransform: "none" }}
              onClick={() => add(v.code)} title={[v.label, v.form, v.unit].filter(Boolean).join(" · ")}>{v.code}</Badge>
          ))}
        </Group></ScrollArea>
        <Text size="xs" c="dimmed">{t("kpi2.varLegend")}</Text>
        <SimpleGrid cols={{ base: 2, sm: 4 }}>
          <TextInput label={t("logs.set.unit")} description={t("kpi2.unitHint")} value={f.unit} onChange={(e) => set({ unit: e.currentTarget.value })} />
          <NumberInput label={t("logs.set.decimals")} min={0} max={4} value={f.decimals} onChange={(v) => set({ decimals: v })} />
          <Select label={t("kpi2.direction")} allowDeselect={false} value={f.direction} onChange={(v) => v && set({ direction: v as KForm["direction"] })}
            data={[{ value: "higher", label: t("kpi2.higher") }, { value: "lower", label: t("kpi2.lower") }]} />
          <Select label={t("kpi2.period")} allowDeselect={false} value={f.period} onChange={(v) => v && set({ period: v as KForm["period"] })}
            data={(["day", "week", "month"] as const).map((x) => ({ value: x, label: t(`kpi2.periods.${x}`) }))} />
        </SimpleGrid>
        <SimpleGrid cols={3}>
          <NumberInput label={t("kpi2.target")} value={f.target} onChange={(v) => set({ target: v })} />
          <NumberInput label={t("kpi2.warn")} value={f.warn} onChange={(v) => set({ warn: v })} />
          <NumberInput label={t("kpi2.critical")} value={f.critical} onChange={(v) => set({ critical: v })} />
        </SimpleGrid>
        <Text size="xs" c="dimmed">{t("kpi2.limitsHint")}</Text>
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <Select label={t("kpi2.line")} clearable placeholder={t("kpi2.allLines")} value={f.machine_id} onChange={(v) => set({ machine_id: v })}
            data={lines.map((m) => ({ value: m.id, label: `${m.code} – ${m.name}` }))} />
          {!f.machine_id && <DeptSelect label={t("kpi2.area")} clearable value={f.department_id} onChange={(v) => set({ department_id: v })} />}
        </SimpleGrid>
        <Group>
          <Checkbox label={t("kpi2.onDashboard")} checked={f.dashboard} onChange={(e) => set({ dashboard: e.currentTarget.checked })} />
          <Checkbox label={t("ops.set.active")} checked={f.is_active} onChange={(e) => set({ is_active: e.currentTarget.checked })} />
          <NumberInput w={100} label={t("ops.set.sort")} min={0} value={f.sort} onChange={(v) => set({ sort: v })} />
        </Group>
        <Button loading={save.isPending} disabled={!f.code || !f.name || !f.formula.trim()} onClick={() => save.mutate(undefined)}>{t("common.save")}</Button>
      </Stack>
    </Modal>
  );
}

function View() {
  const { t } = useTranslation();
  const { can } = useSession();
  const [mid, setMid] = useState<string | null>(null);
  const [period, setPeriod] = useState<"day" | "week" | "month">("week");
  const [kf, setKf] = useState<KForm | null>(null);
  const res = useQ<KpiResult[]>("/operations/kpi-results", { machine_id: mid ?? undefined });
  const defs = useQ<{ items: KpiDef[]; library: KpiLib[]; variables: KpiVariable[] }>("/operations/kpis");
  const lines = useQ<OpSettings>("/operations/settings").data?.machines ?? [];
  const addLib = useMut((code: string) => post(`/operations/kpis/library/${code}`));
  if (!res.data || !defs.data) return <Loading />;
  const have = new Set(defs.data.items.map((k) => k.code));
  const lib = defs.data.library.filter((k) => !have.has(k.code));
  const edit = (k: KpiDef): KForm => ({ id: k.id, code: k.code, name: k.name, description: k.description ?? "", formula: k.formula, unit: k.unit ?? "", decimals: k.decimals, direction: k.direction,
    target: k.target ?? "", warn: k.warn ?? "", critical: k.critical ?? "", period: k.period, machine_id: k.machine_id, department_id: k.department_id, dashboard: k.dashboard, sort: k.sort, is_active: k.is_active });
  const lineName = (id: string | null) => lines.find((m) => m.id === id)?.code ?? t("kpi2.allLines");
  return (
    <>
      <PageHeader title={t("kpi2.title")}><Text size="sm" c="dimmed">{t("kpi2.subtitle")}</Text></PageHeader>
      <Group mb="md" gap="sm">
        {lines.length > 1 && <Select w={240} clearable placeholder={t("kpi2.allLines")} data={lines.map((m) => ({ value: m.id, label: `${m.code} – ${m.name}` }))} value={mid} onChange={setMid} />}
        <SegmentedControl value={period} onChange={(v) => setPeriod(v as typeof period)} data={(["day", "week", "month"] as const).map((x) => ({ value: x, label: t(`kpi2.show.${x}`) }))} />
      </Group>
      <Stack>
        {res.data.length === 0 ? <Text c="dimmed">{t("kpi2.none")}</Text> : (
          <SimpleGrid cols={{ base: 1, xs: 2, md: 3, lg: 4 }}>
            {res.data.map((k) => <KpiCard key={`${k.id}-${k.lines.join()}`} k={k} period={period} />)}
          </SimpleGrid>
        )}
        {can("op.manage") && (
          <Section title={t("kpi2.defs")} actions={<Group gap="xs">
            {lib.length > 0 && <Menu position="bottom-end"><Menu.Target><Button size="xs" variant="light" leftSection={<IconBooks size={14} />}>{t("kpi2.fromLibrary")}</Button></Menu.Target>
              <Menu.Dropdown>{lib.map((k) => <Menu.Item key={k.code} onClick={() => addLib.mutate(k.code)}>{k.name} <Text span size="xs" c="dimmed">· {k.description}</Text></Menu.Item>)}</Menu.Dropdown></Menu>}
            <Button size="xs" leftSection={<IconPlus size={14} />} onClick={() => setKf({ code: "", name: "", description: "", formula: "", unit: "", decimals: 1, direction: "higher", target: "", warn: "", critical: "",
              period: "day", machine_id: null, department_id: null, dashboard: true, sort: (defs.data!.items.length + 1) * 10, is_active: true })}>{t("kpi2.new")}</Button>
          </Group>}>
            <Table.ScrollContainer minWidth={760}><Table striped>
              <Table.Thead><Table.Tr><Table.Th>{t("ops.set.code")}</Table.Th><Table.Th>{t("ops.set.name")}</Table.Th><Table.Th>{t("kpi2.formula")}</Table.Th>
                <Table.Th>{t("kpi2.target")} / {t("kpi2.warn")} / {t("kpi2.critical")}</Table.Th><Table.Th>{t("kpi2.line")}</Table.Th><Table.Th /></Table.Tr></Table.Thead>
              <Table.Tbody>
                {defs.data.items.map((k) => (
                  <Table.Tr key={k.id} opacity={k.is_active ? 1 : 0.5}>
                    <Table.Td className="mono">{k.code}</Table.Td>
                    <Table.Td>{k.name} {k.standard ? <Badge size="xs" variant="light">{t("kpi2.standard")}</Badge> : <Badge size="xs" variant="light" color="teal">{t("kpi2.custom")}</Badge>}</Table.Td>
                    <Table.Td className="mono" fz="xs">{k.formula}</Table.Td>
                    <Table.Td className="nowrap">{[k.target, k.warn, k.critical].map((x) => (x === null ? "—" : fmtNum(x, 2))).join(" / ")} {k.unit} {k.direction === "lower" ? "↓" : "↑"}</Table.Td>
                    <Table.Td>{k.machine_id ? lineName(k.machine_id) : t("kpi2.allLines")}</Table.Td>
                    <Table.Td><Button size="compact-xs" variant="subtle" onClick={() => setKf(edit(k))}><IconPencil size={14} /></Button></Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table></Table.ScrollContainer>
          </Section>
        )}
      </Stack>
      <KpiModal key={`k-${kf?.id}-${!!kf}`} form={kf} vars={defs.data.variables} lines={lines} onClose={() => setKf(null)} />
    </>
  );
}

export default function KpisPage() {
  return <Guard perm="op.view"><View /></Guard>;
}
