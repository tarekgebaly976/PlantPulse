"use client";

import { Badge, Button, Checkbox, Group, NumberInput, Paper, Select, SimpleGrid, Stack, Stepper, Table, Text, TextInput } from "@mantine/core";
import { IconCheck, IconPencil, IconPlus } from "@tabler/icons-react";
import Link from "next/link";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Guard } from "@/components/AppFrame";
import { Modal } from "@/components/Modal";
import { DeptSelect, Loading, PageHeader, Section } from "@/components/ui";
import { post, put } from "@/lib/api";
import { fmtNum, useMut, useQ } from "@/lib/hooks";
import { useSession } from "@/lib/session";
import { FEATURES, type AlertRule, type Condition, type KpiDef, type KpiVariable, type LossCategory, type OpConfig, type OpSettings, type Product, type SetupStatus } from "@/lib/ops";

type Num = number | string;
const n = (v: Num | null | undefined) => (v === "" || v === null || v === undefined ? null : Number(v));

// ---------------- plant setup and template
function PlantConfig({ cfg }: { cfg: OpConfig }) {
  const { t } = useTranslation();
  const [industry, setIndustry] = useState(cfg.industry ?? "");
  const [features, setFeatures] = useState<Record<string, boolean>>(cfg.features);
  const [labels, setLabels] = useState<Record<string, string>>(cfg.labels);
  const [done, setDone] = useState(cfg.setup_done);
  const [base, setBase] = useState(String(cfg.safety_base ?? 1000000));
  const [tpl, setTpl] = useState<string | null>(cfg.template ?? "general");
  const save = useMut(() => put("/operations/config", { industry, features, labels, setup_done: done, safety_base: Number(base) }));
  const apply = useMut((key: string) => post<Record<string, number>>(`/operations/templates/${key}/apply`), { success: false });
  return (
    <Stack>
      <SimpleGrid cols={{ base: 1, sm: 2 }}>
        <TextInput label={t("setup.industry")} description={t("setup.industryHint")} value={industry} onChange={(e) => setIndustry(e.currentTarget.value)} maxLength={60} />
        <Group align="flex-end" gap="xs" wrap="nowrap">
          <Select style={{ flex: 1 }} label={t("setup.template")} description={t("setup.templateHint")} data={cfg.templates.map((x) => ({ value: x.key, label: t(`setup.templates.${x.key}`, { defaultValue: x.name }) }))} value={tpl} onChange={setTpl} />
          <Button variant="light" disabled={!tpl} loading={apply.isPending} onClick={() => tpl && apply.mutate(tpl)}>{t("setup.apply")}</Button>
        </Group>
      </SimpleGrid>
      {apply.data && <Text size="sm" c="teal">{t("setup.applied", apply.data)}</Text>}
      <Text size="sm" fw={500}>{t("setup.features")}</Text>
      <Group>{FEATURES.map((k) => <Checkbox key={k} label={t(`setup.feature.${k}`)} checked={features[k] !== false} onChange={(e) => setFeatures({ ...features, [k]: e.currentTarget.checked })} />)}</Group>
      <SimpleGrid cols={{ base: 1, sm: 2 }}>
        <TextInput label={t("setup.labelReports")} placeholder={t("nav.operations")} value={labels.reports ?? ""} onChange={(e) => setLabels({ ...labels, reports: e.currentTarget.value })} maxLength={60} />
        <TextInput label={t("setup.labelLogs")} placeholder={t("nav.opsLogs")} value={labels.logs ?? ""} onChange={(e) => setLabels({ ...labels, logs: e.currentTarget.value })} maxLength={60} />
      </SimpleGrid>
      <Select w={360} label={t("safe.baseLabel")} description={t("safe.baseHint")} allowDeselect={false} value={base} onChange={(v) => v && setBase(v)}
        data={[{ value: "1000000", label: t("safe.base1m") }, { value: "200000", label: t("safe.base200k") }]} />
      <Checkbox label={t("setup.done")} checked={done} onChange={(e) => setDone(e.currentTarget.checked)} />
      <Button w="fit-content" loading={save.isPending} onClick={() => save.mutate(undefined)}>{t("common.save")}</Button>
    </Stack>
  );
}

// ---------------- products
interface PForm { id?: string; code: string; name: string; category: string; machine_id: string | null; unit: string; rate: Num; cycle: Num; attrs: string; is_active: boolean }

function ProductModal({ form, lines, onClose }: { form: PForm | null; lines: OpSettings["machines"]; onClose: () => void }) {
  const { t } = useTranslation();
  const [f, setF] = useState<PForm | null>(form);
  const save = useMut(() => {
    if (!f) return Promise.resolve();
    const attributes = Object.fromEntries(f.attrs.split("\n").map((l) => l.split("=")).filter((x) => x.length === 2 && x[0]!.trim()).map(([k, v]) => [k!.trim(), v!.trim()]));
    const body = { code: f.code, name: f.name, category: f.category || null, machine_id: f.machine_id, unit: f.unit || null, ideal_rate_per_h: n(f.rate), ideal_cycle_s: n(f.cycle), attributes, is_active: f.is_active };
    return f.id ? put(`/operations/products/${f.id}`, body) : post("/operations/products", body);
  }, { onDone: onClose });
  if (!f) return null;
  const set = (p: Partial<PForm>) => setF({ ...f, ...p });
  return (
    <Modal opened onClose={onClose} title={f.id ? f.code : t("setup.prod.new")} size="lg">
      <Stack>
        <SimpleGrid cols={{ base: 1, sm: 3 }}>
          <TextInput label={t("ops.set.code")} required value={f.code} onChange={(e) => set({ code: e.currentTarget.value })} />
          <TextInput style={{ gridColumn: "span 2" }} label={t("ops.set.name")} required value={f.name} onChange={(e) => set({ name: e.currentTarget.value })} />
          <TextInput label={t("setup.prod.category")} value={f.category} onChange={(e) => set({ category: e.currentTarget.value })} />
          <Select label={t("kpi2.line")} clearable placeholder={t("kpi2.allLines")} value={f.machine_id} onChange={(v) => set({ machine_id: v })} data={lines.map((m) => ({ value: m.id, label: m.code }))} />
          <TextInput label={t("logs.set.unit")} value={f.unit} onChange={(e) => set({ unit: e.currentTarget.value })} />
        </SimpleGrid>
        <SimpleGrid cols={2}>
          <NumberInput label={t("setup.prod.rate")} description={t("setup.prod.rateHint")} min={0} decimalScale={4} value={f.rate} onChange={(v) => set({ rate: v })} />
          <NumberInput label={t("setup.prod.cycle")} description={t("setup.prod.cycleHint")} min={0} decimalScale={3} value={f.cycle} onChange={(v) => set({ cycle: v })} />
        </SimpleGrid>
        <TextInput label={t("setup.prod.attrs")} description={t("setup.prod.attrsHint")} value={f.attrs.replace(/\n/g, "; ")} onChange={(e) => set({ attrs: e.currentTarget.value.replace(/;\s*/g, "\n") })} />
        <Checkbox label={t("ops.set.active")} checked={f.is_active} onChange={(e) => set({ is_active: e.currentTarget.checked })} />
        <Button loading={save.isPending} disabled={!f.code || !f.name} onClick={() => save.mutate(undefined)}>{t("common.save")}</Button>
      </Stack>
    </Modal>
  );
}

// ---------------- loss categories
interface LForm { id?: string; code: string; name: string; parent_id: string | null; affects: LossCategory["affects"]; event_type: LossCategory["event_type"]; planned: boolean; failure: boolean;
  discipline_id: string | null; department_id: string | null; sort: Num; is_active: boolean }

function LossModal({ form, cats, discs, onClose }: { form: LForm | null; cats: LossCategory[]; discs: OpSettings["disciplines"]; onClose: () => void }) {
  const { t } = useTranslation();
  const [f, setF] = useState<LForm | null>(form);
  const save = useMut(() => {
    if (!f) return Promise.resolve();
    const body = { code: f.code, name: f.name, parent_id: f.parent_id, affects: f.affects, event_type: f.event_type, planned: f.planned, failure: f.failure, discipline_id: f.discipline_id,
      department_id: f.department_id, sort: n(f.sort) ?? 0, is_active: f.is_active };
    return f.id ? put(`/operations/loss-categories/${f.id}`, body) : post("/operations/loss-categories", body);
  }, { onDone: onClose });
  if (!f) return null;
  const set = (p: Partial<LForm>) => setF({ ...f, ...p });
  return (
    <Modal opened onClose={onClose} title={f.id ? f.name : t("setup.loss.new")} size="lg">
      <Stack>
        <SimpleGrid cols={{ base: 1, sm: 3 }}>
          <TextInput label={t("ops.set.code")} required value={f.code} onChange={(e) => set({ code: e.currentTarget.value.toUpperCase().replace(/[^A-Z0-9_]/g, "_") })} />
          <TextInput style={{ gridColumn: "span 2" }} label={t("ops.set.name")} required value={f.name} onChange={(e) => set({ name: e.currentTarget.value })} />
        </SimpleGrid>
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <Select label={t("setup.loss.parent")} clearable value={f.parent_id} onChange={(v) => set({ parent_id: v })}
            data={cats.filter((c) => !c.parent_id && c.id !== f.id).map((c) => ({ value: c.id, label: c.name }))} />
          <Select label={t("setup.loss.affects")} allowDeselect={false} value={f.affects} onChange={(v) => v && set({ affects: v as LForm["affects"] })}
            data={(["availability", "performance", "quality", "none"] as const).map((x) => ({ value: x, label: t(`gen.factor.${x}`) }))} />
          <Select label={t("setup.loss.eventType")} description={t("setup.loss.eventTypeHint")} allowDeselect={false} value={f.event_type}
            onChange={(v) => v && set({ event_type: v as LForm["event_type"], planned: v === "planned" ? true : f.planned })}
            data={(["breakdown", "planned", "other", "sheet_break"] as const).map((x) => ({ value: x, label: t(`ops.stops.types.${x}`) }))} />
          <Select label={t("setup.loss.discipline")} clearable value={f.discipline_id} onChange={(v) => set({ discipline_id: v })} data={discs.map((d) => ({ value: d.id, label: `${d.code} – ${d.name}` }))} />
          <DeptSelect label={t("ops.set.dept")} clearable value={f.department_id} onChange={(v) => set({ department_id: v })} />
          <NumberInput label={t("ops.set.sort")} min={0} value={f.sort} onChange={(v) => set({ sort: v })} />
        </SimpleGrid>
        <Group>
          <Checkbox label={t("setup.loss.planned")} checked={f.planned} onChange={(e) => set({ planned: e.currentTarget.checked, failure: e.currentTarget.checked ? false : f.failure })} />
          <Checkbox label={t("setup.loss.failure")} disabled={f.planned} checked={f.failure} onChange={(e) => set({ failure: e.currentTarget.checked })} />
          <Checkbox label={t("ops.set.active")} checked={f.is_active} onChange={(e) => set({ is_active: e.currentTarget.checked })} />
        </Group>
        <Text size="xs" c="dimmed">{t("setup.loss.hint")}</Text>
        <Button loading={save.isPending} disabled={!f.code || !f.name} onClick={() => save.mutate(undefined)}>{t("common.save")}</Button>
      </Stack>
    </Modal>
  );
}

// ---------------- alert rules
const CONDS: Condition[] = ["below", "above", "outside", "kpi_limits", "total_above", "trend_down", "trend_up", "action_overdue"];
interface RForm { id?: string; code: string; name: string; source_kind: AlertRule["source_kind"]; source_code: string | null; condition: Condition; threshold: Num; threshold_high: Num; periods: Num;
  lookback_days: Num; severity: AlertRule["severity"]; machine_id: string | null; notify_role: string | null; notify_email: boolean; escalate_after_days: Num; escalate_role: string | null; is_active: boolean }

function RuleModal({ form, kpis, vars, roles, lines, onClose }: { form: RForm | null; kpis: KpiDef[]; vars: KpiVariable[]; roles: { code: string; name: string }[]; lines: OpSettings["machines"]; onClose: () => void }) {
  const { t } = useTranslation();
  const [f, setF] = useState<RForm | null>(form);
  const save = useMut(() => {
    if (!f) return Promise.resolve();
    const body = { code: f.code, name: f.name, source_kind: f.condition === "action_overdue" ? "none" : f.source_kind, source_code: f.condition === "action_overdue" ? null : f.source_code,
      condition: f.condition, threshold: n(f.threshold), threshold_high: n(f.threshold_high), periods: n(f.periods) ?? 1, lookback_days: n(f.lookback_days) ?? 7, severity: f.severity,
      machine_id: f.machine_id, department_id: null, notify_role: f.notify_role, notify_email: f.notify_email, escalate_after_days: n(f.escalate_after_days), escalate_role: f.escalate_role, is_active: f.is_active };
    return f.id ? put(`/operations/alert-rules/${f.id}`, body) : post("/operations/alert-rules", body);
  }, { onDone: onClose });
  if (!f) return null;
  const set = (p: Partial<RForm>) => setF({ ...f, ...p });
  const window = ["total_above", "trend_down", "trend_up"].includes(f.condition);
  const daily = ["below", "above", "outside", "kpi_limits"].includes(f.condition);
  return (
    <Modal opened onClose={onClose} title={f.id ? f.name : t("setup.rule.new")} size="lg">
      <Stack>
        <SimpleGrid cols={{ base: 1, sm: 3 }}>
          <TextInput label={t("ops.set.code")} required value={f.code} onChange={(e) => set({ code: e.currentTarget.value.toUpperCase().replace(/[^A-Z0-9_]/g, "_") })} />
          <TextInput style={{ gridColumn: "span 2" }} label={t("ops.set.name")} required value={f.name} onChange={(e) => set({ name: e.currentTarget.value })} />
        </SimpleGrid>
        <Select label={t("setup.rule.condition")} allowDeselect={false} value={f.condition} onChange={(v) => v && set({ condition: v as Condition, source_kind: v === "kpi_limits" ? "kpi" : f.source_kind })}
          data={CONDS.map((c) => ({ value: c, label: t(`ins.cond.${c}`) }))} description={t(`setup.rule.condHint.${f.condition}`)} />
        {f.condition !== "action_overdue" && <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <Select label={t("setup.rule.sourceKind")} allowDeselect={false} disabled={f.condition === "kpi_limits"} value={f.source_kind} onChange={(v) => v && set({ source_kind: v as RForm["source_kind"], source_code: null })}
            data={[{ value: "kpi", label: t("setup.rule.kpi") }, { value: "measure", label: t("setup.rule.measure") }]} />
          <Select label={t("setup.rule.source")} searchable required value={f.source_code} onChange={(v) => set({ source_code: v })}
            data={f.source_kind === "kpi" ? kpis.map((k) => ({ value: k.code, label: `${k.code} – ${k.name}` })) : vars.map((v) => ({ value: v.code, label: v.label ? `${v.code} – ${v.label}` : v.code }))} />
        </SimpleGrid>}
        <SimpleGrid cols={{ base: 2, sm: 4 }}>
          {f.condition !== "kpi_limits" && <NumberInput label={f.condition === "outside" ? t("logs.set.low") : f.condition.startsWith("trend") ? t("setup.rule.changePct") : f.condition === "action_overdue" ? t("setup.rule.daysLate") : t("setup.rule.threshold")} value={f.threshold} onChange={(v) => set({ threshold: v })} />}
          {f.condition === "outside" && <NumberInput label={t("logs.set.high")} value={f.threshold_high} onChange={(v) => set({ threshold_high: v })} />}
          {daily && <NumberInput label={t("setup.rule.periods")} min={1} max={30} value={f.periods} onChange={(v) => set({ periods: v })} />}
          {window && <NumberInput label={t("setup.rule.lookback")} min={2} max={90} value={f.lookback_days} onChange={(v) => set({ lookback_days: v })} />}
          <Select label={t("setup.rule.severity")} allowDeselect={false} value={f.severity} onChange={(v) => v && set({ severity: v as RForm["severity"] })}
            data={(["info", "warning", "critical"] as const).map((x) => ({ value: x, label: t(`ins.sev.${x}`) }))} />
        </SimpleGrid>
        <Select label={t("kpi2.line")} clearable placeholder={t("kpi2.allLines")} value={f.machine_id} onChange={(v) => set({ machine_id: v })} data={lines.map((m) => ({ value: m.id, label: `${m.code} – ${m.name}` }))} />
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <Select label={t("setup.rule.notify")} clearable placeholder={t("setup.rule.notifyDefault")} value={f.notify_role} onChange={(v) => set({ notify_role: v })} data={roles.map((r) => ({ value: r.code, label: r.name }))} />
          <Checkbox mt="lg" label={t("setup.rule.email")} checked={f.notify_email} onChange={(e) => set({ notify_email: e.currentTarget.checked })} />
          <NumberInput label={t("setup.rule.escalateAfter")} min={1} max={60} value={f.escalate_after_days} onChange={(v) => set({ escalate_after_days: v })} />
          <Select label={t("setup.rule.escalateTo")} clearable value={f.escalate_role} onChange={(v) => set({ escalate_role: v })} data={roles.map((r) => ({ value: r.code, label: r.name }))} />
        </SimpleGrid>
        <Checkbox label={t("ops.set.active")} checked={f.is_active} onChange={(e) => set({ is_active: e.currentTarget.checked })} />
        <Button loading={save.isPending} disabled={!f.code || !f.name || (f.condition !== "action_overdue" && !f.source_code)} onClick={() => save.mutate(undefined)}>{t("common.save")}</Button>
      </Stack>
    </Modal>
  );
}

function View() {
  const { t } = useTranslation();
  const { can } = useSession();
  const st = useQ<SetupStatus>("/operations/setup");
  const settings = useQ<OpSettings>("/operations/settings");
  const products = useQ<Product[]>("/operations/products");
  const cats = useQ<LossCategory[]>("/operations/loss-categories");
  const rules = useQ<{ items: AlertRule[]; roles: { code: string; name: string }[] }>("/operations/alert-rules");
  const kpis = useQ<{ items: KpiDef[]; variables: KpiVariable[] }>("/operations/kpis");
  const [pf, setPf] = useState<PForm | null>(null);
  const [lf, setLf] = useState<LForm | null>(null);
  const [rf, setRf] = useState<RForm | null>(null);
  if (!st.data || !settings.data) return <Loading />;
  const c = st.data.counts;
  const lines = settings.data.machines;
  const steps: { key: string; n: number | boolean; href: string | null }[] = [
    { key: "industry", n: !!st.data.config.industry, href: "#plant" },
    { key: "areas", n: c.areas ?? 0, href: can("plant.admin") ? "/admin" : null }, // departments are managed by the plant administrator
    { key: "lines", n: c.lines ?? 0, href: "/operations/settings" },
    { key: "shifts", n: c.lines_with_shifts ?? 0, href: "/operations/settings" },
    { key: "products", n: c.products ?? 0, href: "#products" },
    { key: "losses", n: c.loss_categories ?? 0, href: "#losses" },
    { key: "kpis", n: c.kpis_with_target ?? 0, href: "/operations/kpis" },
    { key: "quality", n: c.defects ?? 0, href: "/operations/settings" },
    { key: "forms", n: c.log_forms ?? 0, href: "/operations/settings" },
    { key: "alerts", n: c.alert_rules ?? 0, href: "#alerts" },
  ];
  const doneSteps = steps.filter((s) => !!s.n).length;
  const num = (v: number | null) => (v === null ? "" : fmtNum(v, 2));
  /** A rule's condition in words, e.g. "total above 10 in 7 days", "below 65 for 2 days in a row". */
  const ruleText = (r: AlertRule) => ({
    below: t("setup.rule.txt.below", { v: num(r.threshold), n: r.periods }), above: t("setup.rule.txt.above", { v: num(r.threshold), n: r.periods }),
    outside: t("setup.rule.txt.outside", { lo: num(r.threshold) || "…", hi: num(r.threshold_high) || "…", n: r.periods }), kpi_limits: t("setup.rule.txt.kpi_limits", { n: r.periods }),
    total_above: t("setup.rule.txt.total_above", { v: num(r.threshold), d: r.lookback_days }), trend_down: t("setup.rule.txt.trend_down", { v: num(r.threshold), d: r.lookback_days }),
    trend_up: t("setup.rule.txt.trend_up", { v: num(r.threshold), d: r.lookback_days }), action_overdue: t("setup.rule.txt.action_overdue", { v: num(r.threshold) || "0" }),
  } as Record<string, string>)[r.condition] ?? r.condition;
  const catName = (id: string | null) => cats.data?.find((x) => x.id === id)?.name;
  const lineCode = (id: string | null) => lines.find((m) => m.id === id)?.code;
  return (
    <>
      <PageHeader title={t("setup.title")}><Text size="sm" c="dimmed">{t("setup.subtitle")}</Text></PageHeader>
      <Stack>
        <Paper withBorder p="md" radius="md">
          <Text fw={600} mb="xs">{t("setup.checklist", { n: doneSteps, total: steps.length })}</Text>
          <Stepper active={doneSteps} orientation="vertical" size="sm" allowNextStepsSelect={false}>
            {steps.map((s) => (
              <Stepper.Step key={s.key} completedIcon={<IconCheck size={14} />} color={s.n ? "teal" : "gray"} icon={s.n ? <IconCheck size={14} /> : undefined}
                label={<Group gap={6}><Text size="sm" fw={500}>{t(`setup.steps.${s.key}`)}</Text>{typeof s.n === "number" && <Badge size="xs" style={{ overflow: "visible" }} variant="light" color={s.n ? "teal" : "gray"}>{s.n}</Badge>}
                  {s.href && <Button size="compact-xs" variant="subtle" component={Link} href={s.href}>{t("setup.open")}</Button>}</Group>}
                description={t(`setup.stepHint.${s.key}`)} />
            ))}
          </Stepper>
          {st.data.units.length > 0 && <Text size="xs" c="dimmed" mt="xs">{t("setup.unitsInUse", { units: st.data.units.join(", "), models: st.data.models.map((m) => t(`gen.models.${m}`)).join(", ") })}</Text>}
        </Paper>

        <div id="plant" />
        <Section title={t("setup.plant")}><PlantConfig key={JSON.stringify(st.data.config)} cfg={st.data.config} /></Section>

        <div id="products" />
        <Section title={t("gen.set.products")} actions={<Button size="xs" leftSection={<IconPlus size={14} />}
          onClick={() => setPf({ code: "", name: "", category: "", machine_id: null, unit: "", rate: "", cycle: "", attrs: "", is_active: true })}>{t("common.add")}</Button>}>
          <Table.ScrollContainer minWidth={640}><Table striped>
            <Table.Thead><Table.Tr><Table.Th>{t("ops.set.code")}</Table.Th><Table.Th>{t("ops.set.name")}</Table.Th><Table.Th>{t("setup.prod.category")}</Table.Th><Table.Th>{t("kpi2.line")}</Table.Th><Table.Th>{t("setup.prod.rate")}</Table.Th><Table.Th /></Table.Tr></Table.Thead><Table.Tbody>
            {(products.data ?? []).map((p) => (
              <Table.Tr key={p.id} opacity={p.is_active ? 1 : 0.5}><Table.Td className="mono">{p.code}</Table.Td><Table.Td>{p.name}</Table.Td><Table.Td>{p.category}</Table.Td><Table.Td>{lineCode(p.machine_id) ?? t("kpi2.allLines")}</Table.Td>
                <Table.Td>{p.ideal_rate_per_h !== null ? `${fmtNum(p.ideal_rate_per_h, 2)} ${p.unit ?? lines.find((m) => m.id === p.machine_id)?.output_unit ?? ""}/h` : p.ideal_cycle_s !== null ? `${fmtNum(p.ideal_cycle_s, 2)} s` : "—"}</Table.Td>
                <Table.Td><Button size="compact-xs" variant="subtle" onClick={() => setPf({ id: p.id, code: p.code, name: p.name, category: p.category ?? "", machine_id: p.machine_id, unit: p.unit ?? "",
                  rate: p.ideal_rate_per_h ?? "", cycle: p.ideal_cycle_s ?? "", attrs: Object.entries(p.attributes).map(([k, v]) => `${k}=${v}`).join("\n"), is_active: p.is_active })}><IconPencil size={14} /></Button></Table.Td></Table.Tr>
            ))}
          </Table.Tbody></Table></Table.ScrollContainer>
        </Section>

        <div id="losses" />
        <Section title={t("setup.losses")} actions={<Button size="xs" leftSection={<IconPlus size={14} />}
          onClick={() => setLf({ code: "", name: "", parent_id: null, affects: "availability", event_type: "other", planned: false, failure: false, discipline_id: null, department_id: null, sort: ((cats.data?.length ?? 0) + 1) * 10, is_active: true })}>{t("common.add")}</Button>}>
          <Table.ScrollContainer minWidth={720}><Table striped>
            <Table.Thead><Table.Tr><Table.Th>{t("ops.set.code")}</Table.Th><Table.Th>{t("ops.set.name")}</Table.Th><Table.Th>{t("setup.loss.affects")}</Table.Th><Table.Th>{t("setup.loss.eventType")}</Table.Th><Table.Th>{t("setup.loss.flags")}</Table.Th><Table.Th /></Table.Tr></Table.Thead><Table.Tbody>
            {(cats.data ?? []).map((x) => (
              <Table.Tr key={x.id} opacity={x.is_active ? 1 : 0.5}>
                <Table.Td className="mono">{x.code}</Table.Td><Table.Td>{x.parent_id ? `${catName(x.parent_id)} › ` : ""}{x.name}</Table.Td><Table.Td>{t(`gen.factor.${x.affects}`)}</Table.Td><Table.Td>{t(`ops.stops.types.${x.event_type}`)}</Table.Td>
                <Table.Td className="nowrap">{x.planned && <Badge size="xs" style={{ overflow: "visible" }} variant="light" color="gray">{t("setup.loss.planned")}</Badge>}{x.failure && <Badge size="xs" style={{ overflow: "visible" }} variant="light" color="red">{t("ops.stops.failure")}</Badge>}</Table.Td>
                <Table.Td><Button size="compact-xs" variant="subtle" onClick={() => setLf({ id: x.id, code: x.code, name: x.name, parent_id: x.parent_id, affects: x.affects, event_type: x.event_type, planned: x.planned,
                  failure: x.failure, discipline_id: x.discipline_id, department_id: x.department_id, sort: x.sort, is_active: x.is_active })}><IconPencil size={14} /></Button></Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody></Table></Table.ScrollContainer>
        </Section>

        <div id="alerts" />
        <Section title={t("setup.rules")} actions={<Button size="xs" leftSection={<IconPlus size={14} />}
          onClick={() => setRf({ code: "", name: "", source_kind: "kpi", source_code: null, condition: "kpi_limits", threshold: "", threshold_high: "", periods: 1, lookback_days: 7, severity: "warning",
            machine_id: null, notify_role: null, notify_email: false, escalate_after_days: "", escalate_role: null, is_active: true })}>{t("common.add")}</Button>}>
          <Table.ScrollContainer minWidth={820}><Table striped>
            <Table.Thead><Table.Tr><Table.Th>{t("ins.rule")}</Table.Th><Table.Th>{t("setup.rule.sourceKind")}</Table.Th><Table.Th>{t("setup.rule.condition")}</Table.Th><Table.Th>{t("setup.rule.severity")}</Table.Th><Table.Th>{t("setup.rule.notify")}</Table.Th><Table.Th /></Table.Tr></Table.Thead><Table.Tbody>
            {(rules.data?.items ?? []).map((r) => (
              <Table.Tr key={r.id} opacity={r.is_active ? 1 : 0.5}>
                <Table.Td>{r.name}</Table.Td><Table.Td className="mono" fz="xs">{r.source_code ?? ""}</Table.Td>
                <Table.Td>{ruleText(r)}</Table.Td>
                <Table.Td className="nowrap"><Badge size="xs" style={{ overflow: "visible" }} variant="light" color={r.severity === "critical" ? "red" : r.severity === "warning" ? "orange" : "blue"}>{t(`ins.sev.${r.severity}`)}</Badge></Table.Td>
                <Table.Td>{rules.data?.roles.find((x) => x.code === r.notify_role)?.name ?? t("setup.rule.notifyDefault")}
                  {r.escalate_role && r.escalate_after_days && <Text size="xs" c="dimmed">{t("setup.rule.escalates", { n: r.escalate_after_days, role: rules.data?.roles.find((x) => x.code === r.escalate_role)?.name ?? r.escalate_role })}</Text>}</Table.Td>
                <Table.Td><Button size="compact-xs" variant="subtle" onClick={() => setRf({ id: r.id, code: r.code, name: r.name, source_kind: r.source_kind, source_code: r.source_code, condition: r.condition,
                  threshold: r.threshold ?? "", threshold_high: r.threshold_high ?? "", periods: r.periods, lookback_days: r.lookback_days, severity: r.severity, machine_id: r.machine_id, notify_role: r.notify_role,
                  notify_email: r.notify_email, escalate_after_days: r.escalate_after_days ?? "", escalate_role: r.escalate_role, is_active: r.is_active })}><IconPencil size={14} /></Button></Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody></Table></Table.ScrollContainer>
        </Section>
      </Stack>
      <ProductModal key={`p-${pf?.id}-${!!pf}`} form={pf} lines={lines} onClose={() => setPf(null)} />
      <LossModal key={`l-${lf?.id}-${!!lf}`} form={lf} cats={cats.data ?? []} discs={settings.data.disciplines} onClose={() => setLf(null)} />
      <RuleModal key={`r-${rf?.id}-${!!rf}`} form={rf} kpis={kpis.data?.items ?? []} vars={kpis.data?.variables ?? []} roles={rules.data?.roles ?? []} lines={lines} onClose={() => setRf(null)} />
    </>
  );
}

export default function SetupPage() {
  return <Guard perm="op.manage"><View /></Guard>;
}
