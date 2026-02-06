"use client";

import type { ReactNode } from "react";

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-100 px-4 py-10 sm:flex sm:items-center sm:justify-center sm:py-16">
      <div className="w-full max-w-md">
        <div className="motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2">
          {children}
        </div>
      </div>
    </div>
  );
}
