// app/(protected)/layout.tsx
import { AppNavbar } from "@/components/navbar/navbar";
import { GlobalBackAffordance } from "@/components/navigation/GlobalBackAffordance";
import { AppFooter } from "./footer";

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppNavbar>
      <GlobalBackAffordance />
      <div className="max-h-screen h-screen flex flex-col">
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
        <AppFooter />
      </div>
    </AppNavbar>
  );
}
