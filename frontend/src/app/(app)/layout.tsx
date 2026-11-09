import { Suspense, type ReactNode } from "react";
import { AppFrame } from "@/components/AppFrame";

// Suspense: pages read `?q=` (search links from the top bar) with useSearchParams.
export default function AppLayout({ children }: { children: ReactNode }) {
  return <AppFrame><Suspense>{children}</Suspense></AppFrame>;
}
