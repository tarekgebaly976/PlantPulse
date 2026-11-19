"use client";

// Whole-mill view of the production dashboard (every area on one screen) and the layout editor the production
// manager / administrator uses to choose the sections and KPIs each view shows for everyone.

import { BarChart } from "@mantine/charts";
import { ActionIcon, Anchor, Badge, Button, Checkbox, Group, MultiSelect, Paper, SimpleGrid, Stack, Switch, Text, UnstyledButton } from "@mantine/core";
import { IconArrowDown, IconArrowUp } from "@tabler/icons-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Modal } from "@/components/Modal";
import { oeeColor, Tile } from "@/components/Ops";
import { KpiCard } from "@/components/OpsKpi";
import { put } from "@/lib/api";
import { fmtNum, useMut, useQ } from "@/lib/hooks";
import { hhmm, pct, statusColor, type DashLayout, type KpiDef, type MillArea, type MillView } from "@/lib/ops";

const fmtRate = (v: number | null) => (v === null ? "—" : fmtNum(v, 2));

function Block({ title, sub, children, action }: { title: string; sub?: string; children: ReactNode; action?: ReactNode }) {
  return (
    <Paper withBorder p="md" radius="md">
      <Group justify="space-between" mb={sub ? 0 : "xs"} wrap="nowrap">
        <Text fw={600} size="sm">{title}</Text>
        {action}
      </Group>
      {sub && <Text size="xs" c="dimmed" mb="xs">{sub}</Text>}
      {children}
    </Paper>
  );
}

function AreaCard({ a, onOpen }: { a: MillArea; onOpen: () => void }) {
  const { t, i18n } = useTranslation();
  return (
    <UnstyledButton onClick={onOpen} style={{ display: "block", height: "100%" }}>
      <Paper withBorder p="md" radius="md" h="100%" style={{ borderInlineStart: `4px solid var(--mantine-color-${statusColor(a.status)}-6)` }}>
        <Group justify="space-between" wrap="nowrap" mb={6}>
          <Text fw={700} size="sm" lineClamp={1}>{a.code} – {i18n.language === "ar" && a.name_ar ? a.name_ar : a.name}</Text>
          <Badge size="xs" variant="light" color={statusColor(a.status)} style={{ flexShrink: 0 }}>{t(`kpi2.status.${a.status}`)}</Badge>
        </Group>
        <Stack gap={4}>
          {a.lines.map((l) => (
            <Group key={l.id} gap="xs" wrap="wrap">
              <Text size="sm" fw={600}>{l.code}</Text>
              <Text size="sm">{l.produced === null ? "—" : `${fmtNum(l.produced, 0)} ${l.unit}`}</Text>
              <Text size="sm" c={oeeColor(l.oee)} fw={600}>OEE {pct(l.oee)}</Text>
              <Text size="sm" c="dimmed">{t("ops.tiles.downtime")} {hhmm(l.downtime_hours ?? 0)}</Text>
            </Group>
          ))}
          {a.lines.length === 0 && <Text size="xs" c="dimmed">{t("mill.noLine")}</Text>}
          <Group gap="md">
            <Text size="xs" c={a.lost_time ? "red" : a.incidents ? "orange" : "dimmed"}>{t("mill.incidents", { n: a.incidents, lti: a.lost_time })}</Text>
            {a.open_alerts > 0 && <Text size="xs" c="orange">{t("mill.alerts", { n: a.open_alerts })}</Text>}
          </Group>
          {a.off.length > 0 && <Text size="xs" c="dimmed" lineClamp={2}>{t("mill.offKpis")}: {a.off.map((x) => x.name).join(" · ")}</Text>}
        </Stack>
      </Paper>
    </UnstyledButton>
  );
}

export function MillDashboard({ m, sections, onArea, colors }: { m: MillView; sections: DashLayout["sections"]; onArea: (id: string) => void; colors: string[] }) {
  const { t } = useTranslation();
  const blocks: Record<string, ReactNode> = {
    kpis: m.kpis.length > 0 && (
      <SimpleGrid cols={{ base: 2, sm: 3, lg: 6 }}>
        {m.kpis.map((k) => <KpiCard key={`${k.id}-${k.lines.join()}`} k={k} period="range" showLine={k.lines.length > 0 && k.unit !== ""} />)}
      </SimpleGrid>
    ),
    areas: m.areas.length > 0 && (
      <Stack gap="xs">
        <Text fw={600}>{t("mill.areas")}</Text>
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>{m.areas.map((a) => <AreaCard key={a.id} a={a} onOpen={() => onArea(a.id)} />)}</SimpleGrid>
      </Stack>
    ),
    production: m.production.length > 0 && (
      <SimpleGrid cols={{ base: 1, lg: m.production.length > 1 ? 2 : 1 }}>
        {m.production.map((g) => (
          <Block key={g.unit} title={`${t("gen.dash.production")}, ${g.unit}`} sub={t("mill.productionSub")}>
            <BarChart h={220} data={g.series.map((x) => ({ ...x, day: String(x.day).slice(5) }))} dataKey="day" type="stacked" withLegend={g.lines.length > 1}
              legendProps={{ verticalAlign: "bottom" }} gridAxis="y" barProps={{ radius: 2 }} valueFormatter={(x) => `${fmtNum(x, 1)} ${g.unit}`}
              series={g.lines.map((l, i) => ({ name: l, label: l, color: colors[i % colors.length]! }))} />
          </Block>
        ))}
      </SimpleGrid>
    ),
    losses: m.losses.length > 0 && (
      <Block title={t("mill.losses")} sub={t("mill.lossesSub")}>
        <BarChart h={Math.max(160, 28 * Math.min(m.losses.length, 8) + 40)} data={m.losses.slice(0, 8).map((x) => ({ k: x.name, v: x.hours }))} dataKey="k" orientation="vertical"
          gridAxis="x" barProps={{ radius: 2 }} valueFormatter={(x) => hhmm(x)} yAxisProps={{ width: 150 }} xAxisProps={{ tickFormatter: (v: number) => `${v} h` }}
          series={[{ name: "v", label: t("opsDash.hours"), color: colors[1]! }]} />
      </Block>
    ),
    safety: (
      <Block title={t("safe.title")} sub={t("mill.safetySub", { base: m.safety.base === 200000 ? "200,000" : "1,000,000" })}
        action={<Anchor component={Link} href="/operations/incidents" size="xs">{t("mill.open")}</Anchor>}>
        <SimpleGrid cols={{ base: 2, sm: 3, lg: 5 }}>
          <Tile label={t("inc.daysSinceLti")} value={m.safety.days_since_lost_time === null ? "—" : String(m.safety.days_since_lost_time)} />
          <Tile label={t("mill.periodIncidents")} value={String(m.safety.incidents)} sub={t("safe.lti", { n: m.safety.lost_time })} />
          <Tile label="LTIFR" value={fmtRate(m.safety.rolling.ltifr)} />
          <Tile label="LTISR" value={fmtRate(m.safety.rolling.ltisr)} />
          <Tile label="TRIR" value={fmtRate(m.safety.rolling.trir)} />
        </SimpleGrid>
      </Block>
    ),
    follow_up: (
      <Block title={t("mill.followUp")} action={<Anchor component={Link} href="/operations/kpis" size="xs">{t("mill.open")}</Anchor>}>
        <SimpleGrid cols={{ base: 2, sm: 4 }}>
          <Tile label={t("mill.openAlerts")} value={String(m.follow_up.open_alerts)} color={m.follow_up.alerts.critical ? "red" : m.follow_up.open_alerts ? "orange" : undefined}
            sub={m.follow_up.alerts.critical ? t("mill.critical", { n: m.follow_up.alerts.critical }) : undefined} />
          <Tile label={t("mill.overdue")} value={String(m.follow_up.overdue_actions)} color={m.follow_up.overdue_actions ? "red" : undefined} />
          <Tile label={t("mill.openActions")} value={String(m.follow_up.open_actions)} />
          <Tile label={t("inc.open")} value={String(m.follow_up.open_incidents)} color={m.follow_up.open_incidents ? "orange" : undefined} />
        </SimpleGrid>
      </Block>
    ),
  };
  return <Stack>{sections.filter((s) => s.on && blocks[s.id]).map((s) => <div key={s.id}>{blocks[s.id]}</div>)}</Stack>;
}

/** Sections (on / off, order) and KPIs of one dashboard view, for everyone; op.manage only. */
export function LayoutModal({ scope, kind, layout, defaultKpis, onClose }: { scope: string; kind: "mill" | "area"; layout: DashLayout; defaultKpis: string[]; onClose: () => void }) {
  const { t } = useTranslation();
  const all = (useQ<{ items: KpiDef[] }>("/operations/kpis").data?.items ?? []).filter((k) => k.is_active);
  const [sections, setSections] = useState(layout.sections);
  const [custom, setCustom] = useState(layout.kpis !== null);
  const [kpis, setKpis] = useState<string[]>(layout.kpis ?? defaultKpis);
  const save = useMut(() => put("/operations/dashboard-layout", { scope, sections, kpis: custom ? kpis : null }), { onDone: onClose });
  const reset = useMut(() => put("/operations/dashboard-layout", { scope, reset: true }), { onDone: onClose });
  const move = (i: number, by: number) => {
    const n = [...sections];
    const [x] = n.splice(i, 1);
    n.splice(i + by, 0, x!);
    setSections(n);
  };
  return (
    <Modal opened onClose={onClose} title={t("mill.customise")} size="lg">
      <Stack>
        <Text size="sm" c="dimmed">{t("mill.customiseHint")}</Text>
        <Text fw={600} size="sm">{t("mill.sections")}</Text>
        <Stack gap={4}>
          {sections.map((s, i) => (
            <Group key={s.id} justify="space-between" wrap="nowrap">
              <Checkbox label={t(`mill.sec.${kind}.${s.id}`)} checked={s.on} onChange={(e) => setSections(sections.map((x) => (x.id === s.id ? { ...x, on: e.currentTarget.checked } : x)))} />
              <Group gap={2} wrap="nowrap">
                <ActionIcon variant="subtle" disabled={i === 0} aria-label={t("mill.up")} onClick={() => move(i, -1)}><IconArrowUp size={16} /></ActionIcon>
                <ActionIcon variant="subtle" disabled={i === sections.length - 1} aria-label={t("mill.down")} onClick={() => move(i, 1)}><IconArrowDown size={16} /></ActionIcon>
              </Group>
            </Group>
          ))}
        </Stack>
        <Switch label={t("mill.chooseKpis")} description={t("mill.chooseKpisHint")} checked={custom} onChange={(e) => setCustom(e.currentTarget.checked)} />
        {custom && (
          <MultiSelect label={t("mill.kpis")} searchable clearable value={kpis} onChange={setKpis} maxValues={40}
            data={all.map((k) => ({ value: k.id, label: `${k.code} – ${k.name}` }))} description={t("mill.kpisOrder")} />
        )}
        <Group justify="space-between">
          <Button variant="subtle" color="gray" loading={reset.isPending} onClick={() => reset.mutate(undefined)} disabled={!layout.custom}>{t("mill.reset")}</Button>
          <Button loading={save.isPending} onClick={() => save.mutate(undefined)}>{t("common.save")}</Button>
        </Group>
      </Stack>
    </Modal>
  );
}
