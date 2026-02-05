import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function PortalBlockedState() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Access unavailable</CardTitle>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        Please contact Caribeae to access your account.
      </CardContent>
    </Card>
  );
}
