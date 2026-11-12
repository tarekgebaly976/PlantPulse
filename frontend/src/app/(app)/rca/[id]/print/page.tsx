"use client";

import { Button, Group } from "@mantine/core";
import { IconArrowBack, IconPrinter } from "@tabler/icons-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslation } from "react-i18next";
import { FishboneDiagram, ReasonText, WhysView, type Why } from "@/components/Rca";
import { Loading } from "@/components/ui";
import { fmtDate, fmtMoney, fmtNum, useQ } from "@/lib/hooks";
import { useSession } from "@/lib/session";
import type { RcaDetail } from "../page";

const W_KEYS = ["what", "where", "when", "who", "which", "how"] as const;

/** One RCA on A4, in the standard order: problem (5W1H), fishbone, 5 Whys, root causes, action plan, effectiveness and sign-off. The browser
 * prints it (or saves it as PDF), so Arabic and Bengali text and right-to-left layout come out right. */
export default function RcaPrint() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const { plant } = useSession();
  const q = useQ<RcaDetail>(`/rca/${id}`);
  if (!q.data) return <Loading />;
  const d = q.data;
  const r = d.rca;
  const tz = plant?.timezone;
  const whys = (r.whys ?? []).filter((w: Why) => w.text.trim());
  const verified = r.fishbone.filter((b) => b.status === "verified" && b.text.trim());
  return (
    <>
      <Group className="no-print" mb="md" justify="space-between">
        <Button component={Link} href={`/rca/${id}`} variant="default" leftSection={<IconArrowBack size={16} />}>{t("common.back")}</Button>
        <Button leftSection={<IconPrinter size={16} />} onClick={() => window.print()}>{t("rca.print.now")}</Button>
      </Group>
      <div className="rca-sheet">
        <table style={{ border: 0, marginBottom: 6 }}><tbody><tr>
          <td style={{ border: 0, padding: 0 }}>
            <h1>{t("rca.print.title")}</h1>
            <div style={{ fontSize: 14, fontWeight: 600, marginTop: 2 }}>{r.number} · {r.title}</div>
          </td>
          <td style={{ border: 0, padding: 0, textAlign: "end", whiteSpace: "nowrap" }}>
            <div style={{ fontWeight: 700 }}>{plant?.plant_name}</div>
            <div>{t("common.status")}: {t(`status.${r.status}`)}</div>
            <div>{t("rca.print.printed")}: {fmtDate(new Date().toISOString(), tz)}</div>
          </td>
        </tr></tbody></table>

        <table className="rca-keep"><tbody>
          <tr><th>{t("common.asset")}</th><td>{d.asset ? `${d.asset.code} ${d.asset.name} (${d.asset.criticality})` : "—"}</td>
            <th>{t("rca.cols.failureMode")}</th><td>{d.failure_mode ? `${d.failure_mode.code} ${d.failure_mode.description}` : "—"}</td></tr>
          <tr><th>{t("rca.cols.leader")}</th><td>{r.leader ?? "—"}</td><th>{t("rca.flow.team")}</th><td>{d.team.map((m) => m.name + (m.role_note ? ` (${m.role_note})` : "")).join(", ") || "—"}</td></tr>
          <tr><th>{t("rca.info.started")}</th><td>{fmtDate(r.started_at, tz)}</td><th>{t("rca.cols.due")}</th><td>{r.due_date ?? "—"}</td></tr>
          <tr><th>{t("rca.cols.trigger")}</th><td colSpan={3}>{r.trigger_reasons.filter((x) => x.rule !== "repeat_linked").map((x, i) => <div key={i}>• <ReasonText r={x} /></div>)}</td></tr>
          <tr><th>{t("rca.info.totals")}</th><td colSpan={3}>{t("rca.cols.downtime")}: <b>{fmtNum(d.totals.downtime_hours)}</b> · {t("rca.info.loss")}: <b>{fmtNum(d.totals.production_loss_tons)}</b> · {t("common.cost")}: <b>{fmtMoney(d.totals.cost, d.totals.currency)}</b> · {t("rca.info.workOrders")}: {d.work_orders.map((w) => w.number).join(", ")}</td></tr>
        </tbody></table>

        <h2>{t("rca.tabs.problem")}</h2>
        <table className="rca-keep"><tbody>
          {W_KEYS.map((k) => <tr key={k}><th style={{ width: "22%" }}>{t(`rca.w.${k}`)}</th><td>{r.problem[k] || "—"}</td></tr>)}
          {r.problem_statement && <tr><th>{t("rca.w.statement")}</th><td><b>{r.problem_statement}</b></td></tr>}
        </tbody></table>
        {r.timeline.length > 0 && <div className="rca-keep" style={{ marginTop: 4 }}><b>{t("rca.w.timeline")}:</b>{" "}
          {[...r.timeline].sort((a, b) => (a.at ?? "").localeCompare(b.at ?? "")).map((e) => `${e.at ? fmtDate(e.at, tz, true) : ""} ${e.text}`).join(" → ")}</div>}

        {r.fishbone.length > 0 && <><h2>{t("rca.tabs.fishbone")}</h2>
          <div className="rca-keep"><FishboneDiagram bones={r.fishbone} problem={r.problem_statement || r.problem.what || r.title} /></div>
          {verified.length > 0 && <div>{t("rca.fish.st.verified")}: {verified.map((b) => `${t(`rca.fish.cat.${b.category}`)} – ${b.text}`).join("; ")}</div>}</>}

        {whys.length > 0 && <><h2>{t("rca.tabs.whys")}</h2><div className="rca-keep"><WhysView value={whys} /></div></>}

        <h2>{t("rca.tabs.rootCauses")}</h2>
        <table className="rca-keep"><tbody>
          {r.root_causes.length ? r.root_causes.map((c) => <tr key={c.id}><th style={{ width: "30%" }}>{t(`rca.rc.type.${c.type}`)}</th><td>{c.text}</td></tr>)
            : <tr><td>—</td></tr>}
        </tbody></table>
        {r.analysis_summary && <p style={{ margin: "4px 0" }}><b>{t("rca.rc.summary")}:</b> {r.analysis_summary}</p>}

        <h2>{t("rca.tabs.actions")}</h2>
        <table>
          <thead><tr><th>#</th><th>{t("rca.act.description")}</th><th>{t("rca.act.kind")}</th><th>{t("rca.act.owner")}</th><th>{t("rca.act.due")}</th><th>{t("common.status")}</th><th>{t("rca.act.result")}</th></tr></thead>
          <tbody>{d.actions.map((a) => (
            <tr key={a.id} className="rca-keep"><td>{a.seq}</td><td>{a.description}{a.work_order ? ` (${a.work_order.number})` : ""}</td><td>{t(`rca.act.kinds.${a.kind}`)}</td>
              <td>{a.owner ?? "—"}</td><td>{a.due_date ?? "—"}</td><td>{t(`status.${a.status}`)}{a.done_at ? ` ${fmtDate(a.done_at, tz)}` : ""}</td><td>{a.completion_note ?? ""}</td></tr>))}
            {!d.actions.length && <tr><td colSpan={7}>—</td></tr>}
          </tbody>
        </table>

        <h2>{t("rca.eff.title")}</h2>
        <div className="rca-keep">
          {r.effectiveness_due ? <div>{t("rca.eff.title")}: {fmtDate(r.actions_done_at, tz)} → {r.effectiveness_due}</div> : null}
          {r.recurrence_count > 0 && <div>{t("rca.eff.recurrences", { n: r.recurrence_count })}</div>}
          {r.effectiveness_result && <div><b>{t(`rca.eff.${r.effectiveness_result}`)}</b>{r.effectiveness_note ? ` – ${r.effectiveness_note}` : ""}</div>}
          {r.lessons_learned && <p style={{ margin: "4px 0" }}><b>{t("rca.rc.lessons")}:</b> {r.lessons_learned}</p>}
        </div>

        <h2>{t("rca.print.signatures")}</h2>
        <table className="rca-keep"><tbody><tr style={{ height: 44 }}>
          <td style={{ width: "33%" }}>{t("rca.cols.leader")}: {r.leader ?? ""}</td>
          <td style={{ width: "33%" }}>{t("rca.info.approvedBy")}: {r.approved_by ?? ""}{r.approved_at ? ` · ${fmtDate(r.approved_at, tz)}` : ""}</td>
          <td>{t("status.closed")}: {r.closed_by ?? ""}{r.closed_at ? ` · ${fmtDate(r.closed_at, tz)}` : ""}</td>
        </tr></tbody></table>
      </div>
    </>
  );
}
