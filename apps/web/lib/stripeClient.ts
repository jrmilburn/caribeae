import "server-only";

import { getAppBaseUrl, getStripeWebhookSecret, stripe } from "@/lib/stripe";

// Backward-compatible export. Prefer importing from '@/lib/stripe'.
export const stripeClient = stripe;

export { getStripeWebhookSecret, getAppBaseUrl };
