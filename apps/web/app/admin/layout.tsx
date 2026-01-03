// app/(protected)/layout.tsx
import { AppNavbar } from "@/components/navbar/navbar";
import { AppFooter } from "./footer";

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppNavbar>
      <div className="max-h-screen h-screen flex flex-col">
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
        <AppFooter />
      </div>
    </AppNavbar>
  );
}
