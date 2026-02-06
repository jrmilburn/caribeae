import Link from "next/link";

import { Button } from "@/components/ui/button";
import { AuthShell } from "@/components/auth/AuthShell";

export default function AuthErrorPage() {
  return (
    <AuthShell>
      <div className="space-y-6">
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-muted-foreground">
            Unable to sign in
          </p>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">We couldn&apos;t verify you</h1>
          <p className="text-sm text-muted-foreground">
            No family account found. Please contact Caribeae.
          </p>
        </div>
        <Button className="w-full sm:w-auto" asChild>
          <Link href="/auth">Back to sign in</Link>
        </Button>
      </div>
    </AuthShell>
  );
}
