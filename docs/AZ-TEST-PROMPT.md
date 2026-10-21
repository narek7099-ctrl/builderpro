# BuilderPro A–Z test (run in Claude Code with Chrome)

Paste everything below the line as your first message after `claude --teleport` + `/chrome`.

---

Run a full A–Z test of BuilderPro at https://builderpro-os.com in my Chrome, as a phone user. Don't stop to ask unless a rule below says to.

**Phone size.** Resize the window to about 400×860 (the app switches to its phone layout below 760px wide). Check with a screenshot that you see the bottom bar (Home · Jobs · + · Calendar · Inbox). If the window won't go that narrow, test at the narrowest width you can and say so in the report.

**Accounts.** Use the test logins from earlier in this conversation: plan199 (BuilderPro OS), plan299 (Enterprise), plan99 (Foundation), crew, sub and homeowner. If a password fails, stop and ask me. For the Command Center (builderpro-os.com/command.html) I'll sign in myself with my admin login. Pause and wait for me there.

**Hard rules (never break these):**
1. No real money. Only pay with Stripe test cards (4242 4242 4242 4242) and only when the payment page clearly says **test mode**. If a payment page is live or you can't tell, stop at that page, screenshot it, and note it.
2. Only message test contacts (example.com emails, 555-01xx phone numbers). Never text, email or call a real customer or real number.
3. Name everything you create "… (sample)" and label it as sample/test. When you finish, delete or void what you made (status removed/void), but only if it's yours.
4. Don't change billing, plans, API keys, connected accounts or settings that affect real customers. Don't disconnect anything.
5. Creating a client account in the Command Center makes a real HighLevel sub-account. Ask me before you click Create, and create at most one, named "Test Contractor (sample)".
6. The AI features (AI Team, CEO chat, Lisa) are expected to fail until the Anthropic key is replaced. Note it once and move on.

**What to test, in order (phone layout):**
1. Sign in, sign out, password reset screen (don't send to a real inbox), first-run tour (skip and replay).
2. Owner Home: every tile, Needs you, Today, All apps, account menu (top-right initials), notifications bell.
3. The + sheet: Estimate, Invoice, Job, Customer, Book an inspection, Snap a receipt, Note or to-do. Open each, fill it in with sample data, save.
4. Leads: new contact, contact profile (Call/Text/Email/New inspection/Estimate), search, calculator leads, calculators (copy link, QR), automations page loads.
5. Estimates: build one start to finish (job, materials, labor, other, price, send) to a test contact, including Good/Better/Best "Let them choose". Open the customer link (#est=…) in a new tab as the homeowner and approve and sign it. Check the deposit invoice and that the job moves to active.
6. Jobs: job cards, filters, search, open a job: Overview (read-only then Edit details), Money, Schedule, Crew, Materials, Permits, Photos (upload a test image), Documents, Mark done, job-step check-ins (Finished / Not yet).
7. Calendar: Month default, Week, Day, + Add (inspection, crew day, note), drag a box in Week view, to-dos and Upcoming.
8. Finances: Overview, Invoices (Confirm and send a sample invoice, payment plan), Estimates, Archive, Payouts page loads (don't connect Stripe), QuickBooks page loads (don't connect).
9. Supply: order lists, order materials search, suppliers (add sample suppliers), receipts, templates.
10. Inbox: texts, email (compose to a test address), team chat. Open a thread on a phone and go back.
11. Marketing, Reputation, Website, Social: pages load, Connect buttons go to the right place (don't finish connecting).
12. AI Team and CEO chat: loads, ask one question (expected to fail until the key is fixed).
13. Settings: every section opens from the list and goes back, change and save something harmless, then change it back.
14. Crew login: Clock in / clock out (location off), jobs, messages, Me/More, a receipt.
15. Sub login: jobs, invoices, change orders, compliance pages load.
16. Homeowner login: My projects, documents, sign-up from a customer link.
17. Command Center (I sign in): AI Team board, Approvals, Accounts (+ New account: ask me first), Phone numbers, Memory, Connections pages load.
18. Then repeat steps 2, 6 and 8 quickly at full desktop width.

**For every step:** take a screenshot, check the browser console for errors, and note anything broken, confusing, slow, cut off, or too small to tap with gloves.

**Fixing:** when something is clearly broken and the fix is small and safe, fix it in the repo on branch `claude/web-os-dashboard-design-ijwlrd`, bump the `?v=` for any portal file you change, commit, push, ship to main the same way as before, then retest. Leave bigger or risky fixes in the report for me.

**Report:** keep a running report in `docs/AZ-TEST-REPORT.md`. For each step: pass/fail, what broke, what you fixed (commit), what's left, plus screenshots of failures. Commit it as you go. At the end, give me a short summary: what works, what's broken, and what I need to do myself.
