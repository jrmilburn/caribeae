import { PortalTopBar } from "@/components/portal/PortalTopBar";
import { AttributionFooter } from "@/components/AttributionFooter";

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-[100dvh] overflow-hidden bg-gray-100 text-gray-900">
      <div className="flex h-full min-h-0 flex-col">
        <PortalTopBar />
        <main className="mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col overflow-y-scroll px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
          <div className="flex-1">{children}</div>
          <AttributionFooter />
        </main>
      </div>
    </div>
  );
}
