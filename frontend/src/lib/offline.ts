"use client";

// Field mode without internet. The phone keeps, in IndexedDB on the device only:
//  - the catalogue (all equipment of the user's departments with their QR tokens, symptoms / failure modes and the
//    last work orders per equipment), downloaded with "Prepare for offline" and refreshed when online;
//  - the outbox: work requests (with photos) written without a connection. Each carries its own reference
//    (client_ref), so sending it again after a lost answer never creates a second request on the server.
// Everything is deleted at sign-out. Approvals, LOTO sign-off and closing stay online on purpose.

import { api, ApiError, get, setApiContext } from "./api";

export interface CAsset { id: string; c: string; n: string; na: string | null; p: string | null; d: string; l: string; k: string; loc: string | null; et: string | null; q: string }
export interface CCode { id: string; k: "symptom" | "problem"; c: string; t: string; et: string | null }
export interface CRecent { n: string; t: string; s: string; y: string; d: string | null }
export interface Catalog {
  generated_at: string;
  plant: { id: string; code: string; name: string; tz: string };
  user: { id: string; name: string; locale: string };
  departments: { id: string; c: string; n: string }[];
  assets: CAsset[];
  codes: CCode[];
  recent: Record<string, CRecent[]>;
}

export type OutStatus = "pending" | "sending" | "sent" | "error" | "auth";
export interface OutItem {
  id: string; // client_ref
  created: string; // when written on the phone
  plant_id: string;
  user_id: string;
  asset_id: string;
  asset_code: string;
  body: { title: string; description: string | null; symptoms: string | null; symptom_code_id: string | null; problem_code_id: string | null; suggested_priority: string; is_breakdown: boolean };
  photos: Blob[];
  photos_sent: number;
  status: OutStatus;
  error?: string;
  request_id?: string;
  number?: string;
  open_on_asset?: number;
  sent_at?: string;
}

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
export const listOutbox = async () => ((await tx<OutItem[]>("outbox", "readonly", (s) => s.getAll())) ?? []).sort((a, b) => b.created.localeCompare(a.created));
const putItem = (i: OutItem) => tx("outbox", "readwrite", (s) => s.put(i));
export const deleteItem = (id: string) => tx("outbox", "readwrite", (s) => s.delete(id));
export const pendingCount = async () => (await listOutbox()).filter((i) => i.status !== "sent").length;

/** Sign-out: nothing of this user stays on the phone. */
export async function clearOffline(): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  await new Promise<void>((resolve) => { const r = indexedDB.deleteDatabase(DB); r.onsuccess = r.onerror = r.onblocked = () => resolve(); });
}

/** Online: download the catalogue and keep the field screen itself (HTML, scripts, fonts) for use without internet. */
export async function prepareOffline(): Promise<Catalog> {
  const c = await get<Catalog>("/offline/catalog");
  await saveCatalog(c);
  if ("caches" in window) {
    const urls = new Set<string>(["/field", "/offline.html", "/manifest.webmanifest", "/icons/icon-192.png"]);
    for (const e of performance.getEntriesByType("resource")) {
      const u = new URL(e.name);
      if (u.origin === location.origin && u.pathname.startsWith("/_next/static/")) urls.add(u.pathname + u.search);
    }
    document.querySelectorAll<HTMLScriptElement>("script[src]").forEach((s) => { const u = new URL(s.src); if (u.origin === location.origin) urls.add(u.pathname + u.search); });
    document.querySelectorAll<HTMLLinkElement>("link[rel=stylesheet][href]").forEach((l) => { const u = new URL(l.href); if (u.origin === location.origin) urls.add(u.pathname + u.search); });
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
  await putItem({ ...item, status: "pending", photos_sent: 0 });
}

let running: Promise<{ sent: number; failed: number }> | null = null;

/** Sends every request not yet sent, oldest first; photos after their request. Safe to call again at any time. */
export function syncOutbox(): Promise<{ sent: number; failed: number }> {
  if (!running) running = doSync().finally(() => { running = null; });
  return running;
}

async function doSync(): Promise<{ sent: number; failed: number }> {
  const items = (await listOutbox()).filter((i) => i.status !== "sent").reverse();
  let sent = 0, failed = 0;
  if (!items.length || !navigator.onLine) return { sent, failed };
  let meId: string;
  try {
    const me = await get<{ id: string; csrf_token: string }>("/auth/me");
    setApiContext({ csrf: me.csrf_token });
    meId = me.id;
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) for (const i of items) await putItem({ ...i, status: "auth" });
    return { sent, failed: items.length };
  }
  for (const i of items) {
    if (i.user_id !== meId) { // written by someone else on this phone: only they can send it, under their name
      await putItem({ ...i, status: "auth", error: "other-user" });
      failed++;
      continue;
    }
    setApiContext({ plantId: i.plant_id });
    let cur: OutItem = { ...i, status: "sending", error: undefined };
    await putItem(cur);
    try {
      if (!cur.request_id) {
        const r = await api<{ id: string; number: string; open_on_asset: number | null }>("POST", "/work-requests", {
          asset_id: cur.asset_id, ...cur.body, client_ref: cur.id, reported_at: cur.created,
        });
        cur = { ...cur, request_id: r.id, number: r.number, open_on_asset: r.open_on_asset ?? 0 };
        await putItem(cur);
      }
      while (cur.photos_sent < cur.photos.length) {
        const fd = new FormData();
        fd.append("entity_type", "work_request");
        fd.append("entity_id", cur.request_id!);
        fd.append("category", "photo");
        fd.append("file", new File([cur.photos[cur.photos_sent]!], `photo-${cur.photos_sent + 1}.jpg`, { type: "image/jpeg" }));
        await api("POST", "/attachments", fd);
        cur = { ...cur, photos_sent: cur.photos_sent + 1 };
        await putItem(cur);
      }
      await putItem({ ...cur, status: "sent", photos: [], sent_at: new Date().toISOString() });
      sent++;
    } catch (e) {
      failed++;
      if (e instanceof ApiError) {
        await putItem({ ...cur, status: e.status === 401 ? "auth" : "error", error: e.message });
        if (e.status === 401) break;
      } else {
        await putItem({ ...cur, status: "pending" }); // connection lost again: try later
        break;
      }
    }
  }
  return { sent, failed };
}

/** Sent requests are kept on the phone for a week as a receipt, then removed. */
export async function pruneSent(): Promise<void> {
  const week = Date.now() - 7 * 86400000;
  for (const i of await listOutbox()) if (i.status === "sent" && i.sent_at && Date.parse(i.sent_at) < week) await deleteItem(i.id);
}
