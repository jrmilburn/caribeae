import "server-only";

import Stripe from "stripe";

let stripeClient: Stripe | null = null;

function requireEnv(name: string) {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function getStripeClient() {
  if (!stripeClient) {
    stripeClient = new Stripe(requireEnv("STRIPE_SECRET_KEY"));
  }
  return stripeClient;
}

export function getStripeWebhookSecret() {
  return requireEnv("STRIPE_WEBHOOK_SECRET");
}

export function getAppUrl() {
  const configured = process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL;
  if (!configured || configured.trim().length === 0) {
    throw new Error("Missing APP_URL (or NEXT_PUBLIC_APP_URL) for Stripe redirect URLs.");
  }

  return configured.replace(/\/+$/, "");
}
