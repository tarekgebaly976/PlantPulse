"use client";

/** Weekly maintenance schedule (Sunday–Saturday): the optimiser proposes who does which approved work order on which
 *  day from the roster (any of the 7 days), the planner edits by hand, the engineer approves, then the maintenance
 *  manager gives the final approval that writes assignments and planned dates to the work orders. */

import { ActionIcon, Alert, Badge, Button, Card, Group, MultiSelect, NumberInput, Paper, ScrollArea, SegmentedControl, Select, SimpleGrid, Stack, Stepper, Table, Text, TextInput, Textarea, Tooltip } from "@mantine/core";
import { IconAlertTriangle, IconChevronLeft, IconChevronRight, IconCopy, IconHandStop, IconLock, IconPin, IconPlus, IconSparkles, IconTrash } from "@tabler/icons-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMediaQuery } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { Guard } from "@/components/AppFrame";
import { Modal } from "@/components/Modal";
import { AssetPicker, ConfirmButton, Loading, PageHeader } from "@/components/ui";
import { del, patch, post } from "@/lib/api";
import { fmtDate, fmtNum, useMut, useQ } from "@/lib/hooks";
import { useSession } from "@/lib/session";

interface WO {
  id: string; number: string; title: string; type: string; status: string; priority: string; asset: string | null; criticality: string | null;
  due_date: string | null; pm_deadline: string | null; hours: number | null; crew: number; trade: string | null; safety: boolean; stop: boolean; skills: string[];
  department_id: string;
}
interface Item {
  id: string; work_order: WO | null; user_id: string | null; work_date: string | null; hours: number; overtime: boolean; is_lead: boolean;
  deferred: boolean; reason: string | null; reason_code: string | null; reason_params: MsgParams; pinned: boolean; warnings: Msg[];
}
type MsgParams = Record<string, string | number | null>;
/** A reason or warning from the server: a code with parameters (translated here) and the English text. */
interface Msg { code: string; params: MsgParams; text: string }
interface RosterDay { kind: string; shift: string | null; regular: number; capacity: number }
interface Person { user_id: string; name: string; trade: string | null; departments: string[]; days: Record<string, RosterDay>; load: Record<string, number> }
interface Sched {
  id: string; status: string; days: number; department_id: string | null; max_overtime_hours: number; proposed_at: string | null; proposed_by: string | null; engineer_at: string | null;
  engineer_by: string | null; manager_at: string | null; manager_by: string | null; returned_comment: string | null;
  stats: { solver?: string; seconds?: number; scheduled?: number; deferred?: number; hours?: number; overtime_items?: number; people?: number };
}
interface WeekView {
  week_start: string; days: string[]; today: string; schedule: Sched | null; people: Person[]; items: Item[];
  over_capacity: { user_id: string; date: string; hours: number; capacity: number }[]; apply_warnings?: Msg[]; windows: Win[];
  overlaps: { start: string; end: string; days: number; status: string; department_id: string | null }[];
  department_id: string | null; busy_elsewhere: { user_id: string; date: string; hours: number }[];
}
interface Win { id: string; asset_id: string; asset: string; asset_code: string; date: string; start: string; end: string; hours: number; note: string | null }

const PRIO: Record<string, string> = { P1: "red", P2: "orange", P3: "blue", P4: "gray" };
const STATUS_COLOR: Record<string, string> = { draft: "gray", engineer_approved: "yellow", approved: "teal" };
const KIND_COLOR: Record<string, string> = { leave: "gray", absence: "dark", overtime: "orange", callout: "red" };
const addDays = (d: string, n: number) => { const x = new Date(`${d}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const MAX_DAYS = 31;
const PRESETS = [7, 10, 14, 20, 30];
/** The Sunday of a date's week. */
const sundayOf = (d: string) => addDays(d, -new Date(`${d}T00:00:00Z`).getUTCDay());
/** Thursday to Saturday the planner works on next week; earlier in the week, on this one. */
const defaultWeek = () => { const today = new Date().toISOString().slice(0, 10); const s = sundayOf(today); return new Date(`${today}T00:00:00Z`).getUTCDay() >= 4 ? addDays(s, 7) : s; };

function Schedule() {
  const { t, i18n } = useTranslation();
  const { can } = useSession();
  const router = useRouter();
  const params = useSearchParams();
  // A plan starts on any day and is 1–31 days long; by default a week from Sunday.
  const week = /^\d{4}-\d{2}-\d{2}$/.test(params.get("week") ?? "") ? (params.get("week") as string) : defaultWeek();
  const rawDays = Number(params.get("days"));
  const askDays = Number.isInteger(rawDays) && rawDays >= 1 ? Math.min(MAX_DAYS, rawDays) : null; // none: the plan's own length, or a week
  // The plan of the whole plant (no dept) or of one department.
  const dept = params.get("dept") || null;
  const go = (w: string, n: number | null | undefined, d: string | null) =>
    router.replace(`/schedule?week=${w}${n ? `&days=${n}` : ""}${d ? `&dept=${d}` : ""}`);
  const setWeek = (w: string, n?: number | null) => go(w, n, dept);
  const q = useQ<WeekView>(`/schedule/weeks/${week}`, { ...(askDays ? { days: askDays } : {}), ...(dept ? { department_id: dept } : {}) });
  const depts = useQ<{ id: string; code: string; name: string; name_ar: string | null }[]>("/departments").data ?? [];
  const deptName = (id: string | null) => { const d = depts.find((x) => x.id === id); return d ? `${d.code} — ${i18n.language === "ar" && d.name_ar ? d.name_ar : d.name}` : t("sched.wholePlant"); };
  const [show, setShow] = useState<string | null>(null); // whole plant's plan: show one department only
  const v = q.data;
  const s = v?.schedule ?? null;
  const n = v?.days.length ?? askDays ?? 7; // the days shown
  const want = askDays ?? n; // the length the next proposal gets
  const [ot, setOt] = useState<number | string>(2);
  const [move, setMove] = useState<{ item: Item; user_id: string; work_date: string } | null>(null);
  const [defer, setDefer] = useState<{ wo: WO; reason: string } | null>(null);
  const [place, setPlace] = useState<{ wo: WO; users: string[]; work_date: string } | null>(null);
  const [back, setBack] = useState<string | null>(null);
  const [applied, setApplied] = useState<Msg[] | null>(null);
  const msgT = (m: Msg) => {
    const key = `schedMsg.${m.code}`;
    if (!i18n.exists(key)) return m.text;
    const p = m.params ?? {};
    return `${p.number ? `${p.number}: ` : ""}${t(key, p)}`;
  };
  const reasonT = (i: Item) => (i.reason_code ? msgT({ code: i.reason_code, params: i.reason_params, text: i.reason ?? "" }) : i.reason);
  const phone = useMediaQuery("(max-width: 48em)");
  const [win, setWin] = useState<{ asset_id: string | null; work_date: string; start_time: string; hours: number | string; note: string } | null>(null);

  const propose = useMut(() => post(`/schedule/weeks/${week}/propose`, { max_overtime_hours: Number(ot) || 0, days: want, department_id: dept }), { success: t("sched.proposed") });
  const review = useMut(() => post(`/schedule/${s?.id}/review`));
  const approve = useMut(() => post<WeekView>(`/schedule/${s?.id}/approve`), { onDone: (r) => setApplied(r.apply_warnings ?? []) });
  const sendBack = useMut(() => post(`/schedule/${s?.id}/return`, { comment: back }), { onDone: () => setBack(null) });
  const reopen = useMut(() => post(`/schedule/${s?.id}/reopen`));
  const saveMove = useMut(() => patch(`/schedule/items/${move?.item.id}`, { user_id: move?.user_id, work_date: move?.work_date }), { onDone: () => setMove(null) });
  const saveDefer = useMut(() => post(`/schedule/${s?.id}/work-orders/${defer?.wo.id}/defer`, { reason: defer?.reason }), { onDone: () => { setDefer(null); setMove(null); } });
  const saveWin = useMut(() => post("/schedule/stop-windows", { ...win, hours: Number(win?.hours), note: win?.note || null }), { onDone: () => setWin(null) });
  const delWin = useMut((id: string) => del(`/schedule/stop-windows/${id}`));
  const copyWin = useMut(() => post<{ copied: number }>("/schedule/stop-windows/copy", { from_week: addDays(week, -n), to_week: week, days: n }), { success: false,
    onDone: (r) => notifications.show({ color: "teal", message: t("sched.copied", { n: r.copied }) }) });
  const savePlace = useMut(() => post(`/schedule/${s?.id}/work-orders/${place?.wo.id}/place`, { user_ids: place?.users, work_date: place?.work_date }), { onDone: () => setPlace(null) });

  if (!v) return <Loading />;
  const flip = { transform: i18n.dir() === "rtl" ? "scaleX(-1)" : undefined };
  const locked = s?.status === "approved";
  const canPlan = can("schedule.plan") && !locked;
  const dayName = (d: string) => new Intl.DateTimeFormat(i18n.language, { weekday: "short", timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`));
  const shown = (i: Item) => !show || i.work_order?.department_id === show;
  const placed = v.items.filter((i) => !i.deferred && shown(i));
  const deferred = v.items.filter((i) => i.deferred && shown(i));
  const people = v.people.filter((p) => !show || !p.departments.length || p.departments.includes(show));
  const elsewhere = new Map(v.busy_elsewhere.map((b) => [`${b.user_id}:${b.date}`, b.hours]));
  // the whole plant's plan, per department: work orders placed, hours, deferred
  const perDept = dept ? [] : Object.entries(v.items.reduce<Record<string, { wos: Set<string>; hours: number; deferred: number }>>((acc, i) => {
    const k = i.work_order?.department_id; if (!k) return acc;
    const a = (acc[k] ??= { wos: new Set(), hours: 0, deferred: 0 });
    if (i.deferred) a.deferred += 1; else { a.wos.add(i.work_order!.id); a.hours += i.hours; }
    return acc;
  }, {}));
  const at = (uid: string, d: string) => placed.filter((i) => i.user_id === uid && i.work_date === d);
  const over = new Set(v.over_capacity.map((o) => `${o.user_id}:${o.date}`));
  const peopleOpts = v.people.map((p) => ({ value: p.user_id, label: `${p.name}${p.trade ? ` · ${p.trade}` : ""}` }));
  const dayOpts = v.days.map((d) => ({ value: d, label: `${dayName(d)} ${d}` }));
  const step = !s?.proposed_at ? 0 : s.status === "draft" ? 1 : s.status === "engineer_approved" ? 2 : 3;
  const warnCount = placed.filter((i) => i.warnings.length).length;

  return (
    <>
      <PageHeader title={t("sched.title")} actions={<>
        <ActionIcon variant="default" size="lg" aria-label={t("sched.prev")} onClick={() => setWeek(addDays(week, -n), askDays)}><IconChevronLeft size={18} style={flip} /></ActionIcon>
        <Text fw={600} dir="ltr" data-testid="week-label">{fmtDate(v.week_start)} – {fmtDate(addDays(v.week_start, n - 1))}</Text>
        <ActionIcon variant="default" size="lg" aria-label={t("sched.next")} onClick={() => setWeek(addDays(week, n), askDays)}><IconChevronRight size={18} style={flip} /></ActionIcon>
        {s && <Badge size="lg" variant="light" tt="none" color={STATUS_COLOR[s.status]} data-testid="sched-status">{t(`sched.status_${s.status}`)}</Badge>}
      </>}>
        <Text size="sm" c="dimmed">{t("sched.hint")}</Text>
      </PageHeader>

      <Stack>
        <Paper withBorder p="md">
          <Group gap="sm" align="end" mb="md" wrap="wrap">
            <Select label={t("sched.scope")} w={230} allowDeselect={false} value={dept ?? ""} onChange={(x) => { setShow(null); go(week, askDays, x || null); }}
              data={[{ value: "", label: t("sched.wholePlant") }, ...depts.map((d) => ({ value: d.id, label: deptName(d.id) }))]} />
            <TextInput type="date" label={t("sched.planStart")} value={week} w={170}
              onChange={(e) => /^\d{4}-\d{2}-\d{2}$/.test(e.currentTarget.value) && setWeek(e.currentTarget.value, askDays)} />
            <div>
              <Text size="sm" fw={500} mb={2}>{t("sched.planDays")}</Text>
              <SegmentedControl value={PRESETS.includes(want) ? String(want) : "x"} onChange={(x) => x !== "x" && setWeek(week, Number(x))}
                data={[...PRESETS.map((d) => ({ value: String(d), label: d === 7 ? t("sched.week7") : t("sched.daysN", { n: d }) })), { value: "x", label: t("sched.custom") }]} />
            </div>
            <NumberInput w={110} aria-label={t("sched.planDays")} min={1} max={MAX_DAYS} value={want} clampBehavior="strict" allowDecimal={false}
              onChange={(x) => typeof x === "number" && x >= 1 && x <= MAX_DAYS && setWeek(week, x)} />
            <Button variant="subtle" size="xs" onClick={() => setWeek(sundayOf(week), 7)}>{t("sched.week7")}: {fmtDate(sundayOf(week))}</Button>
          </Group>
          {!dept && depts.length > 1 && (
            <Group gap="xs" mb="sm" wrap="wrap" align="center">
              <Select size="xs" w={230} clearable placeholder={t("sched.allDepts")} aria-label={t("sched.showDept")} value={show} onChange={setShow}
                data={depts.map((d) => ({ value: d.id, label: deptName(d.id) }))} />
              {perDept.map(([k, a]) => (
                <Badge key={k} variant={show === k ? "filled" : "light"} tt="none" style={{ cursor: "pointer" }} onClick={() => setShow(show === k ? null : k)}>
                  {deptName(k).split(" — ")[0]}: {t("sched.deptSummary", { n: a.wos.size, h: fmtNum(a.hours, 1), d: a.deferred })}
                </Badge>))}
            </Group>
          )}
          {s && askDays && askDays !== s.days && <Alert mb="sm" color="blue" p="xs">{t("sched.lengthNote", { n: s.days, m: askDays })}</Alert>}
          {v.overlaps.map((o) => (
            <Alert key={`${o.start}-${o.department_id}`} mb="sm" color="orange" p="xs">
              <Group justify="space-between" gap="xs">
                <Text size="sm">{t("sched.overlap", { start: fmtDate(o.start), end: fmtDate(o.end), n: o.days })} · {deptName(o.department_id)}</Text>
                <Button size="xs" variant="light" onClick={() => go(o.start, null, o.department_id)}>{t("sched.openPlan")}</Button>
              </Group>
            </Alert>
          ))}
          <Stepper active={step} size="sm" allowNextStepsSelect={false}>
            <Stepper.Step label={t("sched.stepPropose")} description={s?.proposed_at ? `${s.proposed_by ?? ""} · ${fmtDate(s.proposed_at)}` : t("sched.notYet")} />
            <Stepper.Step label={t("sched.stepEngineer")} description={s?.engineer_at ? `${s.engineer_by ?? ""} · ${fmtDate(s.engineer_at)}` : undefined} />
            <Stepper.Step label={t("sched.stepManager")} description={s?.manager_at ? `${s.manager_by ?? ""} · ${fmtDate(s.manager_at)}` : undefined} />
          </Stepper>
          {s?.returned_comment && <Alert mt="sm" color="orange" title={t("sched.returned")}>{s.returned_comment}</Alert>}
          <Group mt="md" gap="sm" align="end">
            {canPlan && <>
              <NumberInput w={170} label={t("sched.maxOt")} value={ot} onChange={setOt} min={0} max={8} step={0.5} />
              <Button leftSection={<IconSparkles size={16} />} loading={propose.isPending} onClick={() => propose.mutate(undefined)} data-testid="propose">
                {s?.proposed_at ? t("sched.reproposeBtn") : t("sched.proposeBtn")}
              </Button>
            </>}
            {s?.status === "draft" && s.proposed_at && can("schedule.review") &&
              <Button color="teal" loading={review.isPending} onClick={() => review.mutate(undefined)} data-testid="review">{t("sched.engineerApprove")}</Button>}
            {s?.status === "engineer_approved" && can("schedule.approve") &&
              <ConfirmButton color="teal" loading={approve.isPending} onConfirm={() => approve.mutate(undefined)}>{t("sched.managerApprove")}</ConfirmButton>}
            {s?.status === "engineer_approved" && (can("schedule.approve") || can("schedule.review")) &&
              <Button variant="default" onClick={() => setBack("")}>{t("sched.sendBack")}</Button>}
            {locked && can("schedule.approve") && <Button variant="default" leftSection={<IconLock size={16} />} onClick={() => reopen.mutate(undefined)}>{t("sched.reopen")}</Button>}
          </Group>
        </Paper>

        {s?.proposed_at && (
          <SimpleGrid cols={{ base: 2, sm: 3, lg: 6 }}>
            <Stat label={t("sched.statScheduled")} value={s.stats.scheduled ?? 0} color="teal" />
            <Stat label={t("sched.statHours")} value={fmtNum(s.stats.hours ?? 0, 1)} />
            <Stat label={t("sched.statDeferred")} value={s.stats.deferred ?? 0} color={(s.stats.deferred ?? 0) > 0 ? "orange" : undefined} />
            <Stat label={t("sched.statOvertime")} value={s.stats.overtime_items ?? 0} color={(s.stats.overtime_items ?? 0) > 0 ? "orange" : undefined} />
            <Stat label={t("sched.statWarnings")} value={warnCount + v.over_capacity.length} color={warnCount + v.over_capacity.length ? "red" : "teal"} />
            <Stat label={t("sched.statSolver")} value={s.stats.solver ? `${t(`sched.solver_${s.stats.solver}`, { defaultValue: s.stats.solver })} · ${fmtNum(s.stats.seconds ?? 0, 1)} s` : "—"} />
          </SimpleGrid>
        )}

        <Card withBorder data-testid="stop-windows">
          <Group justify="space-between" mb="xs">
            <div><Text fw={600}>{t("sched.windowsTitle")}</Text><Text size="xs" c="dimmed">{t("sched.windowsHint")}</Text></div>
            {can("stop_window.manage") && <Group gap="xs">
              <Button size="xs" variant="default" leftSection={<IconCopy size={14} />} loading={copyWin.isPending} onClick={() => copyWin.mutate(undefined)}>{t("sched.copyWindows")}</Button>
              <Button size="xs" leftSection={<IconPlus size={14} />} onClick={() => setWin({ asset_id: null, work_date: v.week_start, start_time: "08:00", hours: 4, note: "" })}>{t("sched.addWindow")}</Button>
            </Group>}
          </Group>
          {v.windows.length === 0 ? <Text size="sm" c="dimmed">{t("sched.noWindows")}</Text> : phone ? (
            <Stack gap="xs">
              {v.windows.map((w) => (
                <Paper key={w.id} withBorder p="xs">
                  <Group justify="space-between" wrap="nowrap" align="start">
                    <div>
                      <Text size="sm" fw={600}>{w.asset}</Text>
                      <Text size="sm">{dayName(w.date)} {w.date} · <span dir="ltr">{w.start}–{w.end}</span> · {fmtNum(w.hours, 2)} h</Text>
                      {w.note && <Text size="xs" c="dimmed">{w.note}</Text>}
                    </div>
                    {can("stop_window.manage") && <ActionIcon variant="subtle" color="red" aria-label={t("common.delete")} onClick={() => delWin.mutate(w.id)}><IconTrash size={16} /></ActionIcon>}
                  </Group>
                </Paper>))}
            </Stack>
          ) : (
            <Table fz="sm">
              <Table.Thead><Table.Tr><Table.Th>{t("sched.line")}</Table.Th><Table.Th>{t("sched.day")}</Table.Th><Table.Th>{t("sched.fromTime")}</Table.Th>
                <Table.Th>{t("sched.hours")}</Table.Th><Table.Th>{t("sched.comment")}</Table.Th><Table.Th /></Table.Tr></Table.Thead>
              <Table.Tbody>
                {v.windows.map((w) => (
                  <Table.Tr key={w.id}>
                    <Table.Td>{w.asset}</Table.Td><Table.Td>{dayName(w.date)} {w.date}</Table.Td>
                    <Table.Td dir="ltr" style={{ textAlign: "start" }}>{w.start} – {w.end}</Table.Td><Table.Td>{fmtNum(w.hours, 2)}</Table.Td><Table.Td>{w.note ?? ""}</Table.Td>
                    <Table.Td>{can("stop_window.manage") && <ActionIcon variant="subtle" color="red" aria-label={t("common.delete")} onClick={() => delWin.mutate(w.id)}><IconTrash size={16} /></ActionIcon>}</Table.Td>
                  </Table.Tr>))}
              </Table.Tbody>
            </Table>)}
        </Card>

        {people.length === 0 && <Alert color="gray">{t("sched.noRoster")}</Alert>}
        <ScrollArea type="auto">
          <Table withTableBorder withColumnBorders fz="xs" miw={1100} data-testid="schedule-grid" style={{ tableLayout: "fixed" }}>
            <Table.Thead><Table.Tr>
              <Table.Th w={170}>{t("sched.person")}</Table.Th>
              {v.days.map((d) => (
                <Table.Th key={d} style={{ textAlign: "center", background: d === v.today ? "var(--mantine-color-teal-light)" : undefined }}>
                  {dayName(d)}<Text size="xs" c="dimmed">{d.slice(5)}</Text>
                  {v.windows.filter((w) => w.date === d).map((w) => (
                    <Tooltip key={w.id} label={`${w.asset} · ${w.start}–${w.end}${w.note ? ` · ${w.note}` : ""}`}>
                      <Badge size="xs" color="orange" variant="light" tt="none" leftSection={<IconHandStop size={10} />}>{w.asset_code} {w.start}</Badge>
                    </Tooltip>))}
                </Table.Th>))}
            </Table.Tr></Table.Thead>
            <Table.Tbody>
              {people.map((p) => (
                <Table.Tr key={p.user_id}>
                  <Table.Td>{p.name}<Text size="xs" c="dimmed">{p.trade ?? ""}</Text></Table.Td>
                  {v.days.map((d) => {
                    const r = p.days[d];
                    const off = !r || ["leave", "absence"].includes(r.kind);
                    const load = p.load[d] ?? 0;
                    const full = over.has(`${p.user_id}:${d}`);
                    const other = elsewhere.get(`${p.user_id}:${d}`) ?? 0;
                    return (
                      <Table.Td key={d} style={{ verticalAlign: "top", background: off ? "var(--mantine-color-gray-light)" : undefined }} data-testid={`day-${p.user_id}-${d}`}>
                        <Group gap={4} justify="space-between" mb={4} wrap="nowrap">
                          {r ? <Badge size="xs" variant="light" color={KIND_COLOR[r.kind] ?? "blue"}>{r.kind === "work" ? r.shift ?? "" : t(`sched.kind_${r.kind}`)}</Badge>
                            : <Text size="xs" c="dimmed">{t("sched.off")}</Text>}
                          {r && !off && <Text size="xs" dir="ltr" c={full ? "red" : load > r.regular ? "orange" : "dimmed"} fw={full ? 700 : undefined}>{fmtNum(load, 1)}/{fmtNum(r.regular || r.capacity, 1)} h</Text>}
                          {other > 0 && <Tooltip label={t("sched.busyElsewhere", { h: fmtNum(other, 1) })}><Badge size="xs" color="gray" variant="outline" dir="ltr">+{fmtNum(other, 1)} h</Badge></Tooltip>}
                        </Group>
                        <Stack gap={3}>
                          {at(p.user_id, d).map((i) => i.work_order && (
                            <Tooltip key={i.id} multiline w={280} label={<>
                              <b>{i.work_order.number}</b> · {i.work_order.title}<br />{i.work_order.asset}<br />
                              {fmtNum(i.hours, 2)} h{i.overtime ? ` · ${t("sched.overtime")}` : ""}{i.work_order.due_date ? ` · ${t("sched.due")} ${i.work_order.due_date}` : ""}
                              {i.work_order.skills.length > 0 && <><br />{i.work_order.skills.join(", ")}</>}
                              {i.warnings.map((w) => <div key={w.text}>⚠ {msgT(w)}</div>)}
                            </>}>
                              <Badge fullWidth size="sm" radius="sm" tt="none" color={PRIO[i.work_order.priority] ?? "blue"} variant={i.warnings.length ? "outline" : "light"}
                                style={{ cursor: canPlan ? "pointer" : "default", borderColor: i.warnings.length ? "var(--mantine-color-red-6)" : undefined }}
                                leftSection={i.warnings.length ? <IconAlertTriangle size={11} color="var(--mantine-color-red-6)" /> : i.pinned ? <IconPin size={11} /> : i.work_order.stop ? <IconHandStop size={11} /> : undefined}
                                rightSection={i.overtime ? <Text span size="9px" fw={700} c="orange">OT</Text> : undefined}
                                onClick={() => canPlan && setMove({ item: i, user_id: i.user_id ?? "", work_date: i.work_date ?? "" })} data-testid={`chip-${i.work_order.number}`}>
                                {i.work_order.number.split("-").pop()} · {fmtNum(i.hours, 1)}h
                              </Badge>
                            </Tooltip>))}
                        </Stack>
                      </Table.Td>);
                  })}
                </Table.Tr>))}
            </Table.Tbody>
          </Table>
        </ScrollArea>

        <Card withBorder>
          <Text fw={600} mb="xs">{t("sched.deferredTitle")} ({deferred.length})</Text>
          {deferred.length === 0 ? <Text size="sm" c="dimmed">{t("sched.noDeferred")}</Text> : phone ? (
            <Stack gap="xs" data-testid="deferred">
              {deferred.map((i) => i.work_order && (
                <Paper key={i.id} withBorder p="xs">
                  <Group gap={6} mb={4}>
                    <Badge color={PRIO[i.work_order.priority]} variant="light">{i.work_order.priority}</Badge>
                    <Link href={`/work-orders/${i.work_order.id}`}>{i.work_order.number}</Link>
                  </Group>
                  <Text size="sm" fw={600}>{i.work_order.title}</Text>
                  <Text size="xs" c="dimmed">{i.work_order.asset}</Text>
                  <Text size="xs" c="dimmed">{t("sched.hours")}: {i.work_order.hours ? fmtNum(i.work_order.hours, 1) : "—"} · {t("sched.due")}: {i.work_order.due_date ?? "—"}</Text>
                  <Text size="sm" c="orange.8" mt={4}>{i.pinned && <IconPin size={12} />} {reasonT(i)}</Text>
                  {canPlan && <Button mt={6} size="xs" variant="light" onClick={() => setPlace({ wo: i.work_order as WO, users: [], work_date: v.week_start })}>{t("sched.placeBtn")}</Button>}
                </Paper>))}
            </Stack>
          ) : (
            <Table fz="sm" data-testid="deferred">
              <Table.Thead><Table.Tr>
                <Table.Th>{t("sched.wo")}</Table.Th><Table.Th>{t("sched.priority")}</Table.Th><Table.Th>{t("sched.hours")}</Table.Th>
                <Table.Th>{t("sched.due")}</Table.Th><Table.Th>{t("sched.reason")}</Table.Th><Table.Th />
              </Table.Tr></Table.Thead>
              <Table.Tbody>
                {deferred.map((i) => i.work_order && (
                  <Table.Tr key={i.id}>
                    <Table.Td><Link href={`/work-orders/${i.work_order.id}`}>{i.work_order.number}</Link> · {i.work_order.title}<Text size="xs" c="dimmed">{i.work_order.asset}</Text></Table.Td>
                    <Table.Td><Badge color={PRIO[i.work_order.priority]} variant="light">{i.work_order.priority}</Badge></Table.Td>
                    <Table.Td>{i.work_order.hours ? fmtNum(i.work_order.hours, 1) : "—"}</Table.Td>
                    <Table.Td>{i.work_order.due_date ?? "—"}</Table.Td>
                    <Table.Td>{i.pinned && <IconPin size={12} />} {reasonT(i)}</Table.Td>
                    <Table.Td>{canPlan && <Button size="xs" variant="light" onClick={() => setPlace({ wo: i.work_order as WO, users: [], work_date: v.week_start })}>{t("sched.placeBtn")}</Button>}</Table.Td>
                  </Table.Tr>))}
              </Table.Tbody>
            </Table>)}
        </Card>
      </Stack>

      <Modal opened={!!move} onClose={() => setMove(null)} title={move?.item.work_order ? `${move.item.work_order.number} · ${move.item.work_order.title}` : ""}>
        {move?.item.work_order && <Stack>
          <Text size="sm">{move.item.work_order.asset} · {fmtNum(move.item.hours, 2)} h · <Badge size="xs" color={PRIO[move.item.work_order.priority]}>{move.item.work_order.priority}</Badge></Text>
          {move.item.warnings.map((w) => <Alert key={w.text} color="red" p="xs">{msgT(w)}</Alert>)}
          <Select label={t("sched.person")} data={peopleOpts} value={move.user_id} onChange={(x) => x && setMove({ ...move, user_id: x })} searchable />
          <Select label={t("sched.day")} data={dayOpts} value={move.work_date} onChange={(x) => x && setMove({ ...move, work_date: x })} />
          <Text size="xs" c="dimmed">{t("sched.moveHint")}</Text>
          <Group justify="space-between">
            <Group gap="xs">
              <Button variant="default" component={Link} href={`/work-orders/${move.item.work_order.id}`}>{t("sched.openWo")}</Button>
              <Button variant="light" color="orange" onClick={() => setDefer({ wo: move.item.work_order as WO, reason: "" })}>{t("sched.deferBtn")}</Button>
            </Group>
            <Button loading={saveMove.isPending} onClick={() => saveMove.mutate(undefined)}>{t("common.save")}</Button>
          </Group>
        </Stack>}
      </Modal>

      <Modal opened={!!defer} onClose={() => setDefer(null)} title={`${t("sched.deferBtn")} ${defer?.wo.number ?? ""}`}>
        <Stack>
          <Textarea label={t("sched.reason")} value={defer?.reason ?? ""} onChange={(e) => defer && setDefer({ ...defer, reason: e.currentTarget.value })} autosize minRows={2} />
          <Group justify="end"><Button color="orange" disabled={(defer?.reason.trim().length ?? 0) < 3} loading={saveDefer.isPending} onClick={() => saveDefer.mutate(undefined)}>{t("sched.deferBtn")}</Button></Group>
        </Stack>
      </Modal>

      <Modal opened={!!place} onClose={() => setPlace(null)} title={`${t("sched.placeBtn")} ${place?.wo.number ?? ""}`}>
        {place && <Stack>
          <Text size="sm">{place.wo.title} · {place.wo.hours ? `${fmtNum(place.wo.hours, 1)} h` : t("sched.noHours")} · {t("sched.crew")} {place.wo.crew}</Text>
          <Select label={t("sched.day")} data={dayOpts} value={place.work_date} onChange={(x) => x && setPlace({ ...place, work_date: x })} />
          <MultiSelect label={t("sched.people")} data={peopleOpts} value={place.users} onChange={(x) => setPlace({ ...place, users: x })} searchable />
          <Text size="xs" c="dimmed">{t("sched.moveHint")}</Text>
          <Group justify="end"><Button disabled={!place.users.length || !place.wo.hours} loading={savePlace.isPending} onClick={() => savePlace.mutate(undefined)}>{t("common.save")}</Button></Group>
        </Stack>}
      </Modal>

      <Modal opened={!!win} onClose={() => setWin(null)} title={t("sched.addWindow")}>
        {win && <Stack>
          <AssetPicker label={t("sched.line")} value={win.asset_id} onChange={(x) => setWin({ ...win, asset_id: x })} required />
          <Select label={t("sched.day")} data={dayOpts} value={win.work_date} onChange={(x) => x && setWin({ ...win, work_date: x })} />
          <Group grow>
            <TextInput type="time" label={t("sched.fromTime")} value={win.start_time} onChange={(e) => setWin({ ...win, start_time: e.currentTarget.value })} />
            <NumberInput label={t("sched.hours")} value={win.hours} onChange={(x) => setWin({ ...win, hours: x })} min={0.5} max={168} step={0.5} />
          </Group>
          <TextInput label={t("sched.comment")} value={win.note} onChange={(e) => setWin({ ...win, note: e.currentTarget.value })} placeholder={t("sched.windowNoteHint")} />
          <Group justify="end"><Button disabled={!win.asset_id || !win.start_time || !Number(win.hours)} loading={saveWin.isPending} onClick={() => saveWin.mutate(undefined)}>{t("common.save")}</Button></Group>
        </Stack>}
      </Modal>

      <Modal opened={back !== null} onClose={() => setBack(null)} title={t("sched.sendBack")}>
        <Stack>
          <Textarea label={t("sched.comment")} value={back ?? ""} onChange={(e) => setBack(e.currentTarget.value)} autosize minRows={2} />
          <Group justify="end"><Button color="orange" disabled={(back?.trim().length ?? 0) < 3} loading={sendBack.isPending} onClick={() => sendBack.mutate(undefined)}>{t("sched.sendBack")}</Button></Group>
        </Stack>
      </Modal>

      <Modal opened={applied !== null} onClose={() => setApplied(null)} title={t("sched.appliedTitle")}>
        <Stack>
          <Text size="sm">{t("sched.appliedText")}</Text>
          {applied?.map((w) => <Alert key={w.text} color="yellow" p="xs">{msgT(w)}</Alert>)}
          <Group justify="end"><Button onClick={() => setApplied(null)}>{t("common.close")}</Button></Group>
        </Stack>
      </Modal>
    </>
  );
}

function Stat({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <Card withBorder p="sm">
      <Text size="xs" c="dimmed">{label}</Text>
      <Text fw={700} size="xl" c={color}>{value}</Text>
    </Card>
  );
}

export default function Page() {
  return <Guard perm="wo.view"><Suspense><Schedule /></Suspense></Guard>;
}
