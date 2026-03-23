---
name: stripe-webhook-test
description: Set up Stripe CLI webhook listener and trigger test events to verify webhook processing in local development. Use when testing billing flows, subscription changes, or payment events.
disable-model-invocation: true
---

# Stripe Webhook Test

Helps you test Stripe webhook handling locally by managing the Stripe CLI listener and triggering events.

## Prerequisites

- Stripe CLI installed (`stripe` command available)
- Logged in to Stripe CLI (`stripe login`)
- API running locally on port 3000

## Usage

When invoked, ask the user what they want to test. Common scenarios:

### Start the listener
```bash
stripe listen --forward-to localhost:3000/api/billing/webhook
```
Run this in the background. Note the webhook signing secret it outputs — verify it matches the `STRIPE_WEBHOOK_SECRET` in `.env`.

### Trigger specific events

| Scenario | Command |
|----------|---------|
| New subscription | `stripe trigger checkout.session.completed` |
| Payment succeeded | `stripe trigger invoice.paid` |
| Payment failed | `stripe trigger invoice.payment_failed` |
| Subscription cancelled | `stripe trigger customer.subscription.deleted` |
| Subscription updated | `stripe trigger customer.subscription.updated` |
| Trial ending | `stripe trigger customer.subscription.trial_will_end` |

### Full upgrade flow test
1. Start the listener
2. Trigger `checkout.session.completed`
3. Check the API logs for webhook processing
4. Verify the database reflects the tier change:
   ```bash
   pnpm --filter api exec ts-node -e "
     // Quick check of tenant billing state
   "
   ```

### Verify webhook signature
If webhooks are failing with signature errors:
1. Check `stripe listen` output for the signing secret (`whsec_...`)
2. Compare with `STRIPE_WEBHOOK_SECRET` in `.env`
3. The local listener uses a different secret than the Stripe Dashboard webhook endpoint

## Troubleshooting

- **"No signatures found matching"**: The webhook secret in `.env` doesn't match the `stripe listen` secret. Update `.env` with the secret from `stripe listen` output.
- **Connection refused**: API isn't running on port 3000. Run `pnpm api:dev` first.
- **Event not handled**: Check `apps/api/src/` for the webhook controller — verify the event type is in the handled events list.
