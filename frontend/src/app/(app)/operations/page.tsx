"use client";

import { Alert, Badge, Button, Group, Paper, Select, Stack, Text, TextInput } from "@mantine/core";
import { IconFileReport, IconNotebook, IconPlus, IconSettings } from "@tabler/icons-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Guard } from "@/components/AppFrame";
import { Modal } from "@/components/Modal";
import { DataTable, Loading, PageHeader, StatusBadge } from "@/components/ui";
import { post } from "@/lib/api";
import { fmtNum, useMut, useQ } from "@/lib/hooks";
import { oeeColor, PeriodTiles } from "@/components/Ops";
import { currentProductionDay, hhmm, pct, type LogTemplate, type OpSettings, type ReportList } from "@/lib/ops";
import { useSession } from "@/lib/session";

function NewReport({ opened, onClose, settings }: { opened: boolean; onClose: () => void; settings: OpSettings }) {
  const { t } = useTranslation();
  const { plant } = useSession();
  const router = useRouter();
  const machines = settings.machines.filter((m) => m.is_active);
  const [mid, setMid] = useState<string | null>(machines[0]?.id ?? null);
  const m = machines.find((x) => x.id === mid);
  const [day, setDay] = useState<string>(m ? currentProductionDay(m.day_start, plant?.timezone) : "");
  const go = useMut(() => post<{ id: string }>("/operations/reports", { machine_id: mid, report_date: day }), { success: false, onDone: (r) => router.push(`/operations/${r.id}`) });
  return (
    <Modal opened={opened} onClose={onClose} title={t("ops.newReport")}>
      <Stack>
        <Select label={t("ops.machine")} data={machines.map((x) => ({ value: x.id, label: `${x.code} – ${x.name}` }))} value={mid} onChange={setMid} />
        <TextInput type="date" label={t("ops.date")} value={day} onChange={(e) => setDay(e.currentTarget.value)} />
        <Button disabled={!mid || !day} loading={go.isPending} onClick={() => go.mutate(undefined)}>{t("ops.create")}</Button>
      </Stack>
    </Modal>
  );
}

function List() {
  const { t } = useTranslation();
  const router = useRouter();
  const { can, plant, me, setPlant } = useSession();
  const others = (me?.plants ?? []).filter((p) => p.plant_id !== plant?.plant_id && p.permissions.includes("op.view"));
  const settings = useQ<OpSettings>("/operations/settings");
  const logForms = useQ<LogTemplate[]>("/operations/log-templates");
  const machines = settings.data?.machines ?? [];
  const [mid, setMid] = useState<string | null>(null);
  const machineId = mid ?? machines[0]?.id ?? null;
  const [month, setMonth] = useState<string>("");
  const q = useQ<ReportList>(machineId ? "/operations/reports" : null, { machine_id: machineId, month: month || undefined });
  const [open, setOpen] = useState(false);
  if (settings.isLoading) return <Loading />;
  const m = machines.find((x) => x.id === machineId);
  const today = m ? currentProductionDay(m.day_start, plant?.timezone) : null;
  return (
    <>
      <PageHeader title={t("ops.title")} actions={<>
        {can("op.enter") && machines.length > 0 && <Button leftSection={<IconPlus size={16} />} onClick={() => setOpen(true)}>{t("ops.newReport")}</Button>}
        {(logForms.data ?? []).filter((x) => x.in_pm_report && x.is_active).map((x) => (
          <Button key={x.id} variant="default" component={Link} href={`/operations/logs?form=${x.id}`} leftSection={<IconNotebook size={16} />}>{x.name}</Button>
        ))}
        {can("op.manage") && <Button variant="default" component={Link} href="/operations/settings" leftSection={<IconSettings size={16} />}>{t("ops.settings")}</Button>}
      </>}>
        <Text size="sm" c="dimmed">{t("ops.subtitle")}</Text>
      </PageHeader>
      {settings.data && <NewReport key={String(open)} opened={open} onClose={() => setOpen(false)} settings={settings.data} />}
      {machines.length === 0 ? <Alert color="blue" icon={<IconFileReport />}>
        <Stack gap="xs">
          <Text size="sm">{t("ops.noMachine")}</Text>
          {others.length > 0 && <>
            <Text size="sm">{t("ops.otherPlants")}</Text>
            <Group gap="xs">{others.map((p) => <Button key={p.plant_id} size="xs" variant="light" onClick={() => setPlant(p.plant_id)}>{p.plant_code} – {p.plant_name}</Button>)}</Group>
          </>}
        </Stack>
      </Alert> : <>
        <Group mb="md" gap="sm">
          {machines.length > 1 && <Select w={240} data={machines.map((x) => ({ value: x.id, label: `${x.code} – ${x.name}` }))} value={machineId} onChange={setMid} />}
          <TextInput type="month" w={170} value={month || q.data?.month || ""} onChange={(e) => setMonth(e.currentTarget.value)} aria-label={t("ops.month")} />
        </Group>
        {q.data?.mtd && <Paper withBorder p="md" radius="md" mb="md"><PeriodTiles p={q.data.mtd} title={t("ops.tiles.mtd")} /></Paper>}
        <DataTable rows={q.data?.items} onRow={(r) => router.push(`/operations/${r.id}`)} columns={[
          { key: "d", label: t("ops.cols.date"), render: (r) => <span className="nowrap">{r.report_date}{r.report_date === today && <Badge ms={6} size="xs" variant="light">{t("ops.inProgressShort")}</Badge>}</span> },
          { key: "s", label: t("common.status"), render: (r) => <Group gap={4} wrap="nowrap"><StatusBadge value={r.status} />{r.revision > 1 && <Text size="xs" c="dimmed">r{r.revision}</Text>}</Group> },
          { key: "g", label: t("ops.cols.gross"), render: (r) => fmtNum(r.gross, 1) },
          { key: "n", label: t("ops.cols.net"), render: (r) => fmtNum(r.net, 1), hideOnMobile: true },
          { key: "a", label: t("ops.cols.a"), render: (r) => fmtNum(r.a, 1) },
          { key: "rj", label: t("ops.cols.rejectPct"), render: (r) => pct(r.reject_pct), hideOnMobile: true },
          { key: "run", label: t("ops.cols.run"), render: (r) => hhmm(r.run_hours), hideOnMobile: true },
          { key: "o", label: t("ops.cols.oee"), render: (r) => <Text size="sm" fw={600} c={r.report_date === today ? undefined : oeeColor(r.oee)}>{pct(r.oee)}</Text> },
          { key: "b", label: t("ops.cols.breaks"), render: (r) => r.breaks || "—" },
          { key: "dt", label: t("ops.cols.downtime"), render: (r) => r.downtime_hours ? hhmm(r.downtime_hours) : "—", hideOnMobile: true },
          { key: "w", label: t("ops.cols.warnings"), render: (r) => r.warnings ? <Badge color="orange" variant="light">{r.warnings}</Badge> : "", hideOnMobile: true },
        ]} />
      </>}
    </>
  );
}

export default function OperationsPage() {
  return <Guard perm="op.view"><List /></Guard>;
}
