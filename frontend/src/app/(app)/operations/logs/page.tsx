"use client";

import { Alert, Badge, Button, Group, SegmentedControl, Select, Stack, Text, TextInput } from "@mantine/core";
import { IconNotebook, IconPlus } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Guard } from "@/components/AppFrame";
import { Modal } from "@/components/Modal";
import { DataTable, Loading, PageHeader, StatusBadge } from "@/components/ui";
import { post } from "@/lib/api";
import { useMut, useQ } from "@/lib/hooks";
import { currentProductionDay, fmtVal, type LogList, type LogTemplate } from "@/lib/ops";
import { useSession } from "@/lib/session";

function NewLog({ t: tpl, onClose }: { t: LogTemplate; onClose: () => void }) {
  const { t } = useTranslation();
  const { plant } = useSession();
  const router = useRouter();
  const [day, setDay] = useState(currentProductionDay(tpl.day_start, plant?.timezone));
  const [shift, setShift] = useState<string | null>(tpl.shifts[0]?.code ?? null);
  const go = useMut(() => post<{ id: string }>("/operations/logs", { template_id: tpl.id, log_date: day, shift: tpl.frequency === "shift" ? shift : "-" }),
    { success: false, onDone: (r) => router.push(`/operations/logs/${r.id}`) });
  return (
    <Modal opened onClose={onClose} title={tpl.name}>
      <Stack>
        <TextInput type="date" label={t("ops.date")} value={day} onChange={(e) => setDay(e.currentTarget.value)} />
        {tpl.frequency === "shift" && <Select label={t("ops.shifts.shift")} data={tpl.shifts.map((s) => ({ value: s.code, label: `${s.code} – ${s.name} (${s.start})` }))} value={shift} onChange={setShift} />}
        <Button disabled={!day || (tpl.frequency === "shift" && !shift)} loading={go.isPending} onClick={() => go.mutate(undefined)}>{t("ops.create")}</Button>
      </Stack>
    </Modal>
  );
}

function List() {
  const { t } = useTranslation();
  const router = useRouter();
  const { can } = useSession();
  const tq = useQ<LogTemplate[]>("/operations/log-templates");
  const templates = (tq.data ?? []).filter((x) => x.is_active);
  const [tid, setTid] = useState<string | null>(null);
  const tpl = templates.find((x) => x.id === tid) ?? templates[0];
  const [month, setMonth] = useState("");
  const q = useQ<LogList>(tpl ? "/operations/logs" : null, { template_id: tpl?.id, month: month || undefined });
  const [open, setOpen] = useState(false);
  if (tq.isLoading) return <Loading />;
  const cols = q.data?.columns ?? [];
  return (
    <>
      <PageHeader title={t("logs.title")} actions={tpl && can("op.enter") ? <Button leftSection={<IconPlus size={16} />} onClick={() => setOpen(true)}>{tpl.frequency === "shift" ? t("logs.newShift") : t("logs.newDay")}</Button> : undefined}>
        <Text size="sm" c="dimmed">{t("logs.subtitle")}</Text>
      </PageHeader>
      {open && tpl && <NewLog t={tpl} onClose={() => setOpen(false)} />}
      {templates.length === 0 ? <Alert color="blue" icon={<IconNotebook />}>{t("logs.none")}</Alert> : <>
        <Group mb="md" gap="sm" wrap="wrap">
          <SegmentedControl value={tpl?.id ?? ""} onChange={(v) => { setTid(v); setMonth(""); }} data={templates.map((x) => ({ value: x.id, label: x.name }))} />
          <TextInput type="month" w={170} value={month || q.data?.month || ""} onChange={(e) => setMonth(e.currentTarget.value)} aria-label={t("ops.month")} />
        </Group>
        <DataTable rows={q.data?.items} onRow={(r) => router.push(`/operations/logs/${r.id}`)} columns={[
          { key: "d", label: t("ops.cols.date"), render: (r) => <span className="nowrap">{r.log_date}{r.shift !== "-" && <Badge ms={6} size="sm" variant="outline" color="gray">{r.shift}</Badge>}
            {r.in_progress && <Badge ms={6} size="xs" variant="light">{t("ops.inProgressShort")}</Badge>}</span> },
          { key: "s", label: t("common.status"), render: (r) => <Group gap={4} wrap="nowrap"><StatusBadge value={r.status} />{r.revision > 1 && <Text size="xs" c="dimmed">r{r.revision}</Text>}</Group> },
          ...cols.map((c, i) => ({ key: c.id, label: `${c.label}${c.unit ? `, ${c.unit}` : ""}`, hideOnMobile: i > 1, render: (r: (typeof q.data & object)["items"][number]) => fmtVal(r.values[c.id], c.decimals) })),
          { key: "w", label: t("ops.cols.warnings"), render: (r) => (r.warnings && !r.in_progress ? <Badge color="orange" variant="light">{r.warnings}</Badge> : "") },
        ]} />
      </>}
    </>
  );
}

export default function LogsPage() {
  return <Guard perm="op.view"><List /></Guard>;
}
