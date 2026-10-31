# BuilderPro Stripe test: final report

Run: Oct 25–26, 2026, in the owner's Chrome, Stripe in **live mode**. Plan: `docs/STRIPE-TEST-PROMPT.md`, pick-up notes: `docs/STRIPE-TEST-CONTINUE.md`. Claude never typed a card, an ID or a secret, and never pressed Pay / Start trial or agreed to terms; the owner did those steps.

## Result: pass, $0.00 charged

| Part | What was tested | Result |
|---|---|---|
| A | "Add a card" banner → live checkout → 14-day trial starts | Pass |
| B | Plan changes (Enterprise → OS → Enterprise) and Website add-on on/off during the trial | Pass |
| C | Cancel in Stripe; app shows cancelled | Pass |
| D | Contractor "Connect with Stripe" on Payouts (look only) | Pass, after Connect was turned on |

- **Money:** the only test customer (AZ Test Roofing (sample)) has total spend **$0.00**. 5 invoices, all $0.00. Subscription cancelled Oct 26, 2:24 AM UTC.
- **Billing webhook:** 6 deliveries this run, all 200 OK (1 checkout, 4 updated, 1 deleted).

## Fixed during the test
| Problem | Fix | Where |
|---|---|---|
| A trial with no Stripe subscription never showed the "Add a card" banner (run 1) | Treated as "card needed" | App, 4f93533 |
| After checkout the app kept the trial end from signup (Nov 6) while Stripe said Nov 9 ("12 days left" instead of 14) | The 14 days now start at checkout | `billing-webhook`, **deployed** (v15; JWT check still off; an unsigned request gets 400) |
| Plan & billing showed $299 with the $49 Website add-on on | Price includes add-ons | App |
| Locked AI Team card said "Only on Enterprise." twice | Said once | App |
| Payouts showed Stripe's raw "sign up for Connect" error to contractors | Plain message: "Card payments are being switched on for BuilderPro. Check back shortly." | App |

All app fixes are on `main` and the branch.

## Stripe setup changed
- **Connect turned on** (owner). Sellers collect payments directly; Stripe-hosted onboarding; sellers use their own Stripe Dashboard; **Stripe, not BuilderPro, is liable for negative balances** (the first answers had BuilderPro liable; corrected before the owner confirmed). Owner verified ID and accepted the Connect Platform Agreement.
- **Webhooks**, now exactly two, both Active:

| Destination | Events from | URL | Events |
|---|---|---|---|
| Contractor payments (Connect) | Connected accounts | `.../functions/v1/stripe-webhook` | `checkout.session.completed`, `payment_intent.succeeded`, `account.updated` |
| BuilderPro billing | Your account | `.../functions/v1/billing-webhook` | `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted` |

  The old "Connected Accounts" destination (wrongly set to Your account) was deleted. The owner put the new destination's secret in Supabase as `STRIPE_WEBHOOK_SECRET`.

## Still open
- **Receipt emails (owner's choice):** every plan change during a trial makes a $0.00 invoice. If Stripe → Settings → Customer emails → "Successful payments" is on, customers get a $0 receipt each time.
- **First real contractor payment:** the Connect webhook has had no events yet. When a homeowner first pays an invoice by card, check that the invoice turns paid; if not, look at that destination's Event deliveries.
- **Command Center** wasn't opened (needs the owner's sign-in). It reads the same account status the test checked (`trial`, then `cancelled`).
- **Test leftovers (harmless):** AZ Test's cancelled subscription; an empty, unfinished connected account for plan299; a few extra "BuilderPro …" products in Stripe made by plan changes.

---

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
