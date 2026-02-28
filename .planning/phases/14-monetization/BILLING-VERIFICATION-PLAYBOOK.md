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

**State Reset:** DevSubscriptionPanel → "Reset to Free"

---

### Scenario A2: Free → Pro Annual

**Setup:**
- [ ] DevSubscriptionPanel → "Reset to Free"
- [ ] Tier badge shows "Free"

**Walkthrough:**
- [ ] Click **"Upgrade"** in header → PricingOverlay opens
- [ ] Toggle billing to **"Annual"**
- [ ] Pro card shows annual pricing with savings badge
- [ ] Click CTA on Pro tier card
- [ ] Stripe Checkout opens with annual amount
- [ ] Enter test card `4242 4242 4242 4242`, complete checkout
- [ ] Stripe CLI shows `checkout.session.completed`, `subscription.created`, `invoice.paid`
- [ ] Return to app: tier badge shows "Pro"
- [ ] DevSubscriptionPanel shows currentPeriodEnds ~1 year from now

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

### Scenario A4: Trial Active → Pro Conversion

**Setup:**
- [ ] DevSubscriptionPanel → "Reset to Free"
- [ ] DevSubscriptionPanel → Set Trial Days: `7`
- [ ] Tier badge shows "Pro", trial banner visible

**Walkthrough:**
- [ ] Header shows **"Subscribe"** (not "Upgrade") for trial users
- [ ] Click **"Subscribe"** → PricingOverlay opens
- [ ] Select Pro → complete checkout with test card `4242 4242 4242 4242`
- [ ] Checkout completes successfully
- [ ] Stripe CLI shows `checkout.session.completed` webhook
- [ ] No tier flicker — tier stays "Pro" throughout (no flash to "Free")
- [ ] Trial banner disappears after conversion
- [ ] DevSubscriptionPanel shows stripeSubscriptionId is set, trialEndsAt is null

**State Reset:** DevSubscriptionPanel → "Reset to Free"

---

### Scenario A5: Trial Expired → Pro Conversion

**Setup:**
- [ ] DevSubscriptionPanel → "Reset to Free"
- [ ] Set trial to expired: DevSubscriptionPanel → Set Trial Days: 0 (or via SQL: `UPDATE org_subscriptions SET tier = 'free', trial_ends_at = NOW() - INTERVAL '1 day' WHERE tenant_id = '<id>'`)

**Walkthrough:**
- [ ] Refresh app: TrialExpiredBanner visible with "View Plans" link
- [ ] Click **"View Plans"** → PricingOverlay opens
- [ ] Select Pro → complete checkout with test card `4242 4242 4242 4242`
- [ ] Stripe CLI shows `checkout.session.completed` webhook
- [ ] Tier badge shows "Pro"
- [ ] QuotaGate no longer shows limits (Pro = unlimited)
- [ ] All Pro features accessible (execution history, version history unlocked)

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

### Scenario C1: Update Payment Method

**Setup:**
- [ ] Tenant has active Pro subscription (complete A1 first if needed)

**Walkthrough:**
- [ ] Header shows **"Billing"** link (not "Upgrade") for paid users
- [ ] Click **"Billing"** → Stripe Customer Portal opens in new tab
- [ ] Portal loads successfully
- [ ] Find **"Payment method"** section
- [ ] Click **"Update"** or **"Add"** payment method
- [ ] Enter new card: `4242 4242 4242 4242` (or `5555 5555 5555 4444` for Mastercard)
- [ ] Save the new payment method
- [ ] Payment method updated in Portal UI
- [ ] Return to app: no service interruption — tier still "Pro", all features work

**State Reset:** DevSubscriptionPanel → "Reset to Free"

---

### Scenario C2: View and Download Invoice PDFs

**Setup:**
- [ ] Tenant has active Pro subscription with at least 1 completed payment
- [ ] If not: complete Scenario A1 first

**Walkthrough:**
- [ ] Click **"Billing"** → Stripe Customer Portal opens
- [ ] Find **"Billing history"** or **"Invoices"** section
- [ ] At least one invoice is listed with date, amount, status
- [ ] Click **"Download"** or **"View PDF"** on an invoice
- [ ] PDF downloads/opens
- [ ] PDF includes invoice number, date, line items, total, payment method last 4 digits
- [ ] PDF is professional enough for corporate expense reporting

**State Reset:** DevSubscriptionPanel → "Reset to Free"

---

### Scenario C3: Cancel Subscription

**Setup:**
- [ ] Tenant has active Pro subscription (complete A1 first if needed)

**Walkthrough:**
- [ ] Click **"Billing"** → Stripe Customer Portal
- [ ] Find **"Cancel plan"** or **"Cancel subscription"**
- [ ] Click cancel
- [ ] Confirmation screen explains: access continues until end of billing period
- [ ] Confirm cancellation
- [ ] Stripe CLI shows `customer.subscription.updated` webhook with `cancel_at_period_end: true`
- [ ] Return to app: tier still shows "Pro" (grace period until period end)
- [ ] **Simulate period end** via DB: `UPDATE org_subscriptions SET current_period_ends = NOW() - INTERVAL '1 day' WHERE tenant_id = '<id>';` then trigger `customer.subscription.deleted` webhook
- [ ] After subscription.deleted: tier reverts to "Free"
- [ ] Features lock, quotas enforce
- [ ] Saved queries and history are NOT deleted

**State Reset:** DevSubscriptionPanel → "Reset to Free"

---

### Scenario C4: Reactivate After Cancellation

**Setup:**
- [ ] Complete Scenario C3 (tenant is now free after cancellation)
- [ ] Tier is "Free" with no Stripe bindings

**Walkthrough:**
- [ ] "Upgrade" button appears in header
- [ ] Click "Upgrade" → PricingOverlay
- [ ] Select Pro → complete new checkout with fresh card
- [ ] New subscription created (new stripeSubscriptionId)
- [ ] Tier badge shows "Pro"
- [ ] All Pro features accessible
- [ ] No duplicate subscriptions in Stripe Dashboard

**State Reset:** DevSubscriptionPanel → "Reset to Free"

---

## Category D: Plan Changes

### Scenario D1: Pro Monthly → Pro Annual

**Setup:**
- [ ] Complete Scenario A1 (Pro Monthly active)
- [ ] Stripe Customer Portal is configured to allow plan switching

**Walkthrough:**
- [ ] Click **"Billing"** → Stripe Customer Portal
- [ ] Find **"Update plan"** or **"Change plan"** section
- [ ] Annual option is available
- [ ] Select Annual billing
- [ ] Portal shows prorated credit/charge calculation
- [ ] Confirm the switch
- [ ] Stripe CLI shows `customer.subscription.updated` webhook
- [ ] New price reflects annual pricing
- [ ] Return to app: tier still "Pro" (no interruption)
- [ ] DevSubscriptionPanel shows currentPeriodEnds updated to ~1 year out

**State Reset:** DevSubscriptionPanel → "Reset to Free"

---

### Scenario D2: Pro Annual → Pro Monthly

**Setup:**
- [ ] Complete Scenario A2 (Pro Annual active)

**Walkthrough:**
- [ ] Click **"Billing"** → Stripe Customer Portal
- [ ] Switch to Monthly billing
- [ ] Proration/credit is calculated
- [ ] Change takes effect per Portal configuration (immediate or end-of-period)
- [ ] Stripe CLI shows webhook, tier unchanged, currentPeriodEnds updated

**State Reset:** DevSubscriptionPanel → "Reset to Free"

---

### Scenario D3: Mid-Cycle Proration

**Setup:**
- [ ] Active Pro subscription partway through billing cycle

**Walkthrough:**
- [ ] Switch plans via Stripe Customer Portal (Monthly ↔ Annual)
- [ ] Stripe Dashboard → Invoices → prorated line items visible
- [ ] Invoice shows credit for unused portion + charge for new plan + net amount
- [ ] Stripe CLI shows `invoice.created` and `invoice.paid` webhooks

**State Reset:** DevSubscriptionPanel → "Reset to Free"

---

## Category E: Payment Failures & Recovery

### Scenario E1: Declined Card at Initial Checkout

**Setup:**
- [ ] DevSubscriptionPanel → "Reset to Free"

**Walkthrough:**
- [ ] Click "Upgrade" → PricingOverlay → select Pro → proceed to checkout
- [ ] On Stripe Checkout, enter declined card: **`4000 0000 0000 9995`**
- [ ] Enter valid email, expiry, CVC
- [ ] Click "Pay"
- [ ] Stripe Checkout shows a clear decline error message
- [ ] Stripe CLI shows NO `checkout.session.completed` webhook
- [ ] Return to app: still on "Free" tier
- [ ] Can retry by entering a different card on the same Checkout page
- [ ] Enter `4242 4242 4242 4242` → pay successfully
- [ ] Normal success flow (tier upgrades to Pro)

**State Reset:** DevSubscriptionPanel → "Reset to Free"

---

### Scenario E2: Renewal Payment Failure

**Setup:**
- [ ] Complete Scenario A1 with card `4000 0000 0000 0341` (attach succeeds, charge fails on renewal)
- [ ] OR: Set up via Stripe Dashboard — create subscription with this card, advance Test Clock

**Walkthrough:**
- [ ] After initial checkout succeeds, advance Stripe Test Clock to renewal date
- [ ] Stripe CLI shows `invoice.payment_failed` webhook
- [ ] WebhookHandlerService logs the failed payment event
- [ ] Stripe will retry per Smart Retries schedule
- [ ] **DOCUMENT actual app behavior:** Does the app still show "Pro"? Or does it lock features?

**State Reset:** Cancel subscription in Stripe Dashboard + DevSubscriptionPanel → "Reset to Free"

---

### Scenario E3: Past-Due Grace Period

**Setup via DB:**
```sql
UPDATE org_subscriptions SET
  tier = 'pro',
  stripe_customer_id = 'cus_test_pastdue',
  stripe_subscription_id = 'sub_test_pastdue',
  current_period_ends = NOW() - INTERVAL '5 days'
WHERE tenant_id = '<your-tenant-id>';
```

**Walkthrough:**
- [ ] Refresh the app
- [ ] **DOCUMENT:** What tier does `GET /features` return?
- [ ] **DOCUMENT:** Is the user still on "Pro" or has it fallen to "Free"?
- [ ] **NOTE:** The app relies on the `tier` column, not `currentPeriodEnds`. The real test is whether `customer.subscription.updated` with `status: 'past_due'` changes the tier.

**State Reset:** DevSubscriptionPanel → "Reset to Free"

---

### Scenario E4: Payment Recovery

**Setup:**
- [ ] Achieve past-due state (from E2 or E3)
- [ ] Stripe Portal is accessible

**Walkthrough:**
- [ ] Open Stripe Customer Portal
- [ ] Portal shows outstanding/failed payment
- [ ] "Update payment method" option available
- [ ] Enter a working card: `4242 4242 4242 4242`
- [ ] Stripe retries the failed invoice with the new card
- [ ] Stripe CLI shows `invoice.paid` webhook
- [ ] Stripe CLI shows `customer.subscription.updated` with `status: 'active'`
- [ ] App tier returns to "Pro"

**State Reset:** DevSubscriptionPanel → "Reset to Free"

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

### Scenario F4: Trial → Direct Pro (No Gap)

**Setup:**
- [ ] DevSubscriptionPanel → "Reset to Free"
- [ ] DevSubscriptionPanel → Set Trial Days: `7`
- [ ] Tier badge shows "Pro" (trial active)

**Walkthrough:**
- [ ] Complete checkout (Subscribe → Pro → test card `4242 4242 4242 4242`)
- [ ] **CRITICAL:** Watch for tier flash — tier stays "Pro" throughout (no momentary drop to "Free")
- [ ] In DB: trialEndsAt is now null, stripeSubscriptionId is set
- [ ] Stripe CLI shows `subscription.created` webhook event
- [ ] Features query refreshed — no stale trial data visible in UI

**State Reset:** DevSubscriptionPanel → "Reset to Free"

---

## Category G: Edge Cases & Security

### Scenario G1: Webhook Idempotency

**Setup:**
- [ ] Complete Scenario A1 (generates webhook events)
- [ ] Note the event ID from Stripe CLI output (e.g., `evt_1234567890`)

**Walkthrough:**
- [ ] Check stripe_webhook_events table: `SELECT id, event_type, status FROM stripe_webhook_events ORDER BY processed_at DESC LIMIT 5;`
- [ ] The checkout.session.completed event is status='completed'
- [ ] Replay the event: `stripe events resend evt_<ID>`
- [ ] Endpoint returns 200 (accepted, not error)
- [ ] stripe_webhook_events table: event NOT reprocessed (no duplicate row)
- [ ] org_subscriptions unchanged (no duplicate updates)
- [ ] API logs indicate event was already processed

**State Reset:** DevSubscriptionPanel → "Reset to Free"

---

### Scenario G2: Stripe Binding Conflict

**Setup:**
```sql
UPDATE org_subscriptions SET
  tier = 'pro',
  stripe_customer_id = 'cus_existing_customer',
  stripe_subscription_id = 'sub_existing_sub'
WHERE tenant_id = '<your-tenant-id>';
```

**Walkthrough:**
- [ ] Trigger a webhook event with a DIFFERENT customer ID for the same tenant
- [ ] WebhookHandlerService detects the binding mismatch
- [ ] Event is rejected/failed — subscription NOT updated
- [ ] Audit log contains conflict details
- [ ] Original subscription state preserved (cus_existing_customer intact)

**Note:** This scenario may be more reliably tested via unit tests than live. The existing unit test in `webhook-handler.service.unit.test.ts` covers this.

**State Reset:** DevSubscriptionPanel → "Reset to Free"

---

### Scenario G3: Webhook Signature Failure

**Setup:** None needed

**Walkthrough:**
- [ ] Send a fake webhook: `curl -X POST http://localhost:3000/api/billing/webhook -H "Content-Type: application/json" -H "stripe-signature: invalid_signature_here" -d '{"id": "evt_fake", "type": "checkout.session.completed"}'`
- [ ] Response is 400 or 401 (not 500)
- [ ] No changes to org_subscriptions
- [ ] No entry in stripe_webhook_events
- [ ] Error logged but response body does not leak internals

**State Reset:** None needed

---

### Scenario G4: Encrypted EID Validation

**Setup:** None needed

**Walkthrough:**
- [ ] Fetch encrypted pricing token: `curl http://localhost:3000/api/billing/pricing-token -H "Cookie: <session>"`
- [ ] Response contains an encrypted token (not raw EID)
- [ ] Token is different from the raw tenant EID
- [ ] In webhook-handler.service.ts, `resolveEid` tries decrypting first, falls back to raw value
- [ ] Tampered/garbage metadata.eid fails gracefully (logged error, not crash, no subscription created)

**State Reset:** None needed

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

### Scenario I2: 3D Secure Authentication

**Setup:**
- [ ] DevSubscriptionPanel → "Reset to Free"

**Walkthrough (3DS Success):**
- [ ] Start checkout → select Pro
- [ ] Enter 3DS test card: **`4000 0025 0000 3155`**
- [ ] Stripe redirects to 3D Secure authentication page
- [ ] Complete the 3DS challenge (test mode auto-completes or shows "Complete" button)
- [ ] Returns to Checkout → payment succeeds
- [ ] All standard success criteria (webhook, tier upgrade, etc.)

**Walkthrough (3DS Failure):**
- [ ] Reset to Free, start new checkout
- [ ] Enter failing 3DS card: **`4000 0000 0000 3220`**
- [ ] 3DS challenge appears
- [ ] Authentication fails
- [ ] Payment is declined — no subscription created
- [ ] App state unchanged (still free)

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

### Scenario I6: Checkout Abandonment

**Setup:**
- [ ] DevSubscriptionPanel → "Reset to Free"

**Walkthrough:**
- [ ] Click "Upgrade" → PricingOverlay → select Pro → click CTA
- [ ] Stripe Checkout opens in new tab
- [ ] **Close the Stripe Checkout tab without completing payment**
- [ ] Return to app tab
- [ ] App state unchanged — still "Free" tier
- [ ] Stripe CLI shows NO `checkout.session.completed` webhook
- [ ] Start a NEW checkout: works without issues (no "pending checkout" blocking)
- [ ] After Stripe session timeout (24h): `checkout.session.expired` fires — app handles gracefully
- [ ] No orphaned subscription in Stripe Dashboard

**State Reset:** DevSubscriptionPanel → "Reset to Free" (if any state changed)

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
18. **I6** — Checkout abandonment
19. **E2** — Renewal payment failure
20. **E3** — Past-due grace period
21. **E4** — Payment recovery

### Wave 4: Security & Edge Cases
22. **G1** — Webhook idempotency
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
