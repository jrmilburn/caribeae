This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Stripe Connect (Standard)

The admin payments integration uses **Stripe Connect Standard** accounts only.

### Required environment variables

```bash
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
APP_URL=https://your-app-domain.example
# Optional fallback if APP_URL is not set:
APP_BASE_URL=https://your-app-domain.example
```

Optional helpers:

```bash
# Defaults to \"caribeae\" when unset.
STRIPE_CLIENT_ID_DEFAULT=caribeae

# Must remain \"standard\" if set (any other value throws).
STRIPE_CONNECT_ACCOUNT_TYPE=standard

# Optional business profile prefill during onboarding.
STRIPE_BUSINESS_NAME=\"Caribeae Swim School\"
STRIPE_BUSINESS_SUPPORT_EMAIL=\"support@example.com\"
STRIPE_BUSINESS_URL=\"https://example.com\"
```

### Test onboarding flow (Stripe test mode)

1. Sign in as an admin and open `/admin/settings/payments`.
2. Click **Connect Stripe** and complete onboarding in Stripe.
3. After Stripe redirects back (`?stripe=return` or `?stripe=refresh`), the page auto-refreshes account status.
4. Confirm status becomes **Connected**.
5. In the client portal (`/portal/billing`), verify **Pay now** is enabled and checkout starts successfully.

### What “Standard connected account” means

- The swim school owner controls and owns the Stripe account.
- Stripe manages most compliance and account management directly with the owner.
- The platform creates checkout/payment intents and routes funds via `transfer_data.destination`.

### Troubleshooting

- `refresh_url` loop (back on `?stripe=refresh`):
  - This usually means onboarding was interrupted or not completed.
  - Click **Continue Stripe setup** to generate a fresh one-time onboarding link.

- Missing capabilities / status stays pending:
  - Use **Refresh status** on `/admin/settings/payments`.
  - Check the connected Stripe dashboard for outstanding verification requirements.
  - Ensure `charges_enabled`, `payouts_enabled`, and `details_submitted` are all true.
