# BuilderPro Stripe test

Run: Oct 25, 2026, in the owner's Chrome, Stripe in live mode. Plan: `docs/STRIPE-TEST-PROMPT.md`, pick-up notes: `docs/STRIPE-TEST-CONTINUE.md`. Claude never typed a card or pressed Pay / Start trial; the owner did those steps.

## Summary
(in progress)

**Run 2 (Oct 25): waiting at step 4.** The AZ account was already signed in, the "Add a card" banner now shows, and a fresh live checkout page is open in the owner's Chrome. It's waiting for the owner to enter a card and press Start trial. Nothing has been charged. Part C (cancel) is still required before the run ends.

**Found and fixed:**
- Run 1: the AZ account said "trial" with no Stripe subscription, so the "Add a card" banner never showed. The app now treats a trial with a checkout link but no subscription as "card needed" (fixed by the cloud session, 4f93533). Confirmed in run 2: the banner shows.

**Needs the owner (Stripe setting):**
- The second webhook, "Connected Accounts" (`.../functions/v1/stripe-webhook`), shows **Events from: Your account**. It has to be **Connected accounts**, or homeowners' card payments to a contractor's own Stripe never reach BuilderPro (the invoice wouldn't be marked paid). Fix: Stripe → Workbench → Webhooks → Add destination → Events from **Connected accounts**, same URL, events `checkout.session.completed`, `payment_intent.succeeded`, `account.updated`. Put its new `whsec_…` in Supabase as `STRIPE_WEBHOOK_SECRET`, then delete the old "Connected Accounts" destination. (Events from can't be changed on an existing destination.)

**Checked while waiting (read-only):** Stripe has exactly one customer for narek7099+az2@gmail.com ("AZ Test Roofing (sample)"), total spend $0.00 USD. Both webhook destinations are Active with a 0% error rate.

## Part A: start the subscription (AZ Test Roofing)
| Step | Result | Notes |
|---|---|---|
| 1. Owner signs in as az2 | Pass | Run 2: already signed in in Chrome. |
| 2. "Add a card" banner | Pass (run 2) | Run 1 failed (no banner), fixed. Run 2: bottom banner "Add a card to keep your 14-day free trial. Add card"; account status `checkout`, no subscription. "Add card" → `signup.html?step=pay` ("Checkout was not finished") → "Add card and start trial" opens Stripe. |
| 3. Stripe checkout page | Pass | Live mode ("Live mode. Test data not accepted."), "Try BuilderPro Enterprise", **14 days free, then $299.00 per month starting November 8, 2026** (USD), email narek7099+az2@gmail.com prefilled. No separate "due today" line; Stripe's trial wording means nothing is charged before Nov 8. Also offers Apple Pay, Link, Amazon Pay, Cash App Pay, Klarna and bank. |
| 4. Owner enters card and presses Start trial | Waiting | Owner away; checkout left open in Chrome. |
