import "server-only";

import Stripe from "stripe";

const APP_URL_ENV_NAMES = ["APP_URL", "APP_BASE_URL"] as const;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    throw new Error(`Missing required environment variable: ${name}.`);
  }
  return value.trim();
}

function readAppUrl(): string {
  for (const name of APP_URL_ENV_NAMES) {
    const value = process.env[name];
    if (value && value.trim().length > 0) {
      return value.trim().replace(/\/+$/, "");
    }
  }

  throw new Error(
    `Missing required environment variable: APP_URL or APP_BASE_URL. Stripe onboarding links need an absolute app URL.`
  );
}

function readConnectType(): "standard" {
  const configured = process.env.STRIPE_CONNECT_ACCOUNT_TYPE?.trim().toLowerCase() ?? "standard";
  if (configured !== "standard") {
    throw new Error(
      `Unsupported STRIPE_CONNECT_ACCOUNT_TYPE: ${configured}. This app only supports Stripe Connect Standard accounts.`
    );
  }
  return "standard";
}

const stripeSecretKey = requireEnv("STRIPE_SECRET_KEY");
const appBaseUrl = readAppUrl();
const connectAccountType = readConnectType();

const configuredApiVersion = process.env.STRIPE_API_VERSION?.trim();

export const stripe = new Stripe(stripeSecretKey, {
  ...(configuredApiVersion
    ? {
        // Keep this aligned with the Stripe version configured for the app.
        apiVersion: configuredApiVersion as Stripe.StripeConfig["apiVersion"],
      }
    : {}),
});

export function getAppBaseUrl() {
  return appBaseUrl;
}

export function getStripeWebhookSecret() {
  return requireEnv("STRIPE_WEBHOOK_SECRET");
}

export function getSupportedStripeConnectAccountType() {
  return connectAccountType;
}

export function getStripeDashboardUrl() {
  return stripeSecretKey.startsWith("sk_test_")
    ? "https://dashboard.stripe.com/test"
    : "https://dashboard.stripe.com";
}
