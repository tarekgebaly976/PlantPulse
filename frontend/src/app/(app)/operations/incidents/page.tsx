"use client";

import { Badge, Button, Group, SegmentedControl, SimpleGrid, Stack, Table, Text } from "@mantine/core";
import { IconChecklist, IconPlus } from "@tabler/icons-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Guard } from "@/components/AppFrame";
import { Tile } from "@/components/Ops";
import { SafetyRatesSection } from "@/components/OpsSafetyRates";
import { blankIncident, editIncident, IncidentModal, kindColor, sevColor, type IForm } from "@/components/OpsIncidents";
import { DeptSelect, Loading, PageHeader, Section } from "@/components/ui";
import { post } from "@/lib/api";
import { fmtDate, useMut, useQ } from "@/lib/hooks";
import { INCIDENT_KINDS, type IncidentList } from "@/lib/ops";
import { useSession } from "@/lib/session";

function View() {
  const { t } = useTranslation();
  const { plant, can } = useSession();
  const [status, setStatus] = useState("all");
  const [days, setDays] = useState("90");
  const [dept, setDept] = useState<string | null>(null);
  const [f, setF] = useState<IForm | null>(null);
  const q = useQ<IncidentList>("/operations/incidents", { status, days, department_id: dept ?? undefined });
  const act = useMut((x: { id: string; title: string; machine_id: string | null }) =>
    post("/operations/actions", { title: `${t("inc.followUp")}: ${x.title}`.slice(0, 200), source: "incident", incident_id: x.id, machine_id: x.machine_id }), { success: t("inc.actionMade") });
  if (!q.data) return <Loading />;
  const st = q.data.stats;
  return (
    <>
      <PageHeader title={t("inc.pageTitle")} actions={q.data.can_report ? <Button color="red" leftSection={<IconPlus size={16} />} onClick={() => setF(blankIncident({}))}>{t("inc.report")}</Button> : undefined}>
        <Text size="sm" c="dimmed">{t("inc.subtitle")}</Text>
      </PageHeader>
      <Stack>
        <SimpleGrid cols={{ base: 2, sm: 4 }}>
          <Tile label={t("inc.daysSinceLti")} value={st.days_since_lost_time === null ? "—" : String(st.days_since_lost_time)} color={st.days_since_lost_time !== null && st.days_since_lost_time < 30 ? "red" : "teal"} sub={st.days_since_lost_time === null ? t("inc.noLti") : undefined} />
          <Tile label={t("inc.open")} value={String(st.open)} color={st.open ? "orange.8" : undefined} />
          <Tile label={t("inc.thisMonth")} value={String(st.month_total)} sub={INCIDENT_KINDS.filter((k) => st.month_by_kind[k]).map((k) => `${t(`inc.kinds.${k}`)} ${st.month_by_kind[k]}`).join(" · ")} />
          <Tile label={t("inc.total")} value={String(st.total)} />
        </SimpleGrid>
        <SafetyRatesSection />
        <Group gap="sm">
          <SegmentedControl value={status} onChange={setStatus} data={[{ value: "all", label: t("ins.all") }, { value: "active", label: t("inc.notClosed") }]} />
          <SegmentedControl value={days} onChange={setDays} data={[{ value: "30", label: t("opsDash.days", { n: 30 }) }, { value: "90", label: t("opsDash.days", { n: 90 }) }, { value: "365", label: t("opsDash.days", { n: 365 }) }]} />
          <DeptSelect clearable placeholder={t("inc.allAreas")} value={dept} onChange={setDept} />
        </Group>
        <Section title={t("inc.register")}>
          {q.data.items.length === 0 ? <Text size="sm" c="dimmed">{t("inc.none")}</Text> : (
            <Table.ScrollContainer minWidth={1040}><Table striped highlightOnHover>
              <Table.Thead><Table.Tr><Table.Th>#</Table.Th><Table.Th>{t("inc.when")}</Table.Th><Table.Th>{t("inc.kind")}</Table.Th><Table.Th>{t("inc.title")}</Table.Th>
                <Table.Th>{t("ops.set.dept")}</Table.Th><Table.Th>{t("inc.severity")}</Table.Th><Table.Th>{t("common.status")}</Table.Th><Table.Th /></Table.Tr></Table.Thead>
              <Table.Tbody>
                {q.data.items.map((i) => (
                  <Table.Tr key={i.id} style={{ cursor: "pointer" }} onClick={() => setF(editIncident(i, plant?.timezone))}>
                    <Table.Td className="mono nowrap">{i.number}</Table.Td>
                    <Table.Td className="nowrap">{fmtDate(i.occurred_at, plant?.timezone, true)}{i.shift ? ` · ${i.shift}` : ""}</Table.Td>
                    <Table.Td className="nowrap"><Badge size="sm" style={{ overflow: "visible" }} variant="light" color={kindColor(i.kind)}>{t(`inc.kinds.${i.kind}`)}</Badge></Table.Td>
                    <Table.Td><Text size="sm">{i.title}</Text>{(i.injured > 0 || i.lost_days) && <Text size="xs" c="red">{t("inc.injuredShort", { n: i.injured })}{i.lost_days ? ` · ${t("inc.lostDaysShort", { n: i.lost_days })}` : ""}</Text>}</Table.Td>
                    <Table.Td>{i.department}{i.line ? ` · ${i.line}` : ""}</Table.Td>
                    <Table.Td className="nowrap"><Badge size="sm" style={{ overflow: "visible" }} variant="dot" color={sevColor(i.severity)}>{t(`inc.sev.${i.severity}`)}</Badge></Table.Td>
                    <Table.Td className="nowrap"><Badge size="sm" style={{ overflow: "visible" }} variant="light" color={i.status === "closed" ? "gray" : i.status === "investigating" ? "yellow" : "red"}>{t(`inc.status.${i.status}`)}</Badge></Table.Td>
                    <Table.Td onClick={(e) => e.stopPropagation()}>{can("op.enter") && i.status !== "closed" &&
                      <Button size="compact-xs" variant="light" leftSection={<IconChecklist size={12} />} onClick={() => act.mutate({ id: i.id, title: i.title, machine_id: i.machine_id })}>{t("ins.act.make")}</Button>}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table></Table.ScrollContainer>
          )}
        </Section>
      </Stack>
      <IncidentModal key={`i-${f?.id}-${!!f}`} form={f} canClose={q.data.can_close} onClose={() => setF(null)} />
    </>
  );
}

export default function IncidentsPage() {
  return <Guard perm="op.view"><View /></Guard>;
}
