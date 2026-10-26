# Stripe test: pick up at step 4 (for Claude Code + Chrome on the owner's PC)

Read `docs/STRIPE-TEST-PROMPT.md` (the full plan and rules) and `docs/STRIPE-TEST-REPORT.md` (where the last run stopped) first, then do everything below. Stripe is in **live mode**: real cards, real money.

## What changed since the report was written
- Stripe billing emails, Smart Retries (8 tries over 2 weeks) and the "trial over" statement message are on.
- A second webhook for connected accounts (`stripe-webhook`) is set up, with its secret in Supabase. `account.application.deauthorized` wasn't available to pick, so it isn't included.
- Stripe Connect is turned on.
- The app was fixed so the "Add a card" banner shows for an account that went to checkout but has no subscription. The AZ Test account is set back to "checkout", so the banner should appear.

## Rules (short version; the full list is in the prompt file)
- Never type card details and never press Start trial. When it's time, say "your turn" and wait for the owner.
- Only use narek7099+az2@gmail.com. Don't create new accounts.
- No AI chats, texts or emails.
- **Part C (cancel the subscription in Stripe) is required before you finish**, so nothing is ever charged. If anything goes wrong, jump straight to Part C.
- Never write passwords or keys in the chat or the report.

## Steps
1. Ask the owner to sign in at https://builderpro-os.com/index.html?portal=1 as narek7099+az2@gmail.com. Check that the "Add a card" banner shows.
2. Open checkout from the banner. Check it says live mode, Enterprise, $299/month, 14 days free and $0 today. Then tell the owner it's their turn.
3. After they start the trial, check:
   - Stripe has exactly one Trialing subscription for that customer.
   - The billing webhook's Event deliveries show **200**.
   - The Command Center (https://builderpro-os.com/command.html, the owner signs in) shows AZ Test as **Trial**.
   - The banner is gone.
4. **Part B:** in Settings → Plan & billing, switch Enterprise → OS → Enterprise, and turn the Website add-on on, then off. Check Stripe updates each time and nothing is charged.
5. **Part C (required):** have the owner cancel the subscription in Stripe (customer → subscription → Cancel → Immediately). Then check:
   - the webhook delivery for `customer.subscription.deleted` shows **200**
   - the Command Center shows **Cancelled**
   - the customer's total paid is **$0.00**
6. **Part D, look only:** the owner signs in as narek7099+plan299@gmail.com. Go to Finances → Payouts → Connect Stripe and check the Stripe onboarding page opens, then close it without filling anything in. Copy any error word for word.
7. Update `docs/STRIPE-TEST-REPORT.md` with pass or fail for every step, commit and push to `claude/web-os-dashboard-design-ijwlrd`. Then give the owner a short summary: is the subscription cancelled, was $0 charged, and is there anything to fix?

## Fixing
If something small is clearly broken in the app (wording, layout, a small bug in `index.html`, `portal/*.js` or `signup.html`), fix it and ship it the way `docs/STRIPE-TEST-PROMPT.md` describes: commit on the branch, push, and cherry-pick to `main`. Don't change Supabase functions, secrets or the database; put server-side problems in the report for the cloud session.
