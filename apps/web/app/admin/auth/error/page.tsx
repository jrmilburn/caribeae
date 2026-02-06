import Link from "next/link";

import { Button } from "@/components/ui/button";
import { AuthShell } from "@/components/auth/AuthShell";

export default function AdminAuthErrorPage() {
  return (
    <AuthShell mode="admin">
      <div className="space-y-6">
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-muted-foreground">
            Unable to sign in
          </p>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Admin access required</h1>
          <p className="text-sm text-muted-foreground">
            No admin account found. Please contact Caribeae.
          </p>
        </div>
        <Button className="w-full sm:w-auto" asChild>
          <Link href="/admin/auth">Back to admin sign in</Link>
        </Button>
      </div>
    </AuthShell>
  );
}
