import Link from "next/link";

import { Button } from "@/components/ui/button";
import { formatBrisbaneDate } from "@/lib/dates/formatBrisbaneDate";

type PortalPendingApprovalProps = {
  onboarding: {
    guardianName: string;
    familyName: string;
    submittedAt: Date;
  };
};

export function PortalPendingApproval({ onboarding }: PortalPendingApprovalProps) {
  return (
    <div className="space-y-8">
      <section className="space-y-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-teal-700">
            Client Portal
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-gray-900 sm:text-3xl">
            Your onboarding request is awaiting approval
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-gray-600">
            You&apos;re signed in successfully, but the Caribeae team still needs to review and accept your onboarding
            request before your family account can be activated.
          </p>
        </div>

        <div className="overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-gray-200">
          <div className="border-b border-gray-200 bg-gray-50/80 px-4 py-4 sm:px-6">
            <div className="inline-flex rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700 ring-1 ring-amber-200">
              Awaiting admin review
            </div>
          </div>
          <div className="grid gap-4 px-4 py-5 sm:px-6 lg:grid-cols-3">
            <div className="rounded-lg border border-gray-200 bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Primary guardian</p>
              <p className="mt-2 text-sm font-medium text-gray-900">{onboarding.guardianName}</p>
            </div>
            <div className="rounded-lg border border-gray-200 bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Family name on approval</p>
              <p className="mt-2 text-sm font-medium text-gray-900">{onboarding.familyName}</p>
            </div>
            <div className="rounded-lg border border-gray-200 bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Submitted</p>
              <p className="mt-2 text-sm font-medium text-gray-900">{formatBrisbaneDate(onboarding.submittedAt)}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        <article className="rounded-lg bg-white p-6 shadow-sm ring-1 ring-gray-200">
          <h2 className="text-base font-semibold text-gray-900">What happens next</h2>
          <p className="mt-2 text-sm text-gray-600">
            An admin will review your details, create or connect your family record, and enable the rest of the
            portal once everything is ready.
          </p>
        </article>

        <article className="rounded-lg bg-white p-6 shadow-sm ring-1 ring-gray-200">
          <h2 className="text-base font-semibold text-gray-900">Need to update something?</h2>
          <p className="mt-2 text-sm text-gray-600">
            If your contact details have changed, email the team so they can update your request before approval.
          </p>
          <div className="mt-4">
            <Button asChild variant="outline">
              <Link href="mailto:rachele@caribeae.com.au">Email Caribeae</Link>
            </Button>
          </div>
        </article>
      </section>
    </div>
  );
}
