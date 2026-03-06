---
status: pending
phase: 14-monetization
type: verification-playbook
created: 2026-02-26
scenarios: 36
categories: 9
companion: BILLING-SUCCESS-CRITERIA.md
---

# Billing Verification Playbook

**This is a manual testing playbook.** Every scenario must be verified by a human in a real browser against live dev servers and Stripe test mode. An AI agent walks you through each scenario step-by-step — you perform the action in the browser, observe the result, and confirm. When a step passes, check the box (`- [x]`). When an entire scenario passes, mark its header with `PASS (date)`.

**Do NOT verify via code review or unit tests.** Those are separate concerns. This playbook verifies the actual end-to-end user experience.

---

## Workflow: Manual Verify → Test Audit → Next Scenario

After each scenario is manually verified, **before moving to the next scenario**, perform a test audit:

1. **Identify code paths** — Map the scenario to the backend services, controllers, repositories, and frontend hooks it exercises.
2. **Audit existing tests** — Find all test files covering those code paths. Evaluate against the `testing-test-quality` skill:
   - Flag mock-heavy unit tests (3+ internal mocks) that should be integration tests
   - Flag implementation-coupled assertions (`toHaveBeenCalledWith` on internal methods)
   - Flag weak assertions (`toBeTruthy`), conditional expects, missing assertions
3. **Fix or replace** — If existing tests are mock-heavy for code that touches a real database or orchestrates between services, replace them with integration tests (real NestJS app + real Postgres, mock only external boundaries like Stripe SDK).
4. **Add missing coverage** — Write integration tests for any untested code paths the scenario exercised.
5. **Verify tests catch regressions** — Temporarily break a line of production code that the test should catch. Run the test suite. Confirm it fails. Revert the break.
6. **Record** — Note what was fixed/added in the scenario's section.

**Test quality rules (from `testing-test-quality` skill):**
- Mock only external boundaries (Stripe API, HTTP calls, time, randomness)
- Never mock internal services, repositories, or ConfigService in integration tests
- Assert on observable behavior (HTTP responses, DB state), not internal method calls
- Every test must have at least one assertion; no conditional expects
- Integration tests are the primary coverage strategy for service→repository→DB flows

---

**Prerequisites:**
- [ ] Dev servers running (`pnpm api:dev` + `pnpm web:dev`)
- [ ] Stripe test mode active (STRIPE_SECRET_KEY = `sk_test_...`)
- [ ] Stripe webhook listener running (`stripe listen --forward-to localhost:3000/api/billing/webhook`)
- [ ] Database accessible (PostgreSQL on localhost:5432)
- [ ] Browser open to http://localhost:5173, logged in

**Companion Document:** See `BILLING-SUCCESS-CRITERIA.md` for complete success criteria per scenario.

---

## Reference: Stripe Test Cards

| Card Number | Behavior | Use For |
|---|---|---|
| `4242 4242 4242 4242` | Always succeeds | Happy path checkout |
| `4000 0000 0000 9995` | Always declines | E1: Declined card |
| `4000 0000 0000 0341` | Attach succeeds, charge fails | E2: Renewal failure |
| `4000 0025 0000 3155` | Requires 3D Secure (succeeds) | I2: 3DS authentication |
| `4000 0000 0000 3220` | 3DS required, auth fails | I2: Failed 3DS |
| `4000 0000 0000 0259` | Creates dispute after charge | I4: Chargeback |

**Expiry:** Any future date (e.g., `12/34`)
**CVC:** Any 3 digits (e.g., `123`)
**ZIP:** Any valid ZIP (e.g., `12345`)

---

## Reference: State Reset Commands

### Reset to Free (Recommended between most scenarios)
```
UI: DevSubscriptionPanel → "Reset to Free"
API: curl -X POST http://localhost:3000/api/dev-tools/reset -H "Cookie: <session>"
```
This clears: tier → 'free', stripeCustomerId → null, stripeSubscriptionId → null, trialEndsAt → null

### Set Trial State
```
UI: DevSubscriptionPanel → Enter days → "Set Trial"
API: curl -X POST http://localhost:3000/api/dev-tools/trial -H "Cookie: <session>" -d '{"days": 14}'
Clear: curl -X POST http://localhost:3000/api/dev-tools/trial -H "Cookie: <session>" -d '{"days": null}'
```

### Direct DB Manipulation (for edge cases)
```sql
-- Set specific subscription state
UPDATE org_subscriptions SET
  tier = 'pro',
  stripe_customer_id = 'cus_test123',
  stripe_subscription_id = 'sub_test456',
  trial_ends_at = NULL,
  current_period_ends = NOW() + INTERVAL '30 days'
WHERE tenant_id = '<your-tenant-id>';

-- Simulate past-due (set period end in the past)
UPDATE org_subscriptions SET
  current_period_ends = NOW() - INTERVAL '5 days'
WHERE tenant_id = '<your-tenant-id>';

-- Clear everything (nuclear reset)
DELETE FROM org_subscriptions WHERE tenant_id = '<your-tenant-id>';
DELETE FROM stripe_webhook_events;
```

### Find Your Tenant ID
```sql
SELECT id, eid FROM tenants LIMIT 5;
```

---

## Category A: New Customer Checkout

### Scenario A1: Free → Pro Annual — PASS (2026-02-28)

> **Note:** Originally specified as "Pro Monthly" but verified with annual billing (user preference). Billing toggle defaults to Annual.

**Setup:**
- [x] DevSubscriptionPanel → "Reset to Free"
- [x] Tier badge shows "Free", no trial banner visible
- [x] Execution history panel shows locked overlay

**Walkthrough:**
- [x] Click the **"Upgrade"** button in the app header
- [x] PricingOverlay opens with 3 tier cards (Free, Pro, Enterprise)
- [x] Pro card shows pricing (billing toggle defaults to Annual)
- [x] Click **"Upgrade to Pro"** on Pro tier card
- [x] A new browser tab opens with Stripe Checkout
- [x] Checkout page shows correct line item (Pro Annual, $20/mo per Stripe)
- [x] Enter test card: `4242 4242 4242 4242`, email, expiry `12/34`, CVC `123`
- [x] Click "Pay" / "Subscribe"
- [x] Stripe Checkout redirects to success URL
- [x] Stripe CLI shows `checkout.session.completed` webhook (initially 500 — see bugs below)
- [x] Stripe CLI shows `customer.subscription.created` webhook (initially 500 — see bugs below)
- [x] Stripe CLI shows `invoice.paid` webhook (200 OK)
- [x] Return to app: tier badge shows "Pro" (after page reload — see bugs below)
- [x] Pro features accessible (execution history unlocked, version history unlocked)

**Bugs Found:**

1. **BUG: Webhook race condition (500 errors)** — `checkout.session.completed` and `customer.subscription.created` both return 500 on first attempt. Root cause: both arrive simultaneously, both call `findByTenantId()` and get `undefined`, both attempt `upsert()` on the same `tenantId` with UNIQUE constraint. Second webhook fails. Stripe auto-retry eventually succeeds. Fix: add conflict handling or serialize these event types. **Tracked in backlog.**

2. **BUG: Pricing mismatch** — Pricing overlay shows `$24/mo` for annual (hardcoded in `pricing-data.ts`), but Stripe Checkout shows `$20/mo`. Prices are hardcoded in the frontend and not fetched from Stripe. Fix: add a `GET /api/billing/prices` endpoint that returns live Stripe prices, and have the frontend render those dynamically. **Tracked in backlog.**

3. **UX: Post-checkout redirect** — After Stripe Checkout completes, user is redirected to `/?checkout=success` (the app). Instead, a dedicated success page should inform the user: "Payment successful — you can close this tab and return to the app." This avoids confusion and provides a clear UX signal. **Tracked in backlog.**

**Test Audit (2026-02-28):**
- Existing unit tests: 4 files, 70+ tests, all mock-based (no real DB)
- **Added:** `apps/api/test/billing-webhook.integration.test.ts` — 8 integration tests (real NestJS + real PostgreSQL, mock only Stripe SDK)
- Covers: checkout.session.completed, customer.subscription.created, concurrent processing, invoice.paid, subscription.deleted, idempotency
- Mutation tested: broke tier assignment → tests caught it ✅
- **Finding:** Race condition test PASSED at DB level — PostgreSQL `ON CONFLICT DO UPDATE` handles concurrent upserts correctly. Production 500s may be caused by Stripe API timing or RLS context issues, not the DB upsert.

**State Reset:** DevSubscriptionPanel → "Reset to Free"

---

### Scenario A2: Free → Pro Annual — PASS (2026-03-03)

**Setup:**
- [x] DevSubscriptionPanel → "Reset to Free"
- [x] Tier badge shows "Free"

**Walkthrough:**
- [x] Click **"Upgrade"** in header → PricingOverlay opens
- [x] Toggle billing to **"Annual"** (defaults to Annual)
- [x] Pro card shows annual pricing with 20% savings badge ($20/mo billed annually)
- [x] Click CTA on Pro tier card
- [x] Stripe Checkout opens with annual amount
- [x] Enter test card `4242 4242 4242 4242`, complete checkout
- [x] Stripe CLI shows `checkout.session.completed`, `subscription.created`, `invoice.paid` — all 200 OK (no race condition 500s)
- [x] Return to app: tier badge shows "Pro" (no refresh needed)
- [x] DevSubscriptionPanel shows currentPeriodEnds ~1 year from now

**Findings:**
- **A1 Bug #1 RESOLVED:** Webhook race condition no longer reproduces — all webhooks returned 200.
- **A1 Bug #2 RESOLVED:** Pricing mismatch fixed — in-app now shows $20/mo annual (matches Stripe). Monthly shows $25/mo. Savings badge shows 20%.

**State Reset:** DevSubscriptionPanel → "Reset to Free"

---

### Scenario A3: Free → Pro with PO Number

**Status: BUILT** — `custom_fields` with `purchase_order` key already exists in `createCheckoutSession` (billing.service.ts). Needs manual verification.

**Setup:**
- [ ] DevSubscriptionPanel → "Reset to Free"

**Walkthrough:**
- [ ] Initiate checkout (same as A1 steps 1-6)
- [ ] Stripe Checkout page has a "Purchase Order Number" text field
- [ ] Enter PO number: `PO-2026-0451`
- [ ] Complete checkout with test card
- [ ] In Stripe Dashboard → Payments → click the payment → custom_fields shows PO number
- [ ] Invoice PDF in Stripe Dashboard includes the PO number

**Alternative test — PO field left blank:**
- [ ] Repeat checkout steps
- [ ] Leave PO number field empty
- [ ] Checkout still completes (field is optional)

**State Reset:** DevSubscriptionPanel → "Reset to Free"

---

### Scenario A4: Trial Active → Pro Conversion — PASS (2026-03-04)

**Setup:**
- [x] DevSubscriptionPanel → "Reset to Free"
- [x] DevSubscriptionPanel → Set Trial Days: `7`
- [x] Tier badge shows "Pro", trial banner visible

**Walkthrough:**
- [x] Header shows **"Subscribe"** (not "Upgrade") for trial users
- [x] Click **"Subscribe"** → PricingOverlay opens
- [x] Select Pro → complete checkout with test card `4242 4242 4242 4242`
- [x] Checkout completes successfully
- [x] Stripe CLI shows `checkout.session.completed` webhook
- [x] No tier flicker — tier stays "Pro" throughout (no flash to "Free")
- [x] Trial banner disappears after conversion
- [x] DevSubscriptionPanel shows stripeSubscriptionId is set, trialEndsAt is null

**Bug Found & Fixed:** Trial users saw disabled "Current Plan" button on Pro card instead of upgrade CTA. Fixed in commit 29562ff: extracted `getTierCta` pure function, TierCard now distinguishes trial-Pro from paid-Pro. Test added in `get-tier-cta.test.ts`, mutation tested.

**State Reset:** DevSubscriptionPanel → "Reset to Free"

---

### Scenario A5: Trial Expired → Pro Conversion — PASS (2026-03-04)

**Setup:**
- [x] DevSubscriptionPanel → "Reset to Free"
- [x] Set trial to expired: DevSubscriptionPanel → Set Trial Days: 0

**Walkthrough:**
- [x] Refresh app: TrialExpiredBanner visible with "View Plans" link
- [x] Click **"View Plans"** → PricingOverlay opens with 3 tier cards
- [x] Select Pro → complete checkout with test card `4242 4242 4242 4242`
- [x] Stripe CLI shows `checkout.session.completed` webhook — all webhooks 200 OK
- [x] Tier badge shows "Pro"
- [x] QuotaGate no longer shows limits (Pro = unlimited)
- [x] All Pro features accessible (execution history, version history unlocked)

**Findings:** No bugs. Clean conversion from expired trial to paid Pro. All webhooks processed without errors.

**State Reset:** DevSubscriptionPanel → "Reset to Free"

---

## Category B: Enterprise Sales-Assisted

> **NOTE:** All Category B scenarios require features that are not yet built in the app. These can be partially tested via the Stripe Dashboard directly. Instructions below use the Stripe Dashboard approach.

### Scenario B1: Enterprise Quote → Acceptance → Auto-Subscription

**Status: BUILD REQUIRED** (or use Stripe Dashboard)

**Setup:**
- [ ] DevSubscriptionPanel → "Reset to Free"
- [ ] Open Stripe Dashboard (https://dashboard.stripe.com/test)

**Walkthrough (via Stripe Dashboard):**
- [ ] In Stripe Dashboard → **Customers** → Find or create the test customer
- [ ] Go to **Billing** → **Quotes** → **Create Quote**
- [ ] Add line items: QS Pro Enterprise, custom amount, recurring
- [ ] Set payment terms (e.g., net-30)
- [ ] Add memo: "QS Pro Enterprise - Annual Subscription"
- [ ] **Finalize** the quote
- [ ] Quote PDF is downloadable and looks professional
- [ ] **Send** quote (or use the acceptance URL directly)
- [ ] Open the quote acceptance URL in browser
- [ ] Customer can review line items, pricing, terms
- [ ] **Accept** the quote
- [ ] Stripe auto-creates a subscription
- [ ] Stripe CLI shows `customer.subscription.created` webhook
- [ ] `org_subscriptions` updated with tier='enterprise', Stripe IDs set

**State Reset:** DevSubscriptionPanel → "Reset to Free" + cancel subscription in Stripe Dashboard

---

### Scenario B2: Enterprise Invoice with Net-30

**Status: BUILD REQUIRED** (or use Stripe Dashboard)

**Setup:**
- [ ] Active Enterprise subscription (from B1) OR create manually in Stripe Dashboard
- [ ] Set `days_until_due: 30` on invoice settings

**Walkthrough:**
- [ ] In Stripe Dashboard → **Invoices** → find the latest invoice
- [ ] Invoice status is "Open" (not "Paid")
- [ ] Due date is 30 days from creation
- [ ] Invoice email was sent to customer
- [ ] Open the invoice payment URL (Stripe hosted invoice page)
- [ ] Page shows amount, due date, payment button
- [ ] Complete payment on the hosted invoice page
- [ ] Stripe CLI shows `invoice.paid` webhook
- [ ] Invoice status changes to "Paid" in Dashboard

**State Reset:** Cancel subscription in Stripe Dashboard + DevSubscriptionPanel → "Reset to Free"

---

### Scenario B3: Enterprise Invoice with Net-60

**Walkthrough:** Same as B2 but with `days_until_due: 60`.
- [ ] Due date is 60 days out

**State Reset:** Same as B2

---

### Scenario B4: Quote PDF Download and Review

**Setup:**
- [ ] Create a finalized quote in Stripe Dashboard (from B1)

**Walkthrough:**
- [ ] In Stripe Dashboard → **Quotes** → click the finalized quote
- [ ] Click **"Download PDF"**
- [ ] PDF downloads successfully
- [ ] PDF includes company/product name, line items, pricing, payment terms, total, expiration date
- [ ] Professional formatting
- [ ] Quote has an expiration date
- [ ] After expiration: quote cannot be accepted

**State Reset:** None needed (read-only operation)

---

## Category C: Subscription Management via Portal

### Scenario C1: Update Payment Method — PASS (2026-03-04)

**Setup:**
- [x] Tenant has active Pro subscription (complete A1 first if needed)

**Walkthrough:**
- [x] Header shows **"Billing"** link (not "Upgrade") for paid users
- [x] Click **"Billing"** → Stripe Customer Portal opens in new tab
- [x] Portal loads successfully — shows subscription details, payment method, billing info, invoice history
- [x] Find **"Payment method"** section
- [x] Click **"Add payment method"**
- [x] Enter Mastercard: `5555 5555 5555 4444`, expiry `12/34`, CVC `123`
- [x] Save the new payment method — automatically set as default
- [x] Payment method updated in Portal UI — both Visa •••• 4242 and Mastercard •••• 4444 visible
- [x] Return to app: no service interruption — tier still "Pro", all features work

**Findings:** No bugs. Portal loaded cleanly, payment method add/default flow works as expected. No webhooks fired for payment method update (expected — Stripe Portal handles this client-side).

**State Reset:** DevSubscriptionPanel → "Reset to Free"

---

### Scenario C2: View and Download Invoice PDFs — PASS (2026-03-04)

**Setup:**
- [x] Tenant has active Pro subscription with at least 1 completed payment (from C1 setup)

**Walkthrough:**
- [x] Click **"Billing"** → Stripe Customer Portal opens
- [x] Find **"Invoice history"** section — visible at bottom of portal
- [x] At least one invoice listed: Mar 4, 2026 / $240.00 / Paid
- [x] Click invoice → detail view shows invoice number (PFE0XZ3K-0001), payment date, payment method
- [x] **"Download invoice"** and **"Download receipt"** buttons available
- [x] PDF downloads successfully
- [x] PDF includes invoice number, date, line items (Query++ Pro Tier), total ($240.00), payment method
- [x] PDF is professional enough for corporate expense reporting

**Findings:** No bugs. Invoice and receipt PDFs both available. Portal shows payment method as "Link" (Stripe's default labeling for test mode). All Stripe-hosted — no app code paths beyond portal session generation.

**State Reset:** DevSubscriptionPanel → "Reset to Free"

---

### Scenario C3: Cancel Subscription — PASS (2026-03-04)

**Setup:**
- [x] Tenant has active Pro subscription (fresh checkout with `4242 4242 4242 4242`)

**Walkthrough:**
- [x] Click **"Billing"** → Stripe Customer Portal
- [x] Find **"Cancel plan"** or **"Cancel subscription"**
- [x] Click cancel
- [x] Confirmation screen explains: access continues until end of billing period
- [x] Confirm cancellation
- [x] Stripe CLI shows `customer.subscription.updated` webhook with `cancel_at_period_end: true` — 200 OK
- [x] Return to app: tier still shows "Pro" (grace period until period end)
- [x] Cancel immediately via Stripe Portal → `customer.subscription.deleted` — 200 OK
- [x] After subscription.deleted: tier reverts to "Free"
- [x] Features lock (execution history, version history show locked overlays)
- [x] Saved queries and history are NOT deleted (data preserved, just locked behind tier gate)

**Bugs Found & Fixed:**

1. **BUG: Trial re-provisioned after cancellation** — `handleSubscriptionDeleted` didn't set `trialEndsAt`, leaving it `null`. On next page load, `startTrialIfEligible` matched (`tier='free' AND trialEndsAt IS NULL AND stripeSubscriptionId IS NULL`) and re-provisioned a trial. Fix: Added `trialEndsAt: new Date(0)` to `handleSubscriptionDeleted` (webhook-handler.service.ts). Same pattern as the `resetToFree` fix.

2. **BUG: Re-subscription blocked by stale Stripe bindings** — `handleSubscriptionDeleted` didn't clear `stripeCustomerId`. New checkout created a new Stripe customer, but `checkout.session.completed` hit `checkStripeBinding` conflict (old customer ID ≠ new customer ID) and was silently ignored. Fix: (a) Added `stripeCustomerId: null` to `handleSubscriptionDeleted`. (b) Changed `checkout.session.completed` and `subscription.created` handlers to override stale bindings instead of silently rejecting, with audit logging.

**Test Audit (2026-03-04):**
- Updated existing `'downgrades tier to free and prevents trial re-provisioning'` test — asserts `stripeCustomerId` and `trialEndsAt` are cleared
- Added `'allows re-subscription after cancellation'` — full cancel→re-checkout flow with different Stripe IDs
- Added `'checkout.session.completed overrides stale old Stripe bindings'` — stale binding override path
- Added `'old subscription.deleted is rejected after new checkout binds'` — out-of-order webhook protection
- Added `'subscription.created overrides stale old Stripe bindings'` — stale binding override for subscription.created
- Mutation tested: removing `stripeCustomerId: null` → 2 tests fail ✅

**State Reset:** DevSubscriptionPanel → "Reset to Free"

---

### Scenario C4: Reactivate After Cancellation — PASS (2026-03-04)

**Setup:**
- [x] Complete Scenario C3 (tenant is now free after cancellation)
- [x] Tier is "Free" with no Stripe bindings

**Walkthrough:**
- [x] "Upgrade" button appears in header
- [x] Click "Upgrade" → PricingOverlay
- [x] Select Pro → complete new checkout with fresh card
- [x] New subscription created (new stripeSubscriptionId)
- [x] Tier badge shows "Pro"
- [x] All Pro features accessible
- [x] No duplicate subscriptions in Stripe Dashboard

**Findings:** No bugs. Clean reactivation flow — C3 fixes (clearing `stripeCustomerId` and `trialEndsAt` on cancellation) ensure no stale bindings or trial re-provisioning interfere with re-subscription.

**Test Audit (2026-03-04):**
- C4's code paths are fully covered by existing integration tests added during C3:
  - `'allows re-subscription after cancellation'` — full cancel→re-checkout flow with different Stripe IDs
  - `'checkout.session.completed overrides stale old Stripe bindings'` — stale binding override path
- No new tests needed — C3's test additions comprehensively cover the reactivation path.

**State Reset:** DevSubscriptionPanel → "Reset to Free"

---

## Category D: Plan Changes

### Scenario D1: Pro Monthly → Pro Annual — PASS (2026-03-04)

**Setup:**
- [x] Pro Monthly subscription active (fresh checkout with `4242 4242 4242 4242`)
- [x] Stripe Customer Portal configured to allow plan switching (enabled "Customers can update subscriptions" with all 4 prices, proration mode: "Prorate charges and credits")

**Walkthrough:**
- [x] Click **"Billing"** → Stripe Customer Portal
- [x] Find **"Update subscription"** section
- [x] Annual option is available
- [x] Select Annual billing ($240.00/year)
- [x] Portal shows prorated credit/charge calculation
- [x] Confirm the switch
- [x] Stripe CLI shows `customer.subscription.updated` webhook — all 200 OK
- [x] Prorated invoice created and paid (invoice.created, invoice.paid — 200 OK)
- [x] Return to app: tier still "Pro" (no interruption)
- [x] DevSubscriptionPanel shows currentPeriodEnds updated to 3/4/2027 (~1 year out)

**Bugs Found & Fixed:**

1. **BUG: Portal missing plan switching** — Stripe Customer Portal was not configured to allow subscription updates. Fix: Enabled "Customers can update subscriptions" in Stripe Dashboard → Settings → Billing → Customer Portal, added all 4 prices (Pro Monthly/Annual, Enterprise Monthly/Annual), set proration to "Prorate charges and credits".

2. **BUG: `resetToFree` didn't cancel Stripe subscription** — `DevToolsService.resetToFree()` only cleared the local DB, leaving orphaned active subscriptions in Stripe. Fix: Added `stripe.subscriptions.cancel()` call before DB reset (dev-tools.service.ts).

3. **BUG: `handleInvoicePaid` overwrote `currentPeriodEnds` with stale value** — When switching plans, the prorated invoice's `period_end` reflected the OLD billing period, not the new one. `handleInvoicePaid` was using `invoice.period_end` to set `currentPeriodEnds`, overwriting the correct value set by `handleSubscriptionChange`. Fix: Changed `handleInvoicePaid` to read `current_period_end` from the subscription object (authoritative source) instead of the invoice (webhook-handler.service.ts).

**State Reset:** DevSubscriptionPanel → "Reset to Free"

---

### Scenario D2: Pro Annual → Pro Monthly — PASS (2026-03-04)

**Setup:**
- [x] Pro Annual subscription active (from D1)

**Walkthrough:**
- [x] Click **"Billing"** → Stripe Customer Portal
- [x] Switch to Monthly billing ($25/mo)
- [x] Proration/credit calculated — prorated credit for unused annual portion offset against new monthly charge
- [x] Change takes effect immediately (per Portal proration config)
- [x] Stripe CLI shows `customer.subscription.updated`, `invoice.created`, `invoice.paid` — all 200 OK
- [x] Return to app: tier still "Pro" (no interruption)
- [x] DevSubscriptionPanel shows currentPeriodEnds updated from 3/4/2027 (annual) → 4/4/2026 (~1 month out)

**Findings:** No bugs. Clean annual-to-monthly downgrade with correct proration handling. All webhooks processed without errors. The D1 fix to `handleInvoicePaid` (reading `current_period_end` from subscription instead of invoice) correctly handles the prorated invoice scenario here too.

**State Reset:** DevSubscriptionPanel → "Reset to Free"

---

### Scenario D3: Mid-Cycle Proration — PASS (2026-03-04)

**Setup:**
- [x] Active Pro subscription partway through billing cycle (from D2 annual→monthly switch)

**Walkthrough:**
- [x] Switch plans via Stripe Customer Portal (Monthly ↔ Annual) — verified using D2's prorated invoice
- [x] Stripe Dashboard → Invoices → prorated line items visible (Invoice #KZEXXEWP-0003)
- [x] Invoice shows credit for unused portion (-$240.00 annual) + charge for new plan ($25.00 monthly) + net amount (-$215.00 credit applied to customer balance)
- [x] Stripe CLI shows `invoice.created` and `invoice.paid` webhooks — confirmed 200 OK during D2

**Findings:** No bugs. Proration math handled entirely by Stripe. Customer credit balance ($215.00) covers future monthly invoices.

**State Reset:** DevSubscriptionPanel → "Reset to Free"

---

## Category E: Payment Failures & Recovery

### Scenario E1: Declined Card at Initial Checkout — PASS (2026-03-04)

**Setup:**
- [x] DevSubscriptionPanel → "Reset to Free"

**Walkthrough:**
- [x] Click "Upgrade" → PricingOverlay → select Pro → proceed to checkout
- [x] On Stripe Checkout, enter declined card: **`4000 0000 0000 9995`**
- [x] Enter valid email, expiry, CVC
- [x] Click "Pay"
- [x] Stripe Checkout shows clear decline error: "Your card has insufficient funds. Try a different card."
- [x] Stripe CLI shows `charge.failed` webhook (200 OK) — no `checkout.session.completed` fired
- [x] Return to app: still on "Free" tier, no Pro features unlocked
- [x] Can retry by entering a different card on the same Checkout page
- [x] Enter `4242 4242 4242 4242` → pay successfully
- [x] Normal success flow — `checkout.session.completed`, `subscription.created`, `invoice.paid` all 200 OK, tier upgrades to Pro

**Findings:** No bugs. Declined card handled gracefully — Stripe shows clear error, `charge.failed` webhook acknowledged without state change, retry on same page works cleanly.

**Test Audit (2026-03-04):**
- E1's code paths are minimal on the app side — Stripe Checkout handles the decline entirely client-side
- `charge.failed` webhook is not explicitly handled but returns 200 (correct — informational event, no state change needed)
- Retry success path (checkout.session.completed → subscription.created → invoice.paid) is already covered by existing integration tests in `billing-webhook.integration.test.ts`
- **Added:** `invoice.payment_failed` integration test — verifies subscription state is unchanged AND audit log entry is written with correct event type and invoice ID metadata
- Mutation tested: removed audit log write → test caught it ✅

**State Reset:** DevSubscriptionPanel → "Reset to Free"

---

### Scenario E2: Renewal Payment Failure — PASS (2026-03-04)

**Setup:**
- [x] Created Stripe Test Clock (`clock_1T7TYtBwkehOB62ynhTAllsG`) with customer (`cus_U5etFUr17YAmqx`)
- [x] Created Pro monthly subscription via API with encrypted EID metadata
- [x] Detached payment method before advancing clock to force renewal failure

**Walkthrough:**
- [x] Advanced Stripe Test Clock past renewal date (April 6)
- [x] Stripe CLI shows `invoice.payment_failed` webhook — returned 200
- [x] WebhookHandlerService logged the failed payment audit event
- [x] Stripe will retry per Smart Retries schedule
- [x] **DOCUMENTED actual app behavior:** App still shows "Pro" — tier is NOT downgraded on payment failure. This is correct SaaS dunning best practice: keep access during `past_due`, let Stripe Smart Retries recover the payment. Only downgrade when Stripe cancels the subscription after all retries exhaust (`customer.subscription.deleted` handler resets to Free, already verified in C3).

**State Reset:** Cancel subscription in Stripe Dashboard + DevSubscriptionPanel → "Reset to Free"

**Bugs found:** None

**Test Audit (2026-03-05):**
- Code path: `handleInvoicePaymentFailed()` in webhook-handler.service.ts
- Existing coverage: `invoice.payment_failed` handler tested via `billing-webhook.integration.test.ts` (real NestJS + Postgres, Stripe SDK mocked)
- No new tests needed — existing integration test asserts on DB state (tier preserved, audit event written)

---

### Scenario E3: Past-Due Grace Period — PASS (2026-03-04)

**Setup via DB:**
- [x] Set `tier = 'pro'`, `current_period_ends = NOW() - 5 days` directly in DB

**Walkthrough:**
- [x] Refresh the app — UI shows Pro with all features accessible
- [x] **DOCUMENTED:** `GET /features` returns `tier: "pro"` with all Pro features enabled (`advancedAutocomplete`, `createDataExtension`, `deployToAutomation`, etc.)
- [x] **DOCUMENTED:** User is still on "Pro" — `currentPeriodEnds` being in the past does NOT revoke access
- [x] **CONFIRMED:** The app relies on the `tier` column, not `currentPeriodEnds`. Stripe manages the subscription lifecycle via webhooks — `customer.subscription.updated` (status changes) and `customer.subscription.deleted` (terminal cancellation) are what drive tier changes. This is correct SaaS dunning behavior.

**State Reset:** DevSubscriptionPanel → "Reset to Free"

**Bugs found:** None

**Test Audit (2026-03-05):**
- Code path: `handleSubscriptionChange()` line 431 — `...(isPastDueOrUnpaid ? {} : { tier })` conditional
- **Gap found:** No test covered the past-due grace period behavior (tier preservation when status=past_due)
- **Added:** Integration test `preserves tier when subscription status is past_due (grace period)` in `billing-webhook.integration.test.ts`
- **Mutation tested:** Changed line 431 to always pass `tier` → test failed with `expected 'pro' to be 'enterprise'` → reverted. PASS.

---

### Scenario E4: Payment Recovery — PASS (2026-03-04)

**Setup:**
- [x] Achieved past-due state via Test Clock — detached payment method, advanced clock past renewal, `invoice.payment_failed` fired
- [x] Subscription in `past_due` status with open invoice

**Walkthrough:**
- [x] Attached new working card (`tok_visa` → 4242) to customer
- [x] Paid outstanding invoice via `POST /v1/invoices/{id}/pay` with new payment method
- [x] Stripe CLI shows `invoice.paid` webhook — returned 200
- [x] Stripe CLI shows `customer.subscription.updated` — returned 200
- [x] DB confirms: tier = `pro`, `current_period_ends` advanced to 2026-06-06 (next cycle)
- [x] App tier remained Pro throughout (never downgraded during past-due, correctly recovered after payment)

**Note:** Tested via direct API invoice payment rather than Stripe Portal, which exercises the same webhook paths. Portal-based recovery is a Stripe-hosted UI concern, not an app concern.

**State Reset:** DevSubscriptionPanel → "Reset to Free"

**Bugs found:** None

**Test Audit (2026-03-05):**
- Code path: `handleSubscriptionChange()` + `handleInvoicePaid()` — subscription status transitions during dunning recovery
- Existing coverage: subscription.updated and invoice.paid handlers tested via `billing-webhook.integration.test.ts`
- No new tests needed — recovery path exercises same handlers already covered by E2/E3 tests

---

## Category F: Trial Lifecycle

### Scenario F1: Auto-Trial on First Login — PASS (2026-02-26)

**Setup:**
```sql
-- Delete the subscription row to simulate brand new tenant
DELETE FROM org_subscriptions WHERE tenant_id = '<your-tenant-id>';
```

**Walkthrough:**
- [x] Navigate to the app (triggers auth flow)
- [x] After login, check DB: tier='pro', trial_ends_at is ~14 days from now — (tier=pro, trial_ends_at=2026-03-13)
- [x] App shows "Pro" tier badge
- [x] All Pro features accessible
- [x] `GET /features` returns trial active (confirmed via UI)
- [x] No duplicate row created on re-navigation (count=1 after multiple refreshes)

**State Reset:** DevSubscriptionPanel → "Reset to Free"

---

### Scenario F2: Trial Countdown Banner — PASS (2026-02-27)

**Setup:**
- [x] DevSubscriptionPanel → "Reset to Free"
- [x] DevSubscriptionPanel → Set Trial Days: `3`

**Walkthrough:**
- [x] TrialBanner appears: "Your Pro trial ends in 3 days"
- [x] Banner includes "View Plans" link
- [x] Click dismiss (X button): banner disappears
- [x] Refresh the page: banner reappears (session-scoped dismiss)
- [x] Change trial days to 6: banner does NOT appear (> 5 day threshold)
- [x] Change trial days to 1: text says "Your Pro trial ends tomorrow"
- [x] Change trial days to 0: TrialExpiredBanner appears instead

**State Reset:** DevSubscriptionPanel → "Reset to Free"

---

### Scenario F3: Trial Expiration → Feature Lockdown — PASS (2026-02-27)

**Setup:**
- [x] DevSubscriptionPanel → "Reset to Free"
- [x] Set trial to expired: DevSubscriptionPanel → Set Trial Days: 0 (or via SQL: `UPDATE org_subscriptions SET tier = 'free', trial_ends_at = NOW() - INTERVAL '1 day' WHERE tenant_id = '<id>'`)

**Walkthrough:**
- [x] Refresh the app
- [x] TrialExpiredBanner visible: "Your Pro trial has ended"
- [x] Tier badge shows "Free"
- [x] Try to access execution history: locked overlay appears
- [x] Try to access version history: locked overlay appears
- [x] Check saved queries: QuotaGate shows count badge (e.g., "3/5")
- [x] Try to create saved query beyond limit: QuotaGate blocks creation
- [x] Try to run queries: daily run limit enforced (50/day)

**State Reset:** DevSubscriptionPanel → "Reset to Free"

---

### Scenario F4: Trial → Direct Pro (No Gap) — PASS (2026-03-04)

**Setup:**
- [x] DevSubscriptionPanel → "Reset to Free"
- [x] DevSubscriptionPanel → Set Trial Days: `7`
- [x] Tier badge shows "Pro" (trial active)

**Walkthrough:**
- [x] Complete checkout (Subscribe → Pro → test card `4242 4242 4242 4242`)
- [x] **CRITICAL:** Watch for tier flash — tier stays "Pro" throughout (no momentary drop to "Free") ✅
- [x] In DB: trialEndsAt is now null, stripeSubscriptionId is set
- [x] Stripe CLI shows `subscription.created` webhook event — all webhooks 200 OK
- [x] Features query refreshed — no stale trial data visible in UI (trial banner gone, Pro features accessible)

**Findings:** No bugs. Clean trial-to-paid conversion with zero tier interruption. All webhooks processed without errors.

**Test Audit (2026-03-04):**
- F4's code paths overlap heavily with A4/A5 — all already covered by existing integration tests
- **Key test:** `billing-webhook.integration.test.ts` → `'upgrades trial tenant to paid pro, clearing trial'` (line 402) — sets up trial tenant, processes checkout.session.completed, asserts tier=pro + trialEndsAt=null + stripeSubscriptionId set
- **Supporting tests:** `trial-lifecycle.integration.test.ts` → `'returns subscription tier when Stripe subscription exists'` (features query), `'does not restart trial for paid subscriber'` (re-provisioning guard)
- **Frontend:** `get-tier-cta.test.ts` covers trial-active → "Subscribe to Pro" CTA logic (tested per A4)
- Mutation tested: removed `trialEndsAt: null` from `handleCheckoutSessionCompleted` → test caught it immediately at line 436 ✅
- No new tests needed — existing coverage is comprehensive for F4's paths

**State Reset:** DevSubscriptionPanel → "Reset to Free"

---

## Category G: Edge Cases & Security

### Scenario G1: Webhook Idempotency ✅ PASS (2026-03-05)

**Setup:**
- [x] Complete Scenario A1 (generates webhook events)
- [x] Note the event ID from Stripe CLI output (e.g., `evt_1234567890`)

**Walkthrough:**
- [x] Check stripe_webhook_events table: `SELECT id, event_type, status FROM stripe_webhook_events ORDER BY processed_at DESC LIMIT 5;`
- [x] The checkout.session.completed event is status='completed'
- [x] Replay the event: `stripe events resend evt_<ID>`
- [x] Endpoint returns 200 (accepted, not error)
- [x] stripe_webhook_events table: event NOT reprocessed (no duplicate row)
- [x] org_subscriptions unchanged (no duplicate updates)
- [x] API logs indicate event was already processed

**Result:** Replayed invoice.paid event evt_1T7U2HBwkehOB62yCpGvWh1k via stripe events resend. Single row in DB, processed_at unchanged, subscription state unchanged, log confirmed: [DIAG] Event already completed or in progress, skipped.

**State Reset:** DevSubscriptionPanel → "Reset to Free"

**Test Audit (2026-03-05):**
- Code path: `process()` idempotency guard via `webhookEventRepo.markProcessing()`
- Existing coverage: `checkout.session.expired and past-due grace period tests` already cover the idempotency layer (markProcessing → markCompleted/markFailed)
- No new tests needed — idempotency is exercised implicitly by every integration test that calls `process()`

---

### Scenario G2: Stripe Binding Conflict ✅ PASS (2026-03-05)

**Setup:**
```sql
UPDATE org_subscriptions SET
  stripe_customer_id = 'cus_existing_customer',
  stripe_subscription_id = 'sub_existing_sub'
WHERE tenant_id = '06bb7b4f-4777-4081-92bf-8ec9d6e32eb2';
```

**Walkthrough:**
- [x] Trigger a webhook event with a DIFFERENT customer ID for the same tenant — updated subscription metadata via `stripe subscriptions update` to generate a fresh `customer.subscription.updated` event carrying `cus_U5etFUr17YAmqx` against the fake `cus_existing_customer` binding
- [x] WebhookHandlerService detects the binding mismatch — log confirmed: `subscription.updated — ignored due to Stripe binding conflict`
- [x] Event is rejected/failed — subscription NOT updated (DB still shows `cus_existing_customer` / `sub_existing_sub`)
- [x] Audit log contains conflict details — `subscription.webhook_conflict` row with reason `"Incoming Stripe customer does not match existing binding"`, showing both existing and incoming customer/subscription IDs
- [x] Original subscription state preserved (cus_existing_customer intact)

**Notes:**
- Initial resend of `evt_1T7U2HBwkehOB62ys9uV0QXQ` was silently skipped by idempotency (already processed during G1). Had to generate a fresh event via `stripe subscriptions update` with a metadata change.
- Cleaned up: restored real binding (`cus_U5etFUr17YAmqx` / `sub_1T7TywBwkehOB62ymnyXjTso`) and removed test metadata.

**State Reset:** Restored real Stripe binding (no reset to free needed)

**Test Audit (2026-03-05):**
- Code path: `checkStripeBinding()` + `auditWebhookConflict()` in `handleSubscriptionChange()`
- **Gap found:** No test covered binding conflict rejection on `subscription.updated` (only `subscription.created` had coverage)
- **Added:** Integration test `subscription.updated with mismatched customer is rejected and audited` in `billing-webhook.integration.test.ts`
- **Mutation tested:** Removed `return;` after conflict audit at line 426 → test failed with `expected 'cus_test_integ_001' got 'cus_intruder_999'` → reverted. PASS.

---

### Scenario G3: Webhook Signature Failure ✅ PASS (2026-03-05)

**Setup:** None needed

**Walkthrough:**
- [x] Send a fake webhook: `curl -X POST http://localhost:3000/api/billing/webhook -H "Content-Type: application/json" -H "stripe-signature: invalid_signature_here" -d '{"id": "evt_fake", "type": "checkout.session.completed"}'`
- [x] Response is 401 (not 500) — `{"type":"urn:qpp:error:auth-unauthorized","title":"Unauthorized","status":401,...,"code":"AUTH_UNAUTHORIZED"}`
- [x] No changes to org_subscriptions — tier/customer unchanged
- [x] No entry in stripe_webhook_events — count remained at 573
- [x] Error logged but response body does not leak internals — generic `AUTH_UNAUTHORIZED` message, no stack trace or secret exposure

**State Reset:** None needed

**Test Audit (2026-03-05):**
- Code path: `billing.controller.ts` lines 73-119 — `stripe.webhooks.constructEvent()` signature verification
- Existing coverage: Webhook signature verification is tested via `billing-webhook.integration.test.ts` (returns 401 AUTH_UNAUTHORIZED on invalid signature)
- No new tests needed — signature verification is a Stripe SDK responsibility; our test covers the controller's error handling

---

### Scenario G4: Encrypted EID Validation ✅ PASS (2026-03-05)

**Setup:** None needed

**Walkthrough:**
- [x] Encrypted EID on subscription (`ekao0moOCjxphmSENImfTOwoNCR+Dg68aQTBSpVF1dBCSBNV+Q==`) is different from raw tenant EID (`534019240`) — confirmed via `stripe subscriptions retrieve`
- [x] `decryptEidToken()` in webhook-handler.service.ts attempts decryption; throws on invalid tokens with message `"Invalid metadata.eid token — must be an encrypted token issued by GET /api/billing/pricing-token"`
- [x] Tampered metadata.eid fails gracefully — set `metadata.eid` to `GARBAGE_TAMPERED_TOKEN_12345` via `stripe subscriptions update`, triggered `customer.subscription.updated` event; event recorded as `failed` in `stripe_webhook_events` with error message, no crash, no subscription modification
- [x] No subscription state changes — tier, customer ID, subscription ID, period all unchanged after tampered event
- [x] Cleaned up: restored real encrypted EID on subscription

**Notes:**
- Tested by directly tampering subscription metadata via Stripe CLI, which triggers a real `customer.subscription.updated` webhook through the Stripe CLI listener
- The error is logged at ERROR level and the event is persisted as `failed` in `stripe_webhook_events` for auditability

**State Reset:** None needed (real EID restored)

**Test Audit (2026-03-05):**
- Code path: `decryptEidToken()` in webhook-handler.service.ts lines 149-162
- **Gap found:** No test covered tampered/garbage EID rejection
- **Added:** Integration test `rejects event with tampered/garbage EID and records failure` in `billing-webhook.integration.test.ts`
- **Mutation tested:** Made `decryptEidToken` return raw input instead of throwing → test failed with `promise resolved instead of rejecting` → reverted. PASS.
- **Bug fix:** `catch { // fall through }` was silently swallowing the original decrypt error. Changed to `catch (error) { this.logger.warn(...) }` to log the root cause while still throwing the clean user-facing error.

---

## Category H: Enterprise Compliance

### Scenario H1: MSA/DPA Document Availability

**Status: BUILD REQUIRED** (static documents need to be created/hosted)

**Walkthrough (after building):**
- [ ] Navigate to pricing page or Enterprise "Contact Sales" section
- [ ] Link to MSA document exists and works
- [ ] Link to DPA document exists and works
- [ ] Documents are downloadable as PDF
- [ ] Documents are current (dated, not obviously outdated)
- [ ] DPA covers relevant data processing scope (MCE metadata proxy)

**State Reset:** None needed (read-only)

---

### Scenario H2: Tax and Receipt Availability

**Setup:**
- [ ] Complete any successful checkout scenario (A1 or A2)

**Walkthrough:**
- [ ] Check email inbox for Stripe receipt
- [ ] Receipt email received with date, amount, payment method last 4 digits, line items, link to view online
- [ ] Open Stripe Customer Portal → Billing History
- [ ] Invoice/receipt PDFs available for download
- [ ] If Stripe Tax is configured: tax line items on invoice
- [ ] If Stripe Tax is NOT configured: **DOCUMENT** this as a gap for international customers

**State Reset:** DevSubscriptionPanel → "Reset to Free"

---

## Category I: Additional Scenarios

### Scenario I1: Coupon / Promotion Code

**Status: BUILT** — `allow_promotion_codes: true` already set in `createCheckoutSession` (billing.service.ts). Needs manual verification.

**Setup:**
- [ ] In Stripe Dashboard → Products → Coupons → Create: code `LAUNCH50` (50% off first month, duration: once)
- [ ] DevSubscriptionPanel → "Reset to Free"

**Walkthrough:**
- [ ] Start checkout (Upgrade → Pro → Monthly)
- [ ] Stripe Checkout shows "Add promotion code" field
- [ ] Enter `LAUNCH50`
- [ ] Discount applied — total shows 50% off ($14.50 instead of $29)
- [ ] Enter invalid code `FAKECODE` — error message "This code is not valid"
- [ ] Use valid code and complete payment
- [ ] Invoice shows discount line item
- [ ] Subscription is Pro (discount doesn't affect tier)
- [ ] Next month's invoice is full price ($29) — coupon was "once"

**State Reset:** DevSubscriptionPanel → "Reset to Free"

---

### Scenario I2: 3D Secure Authentication — PASS (2026-03-04)

**Setup:**
- [x] DevSubscriptionPanel → "Reset to Free"

**Walkthrough (3DS Success):**
- [x] Start checkout → select Pro
- [x] Enter 3DS test card: **`4000 0025 0000 3155`**
- [x] Stripe presents 3D Secure authentication challenge
- [x] Complete the 3DS challenge (test mode "Complete" button)
- [x] Returns to Checkout → payment succeeds
- [x] All webhooks 200 OK — `checkout.session.completed`, `customer.subscription.created`, `invoice.paid`
- [x] Tier upgrades to Pro

**Walkthrough (3DS Failure):**
- [x] Reset to Free, start new checkout
- [x] Enter failing 3DS card: **`4000 0000 0000 3220`**
- [x] 3DS challenge appears and fails
- [x] Stripe Checkout shows: "We are unable to authenticate your payment method. Please choose a different payment method and try again."
- [x] `payment_intent.payment_failed` and `charge.failed` webhooks — 200 OK, no state change
- [x] No `checkout.session.completed` fired — correct
- [x] App state unchanged (still Free)

**Findings:** No bugs. 3DS is handled entirely by Stripe Checkout — no app code needed. Both success and failure paths work correctly.

**Test Audit (2026-03-04):**
- 3DS is entirely a Stripe Checkout concern — no app-side code paths specific to 3DS
- Success path webhooks are the standard checkout flow, already covered by existing integration tests
- Failure path webhooks (`charge.failed`, `payment_intent.payment_failed`) are informational — acknowledged with 200, no state change needed
- `invoice.payment_failed` integration test (added during E1 audit) covers the explicit payment failure handler — asserts no state change + audit log written
- No additional tests needed for I2

**State Reset:** DevSubscriptionPanel → "Reset to Free"

---

### Scenario I3: Refund Processing

**Setup:**
- [ ] Complete Scenario A1 (active Pro subscription with at least 1 payment)
- [ ] Note the Payment Intent ID from Stripe Dashboard

**Walkthrough:**
- [ ] In Stripe Dashboard → Payments → Find the payment → click **"Refund"**
- [ ] Select **Full refund**, confirm
- [ ] Stripe CLI shows `charge.refunded` webhook (if configured)
- [ ] **DOCUMENT actual behavior:** Does tier change? (Stripe does NOT auto-cancel on refund)
- [ ] **Partial refund test:** Repeat with partial amount
- [ ] Partial refund does not affect subscription status

**State Reset:** Cancel subscription in Stripe Dashboard + DevSubscriptionPanel → "Reset to Free"

---

### Scenario I4: Chargeback / Dispute

**Setup:**
- [ ] DevSubscriptionPanel → "Reset to Free"
- [ ] Complete checkout with dispute-triggering card: **`4000 0000 0000 0259`**

**Walkthrough:**
- [ ] After checkout completes, Stripe auto-creates a dispute
- [ ] Stripe CLI shows `charge.dispute.created` webhook
- [ ] **DOCUMENT:** Does webhook handler process this event?
- [ ] **DOCUMENT:** What happens to the user's tier during active dispute?
- [ ] In Stripe Dashboard → Disputes → dispute details visible (amount, reason, status)

**State Reset:** DevSubscriptionPanel → "Reset to Free"

---

### Scenario I5: Stripe Test Clocks

**Setup:**
- [ ] Open Stripe Dashboard → Developers → Test Clocks → Create Test Clock
- [ ] Set frozen time to "now"
- [ ] Create a new customer attached to this Test Clock
- [ ] Create a subscription for this customer (Pro Monthly with 14-day trial)

**Walkthrough:**
- [ ] Subscription is created with trial period
- [ ] Advance Test Clock to trial end date (14 days later)
- [ ] Webhooks fire: `customer.subscription.updated`, `invoice.created`, `invoice.paid`
- [ ] Advance Test Clock to renewal date (1 month later)
- [ ] `invoice.created` and `invoice.paid` webhooks fire for renewal
- [ ] Advance Test Clock with a failing card attached
- [ ] `invoice.payment_failed` fires
- [ ] Continue advancing → `customer.subscription.updated` with past_due status
- [ ] All webhooks are processed correctly by the app

**State Reset:** Delete Test Clock in Stripe Dashboard + DevSubscriptionPanel → "Reset to Free"

---

### Scenario I6: Checkout Abandonment — PASS (2026-03-04)

**Setup:**
- [x] DevSubscriptionPanel → "Reset to Free"

**Walkthrough:**
- [x] Click "Upgrade" → PricingOverlay → select Pro → click CTA
- [x] Stripe Checkout opens in new tab
- [x] **Close the Stripe Checkout tab without completing payment**
- [x] Return to app tab
- [x] App state unchanged — still "Free" tier
- [x] Stripe CLI shows NO `checkout.session.completed` webhook
- [x] Start a NEW checkout: works without issues (no "pending checkout" blocking)
- [x] After Stripe session timeout (24h): `checkout.session.expired` fires — app handles gracefully (manually expired via CLI, webhook returned 200, no state change)
- [x] No orphaned subscription in Stripe Dashboard

**State Reset:** No state change occurred — already on Free tier

**Bugs found:** None

**Test Audit (2026-03-05):**
- Code path: `handleCheckoutSessionExpired()` in webhook-handler.service.ts
- Existing coverage: `checkout.session.expired` handler tested via `billing-webhook.integration.test.ts` (asserts no subscription created, event marked completed)
- No new tests needed — existing integration test covers the abandonment/expiry path

---

## Execution Order (Recommended)

Run scenarios in this order to minimize resets and build on prior state:

### Wave 1: Core Happy Paths (most critical)
1. **F1** ✅ — Trial activation (verified 2026-02-26)
2. **F2** ✅ — Trial banner countdown (verified 2026-02-27)
3. **F3** ✅ — Trial expiration lockdown (verified 2026-02-27)
4. **A1** ✅ — Free → Pro Annual (verified 2026-02-28, 3 bugs documented)
5. **A2** — Free → Pro Annual
6. **A4** — Trial → Pro conversion
7. **A5** — Trial expired → Pro conversion
8. **F4** — Trial → direct Pro (no gap)

### Wave 2: Subscription Management
9. **C1** — Update payment method
10. **C2** — View/download invoices
11. **D1** — Monthly → Annual
12. **D2** — Annual → Monthly
13. **D3** — Proration
14. **C3** — Cancel subscription
15. **C4** — Reactivate after cancel

### Wave 3: Payment Failures
16. **E1** — Declined card at checkout
17. **I2** — 3D Secure authentication
18. **I6** ✅ — Checkout abandonment (verified 2026-03-04, no bugs)
19. **E2** ✅ — Renewal payment failure (verified 2026-03-04, no bugs — app correctly keeps Pro during past_due)
20. **E3** ✅ — Past-due grace period (verified 2026-03-04, no bugs — tier column drives access, not currentPeriodEnds)
21. **E4** ✅ — Payment recovery (verified 2026-03-04, no bugs — invoice paid, subscription restored to active)

### Wave 4: Security & Edge Cases
22. **G1** ✅ — Webhook idempotency (verified 2026-03-05, no bugs)
23. **G2** — Binding conflict
24. **G3** — Signature failure
25. **G4** — Encrypted EID validation

### Wave 5: Advanced & Enterprise (may require builds first)
26. **A3** — PO number field
27. **I1** — Coupon codes
28. **B1** — Enterprise quote
29. **B2** — Net-30 invoice
30. **B3** — Net-60 invoice
31. **B4** — Quote PDF
32. **I3** — Refund processing
33. **I4** — Chargeback handling
34. **I5** — Test Clocks full lifecycle
35. **H1** — MSA/DPA documents
36. **H2** — Tax and receipts
