// app/(protected)/layout.tsx
import { Suspense } from "react";

import { AppNavbar } from "@/components/navbar/navbar";
import { AppFooter } from "./footer";
import { SettingsShell } from "./settings/SettingsShell";
import { ensureAdminAccess } from "@/server/admin/ensureAdminAccess";

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  await ensureAdminAccess();

  return (
    <Suspense fallback={null}>
      <AppNavbar>
        <div className="flex h-full min-h-0 flex-col">
          <main className="min-h-0 flex-1 overflow-y-auto">
            <SettingsShell>{children}</SettingsShell>
          </main>
          <AppFooter className="shrink-0" />
        </div>
      </AppNavbar>
    </Suspense>
  );
}
