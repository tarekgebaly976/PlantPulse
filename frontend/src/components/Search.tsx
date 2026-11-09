"use client";

import { ActionIcon, Badge, CloseButton, Group, Kbd, Loader, Modal, ScrollArea, Stack, Text, TextInput, Tooltip, UnstyledButton } from "@mantine/core";
import { useDebouncedValue, useHotkeys } from "@mantine/hooks";
import { IconSearch } from "@tabler/icons-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQ } from "@/lib/hooks";
import { StatusBadge } from "./ui";

// Arabic letters often typed differently are matched as the same letter (أ إ آ → ا, ى → ي, ة → ه), like the server.
const FOLD: Record<string, string> = { "أ": "ا", "إ": "ا", "آ": "ا", "ى": "ي", "ة": "ه" };
export const fold = (s: string) => s.replace(/[أإآىة]/g, (c) => FOLD[c] ?? c).toLowerCase();

/** Every word of `q` is found in at least one of the fields (the same rule as the server). Empty search matches all. */
export function textMatch(q: string, ...fields: (string | number | null | undefined)[]): boolean {
  const words = fold(q.trim()).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = fold(fields.filter((f) => f !== null && f !== undefined).join(" \u0001 "));
  // 1-2 characters must start a word ("OS" finds "OS1"; not the 1 inside "WO-P1-000123"), like the server
  return words.every((w) => (w.length <= 2
    ? new RegExp(`(^|[^\\p{L}\\p{N}])${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "u").test(hay)
    : hay.includes(w)));
}

/** Search box for a list: magnifier, clear button, `?q=` from a link (top-bar search) as the starting value. */
export function SearchBox({ value, onChange, placeholder, w = 260 }: { value: string; onChange: (v: string) => void; placeholder?: string; w?: number | string }) {
  const { t } = useTranslation();
  return (
    <TextInput w={w} value={value} onChange={(e) => onChange(e.currentTarget.value)} placeholder={placeholder ?? t("common.search")} aria-label={t("common.search")}
      leftSection={<IconSearch size={16} />} rightSection={value ? <CloseButton size="sm" aria-label="clear" onClick={() => onChange("")} /> : null} />
  );
}

/** Search text kept in state, starting from `?q=` in the address (links from the top-bar search), plus a debounced
 *  copy for server queries. */
export function useSearch(): [string, (v: string) => void, string] {
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [debounced] = useDebouncedValue(q.trim(), 300);
  return [q, setQ, debounced];
}

interface Hit { id: string; title: string; sub: string | null; status: string | null; link: string }
interface Result { q: string; groups: { kind: string; items: Hit[] }[] }

/** Top-bar search: one box for equipment, work orders, requests, parts, PM plans, lubrication and condition-monitoring
 *  points, RCAs and shutdowns. Ctrl+K (or /) opens it. */
export function GlobalSearch() {
  const { t } = useTranslation();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [debounced] = useDebouncedValue(q.trim(), 250);
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const res = useQ<Result>(open && debounced.length >= 2 ? "/search" : null, { q: debounced });
  const flat = (res.data?.groups ?? []).flatMap((g) => g.items);
  useHotkeys([["mod+K", () => setOpen(true)], ["/", () => setOpen(true)]]);
  const go = (h: Hit | undefined) => { if (!h) return; setOpen(false); setQ(""); router.push(h.link); };
  let i = -1;
  return (
    <>
      <Tooltip label={`${t("search.title")} (Ctrl+K)`}>
        <ActionIcon variant="subtle" aria-label={t("search.title")} data-testid="global-search" onClick={() => setOpen(true)}><IconSearch size={20} /></ActionIcon>
      </Tooltip>
      <Modal opened={open} onClose={() => setOpen(false)} withCloseButton={false} size="lg" yOffset="8vh" padding="sm"
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(s + 1, flat.length - 1)); }
          if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
          if (e.key === "Enter") { e.preventDefault(); go(flat[sel]); }
        }}>
        <TextInput ref={input} data-autofocus size="md" value={q} onChange={(e) => { setQ(e.currentTarget.value); setSel(0); }} placeholder={t("search.placeholder")}
          leftSection={<IconSearch size={18} />} rightSection={res.isFetching ? <Loader size="xs" /> : q ? <CloseButton aria-label="clear" onClick={() => { setQ(""); setSel(0); }} /> : null} />
        <ScrollArea.Autosize mah="62vh" mt="sm">
          {debounced.length < 2 ? <Text size="sm" c="dimmed" p="sm">{t("search.hint")}</Text>
            : res.data && !flat.length ? <Text size="sm" c="dimmed" p="sm">{t("search.none", { q: debounced })}</Text>
              : (res.data?.groups ?? []).map((g) => (
                <Stack key={g.kind} gap={2} mb="sm">
                  <Text size="xs" fw={700} c="dimmed" tt="uppercase" px="xs">{t(`search.kinds.${g.kind}`)}</Text>
                  {g.items.map((h) => {
                    i += 1;
                    const me = i;
                    return (
                      <UnstyledButton key={`${g.kind}-${h.id}`} onClick={() => go(h)} onMouseEnter={() => setSel(me)} px="xs" py={6}
                        style={{ borderRadius: 6, background: sel === me ? "var(--mantine-color-default-hover)" : undefined }}>
                        <Group justify="space-between" wrap="nowrap" gap="xs">
                          <Stack gap={0} style={{ minWidth: 0 }}>
                            <Text size="sm" fw={500} truncate>{h.title}</Text>
                            {h.sub && <Text size="xs" c="dimmed" truncate>{h.sub}</Text>}
                          </Stack>
                          {h.status && <StatusBadge value={h.status} size="sm" />}
                        </Group>
                      </UnstyledButton>
                    );
                  })}
                </Stack>
              ))}
        </ScrollArea.Autosize>
        <Group gap={6} mt="xs" visibleFrom="sm"><Kbd size="xs">↑</Kbd><Kbd size="xs">↓</Kbd><Text size="xs" c="dimmed">{t("search.keys")}</Text><Badge size="xs" variant="outline" ms="auto">Ctrl+K</Badge></Group>
      </Modal>
    </>
  );
}
