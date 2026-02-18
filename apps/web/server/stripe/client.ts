import "server-only";

import { getAppBaseUrl, getStripeWebhookSecret, stripeClient } from "@/lib/stripeClient";

export function getStripeClient() {
  return stripeClient;
}

export { getStripeWebhookSecret };

export function getAppUrl() {
  return getAppBaseUrl();
}
