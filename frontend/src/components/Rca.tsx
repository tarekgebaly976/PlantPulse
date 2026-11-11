"use client";

import { ActionIcon, Badge, Button, Checkbox, Group, Modal, Select, Stack, Text, TextInput, Textarea, Tooltip } from "@mantine/core";
import { IconCornerDownRight, IconPlus, IconTrash } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { post } from "@/lib/api";
import { useMut } from "@/lib/hooks";
import { AssetPicker } from "./ui";

export type Reason = { rule: string; value?: number; limit?: number; days?: number; criticality?: string; failure_mode?: string | null; by?: string; work_order?: string | null; currency?: string };
export type Why = { id: string; parent_id: string | null; text: string; is_root?: boolean };
export type Bone = { id: string; category: Cat; text: string; status: "possible" | "verified" | "ruled_out" };
export type RootCause = { id: string; type: "physical" | "human" | "latent"; text: string };
export type Cat = (typeof CATS)[number];

export const CATS = ["man", "machine", "method", "material", "measurement", "environment"] as const;
export const uid = () => Math.random().toString(36).slice(2, 10);

/** Why the RCA was proposed, in the user's language. */
export function ReasonText({ r }: { r: Reason }) {
  const { t } = useTranslation();
  const n = (v: number | undefined) => (v === undefined ? "" : v.toLocaleString(undefined, { maximumFractionDigits: 2 }));
  const txt = t(`rca.reasons.${r.rule}`, {
    value: n(r.value), limit: n(r.limit), days: r.days, criticality: r.criticality, mode: r.failure_mode ?? "", by: r.by ?? "", wo: r.work_order ?? "",
    defaultValue: r.rule,
  });
  return <>{txt}{r.work_order && r.rule !== "repeat_linked" ? <Text span c="dimmed" size="xs"> · {r.work_order}</Text> : null}</>;
}

export function ReasonBadges({ reasons }: { reasons: Reason[] }) {
  const color: Record<string, string> = { downtime: "orange", repeat: "red", failure_mode: "grape", production_loss: "yellow", cost: "yellow", safety: "red", manual: "blue" };
  return <Group gap={4}>{reasons.filter((r) => r.rule !== "repeat_linked").map((r, i) => (
    <Badge key={i} variant="light" color={color[r.rule] ?? "gray"} tt="none" fw={500} styles={{ label: { overflow: "visible", whiteSpace: "normal" } }}><ReasonText r={r} /></Badge>
  ))}</Group>;
}

/** "Request RCA" on a work order (or for an asset, from the register). The manager decides. */
export function RequestRca({ woId, button }: { woId?: string; button?: ReactNode }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [asset, setAsset] = useState<string | null>(null);
  const m = useMut(() => post<{ id: string }>("/rca", { work_order_id: woId ?? null, asset_id: woId ? null : asset, note }), {
    success: t("rca.requested"), onDone: (r) => { setOpen(false); router.push(`/rca/${r.id}`); },
  });
  return (
    <>
      {button ? <span onClick={() => setOpen(true)}>{button}</span> : <Button variant="light" color="grape" onClick={() => setOpen(true)}>{t("rca.request")}</Button>}
      <Modal opened={open} onClose={() => setOpen(false)} title={t("rca.requestTitle")}>
        <Stack>
          <Text size="sm" c="dimmed">{t("rca.requestHint")}</Text>
          {!woId && <AssetPicker value={asset} onChange={setAsset} label={t("rca.requestAsset")} required />}
          <Textarea label={t("rca.requestWhy")} autosize minRows={3} value={note} onChange={(e) => setNote(e.currentTarget.value)} required />
          <Button loading={m.isPending} disabled={note.trim().length < 3 || (!woId && !asset)} onClick={() => m.mutate(undefined)}>{t("common.submit")}</Button>
        </Stack>
      </Modal>
    </>
  );
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Ishikawa (fishbone) diagram drawn from the causes: the problem is the head, the 6M are the bones. Prints well. */
export function FishboneDiagram({ bones, problem }: { bones: Bone[]; problem: string }) {
  const { t } = useTranslation();
  const top: Cat[] = ["man", "method", "machine"];
  const bottom: Cat[] = ["material", "measurement", "environment"];
  const by = (c: Cat) => bones.filter((b) => b.category === c && b.text.trim());
  const rowH = 19;
  const maxN = Math.max(3, ...CATS.map((c) => by(c).length));
  const half = 50 + maxN * rowH;
  const W = 1100, H = half * 2 + 20, spine = H / 2, headX = 900;
  const xs = [360, 630, 890];
  const slant = 120;
  const color = (b: Bone) => (b.status === "verified" ? "#c92a2a" : b.status === "ruled_out" ? "#adb5bd" : "#343a40");
  const branch = (c: Cat, i: number, up: boolean) => {
    const x1 = xs[i] ?? 0, y1 = spine, x0 = x1 - slant, y0 = up ? 30 : H - 30;
    const items = by(c);
    return (
      <g key={c}>
        <line x1={x0} y1={y0} x2={x1} y2={y1} stroke="#1c7ed6" strokeWidth={2.5} />
        <text x={x0} y={up ? y0 - 10 : y0 + 20} textAnchor="middle" fontSize={14} fontWeight={700} fill="#1864ab">{t(`rca.fish.cat.${c}`)}</text>
        {items.map((b, k) => {
          // spread the causes along the bone, clear of its label and of the spine
          const f = 0.12 + (0.78 * (k + 0.5)) / maxN;
          const y = y0 + (y1 - y0) * f;
          const x = x0 + (x1 - x0) * f;
          return (
            <g key={b.id}>
              <line x1={x - 230} y1={y} x2={x} y2={y} stroke="#ced4da" strokeWidth={1} />
              <text x={x - 6} y={y - 4} textAnchor="end" fontSize={11.5} fill={color(b)} fontWeight={b.status === "verified" ? 700 : 400}
                textDecoration={b.status === "ruled_out" ? "line-through" : undefined}>{clip(b.text, 38)}</text>
            </g>
          );
        })}
      </g>
    );
  };
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: W, background: "white", borderRadius: 8 }} role="img" aria-label={t("rca.tabs.fishbone")} direction="ltr">
      <line x1={120} y1={spine} x2={headX} y2={spine} stroke="#1c7ed6" strokeWidth={4} />
      <polygon points={`${headX},${spine - 9} ${headX + 14},${spine} ${headX},${spine + 9}`} fill="#1c7ed6" />
      <rect x={headX + 16} y={spine - 50} width={W - headX - 22} height={100} rx={8} fill="#e7f5ff" stroke="#1c7ed6" />
      <foreignObject x={headX + 22} y={spine - 46} width={W - headX - 34} height={92}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: "#1864ab", height: "100%", display: "flex", alignItems: "center", textAlign: "center", overflow: "hidden", fontFamily: "inherit" }}>
          {clip(problem || t("rca.fish.problem"), 140)}
        </div>
      </foreignObject>
      {top.map((c, i) => branch(c, i, true))}
      {bottom.map((c, i) => branch(c, i, false))}
    </svg>
  );
}

/** Fishbone editor: causes per 6M category with possible / verified / ruled out. */
export function FishboneEditor({ value, onChange, readOnly }: { value: Bone[]; onChange: (v: Bone[]) => void; readOnly: boolean }) {
  const { t } = useTranslation();
  const set = (id: string, p: Partial<Bone>) => onChange(value.map((b) => (b.id === id ? { ...b, ...p } : b)));
  return (
    <Stack gap="sm">
      {CATS.map((c) => (
        <div key={c}>
          <Group justify="space-between" mb={4}>
            <Text fw={600} size="sm">{t(`rca.fish.cat.${c}`)}</Text>
            {!readOnly && <Button size="compact-xs" variant="subtle" leftSection={<IconPlus size={14} />} onClick={() => onChange([...value, { id: uid(), category: c, text: "", status: "possible" }])}>{t("common.add")}</Button>}
          </Group>
          <Stack gap={4}>
            {value.filter((b) => b.category === c).map((b) => (
              <Group key={b.id} gap="xs" wrap="nowrap">
                <TextInput style={{ flex: 1 }} size="xs" placeholder={t("rca.fish.cause")} value={b.text} readOnly={readOnly} onChange={(e) => set(b.id, { text: e.currentTarget.value })} />
                <Select size="xs" w={130} allowDeselect={false} disabled={readOnly} value={b.status} onChange={(v) => v && set(b.id, { status: v as Bone["status"] })}
                  data={(["possible", "verified", "ruled_out"] as const).map((s) => ({ value: s, label: t(`rca.fish.st.${s}`) }))} />
                {!readOnly && <ActionIcon variant="subtle" color="red" aria-label={t("common.delete")} onClick={() => onChange(value.filter((x) => x.id !== b.id))}><IconTrash size={16} /></ActionIcon>}
              </Group>
            ))}
          </Stack>
        </div>
      ))}
    </Stack>
  );
}

/** 5 Whys as a tree: each answer can be asked "why?" again (next level) or get a second answer (branch). */
export function WhysEditor({ value, onChange, readOnly }: { value: Why[]; onChange: (v: Why[]) => void; readOnly: boolean }) {
  const { t } = useTranslation();
  const set = (id: string, p: Partial<Why>) => onChange(value.map((w) => (w.id === id ? { ...w, ...p } : w)));
  const remove = (id: string) => {
    const gone = new Set([id]);
    let grew = true;
    while (grew) { grew = false; for (const w of value) if (w.parent_id && gone.has(w.parent_id) && !gone.has(w.id)) { gone.add(w.id); grew = true; } }
    onChange(value.filter((w) => !gone.has(w.id)));
  };
  const node = (w: Why, depth: number): ReactNode => (
    <div key={w.id}>
      <Group gap="xs" wrap="nowrap" align="start" ps={depth * 22}>
        {depth > 0 && <IconCornerDownRight size={16} style={{ marginTop: 8, flexShrink: 0 }} color="var(--mantine-color-dimmed)" />}
        <Badge variant="filled" color={w.is_root ? "red" : "blue"} mt={6} miw={64}>{t("rca.whys.level", { n: depth + 1 })}</Badge>
        <Textarea style={{ flex: 1 }} size="sm" autosize minRows={1} placeholder={t("rca.whys.placeholder")} value={w.text} readOnly={readOnly} onChange={(e) => set(w.id, { text: e.currentTarget.value })} />
        <Checkbox mt={8} label={t("rca.whys.root")} checked={!!w.is_root} disabled={readOnly} onChange={(e) => set(w.id, { is_root: e.currentTarget.checked })} />
        {!readOnly && <>
          <Tooltip label={t("rca.whys.next")}><ActionIcon mt={4} variant="light" aria-label={t("rca.whys.next")} onClick={() => onChange([...value, { id: uid(), parent_id: w.id, text: "" }])}><IconPlus size={16} /></ActionIcon></Tooltip>
          <Tooltip label={t("rca.whys.branch")}><ActionIcon mt={4} variant="subtle" aria-label={t("rca.whys.branch")} onClick={() => onChange([...value, { id: uid(), parent_id: w.parent_id, text: "" }])}><IconCornerDownRight size={16} /></ActionIcon></Tooltip>
          <ActionIcon mt={4} variant="subtle" color="red" aria-label={t("common.delete")} onClick={() => remove(w.id)}><IconTrash size={16} /></ActionIcon>
        </>}
      </Group>
      <Stack gap={6} mt={6}>{value.filter((c) => c.parent_id === w.id).map((c) => node(c, depth + 1))}</Stack>
    </div>
  );
  return (
    <Stack gap={6}>
      {value.filter((w) => !w.parent_id).map((w) => node(w, 0))}
      {!readOnly && <Button variant="light" size="xs" w="fit-content" leftSection={<IconPlus size={14} />} onClick={() => onChange([...value, { id: uid(), parent_id: null, text: "" }])}>
        {value.length ? t("rca.whys.branch") : t("rca.whys.start")}</Button>}
    </Stack>
  );
}

/** Read-only 5 Whys for the report. */
export function WhysView({ value }: { value: Why[] }) {
  const { t } = useTranslation();
  const node = (w: Why, depth: number): ReactNode => (
    <div key={w.id} style={{ paddingInlineStart: depth * 18 }}>
      <Text size="sm"><b>{t("rca.whys.level", { n: depth + 1 })}:</b> {w.text}{w.is_root && <Badge ms={6} size="xs" color="red">{t("rca.whys.root")}</Badge>}</Text>
      {value.filter((c) => c.parent_id === w.id).map((c) => node(c, depth + 1))}
    </div>
  );
  return <>{value.filter((w) => !w.parent_id).map((w) => node(w, 0))}</>;
}
