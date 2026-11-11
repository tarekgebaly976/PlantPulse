"use client";

import { BarChart } from "@mantine/charts";
import { Anchor, Badge, Button, Card, Checkbox, Grid, Group, Modal, SegmentedControl, SimpleGrid, Stack, Table, Text, ThemeIcon, UnstyledButton } from "@mantine/core";
import {
  IconAdjustments, IconAlertOctagon, IconAlertTriangle, IconCalendarTime, IconChecklist, IconClipboardList, IconClockExclamation, IconDroplet,
  IconCircleCheck, IconEye, IconHeartRateMonitor, IconPlus, IconQrcode, IconUserCheck,
} from "@tabler/icons-react";
import Link from "next/link";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Loading, PageHeader, StatusBadge } from "@/components/ui";
import { fmtDate, fmtNum, useAssetCodes, useMut, useQ } from "@/lib/hooks";
import type { Page, WorkOrder } from "@/lib/types";
import { useSession } from "@/lib/session";
import { latestMonth, status, STATUS_COLOR, type KpiCard, type Status } from "@/lib/kpiStatus";
import { CM_COLOR, ConditionLegend } from "@/components/KpiControlChart";
import { useKpiTargets } from "@/lib/kpiTargets";
import { put } from "@/lib/api";

interface Summary {
  today: string; my_open_work?: number; open_work_orders?: number; open_emergencies?: number; overdue_work_orders?: number;
  awaiting_approval?: number; awaiting_review?: number; new_requests?: number; pm_pending_approvals?: number; lube_overdue?: number;
  open_alerts?: { critical: number; warning: number }; timezone?: string;
}

/** One colour code for the whole dashboard: red = act now, amber = needs attention or waiting for someone,
 *  green = all clear / target met, grey = information only. */
type Level = "bad" | "warn" | "ok" | "info";
const LEVEL: Record<Level, { fg: string; bg: string; border: string; mantine: string }> = {
  bad: { fg: "#c92a2a", bg: "#fff5f5", border: "#e03131", mantine: "red" },
  warn: { fg: "#d9480f", bg: "#fff9db", border: "#f08c00", mantine: "orange" },
  ok: { fg: "#2b8a3e", bg: "#ebfbee", border: "#37b24d", mantine: "green" },
  info: { fg: "var(--pp-strong)", bg: "transparent", border: "#adb5bd", mantine: "gray" },
};

function DashLegend() {
  const { t } = useTranslation();
  return (
    <Group gap="lg" mb="md" data-testid="dash-legend">
      <Text size="xs" fw={700} c="dimmed">{t("dash.colourKey")}:</Text>
      {(["bad", "warn", "ok", "info"] as const).map((k) => (
        <Group key={k} gap={6} wrap="nowrap"><span style={{ width: 14, height: 14, borderRadius: 3, background: LEVEL[k].bg, border: `3px solid ${LEVEL[k].border}` }} />
          <Text size="xs">{t(`dash.level_${k}`)}</Text></Group>))}
    </Group>
  );
}

function Stat({ label, value, href, level, icon: Icon, sub }: {
  label: string; value: number | undefined; href: string; level: Level; icon: typeof IconUserCheck; sub?: string;
}) {
  if (value === undefined) return null;
  const L = LEVEL[level];
  return (
    <Card withBorder component={Link} href={href} padding="sm" data-testid={`stat-${href}`} data-level={level} className="pp-stat"
      style={{ borderInlineStart: `5px solid ${L.border}`, background: level === "info" ? undefined : L.bg }}>
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <Text size="sm" c="dimmed" fw={500} lh={1.3} lineClamp={2}>{label}</Text>
        <ThemeIcon variant="light" color={L.mantine} size={30} radius="md" style={{ flexShrink: 0 }}><Icon size={17} stroke={1.8} /></ThemeIcon>
      </Group>
      <Group gap={6} align="baseline" mt={6}>
        <Text fz={{ base: 26, sm: 32 }} fw={800} lh={1.1} c={L.fg}>{value}</Text>
        {level === "ok" && <IconCircleCheck size={18} color={L.fg} />}
      </Group>
      {sub && <Text size="xs" c="dimmed" mt={2} lineClamp={2}>{sub}</Text>}
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
/** Layout each user chose, kept on the server (follows the user to phone and PC). hidden: sections and tiles switched
 *  off; calc: calculated KPIs on the KPI card (null = default four); company: company KPI ids (null = all). */
interface DashPrefs { hidden: string[]; calc: string[] | null; company: string[] | null }
const DEFAULT_PREFS: DashPrefs = { hidden: [], calc: null, company: null };

function useDashPrefs() {
  const q = useQ<DashPrefs>("/dashboard/prefs", undefined, { staleTime: 600_000 });
  const save = useMut((p: DashPrefs) => put<DashPrefs>("/dashboard/prefs", p), { success: false });
  return { prefs: q.data ?? DEFAULT_PREFS, loaded: !!q.data, save: (p: DashPrefs) => save.mutate(p) };
}

interface TileDef { key: string; label: string; href: string; icon: typeof IconUserCheck; value: (s: Summary) => number | undefined;
  /** colour when the count is above zero; zero = green (all clear) unless info */
  level: Level | ((s: Summary) => Level); sub?: (s: Summary, t: (k: string, o?: Record<string, unknown>) => string) => string | undefined }
const TILES: TileDef[] = [
  { key: "my_open", label: "dash.myOpen", href: "/my-work", icon: IconUserCheck, value: (s) => s.my_open_work, level: "info" },
  { key: "emergencies", label: "dash.emergencies", href: "/work-orders?type=emergency&open=1", icon: IconAlertOctagon, value: (s) => s.open_emergencies, level: "bad" },
  { key: "overdue", label: "dash.overdue", href: "/work-orders?overdue=1", icon: IconClockExclamation, value: (s) => s.overdue_work_orders, level: "bad" },
  { key: "open", label: "dash.open", href: "/work-orders?open=1", icon: IconClipboardList, value: (s) => s.open_work_orders, level: "info" },
  { key: "new_requests", label: "dash.newRequests", href: "/requests", icon: IconAlertTriangle, value: (s) => s.new_requests, level: "warn" },
  { key: "awaiting_approval", label: "dash.awaitingApproval", href: "/work-orders?status=awaiting_approval", icon: IconChecklist, value: (s) => s.awaiting_approval, level: "warn" },
  { key: "awaiting_review", label: "dash.awaitingReview", href: "/work-orders?status=awaiting_review", icon: IconEye, value: (s) => s.awaiting_review, level: "warn" },
  { key: "pm_approvals", label: "dash.pmApprovals", href: "/pm?tab=approvals", icon: IconCalendarTime, value: (s) => s.pm_pending_approvals, level: "warn" },
  { key: "lube_overdue", label: "dash.lubeOverdue", href: "/lubrication", icon: IconDroplet, value: (s) => s.lube_overdue, level: "bad" },
  // Every open condition-monitoring alarm (the number matches the list it opens), split into alarm and warning limit.
  { key: "cm_alarms", label: "dash.cmAlarms", href: "/pdm?tab=alerts", icon: IconHeartRateMonitor,
    value: (s) => (s.open_alerts ? s.open_alerts.critical + s.open_alerts.warning : undefined),
    level: (s) => ((s.open_alerts?.critical ?? 0) > 0 ? "bad" : "warn"),
    sub: (s, t) => (s.open_alerts ? t("dash.cmAlarmsSplit", { a: s.open_alerts.critical, w: s.open_alerts.warning }) : undefined) },
];
const tileLevel = (x: TileDef, s: Summary): Level => {
  const v = x.value(s) ?? 0;
  if (x.level === "info") return "info";
  return v > 0 ? (typeof x.level === "function" ? x.level(s) : x.level) : "ok";
};
const SECTIONS = ["quick", "tiles", "attention", "activity", "kpis", "condition"] as const;

/** One place to choose everything the dashboard shows: sections, counters, and the KPIs with their targets. */
function Customise({ prefs, summary, defs, cards, onSave, onClose }: {
  prefs: DashPrefs; summary: Summary; defs: { code: string; name: string }[]; cards: KpiCard[]; onSave: (p: DashPrefs) => void; onClose: () => void;
}) {
  const { t } = useTranslation();
  const { can } = useSession();
  const tiles = TILES.filter((x) => x.value(summary) !== undefined);
  const sections = SECTIONS.filter((x) => (x !== "kpis" || can("kpi.view")) && (x !== "condition" || can("pdm.view")));
  const all = [...sections.map((x) => `section.${x}`), ...tiles.map((x) => `tile.${x.key}`)];
  const [shown, setShown] = useState(all.filter((k) => !prefs.hidden.includes(k)));
  const [calc, setCalc] = useState(prefs.calc ?? DEFAULT_TILES);
  const [company, setCompany] = useState(prefs.company ?? cards.map((c) => c.id));
  const save = () => {
    onSave({ hidden: all.filter((k) => !shown.includes(k)), calc: defs.map((d) => d.code).filter((c) => calc.includes(c)),
      company: cards.every((c) => company.includes(c.id)) ? null : company });
    onClose();
  };
  return (
    <Modal opened onClose={onClose} title={t("dash.customiseTitle")} size="xl">
      <Stack>
        <Text size="sm" c="dimmed">{t("dash.customiseHint")}</Text>
        <Checkbox.Group value={shown} onChange={setShown}>
          <SimpleGrid cols={{ base: 1, sm: 2 }}>
            <Stack gap={6}><Text fw={600} size="sm">{t("dash.sections")}</Text>
              {sections.map((x) => <Checkbox key={x} value={`section.${x}`} label={t(`dash.sec_${x}`)} />)}</Stack>
            <Stack gap={6}><Text fw={600} size="sm">{t("dash.tiles")}</Text>
              {tiles.map((x) => <Checkbox key={x.key} value={`tile.${x.key}`} label={t(x.label)} />)}</Stack>
          </SimpleGrid>
        </Checkbox.Group>
        {can("kpi.view") && (
          <SimpleGrid cols={{ base: 1, sm: 2 }}>
            <Checkbox.Group label={t("dash.calcKpis")} value={calc} onChange={setCalc}>
              <Stack gap={6} mt={6}>{defs.map((d) => <Checkbox key={d.code} value={d.code} label={d.name} />)}</Stack>
            </Checkbox.Group>
            <Checkbox.Group label={t("kpi.manual")} value={company} onChange={setCompany}>
              <Stack gap={6} mt={6}>{cards.length === 0 ? <Text size="xs" c="dimmed">{t("dash.noCompany")}</Text>
                : cards.map((c) => <Checkbox key={c.id} value={c.id} label={[c.name, c.department].filter(Boolean).join(" · ")} />)}</Stack>
            </Checkbox.Group>
          </SimpleGrid>
        )}
        <Group justify="space-between">
          <Button variant="subtle" onClick={() => { onSave(DEFAULT_PREFS); onClose(); }}>{t("dash.reset")}</Button>
          <Group><Button variant="default" onClick={onClose}>{t("common.cancel")}</Button><Button onClick={save}>{t("common.save")}</Button></Group>
        </Group>
      </Stack>
    </Modal>
  );
}

function Chip({ s }: { s: Status | null }) {
  const { t } = useTranslation();
  if (!s) return null;
  const c = s === "met" ? "green" : s === "near" ? "orange" : "red";
  return <Badge size="sm" variant="filled" color={c} style={{ flexShrink: 0 }}>{t(`kpi.short_${s}`)}</Badge>;
}
const LV: Record<Status, Level> = { met: "ok", near: "warn", miss: "bad" };

/** One KPI as a dashboard tile, same look as the counters: result (big), target, and status colour. */
function KpiTile({ name, value, unit, target, st, sub, href, testid }: {
  name: string; value: number | null; unit?: string | null; target: number | null; st: Status | null; sub?: string; href: string; testid?: string;
}) {
  const { t } = useTranslation();
  const L = LEVEL[st ? LV[st] : "info"];
  return (
    <Card withBorder component={Link} href={href} padding="sm" className="pp-stat" data-testid={testid} data-level={st ?? "none"}
      style={{ borderInlineStart: `5px solid ${L.border}`, background: st ? L.bg : undefined }}>
      <Group justify="space-between" align="flex-start" wrap="nowrap" gap={4}>
        <Text size="sm" c="dimmed" fw={500} lh={1.3} lineClamp={2}>{name}</Text><Chip s={st} />
      </Group>
      <Text fz={{ base: 24, sm: 30 }} fw={800} lh={1.1} mt={6} c={L.fg}>
        {value === null ? "—" : fmtNum(value, 1)} {value !== null && unit && <Text span size="sm" c="dimmed" fw={500}>{unit}</Text>}
      </Text>
      <Text size="xs" mt={4} fw={600} c={target === null ? "dimmed" : undefined}>
        {target === null ? t("dash.noTarget") : `${t("kpi.target")}: ${fmtNum(target, 1)}${unit ? ` ${unit}` : ""}`}
      </Text>
      {sub && <Text size="xs" c="dimmed">{sub}</Text>}
    </Card>
  );
}

/** KPIs against their targets, as tiles like the counters: calculated KPIs (last 6 months) and company KPIs (latest month). */
function KpiTiles({ today, prefs, onCustomise }: { today: string; prefs: DashPrefs; onCustomise: () => void }) {
  const { t } = useTranslation();
  const calcCodes = prefs.calc ?? DEFAULT_TILES;
  const d = new Date(`${today}T00:00:00`);
  d.setMonth(d.getMonth() - 6);
  const start = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const year = Number(today.slice(0, 4)), month = Number(today.slice(5, 7)) - 1;
  const q = useQ<{ kpis: Kpi[] }>("/kpis", { start, end: today }, { staleTime: 300_000 });
  const defs = useQ<{ code: string; name: string }[]>("/kpis/definitions", undefined, { staleTime: 3_600_000 });
  const { resolve, cards } = useKpiTargets(year, month);
  const by = new Map((q.data?.kpis ?? []).map((k) => [k.code, k]));
  const names = new Map((defs.data ?? []).map((x) => [x.code, x.name]));
  const company = cards.filter((c) => prefs.company === null || prefs.company.includes(c.id));
  const missing = calcCodes.filter((c) => by.get(c)?.available && !resolve(c)).length;
  return (
    <Card withBorder padding="md" mb="lg" data-testid="dash-kpis">
      <Group justify="space-between" mb="sm" wrap="wrap">
        <Group gap="xs"><Anchor component={Link} href="/kpis" fw={700} c="var(--pp-strong)">{t("dash.kpiTitle")}</Anchor>
          <Text size="xs" c="dimmed">{t("dash.last6")}</Text></Group>
        <Button size="compact-sm" variant="subtle" leftSection={<IconAdjustments size={14} />} onClick={onCustomise}>{t("dash.customise")}</Button>
      </Group>
      {!q.data ? <Loading /> : (
        <SimpleGrid cols={{ base: 2, sm: 3, lg: 5 }} spacing={{ base: "xs", sm: "md" }}>
          {calcCodes.map((code) => {
            const k = by.get(code), tg = resolve(code);
            const v = k?.available ? k.value : null;
            return <KpiTile key={code} testid={`dash-kpi-${code}`} href="/kpis" name={TILE_LABEL[code] ? t(TILE_LABEL[code]) : names.get(code) ?? code}
              value={v} unit={k?.unit} target={tg?.target ?? null} st={tg && v !== null ? status(tg.hib, v, tg.target) : null} />;
          })}
          {company.map((c) => {
            const i = latestMonth(c, month);
            const m = i === null ? null : c.months[i] ?? null;
            return <KpiTile key={c.id} testid={`dash-ckpi-${c.id}`} href="/kpis" name={c.name} value={m?.actual ?? null} unit={c.unit} target={m?.target ?? null}
              st={m ? status(c.higher_is_better, m.actual, m.target) : null} sub={[c.department, i === null ? null : MONTHS[i]].filter(Boolean).join(" · ")} />;
          })}
        </SimpleGrid>
      )}
      {missing > 0 && <Text size="xs" c="dimmed" mt="sm">{t("dash.setTargets")} <Anchor component={Link} href="/kpis" size="xs">{t("nav.kpis")}</Anchor></Text>}
    </Card>
  );
}

/** Measurement points whose latest readings break a Nelson rule (or are in alarm), most urgent first. */
function ConditionBoard() {
  const { t } = useTranslation();
  const sig = useQ<Record<string, number[]>>("/pdm/signals", undefined, { staleTime: 120_000 });
  const pts = useQ<{ id: string; code: string; name: string; last_status: string; last_value: number | null; unit: string }[]>("/pdm/points", { limit: 300 }, { staleTime: 120_000 });
  const rank: Record<string, number> = { critical: 0, warning: 1 };
  const rows = (pts.data ?? []).filter((p) => sig.data?.[p.id] || p.last_status === "critical" || p.last_status === "warning")
    .sort((a, b) => (rank[a.last_status] ?? 2) - (rank[b.last_status] ?? 2)).slice(0, 8);
  return (
    <Card withBorder padding="md" data-testid="dash-condition">
      <Group justify="space-between" mb="xs">
        <Anchor component={Link} href="/pdm" fw={700} c="var(--pp-strong)">{t("nav.pdm")}</Anchor>
        <Text size="xs" c="dimmed">{t("dash.cmHint")}</Text>
      </Group>
      {!pts.data ? <Loading /> : rows.length === 0 ? <Text size="sm" c="green.8">{t("dash.cmClear")}</Text> : (
        <Table fz="xs" verticalSpacing={4}>
          <Table.Tbody>{rows.map((p) => (
            <Table.Tr key={p.id} style={{ cursor: "pointer", borderInlineStart: `4px solid ${CM_COLOR[p.last_status] ?? "#dee2e6"}` }}>
              <Table.Td><Anchor component={Link} href={`/pdm?point=${p.id}`} size="xs" fw={600}>{p.code}</Anchor><Text size="xs" c="dimmed" lineClamp={1}>{p.name}</Text></Table.Td>
              <Table.Td ta="end"><Text size="xs" fw={700} c={CM_COLOR[p.last_status]}>{fmtNum(p.last_value)} {p.unit}</Text></Table.Td>
              <Table.Td w={1}>{sig.data?.[p.id] && <Badge color="red" variant="light" size="xs" styles={{ root: { overflow: "visible", maxWidth: "none" }, label: { overflow: "visible" } }}
                title={sig.data[p.id]?.map((x) => `${x}: ${t(`kpi.nelson${x}`)}`).join("\n")}>R{sig.data[p.id]?.join(",")}</Badge>}</Table.Td>
            </Table.Tr>))}</Table.Tbody>
        </Table>
      )}
      <Group mt="sm"><ConditionLegend /></Group>
    </Card>
  );
}

export default function Dashboard() {
  const { t } = useTranslation();
  const { plant, can, me } = useSession();
  const q = useQ<Summary>("/dashboard/summary", undefined, { refetchInterval: 60_000 });
  const { prefs, save } = useDashPrefs();
  const [edit, setEdit] = useState(false);
  const year = q.data ? Number(q.data.today.slice(0, 4)) : null;
  const defs = useQ<{ code: string; name: string }[]>(can("kpi.view") ? "/kpis/definitions" : null, undefined, { staleTime: 3_600_000 });
  const sc = useQ<KpiCard[]>(can("kpi.view") && year ? "/kpis/scorecard" : null, { year }, { staleTime: 300_000 });
  if (!q.data) return <Loading />;
  const s = q.data;
  const on = (k: string) => !prefs.hidden.includes(k);
  // Technicians (who neither approve nor plan) see their own work first; supervisors and managers the plant overview.
  const mine = !can("wo.approve") && !can("wo.plan");
  const side = [
    on("section.activity") && <Activity key="a" />,
    on("section.condition") && can("pdm.view") && <ConditionBoard key="c" />,
  ].filter(Boolean);
  const attention = s.my_open_work !== undefined && on("section.attention");
  const work = (attention || side.length > 0) && (
    <Grid gap="md" mb="lg">
      {attention && <Grid.Col span={{ base: 12, lg: side.length ? 7 : 12 }}><Attention today={s.today} defaultMine={mine} /></Grid.Col>}
      {side.length > 0 && <Grid.Col span={{ base: 12, lg: attention ? 5 : 12 }}>
        {attention ? <Stack gap="md">{side}</Stack> : <SimpleGrid cols={{ base: 1, md: Math.min(side.length, 3) }}>{side}</SimpleGrid>}
      </Grid.Col>}
    </Grid>
  );
  const tiles = TILES.filter((x) => on(`tile.${x.key}`));
  return (
    <>
      <PageHeader title={t("nav.dashboard")} actions={
        <Button variant="light" leftSection={<IconAdjustments size={18} />} onClick={() => setEdit(true)} data-testid="customise-dashboard">{t("dash.customiseTitle")}</Button>}>
        <Text size="sm" c="dimmed">{plant?.plant_name} · {me?.full_name} · {s.today} ({s.timezone})</Text>
      </PageHeader>
      {on("section.quick") && <Group gap="sm" mb="lg">
          {can("request.create") && <Button component={Link} href="/requests?new=1" color="red" leftSection={<IconAlertTriangle size={18} />} className="tap-target">{t("req.new")}</Button>}
          {can("wo.create") && <Button component={Link} href="/work-orders/new" leftSection={<IconPlus size={18} />} className="tap-target">{t("wo.new")}</Button>}
          <Button component={Link} href="/scan" variant="default" leftSection={<IconQrcode size={18} />} className="tap-target">{t("nav.scan")}</Button>
      </Group>}
      <DashLegend />
      {mine && work}
      {on("section.tiles") && tiles.length > 0 && <SimpleGrid cols={{ base: 2, sm: 3, lg: 5 }} mb="lg" spacing={{ base: "xs", sm: "md" }}>
        {tiles.map((x) => <Stat key={x.key} label={t(x.label)} value={x.value(s)} href={x.href} level={tileLevel(x, s)} icon={x.icon} sub={x.sub?.(s, t)} />)}
      </SimpleGrid>}
      {on("section.kpis") && can("kpi.view") && <KpiTiles today={s.today} prefs={prefs} onCustomise={() => setEdit(true)} />}
      {!mine && work}
      {edit && <Customise prefs={prefs} summary={s} defs={defs.data ?? []} cards={sc.data ?? []} onSave={save} onClose={() => setEdit(false)} />}
    </>
  );
}
