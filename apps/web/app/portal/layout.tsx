import { PortalTopBar } from "@/components/portal/PortalTopBar";

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="relative min-h-screen overflow-hidden">
        <div
          className="pointer-events-none absolute inset-0"
          aria-hidden="true"
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(4,78,92,0.08),_transparent_55%)]" />
          <div className="absolute inset-0 bg-[linear-gradient(135deg,_rgba(4,47,74,0.06),_transparent_40%)]" />
          <div className="absolute -right-20 top-0 h-64 w-64 rounded-full bg-emerald-400/10 blur-3xl" />
          <div className="absolute -left-24 bottom-0 h-72 w-72 rounded-full bg-sky-400/10 blur-3xl" />
          <div className="absolute inset-0 bg-[url('/globe.svg')] bg-[length:520px] bg-right-top bg-no-repeat opacity-[0.04]" />
        </div>

        <div className="relative z-10">
          <PortalTopBar />
          <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
