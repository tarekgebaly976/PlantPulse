"use client";

// Field mode without internet. The phone keeps, in IndexedDB on the device only:
//  - the catalogue (all equipment of the user's departments with their QR tokens, symptoms / failure modes, the last
//    work orders per equipment, the user's work orders to carry out and the spare-parts list), downloaded with
//    "Prepare for offline" and refreshed when online;
//  - the outbox, in the order things were written:
//      request  – a work request (with photos);
//      wo_new   – a work order created without internet (engineers, supervisors);
//      wo_sync  – work done on a work order without internet: start, checklist and readings, labour, parts used,
//                 findings, hold or submit for review. While it waits it collects every change (the "draft");
//                 when sent it gets a fresh one. The server checks each line against what changed meanwhile and
//                 answers what it applied and what conflicts (the user then keeps theirs or the server's).
//    Each item carries its own reference (client_ref), so sending it again after a lost answer never applies
//    anything twice on the server.
// Everything is deleted at sign-out. LOTO, permits, approvals, review and closing stay online on purpose.

import { api, ApiError, get, setApiContext } from "./api";

export interface CAsset { id: string; c: string; n: string; na: string | null; p: string | null; d: string; l: string; k: string; loc: string | null; et: string | null; q: string }
export interface CCode { id: string; k: "symptom" | "problem"; c: string; t: string; et: string | null }
export interface CRecent { n: string; t: string; s: string; y: string; d: string | null }
export interface CCheck { id: string; d: string; k: "check" | "reading"; req: boolean; u: string | null; min: number | null; max: number | null;
  done: boolean; ok: boolean | null; val: number | null; rem: string | null; by: string | null; pending?: boolean }
export interface CLabor { d: string; h: number; ot: boolean; who: string | null; no: string | null; pending?: boolean }
export interface CPartUsed { c: string | null; n: string | null; q: number; u: string; pending?: boolean }
export type FieldName = "findings" | "recommendations" | "root_cause" | "corrective_action" | "downtime_hours";
export const FIELD_NAMES: FieldName[] = ["findings", "corrective_action", "root_cause", "recommendations", "downtime_hours"];
/** A work order as kept on the phone. sb = why it cannot be started here (safety, permit, approval, permission). */
export interface CWo {
  id: string; n: string; t: string; ty: string; s: string; pr: string; a: string; ac: string; an: string; v: number;
  desc: string | null; sym: string | null; safety: string | null; loto: boolean; permit: boolean; signed: boolean; test: boolean;
  due: string | null; mine: boolean; sb: string | null; f: Record<FieldName, string | number | null>;
  cl: CCheck[]; lab: CLabor[]; parts: CPartUsed[]; at: string;
  local?: boolean; // created on this phone, not on the server yet
}
export interface CPart { id: string; c: string; n: string; u: string }
export interface Catalog {
  generated_at: string;
  plant: { id: string; code: string; name: string; tz: string };
  user: { id: string; name: string; locale: string };
  perms?: { request: boolean; create: boolean; execute: boolean; assign: boolean };
  departments: { id: string; c: string; n: string }[];
  assets: CAsset[];
  codes: CCode[];
  recent: Record<string, CRecent[]>;
  wos?: CWo[];
  parts?: CPart[];
}

export type OutStatus = "pending" | "sending" | "sent" | "error" | "auth" | "conflict";
interface OutBase { id: string; created: string; plant_id: string; user_id: string; status: OutStatus; error?: string; sent_at?: string }
export interface OutItem extends OutBase {
  kind?: "request"; // phase-1 items have no kind
  asset_id: string;
  asset_code: string;
  body: { title: string; description: string | null; symptoms: string | null; symptom_code_id: string | null; problem_code_id: string | null; suggested_priority: string; is_breakdown: boolean };
  photos: Blob[];
  photos_sent: number;
  request_id?: string;
  number?: string;
  open_on_asset?: number;
}
export interface WoNewItem extends OutBase {
  kind: "wo_new";
  asset_id: string;
  asset_code: string;
  body: { type: string; title: string; description: string | null; symptoms: string | null; symptom_code_id: string | null; problem_code_id: string | null; priority: string };
  assign_me: boolean;
  wo_id?: string;
  number?: string;
}
export interface SyncCheck { id: string; base: { done: boolean; val: number | null; rem: string | null }; is_done: boolean; is_ok: boolean | null; reading_value: number | null; remark: string | null; at: string }
export interface Batch {
  start: boolean;
  checklist: Record<string, SyncCheck>;
  fields: Partial<Record<FieldName, { base: string | number | null; value: string | number | null }>>;
  labor: { work_date: string; hours: number; is_overtime: boolean; notes: string | null }[];
  parts: { part_id: string | null; description: string | null; quantity: number; uom: string | null; used_on: string }[];
  comments: string[];
  finish: "on_hold" | "awaiting_review" | null;
  finish_comment: string | null;
  force: string[];
}
export interface Conflict { key: string; code: string; message: string; label?: string; mine?: unknown; theirs?: unknown }
export interface WoSyncItem extends OutBase {
  kind: "wo_sync";
  wo_ref: string; // server id, or "local:<ref>" while the work order created offline is not sent yet
  wo_number: string;
  asset_code: string;
  title: string;
  updated: string;
  base_version: number | null;
  batch: Batch;
  applied?: string[];
  conflicts?: Conflict[];
  resolved?: string[];
}
export type AnyItem = OutItem | WoNewItem | WoSyncItem;
export const isRequest = (i: AnyItem): i is OutItem => !i.kind || i.kind === "request";

const DB = "plantpulse-field";
const VERSION = 1;
export const SHELL_CACHE = "cmms-shell-v4"; // same name as in public/sw.js

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, VERSION);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains("kv")) db.createObjectStore("kv");
      if (!db.objectStoreNames.contains("outbox")) db.createObjectStore("outbox", { keyPath: "id" });
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

async function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const req = fn(t.objectStore(store));
    t.oncomplete = () => { db.close(); resolve(req ? (req.result as T) : undefined); };
    t.onerror = () => { db.close(); reject(t.error); };
  });
}

export const loadCatalog = () => tx<Catalog>("kv", "readonly", (s) => s.get("catalog"));
const saveCatalog = (c: Catalog) => tx("kv", "readwrite", (s) => s.put(c, "catalog"));
export const listOutbox = async () => ((await tx<AnyItem[]>("outbox", "readonly", (s) => s.getAll())) ?? []).sort((a, b) => b.created.localeCompare(a.created));
const putItem = (i: AnyItem) => tx("outbox", "readwrite", (s) => s.put(i));
export const deleteItem = (id: string) => serial(() => tx("outbox", "readwrite", (s) => s.delete(id)));
/** Delete from the phone (not sent): a work order created offline goes with the work written on it. */
export const discardItem = (id: string) => serial(async () => {
  const items = await listOutbox();
  const it = items.find((i) => i.id === id);
  if (it?.kind === "wo_new") {
    const local = `local:${id}`;
    for (const x of items) if (x.kind === "wo_sync" && x.wo_ref === local) await tx("outbox", "readwrite", (s) => s.delete(x.id));
    await replaceWo(local, null);
  }
  await tx("outbox", "readwrite", (s) => s.delete(id));
});
export const pendingCount = async () => (await listOutbox()).filter((i) => i.status !== "sent").length;

// Edits and sending run one after the other: a change made while a batch is being sent goes into a new batch.
let queue: Promise<unknown> = Promise.resolve();
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const r = queue.then(fn, fn);
  queue = r.catch(() => undefined);
  return r;
}

/** Sign-out: nothing of this user stays on the phone. */
export async function clearOffline(): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  await new Promise<void>((resolve) => { const r = indexedDB.deleteDatabase(DB); r.onsuccess = r.onerror = r.onblocked = () => resolve(); });
}

/** Online: download the catalogue and keep the field screen itself (HTML, scripts, fonts) for use without internet. */
export async function prepareOffline(): Promise<Catalog> {
  const c = await get<Catalog>("/offline/catalog");
  await serial(async () => {
    // Work orders created on this phone and not sent yet, or with work not sent yet, stay on the phone.
    const old = await loadCatalog();
    if (old && old.user.id === c.user.id && old.plant.id === c.plant.id) {
      const unsent = new Set((await listOutbox()).filter((i) => i.kind === "wo_sync" && i.status !== "sent").map((i) => (i as WoSyncItem).wo_ref));
      const have = new Set((c.wos ?? []).map((w) => w.id));
      c.wos = [...(c.wos ?? []), ...(old.wos ?? []).filter((w) => !have.has(w.id) && (w.local || unsent.has(w.id)))];
    }
    await saveCatalog(c);
  });
  if ("caches" in window) {
    const urls = new Set<string>(["/", "/field", "/offline.html", "/manifest.webmanifest", "/icons/icon-192.png"]);
    for (const e of performance.getEntriesByType("resource")) {
      const u = new URL(e.name);
      if (u.origin === location.origin && u.pathname.startsWith("/_next/static/")) urls.add(u.pathname + u.search);
    }
    document.querySelectorAll<HTMLScriptElement>("script[src]").forEach((s) => { const u = new URL(s.src); if (u.origin === location.origin) urls.add(u.pathname + u.search); });
    document.querySelectorAll<HTMLLinkElement>("link[rel=stylesheet][href]").forEach((l) => { const u = new URL(l.href); if (u.origin === location.origin) urls.add(u.pathname + u.search); });
    // The pages kept for offline use (dashboard and field round): keep every script and style they load too.
    for (const page of ["/", "/field"]) {
      try {
        const html = await (await fetch(page, { credentials: "same-origin", cache: "no-store" })).text();
        for (const m of html.matchAll(/(?:src|href)="(\/_next\/static\/[^"]+)"/g)) urls.add(m[1]!.replace(/&amp;/g, "&"));
      } catch { /* kept as far as possible */ }
    }
    const cache = await caches.open(SHELL_CACHE);
    await Promise.all([...urls].map((u) => cache.add(u).catch(() => undefined)));
  }
  return c;
}

export function newRef(): string {
  const a = new Uint8Array(12);
  crypto.getRandomValues(a);
  return "f-" + Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Photos are made smaller on the phone (longest side 1600 px, JPEG) before they are kept and sent. */
export async function shrinkPhoto(file: File): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")?.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b ?? file), "image/jpeg", 0.8));
  } catch {
    return file;
  }
}

export async function addRequest(item: Omit<OutItem, "status" | "photos_sent">): Promise<void> {
  await serial(() => putItem({ ...item, kind: "request", status: "pending", photos_sent: 0 }));
}

// ---------------- work orders on the phone ----------------
const emptyBatch = (): Batch => ({ start: false, checklist: {}, fields: {}, labor: [], parts: [], comments: [], finish: null, finish_comment: null, force: [] });
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

/** A batch laid over a work order: what the phone shows before the server has it. */
function overlay(w: CWo, b: Batch, applied?: Set<string>): CWo {
  const skip = (k: string) => applied?.has(k) ?? false; // already on the server (and in the snapshot)
  const v: CWo = { ...w, f: { ...w.f }, cl: w.cl.map((c) => ({ ...c })), lab: [...w.lab], parts: [...w.parts] };
  if (b.start && !skip("start")) v.s = "in_progress";
  for (const c of Object.values(b.checklist)) {
    if (skip(`check:${c.id}`)) continue;
    const it = v.cl.find((x) => x.id === c.id);
    if (it) Object.assign(it, { done: c.is_done, val: c.reading_value, rem: c.remark, ok: checkOk(it, c.is_done, c.is_ok, c.reading_value), pending: true });
  }
  for (const [k, f] of Object.entries(b.fields)) if (f && !skip(`field:${k}`)) v.f[k as FieldName] = f.value;
  b.labor.forEach((l, i) => { if (!skip(`labor:${i}`)) v.lab.push({ d: l.work_date, h: l.hours, ot: l.is_overtime, who: null, no: l.notes, pending: true }); });
  b.parts.forEach((p, i) => { if (!skip(`part:${i}`)) v.parts.push({ c: null, n: p.description, q: p.quantity, u: p.uom ?? "EA", pending: true }); });
  if (b.finish && !skip("finish")) v.s = b.finish;
  return v;
}

export function checkOk(it: { min: number | null; max: number | null }, done: boolean, ok: boolean | null, val: number | null): boolean | null {
  if (val !== null && (it.min !== null || it.max !== null)) return (it.min === null || val >= it.min) && (it.max === null || val <= it.max);
  return ok !== null ? ok : done ? true : null;
}

/** The work order as the phone shows it: the downloaded copy with every batch not on the server yet. (An answered
 *  batch with conflicts is not laid over: its applied lines are in the fresh copy, the others show the server's
 *  value until the user keeps theirs.) */
export function viewWo(w: CWo, items: AnyItem[], except?: string): CWo {
  let v = w;
  const mine = items.filter((i): i is WoSyncItem => i.kind === "wo_sync" && i.wo_ref === w.id && i.id !== except && i.status !== "sent" && i.status !== "conflict")
    .sort((a, b) => a.created.localeCompare(b.created));
  for (const i of mine) v = overlay(v, i.batch, new Set(i.applied ?? []));
  return v;
}

export const draftOf = (items: AnyItem[], woRef: string) =>
  items.find((i): i is WoSyncItem => i.kind === "wo_sync" && i.wo_ref === woRef && i.status === "pending");

/** Change the work waiting for this work order. fn gets the batch and the work order as it was before this batch
 *  (the "base" each changed line is compared against on the server). */
export function editWo(woRef: string, fn: (b: Batch, base: CWo) => void): Promise<void> {
  return serial(async () => {
    const cat = await loadCatalog();
    const w = cat?.wos?.find((x) => x.id === woRef);
    if (!cat || !w) throw new Error("work order not on this phone");
    const items = await listOutbox();
    const now = new Date().toISOString();
    const d: WoSyncItem = draftOf(items, woRef) ?? {
      kind: "wo_sync", id: newRef(), created: now, updated: now, plant_id: cat.plant.id, user_id: cat.user.id, status: "pending",
      wo_ref: woRef, wo_number: w.n, asset_code: w.ac, title: w.t, base_version: w.local ? null : w.v, batch: emptyBatch(),
    };
    fn(d.batch, viewWo(w, items, d.id));
    await putItem({ ...d, updated: now, wo_number: w.n });
  });
}

export function setCheck(b: Batch, base: CWo, id: string, v: { is_done: boolean; is_ok: boolean | null; reading_value: number | null; remark: string | null }) {
  const it = base.cl.find((c) => c.id === id);
  if (!it) return;
  const prev = b.checklist[id];
  b.checklist[id] = { id, base: prev?.base ?? { done: it.done, val: it.val, rem: it.rem }, ...v, at: new Date().toISOString() };
}

export function setField(b: Batch, base: CWo, name: FieldName, value: string | number | null) {
  const prev = b.fields[name];
  b.fields[name] = { base: prev ? prev.base : base.f[name] ?? null, value };
}

export const addLabor = (b: Batch, hours: number, is_overtime: boolean, notes: string | null, work_date = today()) => { b.labor.push({ work_date, hours, is_overtime, notes }); };
export const addPart = (b: Batch, p: { part_id: string | null; description: string | null; quantity: number; uom: string | null }) => { b.parts.push({ ...p, used_on: today() }); };

/** New work order without internet. It shows on the phone at once (emergency breakdowns can be started at once when
 *  the writer does the work); it is created on the server when the phone is back online. */
export async function addWorkOrder(cat: Catalog, a: CAsset, body: WoNewItem["body"], assign_me: boolean): Promise<string> {
  const ref = newRef();
  const now = new Date().toISOString();
  await serial(async () => {
    await putItem({ kind: "wo_new", id: ref, created: now, plant_id: cat.plant.id, user_id: cat.user.id, status: "pending", asset_id: a.id, asset_code: a.c, body, assign_me });
    const c = (await loadCatalog()) ?? cat;
    const local: CWo = {
      id: `local:${ref}`, n: "", t: body.title, ty: body.type, s: "triage", pr: body.type === "emergency" ? "P1" : body.priority, a: a.id, ac: a.c, an: a.n, v: 1,
      desc: body.description, sym: body.symptoms, safety: null, loto: false, permit: false, signed: false, test: false, due: null, mine: assign_me,
      sb: body.type === "emergency" ? null : "approval", f: { findings: null, recommendations: null, root_cause: null, corrective_action: null, downtime_hours: null },
      cl: [], lab: [], parts: [], at: now, local: true,
    };
    c.wos = [local, ...(c.wos ?? [])];
    await saveCatalog(c);
  });
  return `local:${ref}`;
}

/** Conflict answered by the user: "mine" sends that line again and overwrites the server's value; "theirs" keeps
 *  what is on the server. When every conflict is answered the item counts as sent. */
export function resolveConflict(itemId: string, key: string, keep: "mine" | "theirs"): Promise<void> {
  return serial(async () => {
    const items = await listOutbox();
    const it = items.find((i): i is WoSyncItem => i.id === itemId && i.kind === "wo_sync");
    if (!it) return;
    if (keep === "mine") {
      const b = emptyBatch();
      const [kind, k] = key.split(":") as [string, string | undefined];
      if (kind === "start") b.start = true;
      else if (kind === "check" && k) { const c = it.batch.checklist[k]; if (c) b.checklist[k] = c; b.force.push(key); }
      else if (kind === "field" && k) { const f = it.batch.fields[k as FieldName]; if (f) b.fields[k as FieldName] = f; b.force.push(key); }
      else if (kind === "labor" && k) { const l = it.batch.labor[Number(k)]; if (l) b.labor.push(l); }
      else if (kind === "part" && k) { const p = it.batch.parts[Number(k)]; if (p) b.parts.push(p); }
      else if (kind === "comment" && k) { const c = it.batch.comments[Number(k)]; if (c) b.comments.push(c); }
      else if (kind === "finish") { b.finish = it.batch.finish; b.finish_comment = it.batch.finish_comment; }
      const now = new Date().toISOString();
      await putItem({ ...it, id: newRef(), created: now, updated: now, status: "pending", batch: b, applied: undefined, conflicts: undefined, resolved: undefined, error: undefined, sent_at: undefined });
    }
    const resolved = [...new Set([...(it.resolved ?? []), key])];
    const done = (it.conflicts ?? []).every((c) => resolved.includes(c.key));
    await putItem({ ...it, resolved, status: done ? "sent" : "conflict", sent_at: done ? new Date().toISOString() : it.sent_at });
  });
}

async function replaceWo(oldId: string, w: CWo | null): Promise<void> {
  const c = await loadCatalog();
  if (!c) return;
  const rest = (c.wos ?? []).filter((x) => x.id !== oldId && (!w || x.id !== w.id));
  c.wos = w ? [w, ...rest] : rest;
  await saveCatalog(c);
}

let running: Promise<{ sent: number; failed: number; conflicts: number }> | null = null;

/** Sends everything not yet sent, oldest first (a work order before the work done on it; photos after their
 *  request). Safe to call again at any time. */
export function syncOutbox(): Promise<{ sent: number; failed: number; conflicts: number }> {
  if (!running) running = doSync().finally(() => { running = null; });
  return running;
}

type Sent = "sent" | "failed" | "conflict" | "wait" | "stop";

async function doSync(): Promise<{ sent: number; failed: number; conflicts: number }> {
  let sent = 0, failed = 0, conflicts = 0;
  const first = (await listOutbox()).filter((i) => i.status !== "sent" && i.status !== "conflict");
  if (!first.length || !navigator.onLine) return { sent, failed, conflicts };
  let meId: string;
  try {
    const me = await get<{ id: string; csrf_token: string }>("/auth/me");
    setApiContext({ csrf: me.csrf_token });
    meId = me.id;
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) for (const i of first) await serial(() => putItem({ ...i, status: "auth" }));
    return { sent, failed: first.length, conflicts };
  }
  for (const { id } of [...first].reverse()) {
    const i = (await listOutbox()).find((x) => x.id === id); // fresh: an earlier item may have changed it
    if (!i || i.status === "sent" || i.status === "conflict") continue;
    if (i.user_id !== meId) { // written by someone else on this phone: only they can send it, under their name
      await serial(() => putItem({ ...i, status: "auth", error: "other-user" }));
      failed++;
      continue;
    }
    setApiContext({ plantId: i.plant_id });
    const r: Sent = i.kind === "wo_new" ? await sendWoNew(i) : i.kind === "wo_sync" ? await sendWoSync(i) : await sendRequest(i);
    if (r === "sent") sent++;
    else if (r === "conflict") { sent++; conflicts++; }
    else if (r === "failed") failed++;
    else if (r === "stop") { failed++; break; }
  }
  return { sent, failed, conflicts };
}

async function failedWith(cur: AnyItem, e: unknown): Promise<Sent> {
  if (e instanceof ApiError) {
    await serial(() => putItem({ ...cur, status: e.status === 401 ? "auth" : "error", error: e.message }));
    return e.status === 401 ? "stop" : "failed";
  }
  await serial(() => putItem({ ...cur, status: "pending" })); // connection lost again: try later
  return "stop";
}

async function sendRequest(i: OutItem): Promise<Sent> {
  let cur: OutItem = { ...i, status: "sending", error: undefined };
  await serial(() => putItem(cur));
  try {
    if (!cur.request_id) {
      const r = await api<{ id: string; number: string; open_on_asset: number | null }>("POST", "/work-requests", {
        asset_id: cur.asset_id, ...cur.body, client_ref: cur.id, reported_at: cur.created,
      });
      cur = { ...cur, request_id: r.id, number: r.number, open_on_asset: r.open_on_asset ?? 0 };
      await serial(() => putItem(cur));
    }
    while (cur.photos_sent < cur.photos.length) {
      const fd = new FormData();
      fd.append("entity_type", "work_request");
      fd.append("entity_id", cur.request_id!);
      fd.append("category", "photo");
      fd.append("file", new File([cur.photos[cur.photos_sent]!], `photo-${cur.photos_sent + 1}.jpg`, { type: "image/jpeg" }));
      await api("POST", "/attachments", fd);
      cur = { ...cur, photos_sent: cur.photos_sent + 1 };
      await serial(() => putItem(cur));
    }
    await serial(() => putItem({ ...cur, status: "sent", photos: [], sent_at: new Date().toISOString() }));
    return "sent";
  } catch (e) {
    return failedWith(cur, e);
  }
}

async function sendWoNew(i: WoNewItem): Promise<Sent> {
  const cur: WoNewItem = { ...i, status: "sending", error: undefined };
  await serial(() => putItem(cur));
  try {
    const r = await api<{ id: string; number: string }>("POST", "/work-orders", {
      asset_id: cur.asset_id, ...cur.body, client_ref: cur.id, reported_at: cur.created, assign_me: cur.assign_me,
    });
    let snap: CWo | null = null;
    try { snap = await get<CWo>(`/offline/work-orders/${r.id}`); } catch { /* not allowed to execute: only the number is kept */ }
    await serial(async () => {
      const local = `local:${cur.id}`;
      await replaceWo(local, snap);
      // The work done on it offline now goes to the real work order.
      for (const x of await listOutbox()) if (x.kind === "wo_sync" && x.wo_ref === local) await putItem({ ...x, wo_ref: r.id, wo_number: r.number });
      await putItem({ ...cur, status: "sent", wo_id: r.id, number: r.number, sent_at: new Date().toISOString() });
    });
    return "sent";
  } catch (e) {
    return failedWith(cur, e);
  }
}

async function sendWoSync(i: WoSyncItem): Promise<Sent> {
  if (i.wo_ref.startsWith("local:")) return "wait"; // its work order is not created on the server yet
  const cur: WoSyncItem = { ...i, status: "sending", error: undefined };
  await serial(() => putItem(cur));
  const b = cur.batch;
  try {
    const r = await api<{ applied: string[]; conflicts: Conflict[]; snapshot: CWo; work_order: { number: string } }>("POST", `/offline/work-orders/${cur.wo_ref}/sync`, {
      client_ref: cur.id, written_at: cur.updated, base_version: cur.base_version, start: b.start,
      checklist: Object.values(b.checklist), fields: Object.entries(b.fields).map(([name, f]) => ({ name, base: f!.base, value: f!.value })),
      labor: b.labor, parts: b.parts, comments: b.comments, finish: b.finish, finish_comment: b.finish_comment, force: b.force,
    });
    const conflict = r.conflicts.length > 0;
    await serial(async () => {
      await replaceWo(cur.wo_ref, r.snapshot);
      await putItem({ ...cur, status: conflict ? "conflict" : "sent", applied: r.applied, conflicts: r.conflicts, wo_number: r.work_order.number, sent_at: new Date().toISOString() });
    });
    return conflict ? "conflict" : "sent";
  } catch (e) {
    return failedWith(cur, e);
  }
}

/** Sent items are kept on the phone for a week as a receipt, then removed. */
export async function pruneSent(): Promise<void> {
  const week = Date.now() - 7 * 86400000;
  for (const i of await listOutbox()) if (i.status === "sent" && i.sent_at && Date.parse(i.sent_at) < week) await deleteItem(i.id);
}
