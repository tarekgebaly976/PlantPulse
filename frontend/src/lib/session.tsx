"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { ApiError, get, post, setApiContext } from "./api";
import type { Me, PlantAccess } from "./types";
import i18n, { applyDirection, toLang, type Lang } from "./i18n";

interface SessionValue {
  me: Me | null;
  loading: boolean;
  /** The account could not be loaded because there is no connection (not a sign-out): the app shows an offline
   *  panel with the field round instead of sending the user to the sign-in page. */
  offline: boolean;
  plant: PlantAccess | null;
  setPlant: (id: string) => void;
  can: (perm: string) => boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  setLocale: (l: Lang) => Promise<void>;
}

const Ctx = createContext<SessionValue | null>(null);
const PLANT_KEY = "cmms.plant"; // UI preference only (an id, not a credential)
/** Reachable without signing in: never sent to the sign-in page. */
export const PUBLIC_PATHS = ["/login", "/privacy", "/forgot-password", "/reset-password", "/field"]; // /field: field round, also offline

export function SessionProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [plantId, setPlantId] = useState<string | null>(null);
  const router = useRouter();
  const qc = useQueryClient();

  const adopt = useCallback((m: Me) => {
    setMe(m);
    setApiContext({ csrf: m.csrf_token });
    const saved = typeof window !== "undefined" ? window.localStorage.getItem(PLANT_KEY) : null;
    const pick = m.plants.find((p) => p.plant_id === saved) ?? m.plants[0] ?? null;
    setPlantId(pick?.plant_id ?? null);
    setApiContext({ plantId: pick?.plant_id ?? null });
    const loc = toLang(m.locale);
    void i18n.changeLanguage(loc);
    applyDirection(loc);
  }, []);

  useEffect(() => {
    // Pages for people who are not signed in stay where they are (an e-mailed reset link, the privacy policy …).
    const isPublic = () => PUBLIC_PATHS.some((p) => window.location.pathname === p || window.location.pathname.startsWith(`${p}/`));
    setApiContext({ onUnauthorized: () => { setMe(null); if (!isPublic()) router.replace("/login"); } });
    const load = () => get<Me>("/auth/me")
      .then((m) => { setOffline(false); adopt(m); })
      .catch((e) => { setMe(null); setOffline(!(e instanceof ApiError)); }) // no answer at all = no connection
      .finally(() => setLoading(false));
    void load();
    // Connection back after an offline start: load the account again (no sign-in needed, the cookie is still there).
    const back = () => { if (!window.location.pathname.startsWith("/field")) void load(); };
    window.addEventListener("online", back);
    return () => window.removeEventListener("online", back);
  }, [adopt, router]);

  const plant = useMemo(() => me?.plants.find((p) => p.plant_id === plantId) ?? null, [me, plantId]);

  const value: SessionValue = {
    me, loading, offline, plant,
    setPlant: (id) => {
      setPlantId(id);
      setApiContext({ plantId: id });
      window.localStorage.setItem(PLANT_KEY, id);
      qc.clear();
    },
    can: (perm) => !!plant?.permissions.includes(perm),
    login: async (email, password) => {
      const m = await post<Me>("/auth/login", { email, password });
      adopt(m);
    },
    logout: async () => {
      // Field round: requests not sent yet are lost at sign-out (nothing of this user stays on the phone): ask first.
      const { pendingCount, clearOffline } = await import("./offline");
      const waiting = await pendingCount().catch(() => 0);
      if (waiting > 0 && !window.confirm(i18n.t("field.logoutPending", { n: waiting }))) return;
      try { await post("/auth/logout"); } finally { await clearOffline().catch(() => undefined); setMe(null); qc.clear(); router.replace("/login"); }
    },
    setLocale: async (l) => {
      await i18n.changeLanguage(l);
      applyDirection(l);
      if (me) await post("/auth/locale", { locale: l }).catch(() => undefined);
    },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession(): SessionValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useSession outside SessionProvider");
  return v;
}
