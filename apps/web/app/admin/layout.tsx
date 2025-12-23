// app/(protected)/layout.tsx
import { AppNavbar } from "@/components/navbar/navbar";

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppNavbar>
      <main className="h-screen max-h-screen">
      {children}
      </main>
    </AppNavbar>
    );
}
