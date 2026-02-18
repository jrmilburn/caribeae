import "server-only";

import { getAppBaseUrl, getStripeWebhookSecret, stripe } from "@/lib/stripe";

export function getStripeClient() {
  return stripe;
}

export { getStripeWebhookSecret };

export function getAppUrl() {
  return getAppBaseUrl();
}
