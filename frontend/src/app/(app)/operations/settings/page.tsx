"use client";

import { ActionIcon, Alert, Badge, Button, Checkbox, Group, NumberInput, Select, SimpleGrid, Stack, Table, Text, TextInput } from "@mantine/core";
import { IconPencil, IconPlus, IconTrash } from "@tabler/icons-react";
import Link from "next/link";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Guard } from "@/components/AppFrame";
import { Modal } from "@/components/Modal";
import { AssetPicker, DeptSelect, Loading, PageHeader, Section } from "@/components/ui";
import { post, put } from "@/lib/api";
import { fmtNum, useMut, useQ } from "@/lib/hooks";
import type { OpDefect, OpDiscipline, OpGrade, OpMachine, OpSection, OpSettings, OpShift } from "@/lib/ops";

type Num = number | string;
const n = (v: Num | null | undefined) => (v === "" || v === null || v === undefined ? null : Number(v));

// ---------------- machine
interface MForm { id?: string; code: string; name: string; department_id: string | null; asset_id: string | null; trim_width_m: Num; day_start: string; shifts: OpShift[]; is_active: boolean }

function MachineModal({ form, onClose }: { form: MForm | null; onClose: () => void }) {
  const { t } = useTranslation();
  const [f, setF] = useState<MForm | null>(form);
  const save = useMut(() => {
    if (!f) return Promise.resolve();
    const body = { code: f.code, name: f.name, department_id: f.department_id, asset_id: f.asset_id, trim_width_m: n(f.trim_width_m), day_start: f.day_start, shifts: f.shifts, is_active: f.is_active };
    return f.id ? put(`/operations/machines/${f.id}`, body) : post("/operations/machines", body);
  }, { onDone: onClose });
  if (!f) return null;
  const set = (p: Partial<MForm>) => setF({ ...f, ...p });
  return (
    <Modal opened onClose={onClose} title={f.id ? f.code : t("ops.set.newMachine")} size="lg">
      <Stack>
        <SimpleGrid cols={2}>
          <TextInput label={t("ops.set.code")} required value={f.code} onChange={(e) => set({ code: e.currentTarget.value })} />
          <TextInput label={t("ops.set.name")} required value={f.name} onChange={(e) => set({ name: e.currentTarget.value })} />
        </SimpleGrid>
        <DeptSelect label={t("ops.set.dept")} value={f.department_id} onChange={(v) => set({ department_id: v })} />
        <AssetPicker label={t("ops.set.asset")} required value={f.asset_id} onChange={(v) => set({ asset_id: v })} />
        <SimpleGrid cols={2}>
          <NumberInput label={t("ops.set.width")} min={0} decimalScale={3} value={f.trim_width_m} onChange={(v) => set({ trim_width_m: v })} />
          <TextInput type="time" label={t("ops.set.dayStart")} value={f.day_start} onChange={(e) => set({ day_start: e.currentTarget.value })} />
        </SimpleGrid>
        <Text size="sm" fw={500}>{t("ops.set.shifts")}</Text>
        {f.shifts.map((s, i) => (
          <Group key={i} gap="xs" wrap="nowrap" align="flex-end">
            <TextInput w={80} label={i === 0 ? t("ops.set.shiftCode") : undefined} value={s.code} onChange={(e) => set({ shifts: f.shifts.map((x, j) => (j === i ? { ...x, code: e.currentTarget.value } : x)) })} />
            <TextInput style={{ flex: 1 }} label={i === 0 ? t("ops.set.shiftName") : undefined} value={s.name} onChange={(e) => set({ shifts: f.shifts.map((x, j) => (j === i ? { ...x, name: e.currentTarget.value } : x)) })} />
            <TextInput w={120} type="time" label={i === 0 ? t("ops.set.shiftStart") : undefined} value={s.start} onChange={(e) => set({ shifts: f.shifts.map((x, j) => (j === i ? { ...x, start: e.currentTarget.value } : x)) })} />
            <ActionIcon variant="subtle" color="red" disabled={f.shifts.length < 2} aria-label={t("common.delete")} onClick={() => set({ shifts: f.shifts.filter((_, j) => j !== i) })}><IconTrash size={16} /></ActionIcon>
          </Group>
        ))}
        {f.shifts.length < 4 && <Button size="xs" variant="subtle" leftSection={<IconPlus size={14} />} onClick={() => set({ shifts: [...f.shifts, { code: "", name: "", start: "" }] })}>{t("ops.set.addShift")}</Button>}
        <Checkbox label={t("ops.set.active")} checked={f.is_active} onChange={(e) => set({ is_active: e.currentTarget.checked })} />
        <Button loading={save.isPending} disabled={!f.code || !f.name || !f.department_id || !f.asset_id || f.shifts.some((s) => !s.code || !s.name || !s.start)} onClick={() => save.mutate(undefined)}>{t("common.save")}</Button>
      </Stack>
    </Modal>
  );
}

// ---------------- grade
interface GForm { id?: string; code: string; name: string; gsm: Num; speed: Num; ideal: Num; is_active: boolean }

function GradeModal({ m, form, onClose }: { m: OpMachine; form: GForm | null; onClose: () => void }) {
  const { t } = useTranslation();
  const [f, setF] = useState<GForm | null>(form);
  const save = useMut(() => {
    if (!f) return Promise.resolve();
    const body = { code: f.code || String(f.gsm), name: f.name || null, gsm: n(f.gsm), target_speed_mpm: n(f.speed), ideal_mt_min: n(f.ideal), is_active: f.is_active };
    return f.id ? put(`/operations/grades/${f.id}`, body) : post(`/operations/machines/${m.id}/grades`, body);
  }, { onDone: onClose });
  if (!f) return null;
  const set = (p: Partial<GForm>) => setF({ ...f, ...p });
  const calc = m.trim_width_m && n(f.gsm) && n(f.speed) ? Math.round((n(f.gsm)! * n(f.speed)! * m.trim_width_m) / 10) / 100000 : null;
  const ideal = n(f.ideal);
  return (
    <Modal opened onClose={onClose} title={t("ops.set.grades")}>
      <Stack>
        <SimpleGrid cols={2}>
          <NumberInput label={t("ops.set.gsm")} required min={10} value={f.gsm} onChange={(v) => set({ gsm: v })} />
          <TextInput label={t("ops.set.code")} placeholder={String(f.gsm || "")} value={f.code} onChange={(e) => set({ code: e.currentTarget.value })} />
        </SimpleGrid>
        <TextInput label={t("ops.set.name")} value={f.name} onChange={(e) => set({ name: e.currentTarget.value })} />
        <SimpleGrid cols={2}>
          <NumberInput label={t("ops.set.targetSpeed")} min={1} value={f.speed} onChange={(v) => set({ speed: v })} />
          <NumberInput label={t("ops.set.ideal")} required min={0} decimalScale={5} value={f.ideal} onChange={(v) => set({ ideal: v })} />
        </SimpleGrid>
        {calc !== null && <Group gap="xs"><Text size="xs" c="dimmed">{t("ops.set.calc")}: {calc}</Text><Button size="compact-xs" variant="light" onClick={() => set({ ideal: calc })}>←</Button></Group>}
        {ideal !== null && <Text size="xs" c="dimmed">{fmtNum(ideal * 60, 3)} {t("ops.set.perHour")} · {fmtNum(ideal * 1440, 1)} {t("ops.set.perDay")}</Text>}
        <Text size="xs" c="dimmed">{t("ops.set.rateHint")}</Text>
        <Checkbox label={t("ops.set.active")} checked={f.is_active} onChange={(e) => set({ is_active: e.currentTarget.checked })} />
        <Button loading={save.isPending} disabled={!n(f.gsm) || !n(f.ideal)} onClick={() => save.mutate(undefined)}>{t("common.save")}</Button>
      </Stack>
    </Modal>
  );
}

// ---------------- simple lists
interface SForm { id?: string; name: string; asset_id: string | null; sort: Num; is_active: boolean }
interface DForm { id?: string; code: string; name: string; maintenance: boolean; sort: Num; is_active: boolean }
interface XForm { id?: string; name: string; disposition: string; is_active: boolean }

function SectionModal({ m, form, onClose }: { m: OpMachine; form: SForm | null; onClose: () => void }) {
  const { t } = useTranslation();
  const [f, setF] = useState<SForm | null>(form);
  const save = useMut(() => {
    if (!f) return Promise.resolve();
    const body = { name: f.name, asset_id: f.asset_id, sort: n(f.sort) ?? 0, is_active: f.is_active };
    return f.id ? put(`/operations/sections/${f.id}`, body) : post(`/operations/machines/${m.id}/sections`, body);
  }, { onDone: onClose });
  if (!f) return null;
  return (
    <Modal opened onClose={onClose} title={t("ops.set.sections")}>
      <Stack>
        <TextInput label={t("ops.set.name")} required value={f.name} onChange={(e) => setF({ ...f, name: e.currentTarget.value })} />
        <AssetPicker label={t("ops.set.sectionAsset")} clearable value={f.asset_id} onChange={(v) => setF({ ...f, asset_id: v })} />
        <NumberInput label={t("ops.set.sort")} min={0} value={f.sort} onChange={(v) => setF({ ...f, sort: v })} />
        <Checkbox label={t("ops.set.active")} checked={f.is_active} onChange={(e) => setF({ ...f, is_active: e.currentTarget.checked })} />
        <Button loading={save.isPending} disabled={!f.name} onClick={() => save.mutate(undefined)}>{t("common.save")}</Button>
      </Stack>
    </Modal>
  );
}

function DisciplineModal({ form, onClose }: { form: DForm | null; onClose: () => void }) {
  const { t } = useTranslation();
  const [f, setF] = useState<DForm | null>(form);
  const save = useMut(() => {
    if (!f) return Promise.resolve();
    const body = { code: f.code, name: f.name, maintenance: f.maintenance, sort: n(f.sort) ?? 0, is_active: f.is_active };
    return f.id ? put(`/operations/disciplines/${f.id}`, body) : post("/operations/disciplines", body);
  }, { onDone: onClose });
  if (!f) return null;
  return (
    <Modal opened onClose={onClose} title={t("ops.set.disciplines")}>
      <Stack>
        <SimpleGrid cols={2}>
          <TextInput label={t("ops.set.code")} required value={f.code} onChange={(e) => setF({ ...f, code: e.currentTarget.value })} />
          <NumberInput label={t("ops.set.sort")} min={0} value={f.sort} onChange={(v) => setF({ ...f, sort: v })} />
        </SimpleGrid>
        <TextInput label={t("ops.set.name")} required value={f.name} onChange={(e) => setF({ ...f, name: e.currentTarget.value })} />
        <Checkbox label={t("ops.set.maint")} description={t("ops.set.maintHint")} checked={f.maintenance} onChange={(e) => setF({ ...f, maintenance: e.currentTarget.checked })} />
        <Checkbox label={t("ops.set.active")} checked={f.is_active} onChange={(e) => setF({ ...f, is_active: e.currentTarget.checked })} />
        <Button loading={save.isPending} disabled={!f.code || !f.name} onClick={() => save.mutate(undefined)}>{t("common.save")}</Button>
      </Stack>
    </Modal>
  );
}

function DefectModal({ form, onClose }: { form: XForm | null; onClose: () => void }) {
  const { t } = useTranslation();
  const [f, setF] = useState<XForm | null>(form);
  const save = useMut(() => {
    if (!f) return Promise.resolve();
    const body = { name: f.name, disposition: f.disposition || "R/P", is_active: f.is_active };
    return f.id ? put(`/operations/defects/${f.id}`, body) : post("/operations/defects", body);
  }, { onDone: onClose });
  if (!f) return null;
  return (
    <Modal opened onClose={onClose} title={t("ops.set.defects")}>
      <Stack>
        <TextInput label={t("ops.set.name")} required value={f.name} onChange={(e) => setF({ ...f, name: e.currentTarget.value })} />
        <TextInput label={t("ops.set.disposition")} placeholder="R/P, F/H" maxLength={10} value={f.disposition} onChange={(e) => setF({ ...f, disposition: e.currentTarget.value })} />
        <Checkbox label={t("ops.set.active")} checked={f.is_active} onChange={(e) => setF({ ...f, is_active: e.currentTarget.checked })} />
        <Button loading={save.isPending} disabled={!f.name} onClick={() => save.mutate(undefined)}>{t("common.save")}</Button>
      </Stack>
    </Modal>
  );
}

const Edit = ({ onClick }: { onClick: () => void }) => <ActionIcon variant="subtle" aria-label="edit" onClick={onClick}><IconPencil size={16} /></ActionIcon>;
const Off = ({ on }: { on: boolean }) => (on ? null : <Badge size="xs" color="gray" variant="light">off</Badge>);

function SettingsView() {
  const { t } = useTranslation();
  const q = useQ<OpSettings>("/operations/settings");
  const [mid, setMid] = useState<string | null>(null);
  const [mf, setMf] = useState<MForm | null>(null);
  const [gf, setGf] = useState<GForm | null>(null);
  const [sf, setSf] = useState<SForm | null>(null);
  const [df, setDf] = useState<DForm | null>(null);
  const [xf, setXf] = useState<XForm | null>(null);
  if (!q.data) return <Loading />;
  const { machines, disciplines, defects } = q.data;
  const m = machines.find((x) => x.id === (mid ?? machines[0]?.id));
  const editM = (x: OpMachine): MForm => ({ id: x.id, code: x.code, name: x.name, department_id: x.department_id, asset_id: x.asset_id, trim_width_m: x.trim_width_m ?? "", day_start: x.day_start, shifts: x.shifts, is_active: x.is_active });
  const editG = (g: OpGrade): GForm => ({ id: g.id, code: g.code, name: g.name ?? "", gsm: g.gsm, speed: g.target_speed_mpm ?? "", ideal: g.ideal_mt_min, is_active: g.is_active });
  const editS = (s: OpSection): SForm => ({ id: s.id, name: s.name, asset_id: s.asset_id, sort: s.sort, is_active: s.is_active });
  const editD = (d: OpDiscipline): DForm => ({ id: d.id, code: d.code, name: d.name, maintenance: d.maintenance, sort: d.sort, is_active: d.is_active });
  const editX = (d: OpDefect): XForm => ({ id: d.id, name: d.name, disposition: d.disposition, is_active: d.is_active });
  const add = (onClick: () => void) => <Button size="xs" leftSection={<IconPlus size={14} />} onClick={onClick}>{t("common.add")}</Button>;
  return (
    <>
      <PageHeader title={t("ops.set.title")} actions={<Button variant="default" component={Link} href="/operations">{t("ops.title")}</Button>} />
      <Stack>
        <Section title={t("ops.set.machines")} actions={add(() => setMf({ code: "", name: "", department_id: null, asset_id: null, trim_width_m: "", day_start: "07:00",
          shifts: [{ code: "D", name: "Day shift", start: "07:00" }, { code: "N", name: "Night shift", start: "19:00" }], is_active: true }))}>
          {machines.length === 0 ? <Alert color="blue">{t("ops.noMachine")}</Alert> : (
            <Table striped><Table.Tbody>
              {machines.map((x) => (
                <Table.Tr key={x.id} bg={x.id === m?.id ? "var(--mantine-color-blue-light)" : undefined} style={{ cursor: "pointer" }} onClick={() => setMid(x.id)}>
                  <Table.Td fw={600}>{x.code}</Table.Td><Table.Td>{x.name} <Off on={x.is_active} /></Table.Td>
                  <Table.Td>{t("ops.set.dayStart")} {x.day_start}</Table.Td><Table.Td>{x.shifts.map((s) => `${s.code} ${s.start}`).join(" · ")}</Table.Td>
                  <Table.Td>{x.trim_width_m ? `${x.trim_width_m} m` : ""}</Table.Td>
                  <Table.Td onClick={(e) => e.stopPropagation()}><Edit onClick={() => setMf(editM(x))} /></Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody></Table>
          )}
        </Section>
        {m && (
          <SimpleGrid cols={{ base: 1, lg: 2 }}>
            <Section title={`${t("ops.set.grades")} · ${m.code}`} actions={add(() => setGf({ code: "", name: "", gsm: "", speed: "", ideal: "", is_active: true }))}>
              <Text size="xs" c="dimmed" mb="xs">{t("ops.set.rateHint")}</Text>
              <Table striped>
                <Table.Thead><Table.Tr><Table.Th>{t("ops.set.gsm")}</Table.Th><Table.Th>{t("ops.set.targetSpeed")}</Table.Th><Table.Th>{t("ops.set.ideal")}</Table.Th>
                  <Table.Th>{t("ops.set.perHour")}</Table.Th><Table.Th>{t("ops.set.perDay")}</Table.Th><Table.Th /></Table.Tr></Table.Thead>
                <Table.Tbody>
                  {(m.grades ?? []).map((g) => (
                    <Table.Tr key={g.id}><Table.Td>{g.gsm} {g.code !== String(g.gsm) && <Text span size="xs" c="dimmed">({g.code})</Text>} <Off on={g.is_active} /></Table.Td>
                      <Table.Td>{g.target_speed_mpm ?? "—"}</Table.Td><Table.Td>{g.ideal_mt_min}</Table.Td><Table.Td>{fmtNum(g.ideal_mt_min * 60, 2)}</Table.Td>
                      <Table.Td>{fmtNum(g.ideal_mt_min * 1440, 1)}</Table.Td><Table.Td><Edit onClick={() => setGf(editG(g))} /></Table.Td></Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Section>
            <Section title={`${t("ops.set.sections")} · ${m.code}`} actions={add(() => setSf({ name: "", asset_id: null, sort: (m.sections?.length ?? 0) + 1, is_active: true }))}>
              <Table striped><Table.Tbody>
                {(m.sections ?? []).map((s) => (
                  <Table.Tr key={s.id}><Table.Td>{s.name} <Off on={s.is_active} /></Table.Td><Table.Td>{s.asset_id ? "✓" : ""}</Table.Td><Table.Td><Edit onClick={() => setSf(editS(s))} /></Table.Td></Table.Tr>
                ))}
              </Table.Tbody></Table>
            </Section>
          </SimpleGrid>
        )}
        <SimpleGrid cols={{ base: 1, lg: 2 }}>
          <Section title={t("ops.set.disciplines")} actions={add(() => setDf({ code: "", name: "", maintenance: false, sort: disciplines.length + 1, is_active: true }))}>
            <Table striped><Table.Tbody>
              {disciplines.map((d) => (
                <Table.Tr key={d.id}><Table.Td fw={600}>{d.code}</Table.Td><Table.Td>{d.name} <Off on={d.is_active} /></Table.Td>
                  <Table.Td>{d.maintenance && <Badge size="xs" color="orange" variant="light">{t("ops.set.maint")}</Badge>}</Table.Td><Table.Td><Edit onClick={() => setDf(editD(d))} /></Table.Td></Table.Tr>
              ))}
            </Table.Tbody></Table>
          </Section>
          <Section title={t("ops.set.defects")} actions={add(() => setXf({ name: "", disposition: "R/P", is_active: true }))}>
            <Table striped><Table.Tbody>
              {defects.map((d) => (
                <Table.Tr key={d.id}><Table.Td>{d.name} <Off on={d.is_active} /></Table.Td><Table.Td>{d.disposition}</Table.Td><Table.Td><Edit onClick={() => setXf(editX(d))} /></Table.Td></Table.Tr>
              ))}
            </Table.Tbody></Table>
          </Section>
        </SimpleGrid>
      </Stack>
      <MachineModal key={`m-${mf?.id}-${!!mf}`} form={mf} onClose={() => setMf(null)} />
      {m && <GradeModal key={`g-${gf?.id}-${!!gf}`} m={m} form={gf} onClose={() => setGf(null)} />}
      {m && <SectionModal key={`s-${sf?.id}-${!!sf}`} m={m} form={sf} onClose={() => setSf(null)} />}
      <DisciplineModal key={`d-${df?.id}-${!!df}`} form={df} onClose={() => setDf(null)} />
      <DefectModal key={`x-${xf?.id}-${!!xf}`} form={xf} onClose={() => setXf(null)} />
    </>
  );
}

export default function OperationsSettingsPage() {
  return <Guard perm="op.manage"><SettingsView /></Guard>;
}
