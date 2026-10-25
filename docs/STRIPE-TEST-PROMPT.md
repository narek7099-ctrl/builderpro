# BuilderPro Stripe test (run in Claude Code with Chrome)

## Before you start (you, not Claude)
1. In PowerShell: `cd` to your builderpro folder, run `git pull`, then `claude`. Type `/chrome` and paste everything below the line as your first message.
2. **Payments webhook (second one, for contractors' customer payments).** At https://dashboard.stripe.com/webhooks (live mode), add another destination:
   - Events from: **Connected accounts**.
   - Events: `checkout.session.completed`, `payment_intent.succeeded`, `account.updated`, `account.application.deauthorized`.
   - URL: `https://ttzwzouhiwdwamuimhpo.supabase.co/functions/v1/stripe-webhook`
   - Copy its `whsec_…` into Supabase secrets as `STRIPE_WEBHOOK_SECRET`: https://supabase.com/dashboard/project/ttzwzouhiwdwamuimhpo/functions/secrets
3. **Turn on Stripe Connect** (it lets contractors link their own Stripe for payouts) at https://dashboard.stripe.com/connect. Follow Stripe's setup if it asks.
4. Optional: if you want everyone to see US dollars, turn off **Adaptive Pricing** at https://dashboard.stripe.com/settings/adaptive-pricing.
5. Have your own card ready. You type it yourself; Claude never types card numbers. The trial means **$0 today**, and the test cancels the subscription before it ends.

---

Run the BuilderPro Stripe test at https://builderpro-os.com in my Chrome. Stripe is in **live mode**: real cards, real money. Write results as you go in `docs/STRIPE-TEST-REPORT.md` (pass/fail per step, what broke, screenshots described), commit it and push to branch `claude/web-os-dashboard-design-ijwlrd`. Don't stop to ask unless a rule says so.

**Hard rules:**
1. Never type a card number, CVC or expiry, and never click a Pay/Subscribe/Start trial button on my behalf. When a card is needed, stop and tell me "your turn: enter your card and press Start trial", then wait.
2. Only use the test account **narek7099+az2@gmail.com** (AZ Test Roofing) and the existing test accounts. Don't create new BuilderPro accounts. Don't use Command Center → + New account.
3. Never send texts, emails or calls to anyone. No AI chats (they cost money).
4. Part C (cancel) is required before you finish. If anything stops you earlier, jump to Part C so no real charge ever happens. The trial ends 14 days after checkout.
5. Don't change any Stripe settings, keys or webhooks. Only look, and cancel the one test subscription in Part C.
6. Never write passwords, keys or `whsec_` values in the report or the chat.

## Part A: start the subscription (AZ Test account)
1. Ask me to sign in to https://builderpro-os.com/index.html?portal=1 as narek7099+az2@gmail.com, then wait.
2. The portal should show a banner like "Add a card to keep your 14-day free trial" (its status is "checkout" or "trial"). Screenshot it. If there's no banner, open https://builderpro-os.com/signup.html?step=pay and use its "Continue to checkout" button.
3. On the Stripe page check, and screenshot:
   - It does **not** say "Test mode" (it's live).
   - Plan: **BuilderPro Enterprise**, **$299.00 / month** (or the local currency if Adaptive Pricing is on; note which), **14 days free**, first charge date about 14 days from today.
   - Email is prefilled with narek7099+az2@gmail.com.
   - "Due today" (or the total today) is **$0.00**. If it isn't $0, **stop**: don't let me pay, and report it.
4. Tell me it's my turn (rule 1). After I finish, you should land on `signup.html?done=1`. Check the setup list there and screenshot it.
5. Ask me to open the Stripe dashboard (https://dashboard.stripe.com/customers) and search narek7099+az2@gmail.com. Check: one subscription, status **Trialing**, $299/month, trial end date, metadata has user_id and plan=enterprise.
6. Ask me to open my webhook destination (https://dashboard.stripe.com/webhooks → BuilderPro billing → Event deliveries). `checkout.session.completed` and `customer.subscription.updated` (if sent) should show **200**. Any 400 means the `whsec_` in Supabase is wrong: note it and tell me.
7. Ask me to sign in to https://builderpro-os.com/command.html. On the Accounts page, the AZ Test row should show status **Trial**. Reload the portal: the "Add a card" banner should be gone.

## Part B: change plan and add-ons (still in the trial)
8. In the AZ portal go to Settings → **Plan & billing**. Switch to **BuilderPro OS ($199)** and confirm the prompt. Then check:
   - The portal shows OS.
   - Stripe (I'll look): the subscription now shows $199/month, and the upcoming invoice is $0 today because of the trial.
   - Command Center plan column shows OS.
   Screenshot each.
9. Turn the **Website** add-on on ($49), check Stripe shows a second line, then turn it off again.
10. Switch back to **Enterprise**. Check Stripe shows $299 again and nothing was charged (Stripe → the customer → Invoices or payments: no paid amounts above $0.00).
11. On a plan screen, check that a locked feature (for example AI Team on OS) shows an "Upgrade" card, and that its button goes to the same plan change.

## Part C: cancel (required)
12. Ask me to cancel in Stripe: the customer → subscription → **Cancel subscription → Immediately**.
13. Check the webhook delivery `customer.subscription.deleted` shows **200**.
14. Command Center: AZ Test status is now **Cancelled**. Portal: note what a cancelled owner sees (banner, locked pages or nothing). Note anything confusing.
15. Confirm in Stripe that the customer's total paid is **$0.00**.

## Part D: contractor payouts (Stripe Connect), look only
16. Ask me to sign in to the portal as narek7099+plan299@gmail.com (Enterprise test account).
17. Open Finances → **Payouts**. It should say Stripe isn't connected and show a Connect button. Click it.
    - If Stripe's onboarding page opens, screenshot it and **don't fill anything in**. Close it and go back. Payouts should still say not connected, or "finish setting up".
    - If you get an error (for example Connect isn't turned on), copy the exact message.
18. On an invoice, check how "Pay by card" behaves while Stripe isn't connected. It should say card payments aren't set up, not show an error. Don't send anything.

## Part E: wrap up
19. Every page you visited: check the browser console for errors and note any.
20. Report summary at the top of `docs/STRIPE-TEST-REPORT.md`: what works, what's broken, what I need to do. Commit and push. Then tell me in the chat:
    - whether the AZ subscription is cancelled
    - whether $0 was charged
    - anything I need to fix in Stripe or Supabase.

**Fixing:** if something is clearly broken and the fix is small and safe (wording, a small JS bug in `index.html`/`portal/*.js`/`signup.html`), fix it on the branch, bump `?v=` for any portal file, commit, push the branch, and cherry-pick that commit to `main` (the live site deploys from main):
```
git push origin claude/web-os-dashboard-design-ijwlrd
git fetch origin main
git worktree add ../bp-main origin/main
cd ../bp-main
git cherry-pick <commit>
git push origin HEAD:main
cd ../builderpro
git worktree remove ../bp-main
```
Don't change Supabase functions, secrets or the database. Put server-side problems in the report for the cloud session.
