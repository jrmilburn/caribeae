import assert from "node:assert";

import { StripeAccountType, StripeOnboardingStatus } from "@prisma/client";
import type Stripe from "stripe";

import {
  buildStandardAccountCreateParams,
  refreshAdminStripeAccountStatus,
  startAdminStripeConnectOnboarding,
} from "./adminPayments";

async function test(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    console.log(`✅ ${name}`);
  } catch (error) {
    console.error(`❌ ${name}`);
    console.error(error);
    process.exitCode = 1;
  }
}

function buildStore() {
  let row = {
    stripeAccountId: null as string | null,
    stripeAccountType: null as StripeAccountType | null,
    stripeChargesEnabled: false,
    stripePayoutsEnabled: false,
    stripeDetailsSubmitted: false,
    stripeOnboardingStatus: StripeOnboardingStatus.NOT_CONNECTED,
    stripeLastSyncedAt: null as Date | null,
    updatedAt: new Date("2026-02-18T00:00:00.000Z"),
  };

  return {
    findUnique: async () => (row.stripeAccountId ? { stripeAccountId: row.stripeAccountId, stripeAccountType: row.stripeAccountType } : null),
    upsert: async (args: {
      update: Partial<typeof row>;
      create: Partial<typeof row>;
      select: Record<string, true>;
    }) => {
      row = {
        ...row,
        ...(row.stripeAccountId ? args.update : args.create),
        updatedAt: new Date("2026-02-18T00:05:00.000Z"),
      };
      return { ...row };
    },
    update: async (args: { data: Partial<typeof row>; select: Record<string, true> }) => {
      row = {
        ...row,
        ...args.data,
        updatedAt: new Date("2026-02-18T00:06:00.000Z"),
      };
      return { ...row };
    },
  };
}

void (async () => {
  await test("buildStandardAccountCreateParams uses type standard", () => {
    const params = buildStandardAccountCreateParams({
      clientId: "caribeae",
      contactEmail: "owner@example.com",
      businessDisplayName: "Caribeae",
      businessSupportEmail: "support@example.com",
      businessUrl: "https://example.com",
    });

    assert.strictEqual(params.type, "standard");
  });

  await test("startAdminStripeConnectOnboarding rejects when admin check fails", async () => {
    const store = buildStore();

    await assert.rejects(() =>
      startAdminStripeConnectOnboarding({
        requireAdmin: async () => {
          throw new Error("Unauthorized");
        },
        connectedAccountStore: store as never,
        stripe: {
          accounts: {
            create: async () => ({}) as Stripe.Account,
            retrieve: async () => ({}) as Stripe.Account,
          },
          accountLinks: {
            create: async () => ({ url: "https://stripe.test/onboarding" }) as Stripe.AccountLink,
          },
        },
        appBaseUrl: "https://app.example.com",
        contactEmail: "owner@example.com",
        businessDisplayName: "Caribeae",
        businessSupportEmail: "support@example.com",
        businessUrl: "https://example.com",
      })
    );
  });

  await test("startAdminStripeConnectOnboarding creates standard account", async () => {
    const store = buildStore();
    let receivedType: string | undefined;

    const result = await startAdminStripeConnectOnboarding({
      requireAdmin: async () => ({ admin: true }),
      connectedAccountStore: store as never,
      stripe: {
        accounts: {
          create: async (params) => {
            receivedType = params.type;
            return {
              id: "acct_standard_123",
              type: "standard",
              charges_enabled: false,
              payouts_enabled: false,
              details_submitted: false,
            } as Stripe.Account;
          },
          retrieve: async () => {
            throw new Error("not-used");
          },
        },
        accountLinks: {
          create: async () => ({ url: "https://stripe.test/onboarding" }) as Stripe.AccountLink,
        },
      },
      appBaseUrl: "https://app.example.com",
      contactEmail: "owner@example.com",
      businessDisplayName: "Caribeae",
      businessSupportEmail: "support@example.com",
      businessUrl: "https://example.com",
      now: new Date("2026-02-18T00:01:00.000Z"),
    });

    assert.strictEqual(receivedType, "standard");
    assert.strictEqual(result.snapshot.stripeOnboardingStatus, "pending");
    assert.strictEqual(result.snapshot.stripeAccountType, "standard");
    assert.ok(result.accountLinkUrl.includes("https://stripe.test"));
  });

  await test("refreshAdminStripeAccountStatus stores connected snapshot", async () => {
    const store = buildStore();

    await startAdminStripeConnectOnboarding({
      requireAdmin: async () => ({ admin: true }),
      connectedAccountStore: store as never,
      stripe: {
        accounts: {
          create: async () =>
            ({
              id: "acct_standard_456",
              type: "standard",
              charges_enabled: false,
              payouts_enabled: false,
              details_submitted: false,
            }) as Stripe.Account,
          retrieve: async () => {
            throw new Error("not-used");
          },
        },
        accountLinks: {
          create: async () => ({ url: "https://stripe.test/onboarding" }) as Stripe.AccountLink,
        },
      },
      appBaseUrl: "https://app.example.com",
      contactEmail: "owner@example.com",
      businessDisplayName: "Caribeae",
      businessSupportEmail: "support@example.com",
      businessUrl: "https://example.com",
      now: new Date("2026-02-18T00:01:00.000Z"),
    });

    const snapshot = await refreshAdminStripeAccountStatus({
      requireAdmin: async () => ({ admin: true }),
      connectedAccountStore: store as never,
      stripe: {
        accounts: {
          create: async () => {
            throw new Error("not-used");
          },
          retrieve: async () =>
            ({
              id: "acct_standard_456",
              type: "standard",
              charges_enabled: true,
              payouts_enabled: true,
              details_submitted: true,
            }) as Stripe.Account,
        },
        accountLinks: {
          create: async () => {
            throw new Error("not-used");
          },
        },
      },
      appBaseUrl: "https://app.example.com",
      now: new Date("2026-02-18T00:02:00.000Z"),
    });

    assert.strictEqual(snapshot.stripeOnboardingStatus, "connected");
    assert.strictEqual(snapshot.stripeAccountType, "standard");
    assert.strictEqual(snapshot.stripeChargesEnabled, true);
    assert.strictEqual(snapshot.stripePayoutsEnabled, true);
    assert.strictEqual(snapshot.stripeDetailsSubmitted, true);
  });
})();
