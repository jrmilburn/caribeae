"use client";

import { ClerkProvider } from "@clerk/nextjs";
import { Toaster } from "sonner";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      {children}
      <Toaster richColors closeButton />
    </ClerkProvider>
  );
}
