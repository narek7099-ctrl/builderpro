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
| AI Team (included on Enterprise; $49 add-on on the others) | – | – | ~$5 typical, ~$15 worst, ~$40 extreme |
| **Total** | **~$49** | **~$91** | **~$176** |
| **Left over** | **~$50** | **~$108** | **~$123** |

A typical client uses about half the minutes, so they cost less than this.

**What the AI Team costs** (supabase/functions/ai-team):
- **Measured:** one real test message cost 3.4¢ (Sonnet, about 31,000 tokens read and 550 written).
- **Normal question:** about 3–8¢. **"Think harder" question** (Opus, used for research and long plans): about 10–25¢.
- **Built-in limit:** 150 messages a month per client, then it stops until the 1st. Every message's cost is recorded in `cai_usage`.
- **Automatic runs:** the 7am daily brief and the AI CEO's daily report cost about $1.50–3 a month per client.
- **Per client per month:** typical ~$5; all 150 messages used ~$12–15; all 150 as "think harder" questions ~$40, which is the most it can cost.
- **On the $49 add-on** (Foundation and OS) you keep at least ~$9 even in that extreme case, and ~$40 usually.

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
- **Refund and cancel rules are set:**
  - Terms: cancel any time; the plan runs to the end of the paid month; months already paid aren't refunded; no charge if you cancel during the trial.
  - The app's **Cancel my plan** button does exactly that, and it creates a "cancel" request in the Command Center so you can reach out first.
  - **Refunds you choose to give** (goodwill, or a mistake) are done by hand in Stripe: Payments → the payment → Refund.
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

## Your to-do list

**Before the first paying client:**
1. Upgrade Supabase to Pro ($25/mo) for daily backups.
2. Turn on two-step login: Supabase, Stripe, HighLevel, GitHub, Google, Anthropic.
3. Turn on leaked-password protection: Supabase → Authentication → Passwords.
4. Add your mom as a second admin on Supabase and GitHub.
5. Write the "if I lose access" page (which email owns what, no passwords).
6. **Stripe (your mom's login):**
   - **Webhooks:** add `invoice.payment_failed`, `charge.dispute.created` and `customer.subscription.trial_will_end` to the billing webhook.
   - **Billing settings:**
     - turn on Smart Retries
     - turn on the failed-payment and expiring-card emails
     - turn on the trial-ending reminder email
     - after all retries fail, cancel the subscription
7. **Email sending (Resend):** make a Resend account, verify builderpro-os.com in it (it gives you DNS records to add), and create an API key. Then:
   - add it to Supabase as the secret `RESEND_API_KEY` (Edge Functions → Secrets). Until then, homeowners don't get the emailed copy of their calculator estimate, and supplier orders open in the contractor's own mail app instead of sending.
   - use the same key for Supabase's own email sender, and paste the 5 branded login templates. Steps: `supabase/templates/README.md`. Without it, crew invites and password resets may not reach clients.
8. **Google Calendar:** in Google Cloud, enable the Calendar API, add the calendar scope and the new redirect address, and add test users. Steps: `GOOGLE-SETUP.md` (bottom section). About 10 minutes.
9. **Stripe receipts and reminders:** Stripe → Settings → Branding: upload the BuilderPro logo (`assets/email/builderpro-logo.png`) and set the brand color to #006fff (your mom's login).

**When HighLevel is turned back on:**
10. Turn on extra-minute billing ($0.25/min) in the Command Center.
11. Check the real Lisa cost per minute in HighLevel's billing after the first week, and update this sheet.
12. Add the BuilderPro logo to HighLevel's email templates (appointment reminders, review requests, missed-call follow-ups): Marketing → Emails → Templates.
13. Google Calendar's HighLevel part starts on its own: busy blocks and "customer appointment" bookings go into HighLevel at the next 5-minute sync. Check one of each.
