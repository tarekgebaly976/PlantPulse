"use client";

// Safety rates on the incident register page: rolling 12 months and per month LTIFR, LTISR and TRIR from the incident
// register and the hours worked (entered once a month, per area or for the whole plant).

import { Alert, Button, Group, NumberInput, SegmentedControl, SimpleGrid, Stack, Table, Text, TextInput, Tooltip } from "@mantine/core";
import { IconClockHour4 } from "@tabler/icons-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal } from "@/components/Modal";
import { Tile } from "@/components/Ops";
import { Section } from "@/components/ui";
import { get, put } from "@/lib/api";
import { fmtNum, useMut, useQ } from "@/lib/hooks";
import type { SafetyRates } from "@/lib/ops";
import { useSession } from "@/lib/session";

type Dept = { id: string; code: string; name: string; name_ar: string | null };
type Row = { department_id: string | null; employee_hours: number | string; contractor_hours: number | string };

const baseLabel = (b: number) => (b === 200000 ? "200,000" : "1,000,000");
const monthName = (m: string, lang: string) => new Date(`${m.slice(0, 7)}-01T00:00:00`).toLocaleDateString(lang === "ar" ? "ar" : lang === "bn" ? "bn" : "en", { month: "short", year: "numeric" });

function HoursModal({ onClose }: { onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const depts = useQ<Dept[]>("/departments").data ?? [];
  const now = new Date();
  const [month, setMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
  const [mode, setMode] = useState<"areas" | "plant">("areas");
  const [rows, setRows] = useState<Record<string, Row>>({});
  const [loaded, setLoaded] = useState<string | null>(null);
  if (loaded !== month) {
    setLoaded(month);
    void get<{ rows: Row[] }>("/operations/work-hours", { month }).then((r) => {
      const m: Record<string, Row> = {};
      for (const x of r.rows) m[x.department_id ?? "plant"] = x;
      setRows(m);
      setMode(r.rows.length === 1 && r.rows[0]!.department_id === null ? "plant" : "areas");
    });
  }
  const keys = mode === "plant" ? ["plant"] : depts.map((d) => d.id);
  const num = (v: number | string | undefined) => (v === "" || v === undefined ? 0 : Number(v));
  const total = keys.reduce((a, k) => a + num(rows[k]?.employee_hours) + num(rows[k]?.contractor_hours), 0);
  const set = (k: string, p: Partial<Row>) => setRows({ ...rows, [k]: { department_id: k === "plant" ? null : k, employee_hours: "", contractor_hours: "", ...rows[k], ...p } });
  const save = useMut(() => put("/operations/work-hours", { month, rows: keys.map((k) => ({ department_id: k === "plant" ? null : k, employee_hours: num(rows[k]?.employee_hours), contractor_hours: num(rows[k]?.contractor_hours) })) }), { onDone: onClose });
  return (
    <Modal opened onClose={onClose} title={t("safe.hoursTitle")} size="lg">
      <Stack>
        <Text size="sm" c="dimmed">{t("safe.hoursHint")}</Text>
        <Group align="flex-end">
          <TextInput type="month" label={t("safe.month")} value={month} onChange={(e) => setMonth(e.currentTarget.value)} />
          <SegmentedControl value={mode} onChange={(v) => setMode(v as "areas" | "plant")} data={[{ value: "areas", label: t("safe.perArea") }, { value: "plant", label: t("safe.wholePlant") }]} />
        </Group>
        <Table.ScrollContainer minWidth={420}><Table>
          <Table.Thead><Table.Tr><Table.Th>{t("safe.area")}</Table.Th><Table.Th>{t("safe.employees")}</Table.Th><Table.Th>{t("safe.contractors")}</Table.Th></Table.Tr></Table.Thead>
          <Table.Tbody>
            {keys.map((k) => {
              const d = depts.find((x) => x.id === k);
              return (
                <Table.Tr key={k}>
                  <Table.Td>{d ? `${d.code} — ${i18n.language === "ar" && d.name_ar ? d.name_ar : d.name}` : t("safe.wholePlant")}</Table.Td>
                  <Table.Td><NumberInput size="xs" min={0} thousandSeparator="," value={rows[k]?.employee_hours ?? ""} onChange={(v) => set(k, { employee_hours: v })} /></Table.Td>
                  <Table.Td><NumberInput size="xs" min={0} thousandSeparator="," value={rows[k]?.contractor_hours ?? ""} onChange={(v) => set(k, { contractor_hours: v })} /></Table.Td>
                </Table.Tr>
              );
            })}
          </Table.Tbody>
        </Table></Table.ScrollContainer>
        <Text size="sm" fw={600}>{t("safe.total")}: {fmtNum(total, 0)} h</Text>
        <Button loading={save.isPending} onClick={() => save.mutate(undefined)}>{t("common.save")}</Button>
      </Stack>
    </Modal>
  );
}

export function SafetyRatesSection() {
  const { t, i18n } = useTranslation();
  const { can } = useSession();
  const q = useQ<SafetyRates>("/operations/safety-rates", { months: 12 });
  const [open, setOpen] = useState(false);
  if (!q.data) return null;
  const r = q.data;
  const shown = r.months.filter((m) => m.hours !== null || m.incidents > 0);
  const rate = (v: number | null) => (v === null ? "—" : fmtNum(v, 2));
  return (
    <Section title={t("safe.title")} actions={can("op.manage") ? <Button size="xs" variant="light" leftSection={<IconClockHour4 size={14} />} onClick={() => setOpen(true)}>{t("safe.enterHours")}</Button> : undefined}>
      <Stack>
        <Text size="sm" c="dimmed">{t("safe.subtitle", { base: baseLabel(r.base) })}</Text>
        {r.rolling.months_with_hours === 0 ? <Alert color="blue">{t("safe.noHours")}</Alert> : (
          <SimpleGrid cols={{ base: 2, sm: 4 }}>
            <Tooltip label={t("safe.ltifrHint", { base: baseLabel(r.base) })} multiline w={260}><div><Tile label="LTIFR" value={rate(r.rolling.ltifr)} sub={t("safe.lti", { n: r.rolling.lost_time })} /></div></Tooltip>
            <Tooltip label={t("safe.ltisrHint", { base: baseLabel(r.base) })} multiline w={260}><div><Tile label="LTISR" value={rate(r.rolling.ltisr)} sub={t("safe.lostDays", { n: r.rolling.lost_days })} /></div></Tooltip>
            <Tooltip label={t("safe.trirHint", { base: baseLabel(r.base) })} multiline w={260}><div><Tile label="TRIR" value={rate(r.rolling.trir)} sub={t("safe.recordable", { n: r.rolling.recordable })} /></div></Tooltip>
            <Tile label={t("safe.hoursWorked")} value={fmtNum(r.rolling.hours, 0)} sub={t("safe.monthsWithHours", { n: r.rolling.months_with_hours })} />
          </SimpleGrid>
        )}
        {shown.length > 0 && (
          <Table.ScrollContainer minWidth={760}><Table striped>
            <Table.Thead><Table.Tr><Table.Th>{t("safe.month")}</Table.Th><Table.Th>{t("safe.hoursWorked")}</Table.Th><Table.Th>{t("safe.ltiShort")}</Table.Th><Table.Th>{t("safe.recShort")}</Table.Th>
              <Table.Th>{t("safe.daysShort")}</Table.Th><Table.Th>LTIFR</Table.Th><Table.Th>LTISR</Table.Th><Table.Th>TRIR</Table.Th></Table.Tr></Table.Thead>
            <Table.Tbody>
              {shown.map((m) => (
                <Table.Tr key={m.month}>
                  <Table.Td className="nowrap">{monthName(m.month, i18n.language)}</Table.Td>
                  <Table.Td>{m.hours === null ? <Text size="sm" c="orange">{t("safe.missingHours")}</Text> : fmtNum(m.hours, 0)}</Table.Td>
                  <Table.Td>{m.lost_time}</Table.Td><Table.Td>{m.recordable}</Table.Td><Table.Td>{m.lost_days}</Table.Td>
                  <Table.Td fw={600}>{rate(m.ltifr)}</Table.Td><Table.Td>{rate(m.ltisr)}</Table.Td><Table.Td>{rate(m.trir)}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table></Table.ScrollContainer>
        )}
      </Stack>
      {open && <HoursModal onClose={() => setOpen(false)} />}
    </Section>
  );
}
