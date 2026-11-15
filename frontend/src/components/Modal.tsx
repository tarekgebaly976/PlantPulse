"use client";

// Every dialog of the app closes with the phone's Back button (and the browser's), like its X, instead of leaving the
// page. Opening a dialog adds one history entry (keeping Next.js's own state, so its router stays on the same page);
// Back removes it and closes the dialog on top only.
// A dialog closed with its X or a button does not go back in history (that could cancel a page the dialog just
// opened): its entry is only counted as "used". The next Back skips used entries, so one press still leaves the page.
// A navigation to another page clears the count (those entries are then behind the new page).

import { Modal as MantineModal, type ModalProps } from "@mantine/core";
import { useEffect, useRef } from "react";

type Entry = { id: number; close: () => void; popped: boolean };
const stack: Entry[] = [];
let seq = 0;
let used = 0; // entries left by dialogs closed with a button, on top of the page's own entry
let ownPush = false;
let installed = false;

function install(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;
  const push = window.history.pushState.bind(window.history);
  window.history.pushState = (data: unknown, unused: string, url?: string | URL | null) => {
    if (!ownPush) used = 0; // a real navigation: the used entries are now behind another page
    return push(data, unused, url);
  };
  window.addEventListener("popstate", () => {
    const top = stack.pop();
    if (top) { top.popped = true; top.close(); return; } // Back closes the dialog on top
    if (used > 0) { used--; window.history.back(); } // skip an entry of a dialog already closed
  });
}

/** Back closes this dialog while it is open (dialogs opened on top of it close first). */
export function useBackToClose(opened: boolean, onClose: () => void): void {
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; }, [onClose]);
  useEffect(() => {
    if (!opened) return;
    install();
    const entry: Entry = { id: ++seq, close: () => close.current(), popped: false };
    stack.push(entry);
    ownPush = true;
    try { window.history.pushState({ ...(window.history.state ?? {}), ppModal: entry.id }, ""); } finally { ownPush = false; }
    return () => {
      const i = stack.indexOf(entry);
      if (i >= 0) stack.splice(i, 1);
      if (!entry.popped) used++;
    };
  }, [opened]);
}

/** Mantine's Modal with Back-to-close (same props). */
export function Modal(props: ModalProps) {
  useBackToClose(props.opened, props.onClose);
  return <MantineModal {...props} />;
}
