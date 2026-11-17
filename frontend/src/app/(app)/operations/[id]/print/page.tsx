"use client";

import { Button, Group } from "@mantine/core";
import { IconArrowBack, IconPrinter } from "@tabler/icons-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslation } from "react-i18next";
import { ShiftLogs } from "@/components/Ops";
import { Loading } from "@/components/ui";
import { fmtDate, useQ } from "@/lib/hooks";
import { hhmm, hm, nextDay, pct, t3, type OpSettings, type Report } from "@/lib/ops";
import { useSession } from "@/lib/session";

/** The daily production report on A4 in the order of a typical paper-mill daily form: shift production, machine
 * shutdown and sheet breaks by discipline, stop details, runs and GSM changes, gross by GSM, quality losses, utilities,
 * OEE and the to-date summary. The browser prints it (or saves it as PDF), so Arabic and right-to-left come out right. */
export default function OpsPrint() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const { plant } = useSession();
  const q = useQ<Report>(`/operations/reports/${id}`);
  const st = useQ<OpSettings>("/operations/settings");
  if (!q.data || !st.data) return <Loading />;
  const r = q.data;
  const s = st.data;
  const c = r.calc;
  const tz = plant?.timezone;
  const tm = (iso: string | null) => (iso ? `${hm(iso, tz)}${nextDay(iso, r.report_date, tz) ? " (+1)" : ""}` : "—");
  const disc = (did: string) => s.disciplines.find((d) => d.id === did)?.code ?? (did === "none" ? t("ops.tables.none") : "?");
  const sec = (sid: string | null) => s.machines.find((m) => m.id === r.machine.id)?.sections?.find((x) => x.id === sid)?.name ?? "";
  const discIds = [...new Set([...s.disciplines.filter((d) => d.is_active).map((d) => d.id), ...Object.keys(c.stops.downtime_by_discipline), ...Object.keys(c.stops.breaks_count_by_discipline)])];
  const P = (label: string, v: string) => <tr><th style={{ width: "45%" }}>{label}</th><td>{v}</td></tr>;
  return (
    <>
      <Group className="no-print" mb="md" justify="space-between">
        <Button component={Link} href={`/operations/${id}`} variant="default" leftSection={<IconArrowBack size={16} />}>{t("common.back")}</Button>
        <Button leftSection={<IconPrinter size={16} />} onClick={() => window.print()}>{t("ops.report.print")}</Button>
      </Group>
      <div className="rca-sheet ops-sheet">
        <table style={{ border: 0, marginBottom: 6 }}><tbody><tr>
          <td style={{ border: 0, padding: 0 }}>
            <h1>{t("ops.report.title")}</h1>
            <div style={{ fontSize: 13, fontWeight: 600, marginTop: 2 }}>{r.machine.code} – {r.machine.name} · {r.report_date} ({hm(c.window.start, tz)}–{hm(c.window.end, tz)})</div>
          </td>
          <td style={{ border: 0, padding: 0, textAlign: "end", fontSize: 11 }}>
            {plant?.plant_name}<br />{t(`status.${r.status}`)} · {t("ops.report.revision", { n: r.revision })}
          </td>
        </tr></tbody></table>

        <h2>{t("ops.shifts.title")}</h2>
        <table><thead><tr>
          <th>{t("ops.shifts.shift")}</th><th>{t("ops.shifts.supervisor")}</th><th>GSM</th><th>{t("ops.shifts.speed")}</th><th>{t("ops.shifts.run")}</th>
          <th>{t("ops.tiles.gross")}</th><th>{t("ops.tiles.net")}</th><th>A</th><th>B</th><th>S</th><th>{t("ops.tiles.reject")}</th><th>{t("ops.tiles.trim")}</th><th>B %</th><th>Rej %</th>
        </tr></thead><tbody>
          {c.shifts.map((x) => (
            <tr key={x.code}><td>{x.name}</td><td>{x.supervisor ?? ""}</td><td>{x.gsm?.join("/")}</td><td>{x.speed?.join("/")}</td><td>{hhmm(x.run_hours)}</td>
              <td>{t3(x.gross)}</td><td>{t3(x.net)}</td><td>{t3(x.a)}</td><td>{t3(x.b)}</td><td>{t3(x.s)}</td><td>{t3(x.reject)}</td><td>{t3(x.trim)}</td><td>{pct(x.b_pct, 2)}</td><td>{pct(x.reject_pct, 2)}</td></tr>
          ))}
          <tr style={{ fontWeight: 700 }}><td colSpan={4}>{t("ops.tables.total")}</td><td>{hhmm(c.run_hours)}</td><td>{t3(c.day.gross)}</td><td>{t3(c.day.net)}</td><td>{t3(c.day.a)}</td>
            <td>{t3(c.day.b)}</td><td>{t3(c.day.s)}</td><td>{t3(c.day.reject)}</td><td>{t3(c.day.trim)}</td><td>{pct(c.day.b_pct, 2)}</td><td>{pct(c.day.reject_pct, 2)}</td></tr>
        </tbody></table>

        {r.shift_logs.map((sec) => <div key={sec.template.id} className="rca-keep"><h2>{sec.template.name}</h2><ShiftLogs sec={sec} date={r.report_date} print /></div>)}

        <h2>{t("ops.tables.downtime")} · {t("ops.tables.breaks")}</h2>
        <table><thead><tr><th />{discIds.map((d) => <th key={d}>{disc(d)}</th>)}<th>{t("ops.tables.planned")}</th><th>{t("ops.tables.total")}</th></tr></thead><tbody>
          <tr><th>{t("ops.tables.downtime")} · {t("ops.tiles.day")}</th>{discIds.map((d) => <td key={d}>{hhmm(c.stops.downtime_by_discipline[d] ?? 0)}</td>)}<td>{hhmm(c.stops.planned_hours)}</td><td>{hhmm(c.stops.downtime_hours)}</td></tr>
          <tr><th>{t("ops.tables.downtime")} · {t("ops.tiles.mtd")}</th>{discIds.map((d) => <td key={d}>{hhmm(c.mtd.stops.downtime_by_discipline[d] ?? 0)}</td>)}<td>{hhmm(c.mtd.stops.planned_hours)}</td><td>{hhmm(c.mtd.stops.downtime_hours)}</td></tr>
          <tr><th>{t("ops.tables.breaks")} · {t("ops.tiles.day")}</th>{discIds.map((d) => <td key={d}>{c.stops.breaks_count_by_discipline[d] ?? 0} / {hhmm(c.stops.breaks_hours_by_discipline[d] ?? 0)}</td>)}<td /><td>{c.stops.breaks_count} / {hhmm(c.stops.breaks_hours)}</td></tr>
          <tr><th>{t("ops.tables.breaks")} · {t("ops.tiles.mtd")}</th>{discIds.map((d) => <td key={d}>{c.mtd.stops.breaks_count_by_discipline[d] ?? 0} / {hhmm(c.mtd.stops.breaks_hours_by_discipline[d] ?? 0)}</td>)}<td /><td>{c.mtd.stops.breaks_count} / {hhmm(c.mtd.stops.breaks_hours)}</td></tr>
        </tbody></table>

        <h2>{t("ops.stops.title")}</h2>
        <table><thead><tr><th>#</th><th>{t("ops.stops.duration")}</th><th>{t("ops.stops.start")}</th><th>{t("ops.stops.end")}</th><th>{t("ops.stops.type")}</th>
          <th>{t("ops.stops.section")}</th><th>{t("ops.stops.who")}</th><th>{t("ops.stops.details")}</th></tr></thead><tbody>
          {r.stops.map((x, i) => (
            <tr key={x.id} className="rca-keep"><td>{i + 1}</td><td>{hhmm(x.hours)}</td><td>{tm(x.started_at)}</td><td>{tm(x.ended_at)}</td><td>{t(`ops.stops.types.${x.event_type}`)}</td>
              <td>{sec(x.section_id)}</td><td>{x.parts.map((p) => `${disc(p.discipline_id)}${x.parts.length > 1 ? ` ${hhmm(p.hours)}` : ""}`).join(" + ")}</td><td>{x.reason}</td></tr>
          ))}
          {r.stops.length === 0 && <tr><td colSpan={8}>—</td></tr>}
        </tbody></table>

        <h2>{t("ops.runs.title")}</h2>
        <table><thead><tr><th>#</th><th>{t("ops.runs.duration")}</th><th>{t("ops.runs.start")}</th><th>{t("ops.runs.end")}</th><th>GSM</th><th>{t("ops.runs.speed")}</th>
          <th>{t("ops.runs.rate")}</th><th>{t("ops.runs.ideal")}</th><th>{t("ops.runs.reason")}</th><th>{t("ops.runs.gcHours")}</th><th>{t("ops.runs.gcReject")}</th></tr></thead><tbody>
          {r.segments.map((x, i) => (
            <tr key={x.id}><td>{i + 1}</td><td>{hhmm(x.hours)}</td><td>{tm(x.started_at)}</td><td>{tm(x.ended_at)}</td><td>{x.gsm}</td><td>{x.speed_mpm ?? ""}</td>
              <td>{x.ideal_mt_min}</td><td>{t3(x.ideal_mt)}</td><td>{x.reason}</td><td>{x.grade_change_hours ?? ""}</td><td>{x.grade_change_reject_mt ?? ""}</td></tr>
          ))}
          <tr style={{ fontWeight: 700 }}><td>{t("ops.tables.total")}</td><td>{hhmm(c.run_hours)}</td><td colSpan={5} /><td>{t3(c.ideal_mt)}</td><td colSpan={3} /></tr>
        </tbody></table>

        <table style={{ marginTop: 10 }}><tbody><tr>
          <td style={{ width: "50%", border: 0, paddingInlineStart: 0 }} className="rca-keep">
            <h2>{t("ops.tables.byGsm")}</h2>
            <table><tbody>{Object.entries(c.gross_by_gsm).map(([g, v]) => <tr key={g}><th>{g} gsm</th><td>{t3(v)}</td></tr>)}
              <tr style={{ fontWeight: 700 }}><th>{t("ops.tables.total")}</th><td>{t3(c.day.gross)}</td></tr></tbody></table>
            {r.utilities.map((u) => (
              <div key={u.template.id}>
                <h2>{t("ops.util.fromUt", { name: u.template.name })}</h2>
                <table><tbody>
                  {u.items.map((x) => P(`${x.label}${x.unit ? `, ${x.unit}` : ""}`, x.value === null ? "—" : `${x.value.toLocaleString(undefined, { maximumFractionDigits: x.decimals })}${x.per_ton !== null ? `  (${x.per_ton.toFixed(3)} /t)` : ""}`))}
                </tbody></table>
              </div>
            ))}
            <h2>{t("ops.util.notesTitle")}</h2>
            <table><tbody>{P(t("ops.util.broke"), String(r.broke_tower_pct ?? "—"))}</tbody></table>
          </td>
          <td style={{ width: "50%", border: 0, paddingInlineEnd: 0 }} className="rca-keep">
            <h2>OEE</h2>
            <table><tbody>
              {P(t("ops.tiles.run"), hhmm(c.run_hours))}
              {P(t("ops.tiles.availability"), `${pct(c.oee.availability)} (÷ ${c.oee.planned_hours} h)`)}
              {P(t("ops.tiles.ideal"), `${t3(c.ideal_mt)} t`)}
              {P(t("ops.tiles.performance"), pct(c.oee.performance))}
              {P(t("ops.tiles.quality"), `${pct(c.oee.quality)} (${t3(c.day.a)} ÷ ${t3(c.day.net)})`)}
              <tr style={{ fontWeight: 700 }}><th>OEE</th><td>{pct(c.oee.oee)}</td></tr>
            </tbody></table>
            <h2>{t("ops.losses.title")}</h2>
            <table><thead><tr><th>{t("ops.losses.kind")}</th><th>{t("ops.losses.defect")}</th><th>t</th><th>{t("ops.losses.disposition")}</th></tr></thead><tbody>
              {r.losses.map((x) => <tr key={x.id}><td>{t(`ops.losses.kinds.${x.kind}`)}</td><td>{[s.defects.find((d) => d.id === x.defect_id)?.name, x.defect_text].filter(Boolean).join(" – ")}</td><td>{t3(x.qty_mt)}</td><td>{x.disposition}</td></tr>)}
              {r.losses.length === 0 && <tr><td colSpan={4}>—</td></tr>}
            </tbody></table>
          </td>
        </tr></tbody></table>

        <h2>{t("ops.tiles.mtd")} · {t("ops.tiles.ytd")}</h2>
        <table><thead><tr><th /><th>{t("ops.tiles.gross")}</th><th>{t("ops.tiles.net")}</th><th>{t("ops.tiles.saleable")}</th><th>A</th><th>B</th><th>{t("ops.tiles.reject")}</th><th>{t("ops.tiles.trim")} %</th><th>OEE</th></tr></thead><tbody>
          {([[t("ops.tiles.day"), { days: 1, production: c.day, oee: c.oee }], [t("ops.tiles.mtd"), c.mtd], [t("ops.tiles.ytd"), c.ytd]] as const).map(([label, p]) => (
            <tr key={label}><th>{label}</th><td>{t3(p.production.gross)}</td><td>{t3(p.production.net)}</td><td>{t3(p.production.saleable)}</td><td>{t3(p.production.a)}</td>
              <td>{t3(p.production.b)}</td><td>{t3(p.production.reject)}</td><td>{pct(p.production.trim_pct, 2)}</td><td>{pct(p.oee.oee)}</td></tr>
          ))}
        </tbody></table>

        {r.notes && <><h2>{t("ops.util.notes")}</h2><div style={{ whiteSpace: "pre-wrap" }}>{r.notes}</div></>}
        <table style={{ marginTop: 14 }}><tbody><tr>
          <td>{t("ops.report.submittedBy", { who: r.submitted_by ?? "" })}<br />{r.submitted_at ? fmtDate(r.submitted_at, tz, true) : ""}</td>
          <td>{t("ops.report.confirmedBy", { who: r.confirmed_by ?? "" })}<br />{r.confirmed_at ? fmtDate(r.confirmed_at, tz, true) : ""}</td>
        </tr></tbody></table>
      </div>
    </>
  );
}
