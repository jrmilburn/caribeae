import "server-only";

import Stripe from "stripe";

type RequiredStripeEnv =
  | "STRIPE_SECRET_KEY"
  | "STRIPE_WEBHOOK_SECRET"
  | "APP_BASE_URL";

function requireEnv(name: RequiredStripeEnv): string {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    throw new Error(
      `Missing required environment variable: ${name}. Stripe payments cannot run without this setting.`
    );
  }

  return value;
}

requireEnv("STRIPE_SECRET_KEY");
const webhookSecret = requireEnv("STRIPE_WEBHOOK_SECRET");
const baseUrl = requireEnv("APP_BASE_URL").replace(/\/+$/, "");

// All Stripe API calls in this app should use this singleton client.
export const stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY!, {});

export function getStripeWebhookSecret() {
  return webhookSecret;
}

export function getAppBaseUrl() {
  return baseUrl;
}
