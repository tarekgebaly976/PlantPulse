"use client";

// Field round: works without internet. Scan any equipment QR label (or search), see its card and last jobs, and raise
// a work request with photos. Requests wait on the phone and are sent by themselves when the connection is back.
// Outside the main app frame on purpose: it must open and work with no connection and no server answer.

import { ActionIcon, Alert, Anchor, Badge, Button, Card, Checkbox, Container, FileButton, Group, Image, Loader, Modal, Select, SimpleGrid, Stack, Text,
  Textarea, TextInput, Title } from "@mantine/core";
import { IconArrowLeft, IconCamera, IconCloudUpload, IconQrcode, IconRefresh, IconSearch, IconTrash, IconWifi, IconWifiOff } from "@tabler/icons-react";
import { useNetwork } from "@mantine/hooks";
import jsQR from "jsqr";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import i18n, { applyDirection, toLang } from "@/lib/i18n";
import { addRequest, deleteItem, listOutbox, loadCatalog, newRef, prepareOffline, pruneSent, shrinkPhoto, syncOutbox,
  type CAsset, type Catalog, type OutItem } from "@/lib/offline";
import { useSession } from "@/lib/session";

const STALE_MS = 12 * 3600 * 1000;

/** Camera QR reader (same labels as the app's Scan page: "cmms:asset:<token>"). */
function Scanner({ onCode, onClose }: { onCode: (text: string) => void; onClose: () => void }) {
  const { t } = useTranslation();
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let stream: MediaStream | null = null, raf = 0, stopped = false;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (stopped) { stream.getTracks().forEach((x) => x.stop()); return; }
        if (video.current) { video.current.srcObject = stream; await video.current.play(); }
        const tick = () => {
          const v = video.current, c = canvas.current;
          if (v && c && v.readyState === v.HAVE_ENOUGH_DATA) {
            c.width = v.videoWidth; c.height = v.videoHeight;
            const ctx = c.getContext("2d", { willReadFrequently: true });
            if (ctx) {
              ctx.drawImage(v, 0, 0);
              const code = jsQR(ctx.getImageData(0, 0, c.width, c.height).data, c.width, c.height);
              if (code?.data) { onCode(code.data); return; }
            }
          }
          raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      } catch {
        setErr(t("scan.notSupported"));
      }
    })();
    return () => { stopped = true; cancelAnimationFrame(raf); stream?.getTracks().forEach((x) => x.stop()); };
  }, [onCode, t]);
  return (
    <Stack gap="xs">
      <video ref={video} playsInline muted style={{ width: "100%", borderRadius: 8, background: "#000" }} />
      <canvas ref={canvas} style={{ display: "none" }} />
      {err && <Alert color="orange">{err}</Alert>}
      <Button variant="default" onClick={onClose}>{t("scan.stop")}</Button>
    </Stack>
  );
}

const CRIT_COLOR: Record<string, string> = { A: "red", B: "orange", C: "gray" };

function AssetCard({ cat, a, onRequest }: { cat: Catalog; a: CAsset; onRequest: () => void }) {
  const { t } = useTranslation();
  const byId = useMemo(() => new Map(cat.assets.map((x) => [x.id, x])), [cat]);
  const chain: CAsset[] = [];
  for (let p = a.p ? byId.get(a.p) : undefined; p; p = p.p ? byId.get(p.p) : undefined) chain.unshift(p);
  const dept = cat.departments.find((d) => d.id === a.d);
  const recent = cat.recent[a.id] ?? [];
  return (
    <Card withBorder padding="md" data-testid="field-asset">
      <Group justify="space-between" wrap="nowrap" align="start">
        <div>
          <Text fw={800} size="lg">{a.c}</Text>
          <Text>{i18n.language === "ar" && a.na ? a.na : a.n}</Text>
        </div>
        <Badge color={CRIT_COLOR[a.k] ?? "gray"} variant="filled" size="lg">{a.k}</Badge>
      </Group>
      {chain.length > 0 && <Text size="xs" c="dimmed" mt={4}>{chain.map((x) => x.c).join(" › ")}</Text>}
      <Text size="sm" mt={6}>{[dept?.c, a.et, a.loc].filter(Boolean).join(" · ")}</Text>
      <Button mt="md" fullWidth size="md" color="red" onClick={onRequest} className="tap-target" data-testid="field-new-request">{t("req.new")}</Button>
      <Text fw={600} size="sm" mt="md">{t("field.recent")}</Text>
      {recent.length === 0 ? <Text size="sm" c="dimmed">{t("field.noRecent")}</Text> : (
        <Stack gap={4} mt={4}>{recent.map((w) => (
          <Group key={w.n} gap="xs" wrap="nowrap">
            <Text size="xs" className="mono">{w.n}</Text>
            <Text size="xs" style={{ flex: 1 }} lineClamp={1}>{w.t}</Text>
            <Badge size="xs" variant="light">{t(`status.${w.s}`, { defaultValue: w.s })}</Badge>
          </Group>))}
        </Stack>
      )}
      <Text size="xs" c="dimmed" mt="xs">{t("field.recentAsOf", { date: new Date(cat.generated_at).toLocaleString() })}</Text>
    </Card>
  );
}

function RequestForm({ cat, a, online, onClose, onSaved }: { cat: Catalog; a: CAsset; online: boolean; onClose: () => void; onSaved: () => void }) {
  const { t } = useTranslation();
  const symptoms = cat.codes.filter((c) => c.k === "symptom");
  const modes = cat.codes.filter((c) => c.k === "problem");
  const mine = a.et ? modes.filter((c) => (c.et ?? "").toLowerCase() === a.et!.toLowerCase()) : [];
  const [f, setF] = useState({ symptom: null as string | null, mode: null as string | null, title: "", own: false, description: "", priority: "P3", breakdown: false });
  const [photos, setPhotos] = useState<Blob[]>([]);
  const [busy, setBusy] = useState(false);
  const byId = new Map(cat.codes.map((c) => [c.id, c]));
  const auto = [f.symptom && byId.get(f.symptom)?.t, f.mode && byId.get(f.mode)?.t].filter(Boolean).join(" – ");
  const title = f.own ? f.title : auto;
  const opt = (c: { id: string; t: string }) => ({ value: c.id, label: c.t });
  const modeData = mine.length ? [{ group: t("fm.forType", { type: a.et }), items: mine.map(opt) }, { group: t("fm.other"), items: modes.filter((c) => !mine.includes(c)).map(opt) }] : modes.map(opt);
  const urls = useMemo(() => photos.map((p) => URL.createObjectURL(p)), [photos]);
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls]);
  const save = async () => {
    setBusy(true);
    try {
      await addRequest({
        id: newRef(), created: new Date().toISOString(), plant_id: cat.plant.id, user_id: cat.user.id, asset_id: a.id, asset_code: a.c, photos,
        body: { title, description: f.description || null, symptoms: f.symptom ? byId.get(f.symptom)?.t ?? null : null, symptom_code_id: f.symptom,
          problem_code_id: f.mode, suggested_priority: f.priority, is_breakdown: f.breakdown },
      });
      onSaved();
    } finally { setBusy(false); }
  };
  return (
    <Modal opened onClose={onClose} title={`${t("req.new")} · ${a.c}`} fullScreen>
      <Stack>
        {symptoms.length > 0 && <Select label={t("wo.symptoms")} required searchable placeholder={t("fm.pickSymptom")} value={f.symptom}
          onChange={(v) => setF({ ...f, symptom: v })} data={symptoms.map(opt)} />}
        {modes.length > 0 && <Select label={t("fm.suspected")} description={t("fm.suspectedHint")} searchable clearable value={f.mode}
          onChange={(v) => setF({ ...f, mode: v })} data={modeData} />}
        <TextInput label={t("wo.title")} required value={title} description={!f.own && auto ? t("fm.autoTitle") : undefined}
          onChange={(e) => setF({ ...f, own: true, title: e.currentTarget.value })} />
        <Textarea label={t("common.description")} autosize minRows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.currentTarget.value })} />
        <Select label={t("req.suggested")} data={["P1", "P2", "P3", "P4"]} value={f.priority} allowDeselect={false} onChange={(v) => setF({ ...f, priority: v ?? "P3" })} />
        <Checkbox color="red" label={t("req.breakdown")} checked={f.breakdown} onChange={(e) => setF({ ...f, breakdown: e.currentTarget.checked })} />
        {f.breakdown && !online && <Alert color="red" data-testid="field-call">{t("field.callToo")}</Alert>}
        <Group>
          <FileButton onChange={async (files) => { const add = await Promise.all((files ?? []).map(shrinkPhoto)); setPhotos([...photos, ...add].slice(0, 6)); }}
            accept="image/*" multiple capture="environment">
            {(props) => <Button {...props} variant="light" leftSection={<IconCamera size={18} />} disabled={photos.length >= 6}>{t("field.photo")}</Button>}
          </FileButton>
          <Text size="xs" c="dimmed">{photos.length}/6</Text>
        </Group>
        {photos.length > 0 && <SimpleGrid cols={3}>{urls.map((u, i) => (
          <div key={u} style={{ position: "relative" }}>
            <Image src={u} alt="" radius="sm" h={90} fit="cover" />
            <ActionIcon size="sm" color="red" style={{ position: "absolute", top: 4, insetInlineEnd: 4 }} aria-label={t("common.delete")}
              onClick={() => setPhotos(photos.filter((_, j) => j !== i))}><IconTrash size={14} /></ActionIcon>
          </div>))}
        </SimpleGrid>}
        <Button size="md" loading={busy} disabled={title.trim().length < 3 || (symptoms.length > 0 && !f.symptom)} onClick={() => void save()} className="tap-target" data-testid="field-save">
          {online ? t("field.saveSend") : t("field.saveLater")}</Button>
        <Button variant="subtle" color="gray" onClick={onClose}>{t("common.cancel")}</Button>
      </Stack>
    </Modal>
  );
}

const ST_COLOR: Record<string, string> = { pending: "orange", sending: "blue", sent: "green", error: "red", auth: "red" };

export default function FieldPage() {
  const { t } = useTranslation();
  const { me } = useSession();
  const online = useNetwork().online;
  const [cat, setCat] = useState<Catalog | null | undefined>(undefined);
  const [items, setItems] = useState<OutItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [scan, setScan] = useState(false);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<CAsset | null>(null);
  const [form, setForm] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  // Back closes the camera or the request form first (nothing typed is lost); the next Back leaves the page.
  // The history entry keeps Next.js's own state, so its router treats it as the same page.
  const overlay = scan || form;
  const popped = useRef(false);
  const overlayOpen = useRef(false);
  const skipPop = useRef(false);
  useEffect(() => {
    overlayOpen.current = overlay;
    if (!overlay) return;
    popped.current = false;
    window.history.pushState({ ...(window.history.state ?? {}), ppOverlay: true }, "");
    const onPop = () => { popped.current = true; setScan(false); setForm(false); };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      if (!popped.current && window.history.state?.ppOverlay) { skipPop.current = true; window.history.back(); } // closed with a button
    };
  }, [overlay]);
  // Without internet, Back from the field round (nothing open) always goes to the (offline) dashboard.
  useEffect(() => {
    const onPop = () => {
      if (skipPop.current) { skipPop.current = false; return; }
      // A full page load on purpose: without internet only the service worker's kept page can open, not a router fetch.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      if (!navigator.onLine && !overlayOpen.current) window.location.assign("/");
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  // Leaving the page (another app, screen off, page kept in memory): the camera is always released.
  useEffect(() => {
    const off = () => setScan(false);
    window.addEventListener("pagehide", off);
    return () => window.removeEventListener("pagehide", off);
  }, []);

  const reload = useCallback(async () => { setItems(await listOutbox()); }, []);
  const sync = useCallback(async () => {
    if (!navigator.onLine) return;
    const r = await syncOutbox();
    await reload();
    if (r.sent) setNote(t("field.sentN", { n: r.sent }));
  }, [reload, t]);
  const prepare = useCallback(async () => {
    setBusy(true); setErr(null);
    try { setCat(await prepareOffline()); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }, []);

  useEffect(() => {
    void (async () => {
      const c = (await loadCatalog()) ?? null;
      setCat(c);
      if (c && !me) { const l = toLang(c.user.locale); void i18n.changeLanguage(l); applyDirection(l); }
      await pruneSent();
      await reload();
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Back online: send what waits, and refresh an old catalogue (or another user's) by itself.
  useEffect(() => {
    if (!online || cat === undefined) return;
    const first = window.setTimeout(() => {
      void sync();
      if (me && (!cat || cat.user.id !== me.id || Date.now() - Date.parse(cat.generated_at) > STALE_MS)) void prepare();
    }, 0);
    const id = window.setInterval(() => void sync(), 60_000);
    return () => { window.clearTimeout(first); window.clearInterval(id); };
  }, [online, me, cat, sync, prepare]);

  const byQr = useMemo(() => new Map((cat?.assets ?? []).map((a) => [a.q.toLowerCase(), a])), [cat]);
  const results = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!cat || !words.length) return [];
    return cat.assets.filter((a) => { const h = `${a.c} ${a.n} ${a.na ?? ""}`.toLowerCase(); return words.every((w) => h.includes(w)); }).slice(0, 30);
  }, [q, cat]);
  const onCode = useCallback((text: string) => {
    setScan(false);
    const m = text.trim().match(/^cmms:asset:([0-9a-f]+)$/i);
    const a = m ? byQr.get(m[1]!.toLowerCase()) : cat?.assets.find((x) => x.c.toLowerCase() === text.trim().toLowerCase());
    if (a) { setSel(a); setNote(null); } else setNote(m ? t("field.unknownQr") : t("field.notAsset"));
  }, [byQr, cat, t]);

  const waiting = items.filter((i) => i.status !== "sent");
  return (
    <Container size={560} px="sm" py="sm">
      <Group justify="space-between" mb="sm" wrap="nowrap">
        <Group gap="xs" wrap="nowrap">
          {online && me ? <ActionIcon component={Link} href="/" variant="subtle" aria-label={t("nav.dashboard")}><IconArrowLeft /></ActionIcon>
            : <ActionIcon component="a" href="/" variant="subtle" aria-label={t("nav.dashboard")}><IconArrowLeft /></ActionIcon>}
          <Title order={3}>{t("field.title")}</Title>
        </Group>
        <Badge size="lg" color={online ? "teal" : "red"} variant="light" leftSection={online ? <IconWifi size={14} /> : <IconWifiOff size={14} />} data-testid="field-net"
          style={{ flexShrink: 0, textTransform: "none" }}>
          {online ? t("app.online") : t("field.offlineShort")}
        </Badge>
      </Group>
      {!online && cat && <Text size="xs" c="red" mb="xs">{t("field.offline")}</Text>}
      {cat === undefined ? <Loader /> : !cat ? (
        <Card withBorder padding="lg">
          <Stack>
            <Text>{t("field.intro")}</Text>
            {online && me ? <Button size="md" loading={busy} leftSection={<IconCloudUpload size={18} />} onClick={() => void prepare()} data-testid="field-prepare">{t("field.prepare")}</Button>
              : <Alert color="orange">{online ? <Anchor component={Link} href="/login">{t("field.signInFirst")}</Anchor> : t("field.needOnlineOnce")}</Alert>}
            {err && <Alert color="red">{err}</Alert>}
          </Stack>
        </Card>
      ) : (
        <Stack>
          <Group justify="space-between" wrap="nowrap" align="center" gap="xs">
            <Text size="xs" c="dimmed" style={{ minWidth: 0 }}>{t("field.ready", { n: cat.assets.length, date: new Date(cat.generated_at).toLocaleString() })} · {cat.plant.code}</Text>
            {online && me && <Button size="compact-sm" variant="light" loading={busy} leftSection={<IconRefresh size={14} />} onClick={() => void prepare()}
              style={{ flexShrink: 0 }} data-testid="field-update">{t("field.update")}</Button>}
          </Group>
          {err && <Alert color="red">{err}</Alert>}
          {note && <Alert color="blue" withCloseButton onClose={() => setNote(null)}>{note}</Alert>}
          {scan ? <Scanner onCode={onCode} onClose={() => setScan(false)} /> : (
            <Button size="lg" leftSection={<IconQrcode size={22} />} onClick={() => setScan(true)} className="tap-target" data-testid="field-scan">{t("field.scan")}</Button>
          )}
          <TextInput leftSection={<IconSearch size={16} />} placeholder={t("field.search")} value={q} onChange={(e) => setQ(e.currentTarget.value)} data-testid="field-search" />
          {results.length > 0 && !sel && (
            <Card withBorder padding={0}>{results.map((a) => (
              <Group key={a.id} px="sm" py={8} gap="xs" wrap="nowrap" style={{ cursor: "pointer", borderBottom: "1px solid var(--mantine-color-default-border)" }}
                onClick={() => { setSel(a); setQ(""); }}>
                <Text size="sm" fw={700} className="mono">{a.c}</Text><Text size="sm" lineClamp={1} style={{ flex: 1 }}>{a.n}</Text>
                <Badge size="xs" color={CRIT_COLOR[a.k] ?? "gray"}>{a.k}</Badge>
              </Group>))}
            </Card>)}
          {sel && <AssetCard cat={cat} a={sel} onRequest={() => setForm(true)} />}
          {sel && <Button variant="subtle" color="gray" onClick={() => setSel(null)}>{t("field.another")}</Button>}

          <Group justify="space-between" mt="md">
            <Text fw={700}>{t("field.outbox")} {waiting.length > 0 && <Badge color="orange" ms={4}>{waiting.length}</Badge>}</Text>
            {online && waiting.length > 0 && <Button size="compact-sm" variant="light" leftSection={<IconCloudUpload size={14} />} onClick={() => void sync()}>{t("field.sendNow")}</Button>}
          </Group>
          {items.length === 0 ? <Text size="sm" c="dimmed">{t("field.nothing")}</Text> : (
            <Stack gap="xs" data-testid="field-outbox">{items.map((i) => (
              <Card key={i.id} withBorder padding="xs">
                <Group justify="space-between" wrap="nowrap" align="start">
                  <div style={{ minWidth: 0 }}>
                    <Text size="sm" fw={600} lineClamp={1}>{i.asset_code} · {i.body.title}</Text>
                    <Text size="xs" c="dimmed">{new Date(i.created).toLocaleString()}{i.photos.length ? ` · ${t("field.photos", { n: i.photos.length })}` : ""}{i.body.is_breakdown ? ` · ${t("req.breakdown")}` : ""}</Text>
                    {i.number && <Text size="xs" fw={600}>{i.number}{i.open_on_asset ? ` · ${t("field.openOnAsset", { n: i.open_on_asset })}` : ""}</Text>}
                    {i.status === "auth" && <Text size="xs" c="red">{i.error === "other-user" ? t("field.otherUser") : t("field.signInAgain")}</Text>}
                    {i.status === "error" && <Text size="xs" c="red">{i.error}</Text>}
                  </div>
                  <Group gap={4} wrap="nowrap">
                    <Badge size="sm" color={ST_COLOR[i.status] ?? "gray"} variant="light"
                      styles={{ root: { overflow: "visible", maxWidth: "none", flexShrink: 0, textTransform: "none" }, label: { overflow: "visible", textOverflow: "clip" } }}>
                      {t(`field.st_${i.status}`)}</Badge>
                    {i.status !== "sent" && i.status !== "sending" && <ActionIcon size="sm" variant="subtle" color="red" aria-label={t("common.delete")}
                      onClick={async () => { if (window.confirm(t("field.deleteConfirm"))) { await deleteItem(i.id); await reload(); } }}><IconTrash size={14} /></ActionIcon>}
                  </Group>
                </Group>
              </Card>))}
            </Stack>
          )}
          <Text size="xs" c="dimmed" mt="sm">{t("field.onlineOnly")}</Text>
        </Stack>
      )}
      {form && sel && cat && <RequestForm cat={cat} a={sel} online={online} onClose={() => setForm(false)}
        onSaved={() => { setForm(false); setSel(null); setNote(online ? t("field.savedSending") : t("field.savedOffline")); void reload().then(() => sync()); }} />}
    </Container>
  );
}
