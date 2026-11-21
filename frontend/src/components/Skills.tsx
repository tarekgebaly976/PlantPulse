"use client";

/** Skill matrix (technicians × skills, level and certificate status) and the "required skills" editor used on work
 *  orders and job plans. Kept by the engineer and the maintenance manager (skill.manage). */

import { ActionIcon, Alert, Badge, Button, Checkbox, Group, ScrollArea, Select, SimpleGrid, Stack, Switch, Table, Text, TextInput, Textarea, Tooltip } from "@mantine/core";
import { IconPlus, IconTrash } from "@tabler/icons-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal } from "@/components/Modal";
import { del, patch, post, put } from "@/lib/api";
import { useMut, useQ } from "@/lib/hooks";
import { useSession } from "@/lib/session";

export interface SkillDef { id: string; code: string; name: string; name_ar: string | null; trade: string | null; category: string; needs_certificate: boolean; is_active: boolean }
interface Person { user_id: string; name: string; trade: string | null; role: string }
interface Cell { user_id: string; skill_id: string; level: number; certified_until: string | null; note: string | null; status: string }
interface Matrix { skills: SkillDef[]; people: Person[]; cells: Cell[]; coverage: Record<string, number>; today: string }
export interface Need { skill_id: string; min_level: number; code: string; name: string; name_ar: string | null }

/** Same colour code as the rest of the app: red act now, amber attention, green all clear, grey information. */
const STATUS_COLOR: Record<string, string> = { valid: "green", expiring: "yellow", expired: "red", no_certificate: "red" };
/** The people column stays in view while the skills scroll sideways (phones). */
const STICKY = { position: "sticky", insetInlineStart: 0, zIndex: 1, background: "var(--mantine-color-body)", minWidth: 120 } as const;
const CAT_COLOR: Record<string, string> = { equipment: "blue", technique: "grape", safety: "red" };

function useSkillName() {
  const { i18n } = useTranslation();
  return (s: { name: string; name_ar: string | null }) => (i18n.language === "ar" && s.name_ar ? s.name_ar : s.name);
}

export function SkillMatrix() {
  const { t } = useTranslation();
  const { can } = useSession();
  const name = useSkillName();
  const manage = can("skill.manage");
  const [everyone, setEveryone] = useState(false);
  const q = useQ<Matrix>("/skills/matrix", { everyone });
  const [cell, setCell] = useState<{ person: Person; skill: SkillDef; level: string; certified_until: string; note: string; exists: boolean } | null>(null);
  const [def, setDef] = useState<Partial<SkillDef> | null>(null);
  const save = useMut(() => put(`/skills/matrix/${cell?.person.user_id}/${cell?.skill.id}`, {
    level: Number(cell?.level), certified_until: cell?.certified_until || null, note: cell?.note || null }), { onDone: () => setCell(null) });
  const remove = useMut(() => del(`/skills/matrix/${cell?.person.user_id}/${cell?.skill.id}`), { onDone: () => setCell(null) });
  const saveDef = useMut(() => {
    const body = { name: def?.name, name_ar: def?.name_ar || null, trade: def?.trade || null, category: def?.category ?? "equipment", needs_certificate: !!def?.needs_certificate };
    return def?.id ? patch(`/skills/${def.id}`, { ...body, is_active: def.is_active }) : post("/skills", { ...body, code: def?.code });
  }, { onDone: () => setDef(null) });
  const m = q.data;
  const at = new Map((m?.cells ?? []).map((c) => [`${c.user_id}:${c.skill_id}`, c]));
  const coverColor = (n: number) => (n === 0 ? "red" : n === 1 ? "yellow" : "green");
  return (
    <Stack>
      <Group justify="space-between">
        <Text size="sm" c="dimmed" style={{ flex: 1 }}>{t("skill.hint")}</Text>
        <Switch label={t("skill.everyone")} checked={everyone} onChange={(e) => setEveryone(e.currentTarget.checked)} />
        {manage && <Button leftSection={<IconPlus size={16} />} onClick={() => setDef({ category: "equipment", needs_certificate: false, is_active: true })}>{t("skill.newSkill")}</Button>}
      </Group>
      {m && m.skills.length === 0 ? <Alert color="gray">{t("skill.noSkills")}</Alert> : (
        <ScrollArea type="auto">
          <Table withTableBorder withColumnBorders fz="xs" miw={300 + (m?.skills.length ?? 0) * 70} data-testid="skill-matrix">
            <Table.Thead><Table.Tr>
              <Table.Th style={STICKY}>{t("common.user")}</Table.Th>
              {m?.skills.map((s) => (
                <Table.Th key={s.id} style={{ textAlign: "center", verticalAlign: "top", minWidth: 84, cursor: manage ? "pointer" : undefined }} onClick={() => manage && setDef(s)}>
                  <Tooltip label={`${name(s)} · ${t(`skill.cat_${s.category}`)}`}><Badge size="xs" variant="light" color={CAT_COLOR[s.category]}>{s.code}</Badge></Tooltip>
                  <Text size="10px" fw={500} lh={1.25} mt={4} c="dimmed">{name(s)}</Text>
                </Table.Th>))}
            </Table.Tr></Table.Thead>
            <Table.Tbody>
              {m?.people.map((p) => (
                <Table.Tr key={p.user_id}>
                  <Table.Td style={STICKY}>{p.name}<Text size="xs" c="dimmed">{p.trade}</Text></Table.Td>
                  {m.skills.map((s) => {
                    const c = at.get(`${p.user_id}:${s.id}`);
                    return (
                      <Table.Td key={s.id} style={{ textAlign: "center", cursor: manage ? "pointer" : undefined }} data-testid={`cell-${p.user_id}-${s.code}`}
                        onClick={() => manage && setCell({ person: p, skill: s, level: String(c?.level ?? 1), certified_until: c?.certified_until ?? "", note: c?.note ?? "", exists: !!c })}>
                        {c && <Tooltip label={`${t(`skill.status_${c.status}`)}${c.certified_until ? ` · ${c.certified_until}` : ""}`}>
                          <Badge size="sm" color={STATUS_COLOR[c.status] ?? "gray"} variant={c.status === "valid" ? "light" : "filled"}>{c.level}</Badge>
                        </Tooltip>}
                      </Table.Td>);
                  })}
                </Table.Tr>))}
              <Table.Tr>
                <Table.Td style={STICKY}><Text size="xs" fw={700}>{t("skill.coverage")}</Text></Table.Td>
                {m?.skills.map((s) => { const n = m.coverage[s.id] ?? 0; return (
                  <Table.Td key={s.id} style={{ textAlign: "center" }}><Badge size="sm" color={coverColor(n)}>{n}</Badge></Table.Td>); })}
              </Table.Tr>
            </Table.Tbody>
          </Table>
        </ScrollArea>
      )}
      <Modal opened={!!cell} onClose={() => setCell(null)} title={cell ? `${cell.person.name} · ${cell.skill.code} – ${name(cell.skill)}` : ""}>
        {cell && <Stack>
          <Select label={t("skill.level")} value={cell.level} allowDeselect={false} onChange={(v) => setCell({ ...cell, level: v ?? "1" })}
            data={["1", "2", "3"].map((l) => ({ value: l, label: t(`skill.level${l}`) }))} />
          <TextInput type="date" label={t("skill.certUntil")} required={cell.skill.needs_certificate} value={cell.certified_until}
            onChange={(e) => setCell({ ...cell, certified_until: e.currentTarget.value })} />
          <Textarea label={t("skill.note")} value={cell.note} onChange={(e) => setCell({ ...cell, note: e.currentTarget.value })} autosize />
          <Group justify="space-between">
            {cell.exists ? <Button color="red" variant="subtle" loading={remove.isPending} onClick={() => remove.mutate(undefined)}>{t("skill.remove")}</Button> : <span />}
            <Button loading={save.isPending} onClick={() => save.mutate(undefined)}>{t("common.save")}</Button>
          </Group>
        </Stack>}
      </Modal>
      <Modal opened={!!def} onClose={() => setDef(null)} title={def?.id ? t("skill.editSkill") : t("skill.newSkill")}>
        {def && <Stack>
          <SimpleGrid cols={2}>
            <TextInput label={t("skill.code")} placeholder={t("common.autoCode")} disabled={!!def.id} maxLength={30} value={def.code ?? ""} onChange={(e) => setDef({ ...def, code: e.currentTarget.value })} />
            <Select label={t("skill.category")} value={def.category ?? "equipment"} allowDeselect={false} onChange={(v) => setDef({ ...def, category: v ?? "equipment" })}
              data={["equipment", "technique", "safety"].map((c) => ({ value: c, label: t(`skill.cat_${c}`) }))} />
          </SimpleGrid>
          <TextInput label={t("skill.name")} required value={def.name ?? ""} onChange={(e) => setDef({ ...def, name: e.currentTarget.value })} />
          <TextInput label={t("skill.nameAr")} dir="rtl" value={def.name_ar ?? ""} onChange={(e) => setDef({ ...def, name_ar: e.currentTarget.value })} />
          <TextInput label={t("skill.trade")} value={def.trade ?? ""} onChange={(e) => setDef({ ...def, trade: e.currentTarget.value })} />
          <Checkbox label={t("skill.needsCert")} checked={!!def.needs_certificate} onChange={(e) => setDef({ ...def, needs_certificate: e.currentTarget.checked })} />
          {def.id && <Checkbox label={t("skill.active")} checked={def.is_active !== false} onChange={(e) => setDef({ ...def, is_active: e.currentTarget.checked })} />}
          <Button disabled={!def.name} loading={saveDef.isPending} onClick={() => saveDef.mutate(undefined)}>{t("common.save")}</Button>
        </Stack>}
      </Modal>
    </Stack>
  );
}

/** Required skills of a work order or job plan: badges, and an editor for whoever may change them. */
export function RequiredSkills({ path, canEdit }: { path: string; canEdit: boolean }) {
  const { t } = useTranslation();
  const name = useSkillName();
  const q = useQ<Need[]>(path);
  const skills = useQ<SkillDef[]>(canEdit ? "/skills" : null);
  const [edit, setEdit] = useState<{ skill_id: string | null; min_level: string }[] | null>(null);
  const save = useMut(() => put(path, { skills: (edit ?? []).filter((r) => r.skill_id).map((r) => ({ skill_id: r.skill_id, min_level: Number(r.min_level) })) }),
    { onDone: () => setEdit(null) });
  const opts = (skills.data ?? []).map((s) => ({ value: s.id, label: `${s.code} – ${name(s)}` }));
  if (edit) return (
    <Stack gap="xs">
      {edit.map((r, i) => (
        <Group key={i} gap="xs" wrap="nowrap" align="end">
          <Select style={{ flex: 1 }} searchable placeholder={t("skill.name")} value={r.skill_id} data={opts}
            onChange={(v) => setEdit(edit.map((x, j) => (j === i ? { ...x, skill_id: v } : x)))} aria-label={t("skill.name")} />
          <Select w={190} value={r.min_level} allowDeselect={false} aria-label={t("skill.minLevel")}
            data={["1", "2", "3"].map((l) => ({ value: l, label: t(`skill.level${l}`) }))} onChange={(v) => setEdit(edit.map((x, j) => (j === i ? { ...x, min_level: v ?? "1" } : x)))} />
          <ActionIcon variant="subtle" color="red" aria-label={t("skill.remove")} onClick={() => setEdit(edit.filter((_, j) => j !== i))}><IconTrash size={16} /></ActionIcon>
        </Group>))}
      <Group justify="space-between">
        <Button size="xs" variant="subtle" leftSection={<IconPlus size={14} />} onClick={() => setEdit([...edit, { skill_id: null, min_level: "1" }])}>{t("skill.addRequired")}</Button>
        <Group gap="xs"><Button size="xs" variant="default" onClick={() => setEdit(null)}>{t("common.cancel")}</Button>
          <Button size="xs" loading={save.isPending} onClick={() => save.mutate(undefined)}>{t("common.save")}</Button></Group>
      </Group>
    </Stack>
  );
  return (
    <Stack gap={6}>
      {(q.data ?? []).length === 0 ? <Text size="sm" c="dimmed">{t("skill.noRequired")}</Text> : (
        <Group gap={6}>{q.data?.map((n) => (
          <Tooltip key={n.skill_id} label={`${name(n)} · ${t(`skill.level${n.min_level}`)}`}><Badge variant="light">{n.code} ≥ {n.min_level}</Badge></Tooltip>))}</Group>
      )}
      <Text size="xs" c="dimmed">{t("skill.requiredHint")}</Text>
      {canEdit && <Button size="xs" variant="light" w="fit-content" onClick={() => setEdit((q.data ?? []).map((n) => ({ skill_id: n.skill_id, min_level: String(n.min_level) })))}>{t("common.edit")}</Button>}
    </Stack>
  );
}
