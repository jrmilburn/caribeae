"use client";

import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { UiPaymentsStatus } from "@/server/stripe/connectAccounts";

type ConnectedAccountSnapshot = {
  stripeAccountId: string | null;
  stripeChargesEnabled: boolean;
  stripePayoutsEnabled: boolean;
  stripeDetailsSubmitted: boolean;
  stripeOnboardingStatus: string | null;
  updatedAtIso: string | null;
};

type CreateAccountResponse = {
  stripeAccountId: string;
  stripeChargesEnabled: boolean;
  stripePayoutsEnabled: boolean;
  stripeDetailsSubmitted: boolean;
  stripeOnboardingStatus: string | null;
};

type CreateAccountLinkResponse = {
  url: string;
};

type ApiErrorPayload = {
  error?: string;
};

type PaymentsSettingsClientProps = {
  clientId: string;
  initialSnapshot: ConnectedAccountSnapshot;
  initialStatus: UiPaymentsStatus;
  showReturnNotice: boolean;
  showRefreshNotice: boolean;
};

function deriveStatus(snapshot: ConnectedAccountSnapshot): UiPaymentsStatus {
  if (!snapshot.stripeAccountId) return "not_setup";
  if (snapshot.stripeChargesEnabled && snapshot.stripePayoutsEnabled) return "enabled";
  if (snapshot.stripeOnboardingStatus === "action_required") return "action_required";
  return "pending";
}

function statusCopy(status: UiPaymentsStatus) {
  if (status === "enabled") {
    return {
      label: "Enabled",
      badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200",
      description: "Payments enabled. Families can now pay securely through Stripe Checkout.",
    };
  }
  if (status === "action_required") {
    return {
      label: "Action required",
      badgeClass: "bg-amber-50 text-amber-700 border-amber-200",
      description: "Stripe needs more details before payments can be accepted.",
    };
  }
  if (status === "pending") {
    return {
      label: "Pending",
      badgeClass: "bg-slate-100 text-slate-700 border-slate-200",
      description: "Stripe onboarding is in progress. Complete setup to enable payments.",
    };
  }
  return {
    label: "Not setup",
    badgeClass: "bg-slate-100 text-slate-700 border-slate-200",
    description: "No Stripe account connected yet.",
  };
}

async function parseError(response: Response) {
  const payload = (await response.json().catch(() => null)) as ApiErrorPayload | null;
  return payload?.error ?? "Request failed. Please try again.";
}

export default function PaymentsSettingsClient(props: PaymentsSettingsClientProps) {
  const { clientId, initialSnapshot, initialStatus, showReturnNotice, showRefreshNotice } = props;

  const [snapshot, setSnapshot] = React.useState<ConnectedAccountSnapshot>(initialSnapshot);
  const [status, setStatus] = React.useState<UiPaymentsStatus>(initialStatus);
  const [isCreatingAccount, setIsCreatingAccount] = React.useState(false);
  const [isCreatingLink, setIsCreatingLink] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  const statusState = statusCopy(status);

  async function createConnectedAccount() {
    const response = await fetch("/api/stripe/connect/create-account", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId }),
    });

    if (!response.ok) {
      throw new Error(await parseError(response));
    }

    const payload = (await response.json()) as CreateAccountResponse;
    const nextSnapshot: ConnectedAccountSnapshot = {
      stripeAccountId: payload.stripeAccountId ?? null,
      stripeChargesEnabled: Boolean(payload.stripeChargesEnabled),
      stripePayoutsEnabled: Boolean(payload.stripePayoutsEnabled),
      stripeDetailsSubmitted: Boolean(payload.stripeDetailsSubmitted),
      stripeOnboardingStatus: payload.stripeOnboardingStatus ?? null,
      updatedAtIso: new Date().toISOString(),
    };
    setSnapshot(nextSnapshot);
    setStatus(deriveStatus(nextSnapshot));
  }

  async function createOnboardingLink() {
    const response = await fetch("/api/stripe/connect/create-account-link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId }),
    });

    if (!response.ok) {
      throw new Error(await parseError(response));
    }

    const payload = (await response.json()) as CreateAccountLinkResponse;
    if (!payload.url) {
      throw new Error("Stripe onboarding link was not returned.");
    }
    window.location.assign(payload.url);
  }

  const handleEnable = async () => {
    setErrorMessage(null);
    setIsCreatingAccount(true);
    try {
      await createConnectedAccount();
      setIsCreatingLink(true);
      await createOnboardingLink();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to start Stripe setup.");
    } finally {
      setIsCreatingAccount(false);
      setIsCreatingLink(false);
    }
  };

  const handleContinue = async () => {
    setErrorMessage(null);
    setIsCreatingLink(true);
    try {
      await createOnboardingLink();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to continue Stripe setup.");
      setIsCreatingLink(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 p-4 sm:p-6">
      {showReturnNotice ? (
        <Card className="border-emerald-200 bg-emerald-50/70">
          <CardContent className="pt-6 text-sm text-emerald-800">
            Returned from Stripe setup. If status does not update immediately, refresh in a few seconds.
          </CardContent>
        </Card>
      ) : null}

      {showRefreshNotice ? (
        <Card className="border-amber-200 bg-amber-50/70">
          <CardContent className="pt-6 text-sm text-amber-800">
            Stripe setup was interrupted. Continue onboarding to finish enabling payments.
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle>Online payments</CardTitle>
            <Badge className={cn("w-fit", statusState.badgeClass)} variant="outline">
              {statusState.label}
            </Badge>
          </div>
          <p className="text-sm text-slate-600">{statusState.description}</p>
        </CardHeader>

        <CardContent className="space-y-4">
          {status === "enabled" ? (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              Payments enabled ✅
            </div>
          ) : null}

          <div className="grid gap-3 text-sm sm:grid-cols-2">
            <div className="rounded-md border px-3 py-2">
              <div className="text-xs uppercase tracking-wide text-slate-500">Charges</div>
              <div className="mt-1 font-medium">{snapshot.stripeChargesEnabled ? "Enabled" : "Not enabled"}</div>
            </div>
            <div className="rounded-md border px-3 py-2">
              <div className="text-xs uppercase tracking-wide text-slate-500">Payouts</div>
              <div className="mt-1 font-medium">{snapshot.stripePayoutsEnabled ? "Enabled" : "Not enabled"}</div>
            </div>
          </div>

          {snapshot.stripeAccountId ? (
            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
              <div className="text-xs uppercase tracking-wide text-slate-500">Connected account ID</div>
              <div className="mt-1 overflow-x-auto font-mono text-xs text-slate-800">{snapshot.stripeAccountId}</div>
            </div>
          ) : null}

          {errorMessage ? (
            <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {errorMessage}
            </div>
          ) : null}

          <div className="flex flex-col gap-2 sm:flex-row">
            {!snapshot.stripeAccountId ? (
              <Button onClick={handleEnable} disabled={isCreatingAccount || isCreatingLink}>
                {isCreatingAccount || isCreatingLink ? "Preparing Stripe setup..." : "Enable online payments"}
              </Button>
            ) : status !== "enabled" ? (
              <Button onClick={handleContinue} disabled={isCreatingLink}>
                {isCreatingLink ? "Opening Stripe..." : "Continue Stripe setup"}
              </Button>
            ) : null}

            <Button type="button" variant="outline" onClick={() => window.location.reload()}>
              Refresh status
            </Button>
          </div>

          <p className="text-xs text-slate-500">
            Status is synchronized from Stripe webhooks (`account.updated`). Last local update:{" "}
            {snapshot.updatedAtIso ? new Date(snapshot.updatedAtIso).toLocaleString() : "Not available"}.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
