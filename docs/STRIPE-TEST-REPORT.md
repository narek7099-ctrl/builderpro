# BuilderPro Stripe test

Run: Oct 25, 2026, in the owner's Chrome, Stripe in live mode. Plan: `docs/STRIPE-TEST-PROMPT.md`. Claude never typed a card or pressed Pay / Start trial; the owner did those steps.

## Summary
(in progress)

**Paused Oct 24, evening, at step 4.** The live checkout page was open and checked, waiting for the owner to enter a card and press Start trial. To pick up: reopen `signup.html?step=pay` while signed in as az2 → "Add card and start trial" (it makes a fresh checkout link; the old one may have expired), recheck step 3, then the owner enters the card. If the owner already pressed Start trial, skip to step 5 and check Stripe for exactly one Trialing subscription. Part C (cancel) is still required before the run ends.

**Found so far:**
- The AZ account says status "trial" with no Stripe subscription, so the "Add a card" banner never shows (server: an account without `stripe_subscription_id` should count as "checkout" until the webhook confirms the trial).

## Part A: start the subscription (AZ Test Roofing)
| Step | Result | Notes |
|---|---|---|
| 1. Owner signs in as az2 | Pass | Owner signed in. |
| 2. "Add a card" banner | **Fail** | No banner. The account says status **trial** (12 days left) but has no Stripe subscription, only a Stripe customer and an unfinished live checkout link. The banner only shows for status "checkout", so this owner would never be asked for a card. Used the plan's fallback, `signup.html?step=pay` → "Add card and start trial". |
| 3. Stripe checkout page | Pass | Live mode ("Live mode. Test data not accepted."), "Try BuilderPro Enterprise", **14 days free, then $299.00 per month starting November 7, 2026** (USD), email prefilled. No separate "due today" line; Stripe's trial wording means nothing is charged before Nov 7. Also offers Apple Pay, Link, Amazon Pay, Cash App Pay, Klarna and bank. |
| 4. Owner enters card and presses Start trial | Waiting | |
