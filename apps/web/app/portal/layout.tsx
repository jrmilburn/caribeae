import { PortalTopBar } from "@/components/portal/PortalTopBar";
import { AttributionFooter } from "@/components/AttributionFooter";

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-100 text-gray-900">
      <div className="flex min-h-screen flex-col">
        <PortalTopBar />
        <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
          <div className="flex-1">{children}</div>
          <AttributionFooter />
        </main>
      </div>
    </div>
  );
}
