# BuilderPro Stripe test

Run: Oct 25, 2026, in the owner's Chrome, Stripe in live mode. Plan: `docs/STRIPE-TEST-PROMPT.md`, pick-up notes: `docs/STRIPE-TEST-CONTINUE.md`. Claude never typed a card or pressed Pay / Start trial; the owner did those steps.

## Summary
(in progress)

**Run 2 (Oct 25–26): Parts A, B and C pass. Total charged: $0.00.** The owner started the trial; Stripe had one trialing subscription (ends Nov 9, 2026), the billing webhook returned 200 every time, the "Add a card" banner went away, and plan/add-on changes reached Stripe. The owner then cancelled immediately; the account shows `cancelled`. Part D passes after the owner activated Stripe Connect.

**Done Oct 26:** new destination "Contractor payments (Connect)" (Events from: Connected accounts, same URL and 3 events) created; owner saved its secret as STRIPE_WEBHOOK_SECRET. Old "Connected Accounts" destination deleted by the owner; Stripe now has exactly two: "Contractor payments (Connect)" (Connected accounts) and "BuilderPro billing" (Your account). **Owner to-do:** check Stripe → Customer emails so $0 trial invoices don't email receipts.

**Found and fixed:**
- Run 1: the AZ account said "trial" with no Stripe subscription, so the "Add a card" banner never showed. The app now treats a trial with a checkout link but no subscription as "card needed" (fixed by the cloud session, 4f93533). Confirmed in run 2: the banner shows.
- Run 2: after checkout the account kept the trial end date from signup (Nov 6) while Stripe said Nov 9, so Plan & billing showed "12 days left" until the first plan change. `billing-webhook` now restarts the 14-day clock on `checkout.session.completed`. Deployed Oct 26 (billing-webhook v15, JWT check still off; an unsigned request still gets 400).
- Run 2: Plan & billing showed $299 with the Website add-on on (the account had $348). The price now includes add-ons.
- Run 2: the locked AI Team card said "Only on Enterprise." twice. Fixed.

**Note:** every plan or add-on change during the trial makes a $0.00 Stripe invoice (4 in this run). Harmless, but if Stripe emails receipts these could look like spam to customers. Worth checking Settings → Customer emails → "Successful payments".

**Needs the owner (Stripe setting):**
- The second webhook, "Connected Accounts" (`.../functions/v1/stripe-webhook`), shows **Events from: Your account**. It has to be **Connected accounts**, or homeowners' card payments to a contractor's own Stripe never reach BuilderPro (the invoice wouldn't be marked paid). Fix: Stripe → Workbench → Webhooks → Add destination → Events from **Connected accounts**, same URL, events `checkout.session.completed`, `payment_intent.succeeded`, `account.updated`. Put its new `whsec_…` in Supabase as `STRIPE_WEBHOOK_SECRET`, then delete the old "Connected Accounts" destination. (Events from can't be changed on an existing destination.)

**Checked while waiting (read-only):** Stripe has exactly one customer for narek7099+az2@gmail.com ("AZ Test Roofing (sample)"), total spend $0.00 USD. Both webhook destinations are Active with a 0% error rate.

## Part A: start the subscription (AZ Test Roofing)
| Step | Result | Notes |
|---|---|---|
| 1. Owner signs in as az2 | Pass | Run 2: already signed in in Chrome. |
| 2. "Add a card" banner | Pass (run 2) | Run 1 failed (no banner), fixed. Run 2: bottom banner "Add a card to keep your 14-day free trial. Add card"; account status `checkout`, no subscription. "Add card" → `signup.html?step=pay` ("Checkout was not finished") → "Add card and start trial" opens Stripe. |
| 3. Stripe checkout page | Pass | Live mode ("Live mode. Test data not accepted."), "Try BuilderPro Enterprise", **14 days free, then $299.00 per month starting November 8, 2026** (USD), email narek7099+az2@gmail.com prefilled. No separate "due today" line; Stripe's trial wording means nothing is charged before Nov 8. Also offers Apple Pay, Link, Amazon Pay, Cash App Pay, Klarna and bank. |
| 4. Owner enters card and presses Start trial | Pass | Lands on "You are in". Owner did this step. |
| 5. After trial starts | Pass | Stripe: one subscription, "Free trial ends Nov 9, 2026", BuilderPro Enterprise $299/mo. Billing webhook: `checkout.session.completed` 200 OK, amount_total 0. Account: status `trial`, plan enterprise, subscription linked. App: no "Add a card" banner. Command Center not opened (needs the owner's sign-in); it reads the same `status = trial`. |

## Part B: change plan and add-ons (during the trial)
| Step | Result | Notes |
|---|---|---|
| Enterprise → BuilderPro OS | Pass | Confirm dialog, then $199, AI Team locked in the sidebar. |
| BuilderPro OS → Enterprise | Pass | $299, AI Team "Included"; trial end updated to Nov 9 (14 days) by `customer.subscription.updated`. |
| Website add-on on | Pass | Account price $348, Stripe updated. Page showed $299 (fixed). |
| Website add-on off | Pass | Back to $299. Stripe: 1 item, BuilderPro Enterprise $299/mo, trialing. |
| Money | Pass | 5 invoices, all $0.00 Paid. |

## Part C: cancel (required)
| Step | Result | Notes |
|---|---|---|
| Owner cancels immediately in Stripe | Pass | Subscription "Canceled" Oct 26, 2026, 2:24 AM UTC. |
| Billing webhook | Pass | `customer.subscription.deleted` 200 OK. All 6 deliveries this run were 200 (1 checkout, 4 updated, 1 deleted). |
| Account | Pass | status `cancelled`. Command Center reads this status. |
| Money | Pass | Customer total spend **$0.00**. Nothing was ever charged. |

## Part D: Connect Stripe (look only, plan299)
| Step | Result | Notes |
|---|---|---|
| Finances → Payouts | Pass | "Not connected yet", 3-step explainer, "Connect with Stripe" button. |
| Connect with Stripe (first try) | Fail (Stripe setting) | Stripe refused: Connect was not activated on the live account. |
| Owner activates Connect | Done | Funds flow: sellers collect payments directly. Onboarding hosted by Stripe; sellers use the Stripe Dashboard; **Stripe is liable for negative balances** (the first answers had the platform liable; corrected before confirming). Owner verified ID and confirmed. |
| Connect with Stripe (re-run) | Pass | Opened Stripe "Onboard your account" (connect.stripe.com). Closed without filling anything in. Payouts now shows "Stripe needs a few more details" with "Finish on Stripe". An empty, unfinished connected account now exists for plan299 (test). |
| Error shown to the contractor | Fixed | It showed Stripe's raw text telling the contractor to sign up for Connect. Now shows "Card payments are being switched on for BuilderPro. Check back shortly." |
