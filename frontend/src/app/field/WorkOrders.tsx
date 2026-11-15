"use client";

// Field round, phase 2: work orders without internet. Engineers and supervisors create work orders; whoever may carry
// out the work starts it, fills the checklist and readings, books labour and parts, writes the findings and puts it
// on hold or sends it for review. Every change is kept on the phone and sent when online; the server answers what it
// applied and what someone else changed meanwhile (a conflict the user decides: keep mine / keep theirs).

import { Alert, Badge, Button, Card, Checkbox, Divider, Group, Modal, NumberInput, Select, Stack, Text, Textarea, TextInput, Title } from "@mantine/core";
import { IconAlertTriangle, IconPlayerPause, IconPlayerPlay, IconSend, IconTrash } from "@tabler/icons-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { addLabor, addPart, addWorkOrder, checkOk, draftOf, editWo, FIELD_NAMES, resolveConflict, setCheck, setField, viewWo,
  type AnyItem, type CAsset, type Catalog, type CCheck, type Conflict, type CWo, type FieldName, type WoSyncItem } from "@/lib/offline";

const PR_COLOR: Record<string, string> = { P1: "red", P2: "orange", P3: "blue", P4: "gray" };
const ST_COLOR: Record<string, string> = { in_progress: "blue", on_hold: "yellow", awaiting_review: "grape", triage: "orange", approved: "teal", scheduled: "teal", planned: "teal" };
const FIELD_KEY: Record<FieldName, string> = { findings: "wo.findings", corrective_action: "wo.correctiveAction", root_cause: "wo.rootCause", recommendations: "wo.recommendations", downtime_hours: "fwo.downtime" };

export const canExecute = (cat: Catalog, w: CWo) => !!cat.perms?.execute && (w.mine || !!cat.perms?.assign);
const unsentFor = (items: AnyItem[], id: string) => items.filter((i): i is WoSyncItem => i.kind === "wo_sync" && i.wo_ref === id && i.status !== "sent");

/** Badge on a work order: changes waiting on the phone, or a conflict to decide. */
export function WoFlag({ items, id }: { items: AnyItem[]; id: string }) {
  const { t } = useTranslation();
  const u = unsentFor(items, id);
  if (u.some((i) => i.status === "conflict")) return <Badge size="sm" color="red" leftSection={<IconAlertTriangle size={12} />}>{t("fwo.conflict")}</Badge>;
  if (u.length) return <Badge size="sm" color="orange" variant="light">{t("fwo.waiting")}</Badge>;
  return null;
}

export function WoList({ cat, items, onOpen }: { cat: Catalog; items: AnyItem[]; onOpen: (id: string) => void }) {
  const { t } = useTranslation();
  const [q, setQ] = useState("");
  const wos = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return (cat.wos ?? []).map((w) => viewWo(w, items)).filter((w) => {
      const h = `${w.n} ${w.ac} ${w.an} ${w.t}`.toLowerCase();
      return words.every((x) => h.includes(x));
    });
  }, [cat, items, q]);
  return (
    <Stack gap="xs" data-testid="fwo-list">
      <TextInput placeholder={t("fwo.search")} value={q} onChange={(e) => setQ(e.currentTarget.value)} />
      {wos.length === 0 && <Text size="sm" c="dimmed">{t("fwo.none")}</Text>}
      {wos.map((w) => (
        <Card key={w.id} withBorder padding="xs" style={{ cursor: "pointer" }} onClick={() => onOpen(w.id)} data-testid="fwo-item">
          <Group justify="space-between" wrap="nowrap" align="start">
            <div style={{ minWidth: 0 }}>
              <Text size="sm" fw={700}><span className="mono">{w.local ? t("fwo.newLocal") : w.n}</span> · {w.ac}</Text>
              <Text size="sm" lineClamp={2}>{w.t}</Text>
              <Group gap={4} mt={4}>
                <Badge size="xs" color={ST_COLOR[w.s] ?? "gray"} variant="light">{t(`status.${w.s}`, { defaultValue: w.s })}</Badge>
                {w.ty === "emergency" && <Badge size="xs" color="red">{t("woType.emergency")}</Badge>}
                {!w.mine && <Badge size="xs" variant="outline" color="gray">{t("fwo.notMine")}</Badge>}
                <WoFlag items={items} id={w.id} />
              </Group>
            </div>
            <Badge color={PR_COLOR[w.pr] ?? "gray"} variant="filled" style={{ flexShrink: 0, overflow: "visible" }}>{w.pr}</Badge>
          </Group>
        </Card>
      ))}
    </Stack>
  );
}

/** New work order on the phone (no internet needed). */
export function WoForm({ cat, a, online, onClose, onSaved }: { cat: Catalog; a: CAsset; online: boolean; onClose: () => void; onSaved: (localId: string, startNow: boolean) => void }) {
  const { t } = useTranslation();
  const symptoms = cat.codes.filter((c) => c.k === "symptom");
  const byId = new Map(cat.codes.map((c) => [c.id, c]));
  const [f, setF] = useState({ type: "corrective", symptom: null as string | null, title: "", description: "", priority: "P3", me: !!cat.perms?.execute });
  const [busy, setBusy] = useState(false);
  const emergency = f.type === "emergency";
  const save = async () => {
    setBusy(true);
    try {
      const id = await addWorkOrder(cat, a, {
        type: f.type, title: f.title.trim(), description: f.description.trim() || null, symptoms: f.symptom ? byId.get(f.symptom)?.t ?? null : null,
        symptom_code_id: f.symptom, problem_code_id: null, priority: emergency ? "P1" : f.priority,
      }, f.me);
      onSaved(id, emergency && f.me);
    } finally { setBusy(false); }
  };
  return (
    <Modal opened onClose={onClose} title={`${t("wo.new")} · ${a.c}`} fullScreen>
      <Stack>
        <Select label={t("common.type")} allowDeselect={false} value={f.type} onChange={(v) => setF({ ...f, type: v ?? "corrective" })}
          data={["corrective", "emergency", "inspection", "improvement"].map((x) => ({ value: x, label: t(`woType.${x}`) }))} data-testid="fwo-type" />
        {symptoms.length > 0 && <Select label={t("wo.symptoms")} searchable clearable placeholder={t("fm.pickSymptom")} value={f.symptom}
          onChange={(v) => setF({ ...f, symptom: v, title: f.title || (v ? byId.get(v)?.t ?? "" : "") })} data={symptoms.map((c) => ({ value: c.id, label: c.t }))} />}
        <TextInput label={t("wo.title")} required value={f.title} onChange={(e) => setF({ ...f, title: e.currentTarget.value })} data-testid="fwo-title" />
        <Textarea label={t("common.description")} autosize minRows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.currentTarget.value })} />
        {!emergency && <Select label={t("common.priority")} data={["P1", "P2", "P3", "P4"]} value={f.priority} allowDeselect={false} onChange={(v) => setF({ ...f, priority: v ?? "P3" })} />}
        {cat.perms?.execute && <Checkbox label={t("fwo.assignMe")} checked={f.me} onChange={(e) => setF({ ...f, me: e.currentTarget.checked })} data-testid="fwo-me" />}
        <Text size="xs" c="dimmed">{emergency ? (f.me ? t("fwo.emergencyStart") : t("fwo.emergencyNoStart")) : t("fwo.needsApproval")}</Text>
        {emergency && !online && <Alert color="red">{t("field.callToo")}</Alert>}
        <Button size="md" loading={busy} disabled={f.title.trim().length < 3} onClick={() => void save()} className="tap-target" data-testid="fwo-save">
          {online ? t("field.saveSend") : t("field.saveLater")}</Button>
        <Button variant="subtle" color="gray" onClick={onClose}>{t("common.cancel")}</Button>
      </Stack>
    </Modal>
  );
}

function CheckLine({ it, enabled, onSet }: { it: CCheck; enabled: boolean; onSet: (v: { is_done: boolean; is_ok: boolean | null; reading_value: number | null; remark: string | null }) => void }) {
  const { t } = useTranslation();
  const range = it.k === "reading" && (it.min !== null || it.max !== null) ? `${it.min ?? "…"} – ${it.max ?? "…"} ${it.u ?? ""}` : null;
  const out = it.k === "reading" && it.val !== null && checkOk(it, true, null, it.val) === false;
  const set = (p: Partial<{ is_done: boolean; is_ok: boolean | null; reading_value: number | null; remark: string | null }>) =>
    onSet({ is_done: it.done, is_ok: it.ok, reading_value: it.val, remark: it.rem, ...p });
  return (
    <Card withBorder padding="xs" data-testid="fwo-check">
      <Group justify="space-between" wrap="nowrap" align="start" gap="xs">
        <Text size="sm" fw={600} style={{ flex: 1 }}>{it.d}{it.req && <Text span c="red"> *</Text>}</Text>
        {it.pending && <Badge size="xs" color="orange" variant="dot">{t("fwo.notSent")}</Badge>}
      </Group>
      {it.by && !it.pending && <Text size="xs" c="dimmed">{t("fwo.doneBy", { name: it.by })}</Text>}
      {it.k === "reading" ? (
        <Group gap="xs" mt={4} wrap="nowrap" align="end">
          <NumberInput key={`${it.id}-${it.val}`} size="sm" style={{ flex: 1 }} disabled={!enabled} decimalScale={3} defaultValue={it.val ?? undefined}
            label={range ? t("fwo.range", { range }) : it.u ?? undefined} error={out ? t("fwo.outOfRange") : undefined}
            onBlur={(e) => { const raw = e.currentTarget.value.replace(",", "."); const v = raw.trim() === "" ? null : Number(raw);
              if (v !== null && Number.isNaN(v)) return; if (v !== it.val) set({ reading_value: v, is_done: v !== null, is_ok: null }); }} data-testid="fwo-reading" />
        </Group>
      ) : (
        <Group gap="xs" mt={4}>
          <Button size="compact-sm" disabled={!enabled} color="green" variant={it.done && it.ok !== false ? "filled" : "default"}
            onClick={() => set(it.done && it.ok !== false ? { is_done: false, is_ok: null } : { is_done: true, is_ok: true })} data-testid="fwo-ok">{t("fwo.ok")}</Button>
          <Button size="compact-sm" disabled={!enabled} color="red" variant={it.done && it.ok === false ? "filled" : "default"}
            onClick={() => set(it.done && it.ok === false ? { is_done: false, is_ok: null } : { is_done: true, is_ok: false })}>{t("fwo.notOk")}</Button>
        </Group>
      )}
      <TextInput key={`${it.id}-rem-${it.rem}`} size="xs" mt={6} placeholder={t("fwo.remark")} disabled={!enabled} defaultValue={it.rem ?? ""}
        onBlur={(e) => { const v = e.currentTarget.value.trim() || null; if (v !== (it.rem ?? null)) set({ remark: v }); }} />
    </Card>
  );
}

const SB_KEY: Record<string, string> = { safety: "fwo.sbSafety", permit: "fwo.sbPermit", approval: "fwo.sbApproval", permission: "fwo.sbPermission" };

/** One work order on the phone: start, checklist and readings, labour, parts, findings, hold / submit. */
export function WoScreen({ cat, id, items, onClose, onChanged }: { cat: Catalog; id: string; items: AnyItem[]; onClose: () => void; onChanged: () => void }) {
  const { t } = useTranslation();
  const base = cat.wos?.find((w) => w.id === id);
  const [lab, setLab] = useState({ hours: "" as string | number, ot: false, note: "" });
  const [pt, setPt] = useState({ part: null as string | null, text: "", qty: 1 as string | number });
  const [comment, setComment] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const partById = useMemo(() => new Map((cat.parts ?? []).map((p) => [p.id, p])), [cat.parts]);
  const partData = useMemo(() => (cat.parts ?? []).map((p) => ({ value: p.id, label: `${p.c} · ${p.n}` })), [cat.parts]);
  if (!base) return null;
  const w = viewWo(base, items);
  const draft = draftOf(items, id);
  const may = canExecute(cat, w);
  const running = w.s === "in_progress";
  const exec = may && (running || w.s === "on_hold");
  const edit = async (fn: Parameters<typeof editWo>[1]) => {
    setErr(null);
    try { await editWo(id, fn); onChanged(); } catch (e) { setErr((e as Error).message); }
  };
  const missing = w.cl.filter((c) => c.req && !c.done).length;
  const finish = (to: "on_hold" | "awaiting_review") => {
    if (to === "awaiting_review" && missing && !window.confirm(t("fwo.missingConfirm", { n: missing }))) return;
    void edit((b) => { b.finish = to; });
  };
  return (
    <Modal opened onClose={onClose} fullScreen title={<Text fw={700}>{w.local ? t("fwo.newLocal") : w.n} · {w.ac}</Text>}>
      <Stack gap="sm" data-testid="fwo-screen">
        <div>
          <Title order={4}>{w.t}</Title>
          <Text size="sm" c="dimmed">{w.an}</Text>
          <Group gap={4} mt={4}>
            <Badge color={ST_COLOR[w.s] ?? "gray"} data-testid="fwo-status">{t(`status.${w.s}`, { defaultValue: w.s })}</Badge>
            <Badge color={PR_COLOR[w.pr] ?? "gray"} variant="light">{w.pr}</Badge>
            <Badge variant="outline">{t(`woType.${w.ty}`, { defaultValue: w.ty })}</Badge>
            {w.due && <Badge variant="outline" color="gray">{t("fwo.due", { date: w.due })}</Badge>}
          </Group>
        </div>
        {w.local && <Alert color="orange">{t("fwo.localHint")}</Alert>}
        {draft && <Alert color="orange" variant="light">{t("fwo.draftHint")}</Alert>}
        {(w.desc || w.sym) && <Text size="sm" style={{ whiteSpace: "pre-wrap" }}>{[w.sym, w.desc].filter(Boolean).join("\n")}</Text>}
        {(w.safety || w.loto || w.permit) && (
          <Alert color="yellow" icon={<IconAlertTriangle />} title={t("fwo.safety")}>
            {[w.loto && "LOTO", w.permit && t("fwo.permit"), w.safety].filter(Boolean).join(" · ")}
            {(w.loto || w.permit) && <Text size="xs">{w.signed ? t("fwo.signed") : t("fwo.notSigned")}</Text>}
          </Alert>
        )}
        {!may && <Alert color="gray">{t("fwo.viewOnly")}</Alert>}
        {err && <Alert color="red">{err}</Alert>}

        {may && !running && w.s !== "on_hold" && w.s !== "awaiting_review" && (
          w.sb ? <Alert color="orange" data-testid="fwo-blocked">{t(SB_KEY[w.sb] ?? "fwo.sbApproval")}</Alert> : (
            <Button size="lg" leftSection={<IconPlayerPlay />} onClick={() => void edit((b) => { b.start = true; })} className="tap-target" data-testid="fwo-start">{t("fwo.start")}</Button>
          ))}
        {may && w.s === "on_hold" && (
          <Button size="md" variant="light" leftSection={<IconPlayerPlay />} onClick={() => void edit((b) => { if (b.finish === "on_hold") b.finish = null; else b.start = true; })}>{t("fwo.resume")}</Button>
        )}
        {w.s === "awaiting_review" && (
          <Alert color="grape">{t("fwo.submitted")}{draft?.batch.finish === "awaiting_review" && (
            <Button size="compact-xs" variant="subtle" ms="xs" onClick={() => void edit((b) => { b.finish = null; })}>{t("fwo.undo")}</Button>)}</Alert>
        )}

        {w.cl.length > 0 && <Divider label={t("fwo.checklist", { done: w.cl.filter((c) => c.done).length, n: w.cl.length })} labelPosition="left" />}
        {w.cl.map((c) => <CheckLine key={c.id} it={c} enabled={exec} onSet={(v) => void edit((b, bw) => setCheck(b, bw, c.id, v))} />)}

        <Divider label={t("fwo.labour")} labelPosition="left" />
        {w.lab.map((l, i) => (
          <Group key={i} gap="xs" wrap="nowrap">
            <Text size="sm" className="mono">{l.d}</Text><Text size="sm" fw={600}>{l.h} h{l.ot ? ` · ${t("fwo.ot")}` : ""}</Text>
            <Text size="xs" c="dimmed" lineClamp={1} style={{ flex: 1 }}>{l.who ?? ""} {l.no ?? ""}</Text>
            {l.pending && <Badge size="xs" color="orange" variant="dot">{t("fwo.notSent")}</Badge>}
          </Group>
        ))}
        {exec && (
          <Group gap="xs" align="end" wrap="nowrap">
            <NumberInput size="sm" w={90} label={t("fwo.hours")} min={0.25} max={24} step={0.5} decimalScale={2} value={lab.hours} onChange={(v) => setLab({ ...lab, hours: v })} data-testid="fwo-hours" />
            <TextInput size="sm" style={{ flex: 1 }} label={t("fwo.note")} value={lab.note} onChange={(e) => setLab({ ...lab, note: e.currentTarget.value })} />
            <Checkbox size="sm" mb={8} label={t("fwo.ot")} checked={lab.ot} onChange={(e) => setLab({ ...lab, ot: e.currentTarget.checked })} />
            <Button size="sm" disabled={!(Number(lab.hours) > 0 && Number(lab.hours) <= 24)} data-testid="fwo-add-hours"
              onClick={() => { const h = Number(lab.hours); void edit((b) => addLabor(b, h, lab.ot, lab.note.trim() || null)); setLab({ hours: "", ot: false, note: "" }); }}>{t("common.add")}</Button>
          </Group>
        )}

        <Divider label={t("used.title")} labelPosition="left" />
        {w.parts.map((p, i) => (
          <Group key={i} gap="xs" wrap="nowrap">
            <Text size="sm" fw={600}>{p.q} {p.u}</Text><Text size="sm" lineClamp={1} style={{ flex: 1 }}>{[p.c, p.n].filter(Boolean).join(" · ")}</Text>
            {p.pending && <Badge size="xs" color="orange" variant="dot">{t("fwo.notSent")}</Badge>}
          </Group>
        ))}
        {exec && (
          <Stack gap={6}>
            {partData.length > 0 && <Select size="sm" searchable clearable limit={30} placeholder={t("fwo.pickPart")} value={pt.part} data={partData}
              onChange={(v) => setPt({ ...pt, part: v })} nothingFoundMessage={t("fwo.noPart")} />}
            {!pt.part && <TextInput size="sm" placeholder={t("fwo.partText")} value={pt.text} onChange={(e) => setPt({ ...pt, text: e.currentTarget.value })} data-testid="fwo-part-text" />}
            <Group gap="xs" align="end" wrap="nowrap">
              <NumberInput size="sm" w={100} label={t("fwo.qty")} min={0.001} decimalScale={3} value={pt.qty} onChange={(v) => setPt({ ...pt, qty: v })} />
              <Button size="sm" disabled={!(Number(pt.qty) > 0) || (!pt.part && pt.text.trim().length < 2)} data-testid="fwo-add-part"
                onClick={() => { const p = pt.part ? partById.get(pt.part) : undefined; const q = Number(pt.qty);
                  void edit((b) => addPart(b, { part_id: p?.id ?? null, description: p ? `${p.c} · ${p.n}` : pt.text.trim(), quantity: q, uom: p?.u ?? null }));
                  setPt({ part: null, text: "", qty: 1 }); }}>{t("common.add")}</Button>
            </Group>
          </Stack>
        )}

        <Divider label={t("fwo.report")} labelPosition="left" />
        {FIELD_NAMES.map((name) => name === "downtime_hours" ? (
          <NumberInput key={`${name}-${w.f[name]}`} label={t(FIELD_KEY[name])} min={0} decimalScale={2} disabled={!exec} defaultValue={w.f[name] ?? undefined}
            onBlur={(e) => { const raw = e.currentTarget.value.replace(",", ".").trim(); const v = raw === "" ? null : Number(raw);
              if (v !== null && (Number.isNaN(v) || v < 0)) return; if (v !== (w.f[name] ?? null)) void edit((b, bw) => setField(b, bw, name, v)); }} />
        ) : (
          <Textarea key={`${name}-${w.f[name]}`} label={t(FIELD_KEY[name])} autosize minRows={name === "findings" ? 2 : 1} disabled={!exec} defaultValue={(w.f[name] as string | null) ?? ""}
            description={name === "root_cause" && w.ty === "emergency" ? t("fwo.rootCauseHint") : undefined} data-testid={`fwo-${name}`}
            onBlur={(e) => { const v = e.currentTarget.value.trim() || null; if (v !== ((w.f[name] as string | null) ?? null)) void edit((b, bw) => setField(b, bw, name, v)); }} />
        ))}
        {may && (
          <Group gap="xs" align="end" wrap="nowrap">
            <Textarea style={{ flex: 1 }} autosize minRows={1} label={t("fwo.comment")} value={comment} onChange={(e) => setComment(e.currentTarget.value)} />
            <Button size="sm" disabled={!comment.trim()} onClick={() => { const c = comment.trim(); void edit((b) => { b.comments.push(c); }); setComment(""); }}>{t("common.add")}</Button>
          </Group>
        )}
        {draft && draft.batch.comments.map((c, i) => <Text key={i} size="xs" c="dimmed">💬 {c} · {t("fwo.notSent")}</Text>)}

        {exec && (
          <Stack gap="xs" mt="sm">
            <Button size="md" color="grape" leftSection={<IconSend size={18} />} onClick={() => finish("awaiting_review")} className="tap-target" data-testid="fwo-submit">{t("fwo.submit")}</Button>
            {running && <Button variant="light" color="yellow" leftSection={<IconPlayerPause size={18} />} onClick={() => finish("on_hold")} data-testid="fwo-hold">{t("fwo.hold")}</Button>}
          </Stack>
        )}
        <Text size="xs" c="dimmed">{t("fwo.online")}</Text>
        <Button variant="subtle" color="gray" onClick={onClose}>{t("common.close")}</Button>
      </Stack>
    </Modal>
  );
}

function show(v: unknown, t: (k: string, o?: Record<string, unknown>) => string): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "object") {
    const c = v as { done?: boolean; val?: number | null; rem?: string | null; by?: string | null };
    const main = c.val !== null && c.val !== undefined ? String(c.val) : c.done ? t("fwo.ok") : t("fwo.open");
    return [main, c.rem, c.by && t("fwo.doneBy", { name: c.by })].filter(Boolean).join(" · ");
  }
  return String(v);
}

/** The server's answer for one batch: each conflict with yours / theirs and the user's choice. */
export function ConflictCard({ cat, it, onChanged }: { cat: Catalog; it: WoSyncItem; onChanged: () => void }) {
  const { t } = useTranslation();
  const w = cat.wos?.find((x) => x.id === it.wo_ref);
  const open = (it.conflicts ?? []).filter((c) => !(it.resolved ?? []).includes(c.key));
  const label = (c: Conflict) => {
    const [kind, k] = c.key.split(":");
    if (kind === "check") return w?.cl.find((x) => x.id === k)?.d ?? c.label ?? t("fwo.checkLine");
    if (kind === "field") return t(FIELD_KEY[k as FieldName] ?? k!);
    if (kind === "labor") { const l = it.batch.labor[Number(k)]; return `${t("fwo.labour")}: ${l?.hours ?? "?"} h`; }
    if (kind === "part") { const p = it.batch.parts[Number(k)]; return `${t("used.title")}: ${p?.quantity ?? ""} ${p?.description ?? ""}`; }
    if (kind === "comment") return t("fwo.comment");
    if (kind === "start") return t("fwo.start");
    if (kind === "finish") return it.batch.finish === "on_hold" ? t("fwo.hold") : t("fwo.submit");
    return c.key;
  };
  const go = async (c: Conflict, keep: "mine" | "theirs") => { await resolveConflict(it.id, c.key, keep); onChanged(); };
  return (
    <Stack gap={6} mt={6} data-testid="fwo-conflicts">
      <Text size="xs" c="red" fw={600}>{t("fwo.conflictHint", { n: open.length })}</Text>
      {open.map((c) => {
        const changed = c.code === "changed";
        return (
          <Card key={c.key} withBorder padding={6} bg="var(--mantine-color-red-light)">
            <Text size="sm" fw={600}>{label(c)}</Text>
            {changed ? (<>
              <Text size="xs">{t("fwo.yours")}: <b>{show(c.mine, t)}</b></Text>
              <Text size="xs">{t("fwo.theirs")}: <b>{show(c.theirs, t)}</b></Text>
            </>) : <Text size="xs">{c.code === "held_back" ? t("fwo.heldBack") : c.message}</Text>}
            <Group gap={6} mt={4}>
              <Button size="compact-xs" onClick={() => void go(c, "mine")} data-testid="fwo-keep-mine">{changed ? t("fwo.keepMine") : t("fwo.tryAgain")}</Button>
              <Button size="compact-xs" variant="default" leftSection={changed ? undefined : <IconTrash size={12} />} onClick={() => void go(c, "theirs")} data-testid="fwo-keep-theirs">
                {changed ? t("fwo.keepTheirs") : t("fwo.discard")}</Button>
            </Group>
          </Card>
        );
      })}
    </Stack>
  );
}

