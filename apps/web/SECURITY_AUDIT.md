# Security Audit Report

Date: February 10, 2026
Scope: Next.js app (App Router), server actions, API routes, Prisma DB layer, Clerk auth, Twilio/Supabase/Sendgrid integrations.

## Executive Summary
The codebase is in solid shape for a growing admin + client portal, and recent hardening work in this audit materially improved security. The highest remaining risk is secrets committed in `.env`, which enables full compromise if the repo leaks. The next most important gap is the public onboarding update flow, which allows PII updates based only on request/family IDs without a signed token. Rate limiting for auth and pending-auth state are currently in-memory, which weakens brute-force defenses in multi-instance deployments.

Key wins applied during this audit:
- Baseline security headers and CSP are now enforced.
- Missing admin checks on admin server actions are fixed.
- Input validation tightened for admin actions and file uploads.
- Rate limiting and webhook idempotency added for key endpoints.

## Threat Model (Short)
Assets:
- PII for families and students (names, emails, phones, addresses, DOB, medical notes).
- Billing data (invoices, payments, receipts, credits).
- Messaging (SMS/Email content, delivery metadata).
- Admin-only workflows (scheduling, enrolments, accounting, reporting).

Trust boundaries:
- Public unauthenticated endpoints (onboarding, auth eligibility/start).
- Authenticated client portal (family self-service).
- Admin portal (privileged operations).
- Third-party webhooks (Twilio inbound/status, Sendgrid, Supabase storage).

Primary attack surfaces:
- Server actions and API routes.
- Public onboarding flow endpoints.
- Webhook endpoints.
- Supply chain and secrets management.

## Overall Security Score
**84 / 100** (post-fix)

### Category Subscores (0–100)
- AuthN/AuthZ & session handling: 82
- Data access & multi-tenancy boundaries: 88
- Input validation & injection defenses: 90
- XSS/CSRF/clickjacking & browser protections: 80
- Secrets & sensitive data handling: 55
- Dependencies & supply chain: 75
- Logging/monitoring & incident readiness: 65
- Infrastructure/config (headers, cookies, env, build): 70

### Scoring Breakdown (Deductions)
| Finding | Severity | Confidence | Exposure | Deduction |
| --- | --- | --- | --- | --- |
| Secrets committed in `.env` | Critical (20) | High (1.0) | Internal-only (0.4) | 8.0 |
| Onboarding update endpoints lack strong authorization | Medium (6) | Medium (0.7) | Internet-facing (1.0) | 4.2 |
| Auth rate limits and pending-auth state are in-memory | Low (2) | Medium (0.7) | Internet-facing (1.0) | 1.4 |
| Eligibility endpoint returns internal `familyId` | Low (2) | High (1.0) | Internet-facing (1.0) | 2.0 |
| **Total Deductions** |  |  |  | **15.6** |

## Findings (Grouped by Severity)

### CRITICAL — Secrets committed to repository
Severity: Critical | Confidence: High | Exposure: Internal-only

Impact:
Attackers with repo access can use database credentials, Clerk secret, Twilio auth token, and Sendgrid API key to exfiltrate data, send messages, or impersonate the application.

Affected areas:
- `.env`

Proof (code references):
- `.env:12–24`

Exploit scenario:
A leaked repo (or a compromised developer laptop) exposes the DB URL and service credentials, enabling full read/write access to production data and messaging abuse.

Recommended fix:
- Rotate all secrets immediately.
- Remove `.env` from version control and add to `.gitignore`.
- Replace with `.env.example` containing placeholder values.
- Use a secret manager in CI/CD (Vercel/Render/1Password/Secrets Manager).

Patch suggestion:
```bash
# Remove tracked secrets file

git rm --cached .env

# Prevent re-adding secrets
echo ".env" >> .gitignore

# Add a redacted template
touch .env.example
```

OWASP ASVS mapping:
- V14.4 (Secure configuration), V15.1 (Sensitive data handling)

OWASP Top 10 mapping:
- A05: Security Misconfiguration

---

### MEDIUM — Onboarding update endpoints lack strong authorization
Severity: Medium | Confidence: Medium | Exposure: Internet-facing

Impact:
Public onboarding updates can modify family contact details and onboarding records using only a `requestId` and `familyId`. If those IDs leak (logs, email forwarding, guessable links), attackers can alter PII.

Affected areas:
- `server/onboarding/updateOnboardingContact.ts`
- `server/onboarding/submitOnboardingRequest.ts`

Proof (code references):
- `server/onboarding/updateOnboardingContact.ts:17–60`
- `server/onboarding/submitOnboardingRequest.ts:101–136`

Exploit scenario:
An attacker obtains a valid onboarding request ID (e.g., via email forwarding) and updates contact info to hijack communications or misdirect invoices.

Recommended fix:
- Require a signed, short-lived token to authorize onboarding updates.
- Store a hashed token in the onboarding record and validate it on update.
- Alternatively, require a logged-in session for updates.

Patch suggestion (conceptual):
```ts
// 1) Add token fields to OnboardingRequest
//    onboardingUpdateTokenHash, onboardingUpdateTokenExpiresAt

// 2) Generate token on request creation and email a signed link

// 3) Validate token + expiry on update
if (!verifyToken(input.token, request.onboardingUpdateTokenHash)) {
  return { ok: false, error: "Unauthorized" };
}
if (request.onboardingUpdateTokenExpiresAt < new Date()) {
  return { ok: false, error: "Link expired" };
}
```

OWASP ASVS mapping:
- V4 (Access control), V3 (Session management)

OWASP Top 10 mapping:
- A01: Broken Access Control

---

### LOW — Auth rate limits and pending-auth state are in-memory
Severity: Low | Confidence: Medium | Exposure: Internet-facing

Impact:
Rate limiting and pending-auth tokens are stored in memory, which does not scale across instances and can be bypassed in horizontally scaled environments.

Affected areas:
- `server/auth/rateLimit.ts`
- `server/auth/pendingAuth.ts`

Proof (code references):
- `server/auth/rateLimit.ts:10–31`
- `server/auth/pendingAuth.ts:18–45`

Exploit scenario:
Attackers can distribute requests across instances to bypass limits, enabling faster brute-force or OTP abuse.

Recommended fix:
- Move rate limiting and pending-auth storage to Redis/Upstash.
- Add IP + identifier-based throttling with a shared store.

Patch suggestion (conceptual):
```ts
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const ratelimit = new Ratelimit({ redis: Redis.fromEnv(), limiter: Ratelimit.slidingWindow(5, "10 m") });
const { success } = await ratelimit.limit(key);
```

OWASP ASVS mapping:
- V2.2 (Authentication security), V7 (Rate limiting)

OWASP Top 10 mapping:
- A07: Identification and Authentication Failures

---

### LOW — Eligibility endpoint returns internal `familyId`
Severity: Low | Confidence: High | Exposure: Internet-facing

Impact:
The eligibility check returns the internal family ID, which can aid account enumeration and metadata correlation.

Affected areas:
- `app/api/auth/eligibility/route.ts`

Proof (code references):
- `app/api/auth/eligibility/route.ts:36–43`

Exploit scenario:
An attacker verifies email/phone ownership and obtains a stable internal ID, which may be used to correlate records across other endpoints.

Recommended fix:
- Return a generic success response without the internal ID.
- If needed for client flow, return an opaque, short-lived token that maps to the family ID server-side.

Patch suggestion:
```ts
return NextResponse.json({ ok: true });
// Or return { ok: true, token } and store token -> familyId server-side
```

OWASP ASVS mapping:
- V4 (Access control), V7 (Data protection)

OWASP Top 10 mapping:
- A01: Broken Access Control

## Remediations Applied In This Audit
- `b03eb32` — Baseline security headers + CSP (`next.config.ts`).
- `8048f25` — Admin auth enforced on admin server actions.
- `a22e24c` — Input validation added for admin actions + file upload validation.
- `4ba5b52` — Rate limiting + webhook idempotency.

## Top 10 Fixes To Do This Week
- [x] Add baseline security headers and CSP.
- [x] Enforce admin checks on admin server actions.
- [x] Add input validation to admin actions and uploads.
- [x] Add rate limiting and webhook idempotency on high-risk endpoints.
- [ ] Rotate all secrets in `.env` and remove `.env` from git history.
- [ ] Introduce signed onboarding update tokens (or require session auth).
- [ ] Move rate limiting + pending-auth storage to a shared store (Redis/Upstash).
- [ ] Remove `familyId` from eligibility responses or replace with opaque tokens.
- [ ] Add security event logging and alerting for auth failures and admin actions.
- [ ] Add SCA in CI (`npm audit`/Dependabot) with block-on-high policy.

## Notes / Assumptions
- Repo is assumed private; if it is public, the secrets finding elevates to Internet-facing exposure.
- Clerk handles session cookies and token rotation per vendor defaults.
- CSP uses `unsafe-inline` to avoid breaking Next.js and Unlayer; upgrading to nonce-based CSP is recommended later.
