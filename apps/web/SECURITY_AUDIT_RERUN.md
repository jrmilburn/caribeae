# Security Audit Rerun

## Executive Summary (Top 3 Risks)
1. **Low – Account enumeration**: Public auth endpoints return different responses for existing vs. non-existing users/admins, enabling identifier enumeration.
2. **Low – PII in logs**: The eligibility resolver logs raw identifiers when duplicates are found.
3. **Suspected – Rate-limit spoofing**: IP-based rate limiting trusts `X-Forwarded-For` without validating trusted proxies.

## Overall Score
**97.4 / 100** (confirmed findings only; scores rounded to 0.1)

### Category Subscores (0–100)
1. **AuthN/AuthZ & session handling**: 98.0
2. **Multi-tenancy + data access boundaries (IDOR checks)**: 100.0
3. **Input validation & injection**: 100.0
4. **XSS/CSRF/clickjacking & browser protections**: 100.0
5. **Secrets & sensitive data**: 100.0
6. **Dependencies & supply chain**: 100.0 (no automated audit run)
7. **Logging/monitoring & incident readiness**: 99.4
8. **Infrastructure/config**: 100.0

### How Subscores Were Computed
- Each **confirmed** finding is mapped to a **single primary ASVS category** to avoid double counting.
- Subscore = **100 − sum(deductions)** for findings mapped to that category.
- No deductions applied to categories without confirmed findings.

## Deductions Table
| ID | Finding | Severity | Confidence | Exposure | Deduction |
|---|---|---|---|---|---|
| F-1 | Account enumeration via auth/admin auth endpoints | Low (2) | High (1.0) | Internet-facing (1.0) | **2.00** |
| F-2 | Raw identifier logging on duplicate eligibility matches | Low (2) | Medium (0.7) | Internal-only (0.4) | **0.56** |

## Entry Points (Exhaustive)
### Route Handlers
- **Auth**
  - `POST /api/auth/eligibility` – eligibility check (public)
  - `POST /api/auth/start` – pending auth issuance (public)
  - `POST /api/auth/complete` – finalize sign-in (requires Clerk session)
  - `GET /api/auth/session` – session status
- **Admin Auth**
  - `POST /api/admin-auth/start` – admin eligibility check (public)
  - `POST /api/admin-auth/complete` – admin session validation (requires Clerk session)
- **Admin APIs**
  - `GET /api/admin/holidays`
  - `GET /api/admin/class-templates`
  - `PATCH /api/admin/class-templates/[id]`
  - `GET /api/admin/reports/audit/sales-summary`
  - `GET /api/admin/reports/audit/payments`
  - `GET /api/admin/reports/audit/payment-allocations`
  - `GET /api/admin/reports/audit/invoice-line-items`
- **Webhooks**
  - `POST /api/sms/inbound` – Twilio inbound SMS
  - `POST /api/sms/status` – Twilio status callbacks
- **Uploads**
  - `POST /api/_email/upload` – admin-only asset upload
- **Receipts (PDF)**
  - `GET /portal/invoice/[id]/receipt`
  - `GET /admin/(protected)/invoice/[id]/receipt`
  - `GET /admin/(protected)/payment/[id]/receipt`

### Server Actions ("use server")
- **Admin-only** (all require `requireAdmin()`):
  - Attendance: `server/attendance/*`
  - Holidays: `server/holiday/*`
  - Messages & broadcasts: `server/messages/*`
  - Products/POS: `server/products/*`, `server/pos/*`
  - Students/Families/Teachers/Levels/Classes: `server/student/*`, `server/family/*`, `server/teacher/*`, `server/level/*`, `server/class/*`, `server/classTemplate/*`
  - Billing/Enrolments/Invoices: `server/billing/*`, `server/enrolment/*`, `server/enrolmentPlan/*`, `server/invoicing/*`
  - Communications/Reports: `server/communication/*`, `server/reports/*`
  - Onboarding admin flows: `server/onboarding/updateOnboardingStatus`, `server/onboarding/listOnboardingRequests`, `server/onboarding/acceptOnboardingRequest`, `server/onboarding/findMatchingFamilies`
- **Family-portal**
  - `server/portal/*` (guards via `getFamilyForCurrentUser`)
  - `server/waitlist/createWaitlistRequest` (guards via `getFamilyForCurrentUser`)
- **Public**
  - `server/onboarding/submitOnboardingRequest` (rate-limited, tokenized update flow)
  - `server/onboarding/updateOnboardingContact` (update-token required)

### Authentication/Authorization Summary (by entry point)
- **Admin server actions & admin route handlers**: protected by `requireAdmin()` and/or `ensureAdminAccess()`.
- **Portal**: access is tied to `getFamilyForCurrentUser()` and explicit family ownership checks.
- **Public onboarding + auth**: rely on rate limiting, identifier validation, and update-token verification.

## Findings (Grouped by Severity)

### Low

**F-1: Account enumeration via auth/admin auth endpoints**
- **ASVS**: V2 (Authentication)
- **OWASP Top 10 (2021)**: A07 Identification and Authentication Failures
- **Impact**: Attackers can confirm valid user/admin identifiers by observing response differences, enabling targeted phishing or credential stuffing.
- **Exploit scenario**: Probe endpoints with guessed emails/phones and observe 200 vs. 403 responses or `flow` values.
- **Affected files/lines**:
  - `app/api/auth/eligibility/route.ts:36-41` (403 when no family)
  - `app/api/auth/start/route.ts:45-53` (returns `flow` = signIn vs signUp)
  - `app/api/admin-auth/start/route.ts:42-63` (distinct responses for admin presence)
- **Code excerpt**:
  ```ts
  // app/api/auth/start/route.ts:45-53
  const userList = await users.getUserList({ limit: 1, emailAddress: [normalized] });
  const flow = userList.data.length > 0 ? "signIn" : "signUp";
  ```
- **Recommendation**: Return a uniform response for eligibility/start (no “signIn vs signUp”), and defer branching to Clerk errors; consider adding CAPTCHA/abuse controls.

**F-2: Raw identifier logging on duplicate eligibility matches**
- **ASVS**: V10 (Error Handling & Logging)
- **OWASP Top 10 (2021)**: A09 Security Logging and Monitoring Failures
- **Impact**: Logs may include email/phone identifiers in cleartext, increasing PII exposure in logging systems.
- **Exploit scenario**: Duplicate identifier matches trigger a warning log containing the raw identifier.
- **Affected files/lines**:
  - `server/auth/eligibility.ts:51-54`
- **Code excerpt**:
  ```ts
  // server/auth/eligibility.ts:51-54
  console.warn(`Multiple families matched ${type} identifier ${identifier}. Using most recently updated.`);
  ```
- **Recommendation**: Mask identifiers in logs (e.g., hash or partial redaction), or log only counts/IDs.

## Top 10 Fixes This Week (Checklist)
- [ ] Normalize auth start/eligibility responses to avoid user/admin enumeration.
- [ ] Add abuse controls (captcha or stronger rate limiting) for public auth and onboarding endpoints.
- [ ] Ensure rate-limit IPs come from trusted proxy headers only.
- [ ] Add explicit CSRF protection for cookie-authenticated route handlers that mutate state.
- [ ] Mask or hash identifiers in auth eligibility logs.
- [ ] Add structured audit logging for admin actions (who/what/when).
- [ ] Add dependency scanning in CI (npm audit or SCA tool).
- [ ] Add webhook replay protection for all webhooks (Twilio already uses signature + SID checks).
- [ ] Review CSP to remove `unsafe-inline` using nonces (phased rollout).
- [ ] Add security regression tests for auth linking flow.

