import type { ReactNode } from "react";
import { LocalSimulationBanner } from "@/components/LocalSimulationBanner";
import { PaperDataBanner } from "@/components/PaperDataBanner";

// Every authenticated page carries both banners, persistently — see
// lib/local-broker/README.md and lib/order-executor/README.md's standing
// rule for order-related UI, applied here at the layout level so nothing
// under app/(app)/ can ever render without them.
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <LocalSimulationBanner />
      <PaperDataBanner />
      {children}
    </div>
  );
}
