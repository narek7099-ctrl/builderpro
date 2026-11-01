# Before real clients: costs, safety, payments

Written Nov 1, 2026. Numbers are estimates from HighLevel's published rates; check them again when HighLevel is turned back on.

## 1. What each client costs (HighLevel usage)

HighLevel's own rates (LC Phone help article):
- local number $1.15/month
- inbound call $0.0117/min
- text $0.0075 per segment, plus a carrier fee of about $0.004

Voice AI (Lisa) rates vary by source: about $0.13 to $0.17 per minute on top of the call minute. This sheet uses **$0.19/min all-in** to be safe.

Each plan already includes Lisa minutes: Foundation 150, OS 300, Enterprise 500 (supabase/functions/usage-sync).

**Worst case, when a client uses every included minute:**

| Cost per month | Foundation $99 | OS $199 | Enterprise $299 |
|---|---|---|---|
| Lisa minutes, all used | 150 × $0.19 = $28.50 | 300 × $0.19 = $57 | 500 × $0.19 = $95 |
| Texts (about 2 per minute of calls) | ~$4 | ~$7 | ~$12 |
| Lisa text replies (Conversation AI, ~$0.02 to $0.04 each) | ~$8 | ~$16 | ~$40 |
| Number + texting registration (A2P) | ~$5 | ~$5 | ~$5 |
| Stripe fee (2.9% + 30¢) | $3.17 | $6.07 | $8.97 |
| **Total** | **~$49** | **~$91** | **~$161**, plus the AI Team's own AI cost |
| **Left over** | **~$50** | **~$108** | **~$138** |

A typical client uses about half the minutes, so they cost less than this.

**Fixed costs, whatever the number of clients:**
- HighLevel agency plan: $297 or $497/mo
- Supabase Pro when you go live: $25/mo
- AI for the Command Center: a few dollars a day

**Break-even:** about 6 to 10 clients, depending on the mix of plans.

**What protects you:**
1. **Extra-minute billing ($0.25/min) is built but switched off.** Turn it on in the Command Center when HighLevel comes back on. Each extra minute then earns about 6¢ instead of costing about 19¢.
2. **Trials are the open risk.** Someone can use all 150 minutes in their free trial and then cancel. The card taken at sign-up and the new "trial ends in 3 days" alert help. If it happens, give trials a lower minute limit, such as 50.
3. **Don't give away unlimited minutes**, even in a sales conversation.

## 2. Stop changes from breaking things (done)

- `tools/preflight.js` checks three things:
  1. every script compiles
  2. the main pages open with no errors and show the right things (prices, log-ins, calculator)
  3. the unit tests pass
- **It runs before every change goes to the live site.** The ship script stops if it fails.
- **It also runs on GitHub** after every push (`.github/workflows/preflight.yml`), and GitHub emails you if it fails.
- **Tested:** a deliberately broken file was caught in 7 places.
- **Still manual:** testing logged-in screens. The daily website check covers the public site.

## 3. Customer data and keys

Database check (Nov 1):
- All 87 tables are locked to their owner (row-level security is on everywhere).
- The flagged database functions all check who's calling.
- No problems found.

**To do (only you can):**
1. **Upgrade Supabase to Pro ($25/mo) before the first paying client.** The free plan has no backups you can restore from. Pro keeps 7 days of daily backups.
2. **Turn on two-step login** for Supabase, Stripe (your mom's login), HighLevel, GitHub, Google and Anthropic.
3. **Turn on leaked-password protection:** Supabase → Authentication → Passwords. It blocks passwords that showed up in data leaks.
4. **Write an "if I lose access" page** and keep it somewhere private (a password manager, or paper at home). It should list which email owns each account, and that your mom owns Stripe. **No passwords on that page.**
5. **Add your mom as a second admin** on Supabase and GitHub, so one locked-out account doesn't lock out the business.

## 4. Payments going wrong

**Done:**
- The billing webhook now creates an item in the Command Center (support requests, which the Software Team checks) for:
  - a declined card
  - a chargeback, with its answer-by date
  - a trial ending in 3 days
- Terms already say: cancel any time, no refunds for months already paid, no charge if you cancel during the trial.
- The app already shows an "update your card" bar when a payment fails.

**To do in Stripe (your mom's login):**
1. **Developers → Webhooks → the billing-webhook endpoint → add events:** `invoice.payment_failed`, `charge.dispute.created`, `customer.subscription.trial_will_end`.
2. **Settings → Billing → Subscriptions and emails:**
   - turn on **Smart Retries**
   - turn on emails for failed payments and expiring cards
   - turn on the **trial-ending reminder email** (card networks expect this for free trials, and it prevents most chargebacks)
   - after all retries fail, **cancel the subscription**
3. **Answer every chargeback.** Send the sign-up date, the terms they agreed to, and that they used the product. Stripe gives about a week.
