# BuilderPro A–Z test, round 2 (partial)

Run: Oct 22, 2026, in the owner's Chrome, desktop width (the window was maximized on a 3440px screen and couldn't be resized, so phone layout was not tested).
New account: narek7099+az2@gmail.com, "AZ Test Roofing (sample)", Enterprise. Password given to the owner in chat only.
Stopped early: Claude's usage limit was reached.

## Blockers for the owner
1. **HighLevel never builds for any account.** Server says `GHL_API_KEY / GHL_COMPANY_ID not set`. Every account in the database has an empty HighLevel location id. Add both secrets in Supabase → Edge Functions → Secrets; the Command Center retries new sign-ups automatically. Without it: no sub-account, no texting/emailing customers (estimates are "not_messaged, no_highlevel"), AI Team says "CRM still being set up".
2. **Stripe never tells BuilderPro the card went through.** After the test-mode checkout the account stayed `checkout` ("Add a card to keep your trial" banner, AI Team locked behind "$49 Add AI Team" even on Enterprise). No call ever reached `billing-webhook`. In Stripe (test mode) → Developers → Webhooks, add `https://ttzwzouhiwdwamuimhpo.supabase.co/functions/v1/billing-webhook` with checkout.session.completed, customer.subscription.updated, customer.subscription.deleted, and put its signing secret in Supabase as `STRIPE_BILLING_WEBHOOK_SECRET`. (Test only: I set this account's status to `trial` by hand to keep testing.)
3. **Copied data on the new account.** Before the fix below, the new account received plan199's jobs and money (Kitchen remodel, Gutter replacement (sample), etc.). Clearing it was blocked by a safety check. Run in Supabase SQL: `update portal_finance set jobs='[]', fin='[]' where owner='7f1092cc-e524-4c45-8e4b-387835a79156';` (keep the new "Roof replacement (sample)" estimate out of it or redo it).

## Fixed and shipped (commit 9242473, main 14e382b)
- **One account's data leaking into another on the same browser.** The jobs/money cache was "migrated" into any account that had no server data yet, so a new sign-up on a shared computer got the last user's projects and numbers. The device cache now remembers its account and is cleared when a different account signs in (jobs, finances, calendar notes, closed days, receipts, templates, prices). Verified live: the cache is now tagged with the new account.

## Results
| Step | Result | Notes |
|---|---|---|
| Sign-up page | Pass | Enterprise preselected from pricing; plan switch updates the summary; empty fields highlighted; Show/Hide password; chips; Edit link from Review; Website add-on off; total $299. Small: red field outlines stay until you press Continue again. |
| Stripe checkout | Pass (sandbox) | Page shows Sandbox; 4242 test card; redirected to the setup page. No real money. |
| Setup page | Partial | Login ticked; HighLevel step never completes (blocker 1); "card not on file" note (blocker 2). |
| First-run tour | Pass | Shows on first login; Skip works; replay is under **?** → Take the tour on desktop (not the account menu). |
| New contact | Pass | Saved with auto-text unticked. Not in HighLevel (blocker 1). |
| Estimate builder | Pass | Catalog search, quantity, mark-up and tax math correct ($2,677.50). Draft saves. |
| Good/Better/Best | Pass | AI wrote the three tiers; Let them choose; sent by email. App correctly shows "send them this link" because email isn't connected. |
| Customer link | Pass, with note | Pick, sign, approve works. First Approve press showed "Couldn't reach the server" (request never left the browser); second press worked. Wording: confirmation says "They'll text you" even when sent by email. |
| Owner update | Pass | "AZ picked Better, signed" appeared without a reload; shows under Ready to invoice. |
| Page loads | Pass | Calendar, Projects, Supply (all tabs), Leads, Automations (55), Calculators, Payouts, QuickBooks, Reputation, Website, Social, Texts, Email, Team chat, Settings. |
| AI Team | Pass | Sales answered one question using the business and project data; chat came back after leaving and returning. |

## Second session
4. **Anthropic credit ran out.** The AI CEO question failed; the server log says "Your credit balance is too low to access the Anthropic API." Add credits in the Anthropic Console → Plans & Billing. Note: the Command Center team shifts run every 30 minutes and use credit even when nobody is chatting (turn shifts off on the AI Team board if you want to save credit).

| Step | Result | Notes |
|---|---|---|
| AI CEO tab | Blocked | Morning briefing ran (from the copied data). Question failed: Anthropic credit (blocker 4). |
| Suppliers | Pass | Added ABC Supply and SRS Distribution from the chain list (the "Add" form opens and saves). |
| Dark mode | Pass | Dashboard, Calendar, Finances readable; turned back off. |
| Password reset email | Sent | To narek7099+az2@gmail.com; owner to confirm it arrived. |
| Command Center, Accounts | Pass, shows the problem | New row: Enterprise, trial, 14 days left, Setup "Failed, sent to Support". Setup log: 3 retries, all "GHL_API_KEY / GHL_COMPANY_ID not set". |
| Command Center, Approvals / Memory | Pass | Nothing waiting. Memory now saves notes (yesterday's fix); Marketing noted not to run paid ads until HighLevel provisioning is fixed. |
| HighLevel check | Not possible | No sub-account exists (blocker 1). |

## Still not done
- HighLevel sub-account check, once blocker 1 is fixed.
- Lisa, CEO chat answers and the CEO chat reopening, once blocker 4 is fixed.
- Phone layout (+ sheet, glove sizes): the Chrome window is maximized on a 3440px screen and can't be resized by the tools.
- Photo upload, job step Finished/Not yet, Mark done, templates.
- Signed-out customer "save to your account" prompt: needs an incognito window, which the tools can't open.
- Cleanup: AZ Contact (sample), Roof replacement (sample) estimate, ABC Supply and SRS Distribution suppliers on the new account. They're all on the test account; delete them in the app when convenient, or keep them for the next round.
