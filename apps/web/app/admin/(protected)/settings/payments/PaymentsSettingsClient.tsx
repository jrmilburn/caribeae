"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type UiPaymentsStatus = "not_connected" | "pending" | "connected";

type PaymentsSnapshot = {
  stripeAccountId: string | null;
  stripeAccountType: "standard" | null;
  stripeChargesEnabled: boolean;
  stripePayoutsEnabled: boolean;
  stripeDetailsSubmitted: boolean;
  stripeOnboardingStatus: "not_connected" | "pending" | "connected";
  stripeLastSyncedAtIso: string | null;
  updatedAtIso: string | null;
};

type RoutePayload = {
  url?: string;
  snapshot?: PaymentsSnapshot;
  error?: string;
  code?: string;
};

type PaymentsSettingsClientProps = {
  initialSnapshot: PaymentsSnapshot;
  initialStatus: UiPaymentsStatus;
  stripeQueryValue: string | null;
  stripeDashboardUrl: string;
};

function deriveStatus(snapshot: PaymentsSnapshot): UiPaymentsStatus {
  if (
    !snapshot.stripeAccountId ||
    snapshot.stripeAccountType !== "standard" ||
    snapshot.stripeOnboardingStatus === "not_connected"
  ) {
    return "not_connected";
  }
  if (snapshot.stripeOnboardingStatus === "connected") {
    return "connected";
  }
  return "pending";
}

function statusCopy(status: UiPaymentsStatus) {
  if (status === "connected") {
    return {
      label: "Connected",
      badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200",
      description: "Stripe is connected and online payments are enabled.",
    };
  }

  if (status === "pending") {
    return {
      label: "Pending verification",
      badgeClass: "bg-amber-50 text-amber-700 border-amber-200",
      description: "Stripe onboarding is not complete yet. Continue setup to enable payments.",
    };
  }

  return {
    label: "Not connected",
    badgeClass: "bg-slate-100 text-slate-700 border-slate-200",
    description: "No Stripe Standard account is connected for this swim school.",
  };
}

function formatDate(value: string | null) {
  if (!value) return "Not available";
  return new Date(value).toLocaleString();
}

async function postJson(pathname: string) {
  const response = await fetch(pathname, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });

  const payload = (await response.json().catch(() => null)) as RoutePayload | null;

  if (!response.ok) {
    throw new Error(payload?.error ?? "Request failed.");
  }

  return payload ?? {};
}

export default function PaymentsSettingsClient(props: PaymentsSettingsClientProps) {
  const { initialSnapshot, initialStatus, stripeQueryValue, stripeDashboardUrl } = props;

  const [snapshot, setSnapshot] = React.useState(initialSnapshot);
  const [status, setStatus] = React.useState(initialStatus);
  const [isConnecting, setIsConnecting] = React.useState(false);
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [isDisconnectingLegacy, setIsDisconnectingLegacy] = React.useState(false);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  const hasLegacyAccount = Boolean(snapshot.stripeAccountId && snapshot.stripeAccountType !== "standard");

  const statusState = statusCopy(status);

  const updateFromSnapshot = React.useCallback((next: PaymentsSnapshot) => {
    setSnapshot(next);
    setStatus(deriveStatus(next));
  }, []);

  const refreshStatus = React.useCallback(
    async (showSuccessToast: boolean) => {
      setErrorMessage(null);
      setIsRefreshing(true);

      try {
        const payload = await postJson("/admin/settings/payments/refresh-account-status");
        if (payload.snapshot) {
          updateFromSnapshot(payload.snapshot);
        }

        if (showSuccessToast) {
          toast.success("Stripe status refreshed.");
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to refresh Stripe status.";
        setErrorMessage(message);
      } finally {
        setIsRefreshing(false);
      }
    },
    [updateFromSnapshot]
  );

  const handleConnectOrContinue = React.useCallback(async () => {
    setErrorMessage(null);
    setIsConnecting(true);

    try {
      const payload = await postJson("/admin/settings/payments/connect-stripe");
      if (payload.snapshot) {
        updateFromSnapshot(payload.snapshot);
      }

      if (!payload.url) {
        throw new Error("Stripe onboarding link was not returned.");
      }

      window.location.assign(payload.url);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to start Stripe onboarding.";
      setErrorMessage(message);
    } finally {
      setIsConnecting(false);
    }
  }, [updateFromSnapshot]);

  const handleDisconnectLegacy = React.useCallback(async () => {
    setErrorMessage(null);
    setIsDisconnectingLegacy(true);

    try {
      const payload = await postJson("/admin/settings/payments/disconnect-legacy");
      if (payload.snapshot) {
        updateFromSnapshot(payload.snapshot);
      }
      toast.success("Legacy Stripe account disconnected.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to disconnect legacy account.";
      setErrorMessage(message);
    } finally {
      setIsDisconnectingLegacy(false);
    }
  }, [updateFromSnapshot]);

  React.useEffect(() => {
    if (stripeQueryValue === "return") {
      setNotice("Welcome back from Stripe. We refreshed your account status.");
      void refreshStatus(false);
      return;
    }

    if (stripeQueryValue === "refresh") {
      setNotice("Stripe setup was interrupted. Continue setup whenever you are ready.");
      void refreshStatus(false);
    }
  }, [refreshStatus, stripeQueryValue]);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 p-4 sm:p-6">
      {notice ? (
        <Card className="border-sky-200 bg-sky-50/80">
          <CardContent className="pt-6 text-sm text-sky-800">{notice}</CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle>Payments</CardTitle>
            <Badge className={cn("w-fit", statusState.badgeClass)} variant="outline">
              {statusState.label}
            </Badge>
          </div>
          <p className="text-sm text-slate-600">
            Connect your Stripe account to accept online payments in the client portal.
          </p>
          <p className="text-sm text-slate-600">{statusState.description}</p>
        </CardHeader>

        <CardContent className="space-y-4">
          {hasLegacyAccount ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              A legacy non-standard Stripe account is linked from the previous setup. Disconnect it, then connect
              Stripe again to use Standard onboarding.
            </div>
          ) : null}

          {errorMessage ? (
            <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {errorMessage}
            </div>
          ) : null}

          <div className="grid gap-3 text-sm sm:grid-cols-3">
            <div className="rounded-md border px-3 py-2">
              <div className="text-xs uppercase tracking-wide text-slate-500">Charges</div>
              <div className="mt-1 font-medium">{snapshot.stripeChargesEnabled ? "Enabled" : "Not enabled"}</div>
            </div>
            <div className="rounded-md border px-3 py-2">
              <div className="text-xs uppercase tracking-wide text-slate-500">Payouts</div>
              <div className="mt-1 font-medium">{snapshot.stripePayoutsEnabled ? "Enabled" : "Not enabled"}</div>
            </div>
            <div className="rounded-md border px-3 py-2">
              <div className="text-xs uppercase tracking-wide text-slate-500">Details submitted</div>
              <div className="mt-1 font-medium">{snapshot.stripeDetailsSubmitted ? "Yes" : "No"}</div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {hasLegacyAccount ? (
              <Button onClick={handleDisconnectLegacy} disabled={isDisconnectingLegacy || isConnecting || isRefreshing}>
                {isDisconnectingLegacy ? "Disconnecting..." : "Disconnect legacy account"}
              </Button>
            ) : status === "not_connected" ? (
              <Button onClick={handleConnectOrContinue} disabled={isConnecting || isRefreshing}>
                {isConnecting ? "Opening Stripe..." : "Connect Stripe"}
              </Button>
            ) : status === "pending" ? (
              <Button onClick={handleConnectOrContinue} disabled={isConnecting || isRefreshing}>
                {isConnecting ? "Opening Stripe..." : "Continue Stripe setup"}
              </Button>
            ) : (
              <>
                <Button asChild>
                  <Link href={stripeDashboardUrl} target="_blank" rel="noreferrer">
                    Manage in Stripe
                  </Link>
                </Button>
                <Button variant="outline" onClick={handleConnectOrContinue} disabled={isConnecting || isRefreshing}>
                  {isConnecting ? "Opening Stripe..." : "Reconnect"}
                </Button>
              </>
            )}

            <Button type="button" variant="outline" onClick={() => void refreshStatus(true)} disabled={isRefreshing || isConnecting}>
              {isRefreshing ? "Refreshing..." : "Refresh status"}
            </Button>
          </div>

          <p className="text-xs text-slate-500">
            Last Stripe sync: {formatDate(snapshot.stripeLastSyncedAtIso)}. Last local update: {formatDate(snapshot.updatedAtIso)}.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
