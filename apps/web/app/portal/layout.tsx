import { PortalTopBar } from "@/components/portal/PortalTopBar";
import { AttributionFooter } from "@/components/AttributionFooter";
import { getFamilyForCurrentUser } from "@/server/portal/getFamilyForCurrentUser";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const access = await getFamilyForCurrentUser();
  const navItems =
    access.status === "PENDING_APPROVAL"
      ? [{ href: "/portal", label: "Dashboard" }]
      : undefined;

  return (
    <div className="h-[100dvh] overflow-hidden bg-gray-100 text-gray-900">
      <div className="flex h-full min-h-0 flex-col">
        <PortalTopBar items={navItems} />
        <main className="min-h-0 flex-1 overflow-y-scroll">
          <div className="mx-auto flex min-h-full w-full max-w-7xl flex-col px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
            <div className="flex-1">{children}</div>
            <AttributionFooter />
          </div>
        </main>
      </div>
    </div>
  );
}
