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

let stripeClient: Stripe | null = null;

function createStripeClient() {
  const configuredApiVersion = process.env.STRIPE_API_VERSION?.trim();

  return new Stripe(requireEnv("STRIPE_SECRET_KEY"), {
    ...(configuredApiVersion
      ? {
          // Keep this aligned with the Stripe version configured for the app.
          apiVersion: configuredApiVersion as Stripe.StripeConfig["apiVersion"],
        }
      : {}),
  });
}

export function getStripeClient() {
  if (!stripeClient) {
    stripeClient = createStripeClient();
  }

  return stripeClient;
}

export const stripe = new Proxy({} as Stripe, {
  get(_target, prop) {
    const client = getStripeClient();
    const value = Reflect.get(client as object, prop);
    return typeof value === "function" ? value.bind(client) : value;
  },
});

export function getAppBaseUrl() {
  return readAppUrl();
}

export function getStripeWebhookSecret() {
  return requireEnv("STRIPE_WEBHOOK_SECRET");
}

export function getSupportedStripeConnectAccountType() {
  return readConnectType();
}

export function getStripeDashboardUrl() {
  return process.env.STRIPE_SECRET_KEY?.trim().startsWith("sk_test_")
    ? "https://dashboard.stripe.com/test"
    : "https://dashboard.stripe.com";
}
