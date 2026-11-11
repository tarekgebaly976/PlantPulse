"use client";

import { BarChart } from "@mantine/charts";
import { Anchor, Badge, Button, Card, Checkbox, Grid, Group, Modal, SegmentedControl, SimpleGrid, Stack, Table, Text, ThemeIcon, UnstyledButton } from "@mantine/core";
import {
  IconAdjustments, IconAlertOctagon, IconAlertTriangle, IconCalendarTime, IconChecklist, IconClipboardList, IconClockExclamation, IconDroplet,
  IconCircleCheck, IconEye, IconHeartRateMonitor, IconPlus, IconQrcode, IconUserCheck,
} from "@tabler/icons-react";
import Link from "next/link";
import { useState, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { Loading, PageHeader, StatusBadge } from "@/components/ui";
import { fmtDate, fmtNum, useAssetCodes, useQ } from "@/lib/hooks";
import type { Page, WorkOrder } from "@/lib/types";
import { useSession } from "@/lib/session";
import { latestMonth, status, STATUS_COLOR, type KpiCard, type Status } from "@/lib/kpiStatus";

interface Summary {
  today: string; my_open_work?: number; open_work_orders?: number; open_emergencies?: number; overdue_work_orders?: number;
  awaiting_approval?: number; awaiting_review?: number; new_requests?: number; pm_pending_approvals?: number; lube_overdue?: number;
  open_alerts?: { critical: number; warning: number }; timezone?: string;
}

function Stat({ label, value, href, color, icon: Icon, alert }: {
  label: string; value: number | undefined; href: string; color: string; icon: typeof IconUserCheck; alert?: boolean;
}) {
  if (value === undefined) return null;
  const on = value > 0;
  return (
    <Card withBorder component={Link} href={href} padding="sm" data-testid={`stat-${href}`} className="pp-stat"
      data-alert={alert && on ? true : undefined} style={{ "--pp-stat-color": `var(--mantine-color-${color}-6)` } as CSSProperties}>
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <Text size="sm" c="dimmed" fw={500} lh={1.3} lineClamp={2}>{label}</Text>
        <ThemeIcon variant="light" color={on ? color : "gray"} size={30} radius="md" style={{ flexShrink: 0 }}><Icon size={17} stroke={1.8} /></ThemeIcon>
      </Group>
      <Text fz={{ base: 26, sm: 32 }} fw={800} lh={1.1} mt={6} c={on && alert ? `${color}.7` : on ? "var(--pp-strong)" : "gray.5"}>{value}</Text>
    </Card>
  );
}

/** Open work orders, most urgent first (priority, then work order number); "Mine" = assigned to me. */
function Attention({ today, defaultMine }: { today: string; defaultMine: boolean }) {
  const { t } = useTranslation();
  const [scope, setScope] = useState<"mine" | "all">(defaultMine ? "mine" : "all");
  const q = useQ<Page<WorkOrder>>("/work-orders", { open_only: true, assigned_to_me: scope === "mine", sort: "priority", limit: 8 });
  const amap = useAssetCodes((q.data?.items ?? []).map((w) => w.asset_id));
  const rows = q.data?.items;
  return (
    <Card withBorder padding="md" h="100%">
      <Group justify="space-between" mb="sm" wrap="nowrap">
        <Text fw={700}>{t("dash.attention")}</Text>
        <SegmentedControl size="xs" value={scope} onChange={(v) => setScope(v as "mine" | "all")} data-testid="attention-scope"
          data={[{ value: "mine", label: t("dash.mine") }, { value: "all", label: t("dash.all") }]} />
      </Group>
      {!rows ? <Loading /> : rows.length === 0 ? (
        <Stack align="center" gap={6} py="xl" c="dimmed">
          <ThemeIcon variant="light" color="teal" size={44} radius="xl"><IconCircleCheck size={26} /></ThemeIcon>
          <Text size="sm">{t("dash.allClear")}</Text>
        </Stack>
      ) : (
        <Stack gap={0} data-testid="attention-list">
          {rows.map((w) => {
            const late = !!w.due_date && w.due_date < today;
            return (
              <UnstyledButton key={w.id} component={Link} href={`/work-orders/${w.id}`} className="pp-row">
                <Group wrap="nowrap" gap="sm" align="flex-start">
                  <StatusBadge value={w.priority} variant="filled" w={34} />
                  <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
                    <Group gap={6} wrap="nowrap">
                      {w.type === "emergency" && <IconAlertOctagon size={16} color="var(--mantine-color-red-6)" style={{ flexShrink: 0 }} />}
                      <Text size="sm" fw={600} lineClamp={2}>{w.title}</Text>
                    </Group>
                    <Group gap={6} wrap="wrap">
                      <Text size="xs" c="dimmed" className="mono">{w.number}</Text>
                      <Text size="xs" c="dimmed">· {amap.get(w.asset_id) ?? "…"}</Text>
                      <StatusBadge value={w.status} size="xs" />
                    </Group>
                  </Stack>
                  <Stack gap={0} align="flex-end" style={{ flexShrink: 0 }}>
                    <Text size="xs" c="dimmed">{t("dash.due")}</Text>
                    <Text size="sm" fw={late ? 700 : 500} c={late ? "red.7" : undefined} className="nowrap">{fmtDate(w.due_date)}</Text>
                  </Stack>
                </Group>
              </UnstyledButton>
            );
          })}
          <Anchor component={Link} href={scope === "mine" ? "/my-work" : "/work-orders?open=1"} size="sm" fw={600} mt="sm">{t("dash.viewAll")} →</Anchor>
        </Stack>
      )}
    </Card>
  );
}

function Activity() {
  const { t } = useTranslation();
  const q = useQ<{ week: string; opened: number; completed: number }[]>("/dashboard/activity", { weeks: 8 }, { staleTime: 300_000 });
  return (
    <Card withBorder padding="md">
      <Text fw={700} mb="sm">{t("dash.activity")}</Text>
      {!q.data ? <Loading /> : (
        <BarChart h={190} data={q.data.map((w) => ({ week: w.week.slice(5), [t("dash.opened")]: w.opened, [t("dash.completed")]: w.completed }))}
          dataKey="week" withLegend legendProps={{ verticalAlign: "bottom" }} barProps={{ radius: 3 }} gridAxis="y" tickLine="none"
          series={[{ name: t("dash.opened"), color: "brand.4" }, { name: t("dash.completed"), color: "teal.6" }]} />
      )}
    </Card>
  );
}

interface Kpi { code: string; value: number | null; unit: string; available: boolean }
const DEFAULT_TILES = ["pm_compliance", "mtbf", "mttr", "availability"];
const TILE_LABEL: Record<string, string> = { pm_compliance: "dash.pmCompliance", mtbf: "dash.mtbf", mttr: "dash.mttr", availability: "dash.availability" };
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
interface DashPrefs { calc: string[]; company: string[] | null } // company null = every company KPI

function readPrefs(key: string): DashPrefs {
  try {
    const v = typeof window === "undefined" ? null : (JSON.parse(window.localStorage.getItem(key) ?? "null") as DashPrefs | null);
    if (v && Array.isArray(v.calc) && (v.company === null || Array.isArray(v.company))) return v;
  } catch { /* corrupt value: use the default */ }
  return { calc: DEFAULT_TILES, company: null };
}

/** The KPIs each user picked for their dashboard, kept on this device (per user and plant). */
function useDashPrefs(): [DashPrefs, (p: DashPrefs) => void] {
  const { me, plant } = useSession();
  const key = `pp.dash.${me?.id ?? ""}.${plant?.plant_id ?? ""}`;
  const [saved, setSaved] = useState<{ key: string; prefs: DashPrefs } | null>(null);
  const prefs = saved?.key === key ? saved.prefs : readPrefs(key);
  return [prefs, (p) => { setSaved({ key, prefs: p }); window.localStorage.setItem(key, JSON.stringify(p)); }];
}

function Customise({ prefs, defs, cards, onSave, onClose }: {
  prefs: DashPrefs; defs: { code: string; name: string }[]; cards: KpiCard[]; onSave: (p: DashPrefs) => void; onClose: () => void;
}) {
  const { t } = useTranslation();
  const [calc, setCalc] = useState(prefs.calc);
  const [company, setCompany] = useState(prefs.company ?? cards.map((c) => c.id));
  return (
    <Modal opened onClose={onClose} title={t("dash.customise")} size="lg">
      <Stack>
        <Text size="sm" c="dimmed">{t("dash.customiseHint")}</Text>
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <Checkbox.Group label={t("dash.calcKpis")} value={calc} onChange={setCalc}>
            <Stack gap={6} mt={6}>{defs.map((d) => <Checkbox key={d.code} value={d.code} label={d.name} />)}</Stack>
          </Checkbox.Group>
          <Checkbox.Group label={t("kpi.manual")} value={company} onChange={setCompany}>
            <Stack gap={6} mt={6}>{cards.length === 0 ? <Text size="xs" c="dimmed">{t("common.noData")}</Text>
              : cards.map((c) => <Checkbox key={c.id} value={c.id} label={[c.name, c.department].filter(Boolean).join(" · ")} />)}</Stack>
          </Checkbox.Group>
        </SimpleGrid>
        <Group justify="space-between">
          <Button variant="subtle" onClick={() => { onSave({ calc: DEFAULT_TILES, company: null }); onClose(); }}>{t("dash.reset")}</Button>
          <Group><Button variant="default" onClick={onClose}>{t("common.cancel")}</Button>
            <Button onClick={() => { onSave({ calc: defs.map((d) => d.code).filter((c) => calc.includes(c)), company: company.length === cards.length ? null : company }); onClose(); }}>{t("common.save")}</Button></Group>
        </Group>
      </Stack>
    </Modal>
  );
}

function Swatch({ s }: { s: Status | null }) {
  const { t } = useTranslation();
  return s ? <Badge size="xs" variant="filled" color={STATUS_COLOR[s].mantine === "yellow" ? "orange" : STATUS_COLOR[s].mantine}>{t(`kpi.short_${s}`)}</Badge> : null;
}

/** KPI card on the dashboard: each user picks the KPIs; every KPI shows its result next to its target, coloured by status. */
function KpiBoard({ today }: { today: string }) {
  const { t } = useTranslation();
  const [prefs, setPrefs] = useDashPrefs();
  const [edit, setEdit] = useState(false);
  const d = new Date(`${today}T00:00:00`);
  d.setMonth(d.getMonth() - 6);
  const start = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const year = Number(today.slice(0, 4)), month = Number(today.slice(5, 7)) - 1;
  const q = useQ<{ kpis: Kpi[] }>("/kpis", { start, end: today }, { staleTime: 300_000 });
  const defs = useQ<{ code: string; name: string }[]>("/kpis/definitions", undefined, { staleTime: 3_600_000 });
  const sc = useQ<KpiCard[]>("/kpis/scorecard", { year }, { staleTime: 300_000 });
  const by = new Map((q.data?.kpis ?? []).map((k) => [k.code, k]));
  const names = new Map((defs.data ?? []).map((x) => [x.code, x.name]));
  const cards = sc.data ?? [];
  const company = cards.filter((c) => prefs.company === null || prefs.company.includes(c.id));
  // Target of a calculated KPI: the latest target of the plant-level company KPI linked to it.
  const targetOf = (code: string) => {
    const c = cards.find((x) => x.kpi_code === code && !x.department_id);
    const m = c ? [...c.months.slice(0, month + 1)].reverse().find((x) => x.target !== null) : undefined;
    return c && m ? { target: m.target as number, hib: c.higher_is_better } : null;
  };
  return (
    <Card withBorder padding="md">
      <Group justify="space-between" mb="sm">
        <Anchor component={Link} href="/kpis" fw={700} c="var(--pp-strong)">{t("nav.kpis")}</Anchor>
        <Group gap="xs"><Text size="xs" c="dimmed">{t("dash.last6")}</Text>
          <Button size="compact-xs" variant="subtle" leftSection={<IconAdjustments size={14} />} onClick={() => setEdit(true)}>{t("dash.customise")}</Button></Group>
      </Group>
      {!q.data ? <Loading /> : (
        <SimpleGrid cols={2} spacing="sm" verticalSpacing="sm">
          {prefs.calc.map((code) => {
            const k = by.get(code), tg = targetOf(code);
            const s = k?.available && tg ? status(tg.hib, k.value, tg.target) : null;
            return (
              <div key={code} data-testid={`dash-kpi-${code}`} style={{ borderInlineStart: `4px solid ${s ? STATUS_COLOR[s].fg : "#dee2e6"}`, paddingInlineStart: 8 }}>
                <Text size="xs" c="dimmed" lineClamp={1}>{TILE_LABEL[code] ? t(TILE_LABEL[code]) : names.get(code) ?? code}</Text>
                <Text fz={22} fw={800} c={s ? STATUS_COLOR[s].fg : "var(--pp-strong)"} lh={1.2}>
                  {k?.available ? fmtNum(k.value, 1) : "—"} {k?.available && <Text span size="sm" c="dimmed" fw={500}>{k.unit}</Text>}
                </Text>
                {tg && <Group gap={4}><Text size="xs" c="dimmed">{t("kpi.target")} {fmtNum(tg.target, 1)}</Text><Swatch s={s} /></Group>}
              </div>
            );
          })}
        </SimpleGrid>
      )}
      {company.length > 0 && (
        <>
          <Text fw={600} size="sm" mt="md" mb={4}>{t("kpi.manual")}</Text>
          <Table fz="xs" verticalSpacing={4} data-testid="dash-company-kpis">
            <Table.Thead><Table.Tr><Table.Th>KPI</Table.Th><Table.Th>{t("kpi.month")}</Table.Th><Table.Th ta="end">{t("kpi.result")}</Table.Th><Table.Th ta="end">{t("kpi.target")}</Table.Th><Table.Th /></Table.Tr></Table.Thead>
            <Table.Tbody>{company.map((c) => {
              const i = latestMonth(c, month);
              const m = i === null ? null : c.months[i] ?? null;
              const s = m ? status(c.higher_is_better, m.actual, m.target) : null;
              return (
                <Table.Tr key={c.id} style={s ? { background: STATUS_COLOR[s].bg } : undefined}>
                  <Table.Td><Text size="xs" fw={600} lineClamp={1}>{c.name}</Text>{c.department && <Text size="xs" c="dimmed">{c.department}</Text>}</Table.Td>
                  <Table.Td>{i === null ? "—" : MONTHS[i]}</Table.Td>
                  <Table.Td ta="end"><Text size="xs" fw={700} c={s ? STATUS_COLOR[s].fg : undefined}>{m?.actual == null ? "—" : fmtNum(m.actual)}{c.unit ? ` ${c.unit}` : ""}</Text></Table.Td>
                  <Table.Td ta="end">{m?.target == null ? "—" : fmtNum(m.target)}</Table.Td>
                  <Table.Td><Swatch s={s} /></Table.Td>
                </Table.Tr>);
            })}</Table.Tbody>
          </Table>
        </>
      )}
      {edit && defs.data && <Customise prefs={prefs} defs={defs.data} cards={cards} onSave={setPrefs} onClose={() => setEdit(false)} />}
    </Card>
  );
}

export default function Dashboard() {
  const { t } = useTranslation();
  const { plant, can, me } = useSession();
  const q = useQ<Summary>("/dashboard/summary", undefined, { refetchInterval: 60_000 });
  if (!q.data) return <Loading />;
  const s = q.data;
  // Technicians (who neither approve nor plan) see their own work first; supervisors and managers the plant overview.
  const mine = !can("wo.approve") && !can("wo.plan");
  const work = s.my_open_work !== undefined && (
    <Grid gap="md" mb="lg">
      <Grid.Col span={{ base: 12, lg: 7 }}><Attention today={s.today} defaultMine={mine} /></Grid.Col>
      <Grid.Col span={{ base: 12, lg: 5 }}>
        <Stack gap="md">
          <Activity />
          {can("kpi.view") && <KpiBoard today={s.today} />}
        </Stack>
      </Grid.Col>
    </Grid>
  );
  return (
    <>
      <PageHeader title={t("nav.dashboard")}>
        <Text size="sm" c="dimmed">{plant?.plant_name} · {me?.full_name} · {s.today} ({s.timezone})</Text>
      </PageHeader>
      <Group gap="sm" mb="lg">
          {can("request.create") && <Button component={Link} href="/requests?new=1" color="red" leftSection={<IconAlertTriangle size={18} />} className="tap-target">{t("req.new")}</Button>}
          {can("wo.create") && <Button component={Link} href="/work-orders/new" leftSection={<IconPlus size={18} />} className="tap-target">{t("wo.new")}</Button>}
          <Button component={Link} href="/scan" variant="default" leftSection={<IconQrcode size={18} />} className="tap-target">{t("nav.scan")}</Button>
      </Group>
      {mine && work}
      <SimpleGrid cols={{ base: 2, sm: 3, lg: 5 }} mb="lg" spacing={{ base: "xs", sm: "md" }}>
        <Stat label={t("dash.myOpen")} value={s.my_open_work} href="/my-work" color="brand" icon={IconUserCheck} />
        <Stat label={t("dash.emergencies")} value={s.open_emergencies} href="/work-orders?type=emergency&open=1" color="red" icon={IconAlertOctagon} alert />
        <Stat label={t("dash.overdue")} value={s.overdue_work_orders} href="/work-orders?overdue=1" color="orange" icon={IconClockExclamation} alert />
        <Stat label={t("dash.open")} value={s.open_work_orders} href="/work-orders?open=1" color="brand" icon={IconClipboardList} />
        <Stat label={t("dash.newRequests")} value={s.new_requests} href="/requests" color="yellow" icon={IconAlertTriangle} alert />
        <Stat label={t("dash.awaitingApproval")} value={s.awaiting_approval} href="/work-orders?status=awaiting_approval" color="yellow" icon={IconChecklist} alert />
        <Stat label={t("dash.awaitingReview")} value={s.awaiting_review} href="/work-orders?status=awaiting_review" color="violet" icon={IconEye} alert />
        <Stat label={t("dash.pmApprovals")} value={s.pm_pending_approvals} href="/pm?tab=approvals" color="yellow" icon={IconCalendarTime} alert />
        <Stat label={t("dash.lubeOverdue")} value={s.lube_overdue} href="/lubrication" color="orange" icon={IconDroplet} alert />
        <Stat label={t("dash.critical")} value={s.open_alerts?.critical} href="/pdm?tab=alerts" color="red" icon={IconHeartRateMonitor} alert />
      </SimpleGrid>
      {!mine && work}
    </>
  );
}
