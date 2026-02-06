import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AuthShell } from "@/components/auth/AuthShell";

export default function AuthErrorPage() {
  return (
    <AuthShell>
      <Card className="w-full rounded-2xl border border-border/60 shadow-md sm:border-border">
        <CardHeader className="space-y-2">
          <CardTitle className="text-2xl">Unable to sign in</CardTitle>
          <p className="text-sm text-muted-foreground">
            No family account found. Please contact Caribeae.
          </p>
        </CardHeader>
        <CardContent>
          <Button className="w-full" asChild>
            <Link href="/auth">Back to sign in</Link>
          </Button>
        </CardContent>
      </Card>
    </AuthShell>
  );
}
