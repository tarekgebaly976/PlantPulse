"use client";

import { Badge, Button, Group, Paper, SimpleGrid, Stack, Table, Text } from "@mantine/core";
import { IconArrowLeft, IconPlus } from "@tabler/icons-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { post } from "@/lib/api";
import { fmtNum, useMut } from "@/lib/hooks";
import { fmtVal, hhmm, pct, type Period, type ShiftLogSection } from "@/lib/ops";
import { StatusBadge } from "./ui";

export function Tile({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <Paper withBorder p="sm" radius="md">
      <Text size="xs" c="dimmed">{label}</Text>
      <Text fw={700} size="xl" c={color}>{value}</Text>
      {sub && <Text size="xs" c="dimmed">{sub}</Text>}
    </Paper>
  );
}

export function oeeColor(v: number | null | undefined): string | undefined {
  if (v === null || v === undefined) return undefined;
  return v >= 0.75 ? "teal" : v >= 0.6 ? "yellow.8" : "red";
}

export function PeriodTiles({ p, title }: { p: Period; title: string }) {
  const { t } = useTranslation();
  return (
    <Stack gap={6}>
      <Text fw={600} size="sm">{title} · {t("ops.tiles.days", { n: p.days })}</Text>
      <SimpleGrid cols={{ base: 2, sm: 3, lg: 6 }}>
        <Tile label={t("ops.tiles.gross")} value={`${fmtNum(p.production.gross, 1)} t`} />
        <Tile label={t("ops.tiles.a")} value={`${fmtNum(p.production.a, 1)} t`} sub={`${t("ops.tiles.b")} ${pct(p.production.b_pct)} · ${t("ops.tiles.reject")} ${pct(p.production.reject_pct)}`} />
        <Tile label={t("ops.tiles.oee")} value={pct(p.oee.oee)} color={oeeColor(p.oee.oee)}
          sub={`\u2066${pct(p.oee.availability, 0)} × ${pct(p.oee.performance, 0)} × ${pct(p.oee.quality, 0)}\u2069`} />
        <Tile label={t("ops.tiles.run")} value={hhmm(p.run_hours)} sub={`${t("ops.tiles.ideal")} ${fmtNum(p.ideal_mt, 0)} t`} />
        <Tile label={t("ops.tiles.downtime")} value={hhmm(p.stops.downtime_hours)} sub={`${t("ops.tables.planned")} ${hhmm(p.stops.planned_hours)}`} />
        <Tile label={t("ops.tiles.breaks")} value={String(p.stops.breaks_count)} sub={hhmm(p.stops.breaks_hours)} />
      </SimpleGrid>
    </Stack>
  );
}



/** Shift logs shown inside the PM daily report (e.g. stock preparation): one column per shift, then the day figure. */
export function ShiftLogs({ sec, date, canStart, print }: { sec: ShiftLogSection; date: string; canStart?: boolean; print?: boolean }) {
  const { t } = useTranslation();
  const router = useRouter();
  const start = useMut((shift: string) => post<{ id: string }>("/operations/logs", { template_id: sec.template.id, log_date: date, shift }),
    { success: false, onDone: (r) => router.push(`/operations/logs/${r.id}`) });
  const codes = sec.shift_codes;
  const name = (c: string) => sec.template.shifts.find((x) => x.code === c)?.name ?? c;
  const cell = (l: ShiftLogSection["lines"][number], v: number | string | null | undefined) => {
    if (v === null || v === undefined || v === "") return "—";
    if (l.kind === "check") return Number(v) ? "✓" : "✗";
    if (l.kind === "text") return String(v);
    return fmtVal(Number(v), l.decimals);
  };
  const head = <tr><th />{codes.map((c) => <th key={c}>{name(c)}</th>)}<th>{t("ops.sp.day")}</th></tr>;
  const bar = print ? null : (
    <Group gap="xs" mb="xs" wrap="wrap">
      {codes.map((c) => {
        const lg = sec.logs[c];
        return (
          <Group key={c} gap={4} wrap="nowrap">
            <Text size="sm" fw={600}>{name(c)}:</Text>
            {lg ? <><StatusBadge value={lg.status} size="sm" /><Button size="compact-sm" variant="light" component={Link} href={`/operations/logs/${lg.id}`}>{t("ops.sp.open")}</Button></>
              : canStart ? <Button size="compact-sm" leftSection={<IconPlus size={12} />} loading={start.isPending} onClick={() => start.mutate(c)}>{t("ops.sp.start")}</Button>
              : <Badge size="sm" color="gray" variant="light">{t("ops.sp.none")}</Badge>}
          </Group>
        );
      })}
    </Group>
  );
  const rows = sec.lines.map((l, i) => {
    const sh = i === 0 || sec.lines[i - 1]!.section !== l.section;
    return [
      sh ? <tr key={`s-${l.id}`}><td colSpan={codes.length + 2} style={{ fontWeight: 600, background: "var(--pp-thead-bg)" }}>{l.section}</td></tr> : null,
      <tr key={l.id}>
        <td>{l.label}{l.unit ? <Text span size="xs" c="dimmed"> ({l.unit})</Text> : null}</td>
        {codes.map((c) => <td key={c} style={l.flags[c] ? { color: "var(--mantine-color-red-7)", fontWeight: 600 } : undefined}>{cell(l, l.shifts[c])}</td>)}
        <td style={{ fontWeight: 600 }}>{l.day === null ? "" : fmtVal(l.day, l.decimals)}</td>
      </tr>,
    ];
  });
  if (print) return <table><thead>{head}</thead><tbody>{rows}</tbody></table>;
  return (
    <>
      {bar}
      <Table.ScrollContainer minWidth={420}>
        <Table striped withTableBorder fz="sm"><Table.Thead>{head}</Table.Thead><Table.Tbody>{rows}</Table.Tbody></Table>
      </Table.ScrollContainer>
    </>
  );
}

/** A clear way back at the top of a detail page (phones have no browser back button inside the app). */
export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Button component={Link} href={href} variant="subtle" size="compact-md" px={4} mb={6} leftSection={<IconArrowLeft size={18} />} className="no-print">
      {label}
    </Button>
  );
}
