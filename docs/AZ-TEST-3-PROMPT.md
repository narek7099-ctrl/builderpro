# BuilderPro round 3: full test and improve run (Claude Code + Chrome)

Paste everything below the line as your first message after `/chrome` in a fresh `claude` session in the builderpro folder.

---

You're alone with BuilderPro (https://builderpro-os.com) in my Chrome while I'm away for up to 6 hours. There's no time to fill: the job is done when every section below is tested and the report is finished, then stop. I'm away and you have my permission to test everything and improve the app, looks and how it works. Don't stop to ask me anything; when something needs me, write it in the report under "Needs the owner" and move on. Read `docs/AZ-TEST-REPORT.md` and `docs/AZ-TEST-2-REPORT.md` first so you know what already passed and what was broken.

**Logins.** Test logins are in `test-logins.local.txt` in this folder (never commit it, never paste a password into the report, a commit or the chat). I'm already signed in to the Command Center (command.html), HighLevel and Stripe in this Chrome; don't sign out of those. Switch between BuilderPro test accounts by signing out and in on builderpro-os.com.

**Hard rules (never break these):**
1. No real money. Only Stripe test mode with 4242 4242 4242 4242. If a payment page is live or unclear, don't type a card; note it.
2. Only message test contacts: example.com emails, 555-01xx numbers, or my `narek7099+…@gmail.com` addresses. Never text, email or call anyone else.
3. Name everything you create "… (sample)". Void or delete only what you made, at the end.
4. Don't change billing, plans, API keys, Supabase secrets, connected accounts, or another account's settings without changing them back. Don't disconnect anything. Don't create new BuilderPro accounts or HighLevel sub-accounts (one test account already exists: AZ Test Roofing (sample)).
5. **Spend no money at all.** Don't use anything that calls the AI (it bills per message), even if it seems to work: no CEO chat, AI Team or Lisa questions, no "Run now" briefing, no AI-written estimate tiers or descriptions, no AI receptionist test calls, no "Ask Lisa". Only check that those screens open and their buttons are there; note "AI not exercised (no-spend rule)". Don't use connected paid tools (Higgsfield, Canva and the like). Don't send texts or make calls (they cost in HighLevel). Emails to test addresses are fine (free). Stripe only in test mode. Don't turn the Command Center team shifts on if they're off.
6. In HighLevel, look only: no workflow changes, no phone numbers, no sending.
7. Don't change Supabase functions or the database. For server-side problems, write the exact fix in the report under "Server fixes for the cloud session".

**Window sizes.** Test every screen at phone width and at desktop width. I've left two Chrome windows open (same profile, so the same sign-ins): a **narrow one about phone width** and a **wide one**. Use the narrow window for the phone layout and the wide one for desktop. If you can resize a window yourself (works only when it isn't maximized), that's fine too.

## How to work
- Work in this order and keep moving; don't spend more than ~20 minutes stuck on one thing.
- For each area: use it like a contractor who isn't good with computers would, take a screenshot, check the console for errors, fix what's broken or clumsy, retest, then move on.
- **Fixing is allowed for anything in the front end** (index.html, portal/*.js, portal/*.css, signup.html, command.html): bugs, layout, wording, spacing, flows that take too many taps, missing empty states, confusing buttons. Match the existing design (navy header, blue main button, rounded white cards, General Sans) and the code style around it. Bump the `?v=` for any portal file you change.
- Commit small, one fix or one screen per commit, with a clear message. Push the branch and ship each commit to main (the live site deploys from main), then retest live after a minute:
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
- Keep `docs/AZ-TEST-3-REPORT.md` updated at least every 30 minutes (commit and push it too), so progress survives if the session stops.

## 1. Quick re-checks (first 20 min)
- Command Center → Accounts: does AZ Test Roofing (sample) show a HighLevel sub-account now? (I may have upgraded HighLevel.) If it shows "Failed", note the reason shown under it.
- Command Center CEO chat and the AI Team page open, show past conversations, and the input is there (don't send a message: rule 5). Close and reopen a past conversation: it should come back.
- Stripe: on the AZ Test account, does it still say "Add a card"? (Means the billing webhook isn't set yet.)

## 2. Every feature, by role (phone width first, then desktop)
**Owner, Enterprise test account** (most features), then quick passes on $199 and $99 to check plan locks look right and never show broken screens:
- Home: every tile, Needs you, Today, All apps, notifications bell, account menu, search, tour replay.
- + sheet: Estimate, Invoice, Job, Customer, Book an inspection, Snap a receipt, Note or to-do.
- Leads/contacts: add, search, filter, profile (Call/Text/Email/Inspection/Estimate), notes, tags.
- Calculators and booking page: open, copy link, QR, submit a test lead (example.com), check it lands in Leads.
- Estimates: single price, Good/Better/Best (write the three options by hand, not with AI), materials catalog, labor, markup/tax, templates, send by email to a test address, customer link: pick, sign, approve, decline.
- Invoices: deposit, progress, final, payment plan, send, mark paid by hand, receipts, archive.
- Jobs: every tab (Overview, Money, Schedule, Crew, Materials, Permits, Contract, Photos, Documents), job steps Finished/Not yet, photo upload (any small image), change order, Mark done.
- Calendar: Month/Week/Day, + Add (inspection, crew day, note), drag in Week view, to-dos, Upcoming.
- Crews and team: add a sample employee/crew, assign to a job, time clock view.
- Supply: order lists, order materials, suppliers, receipts, templates.
- Inbox: texts, email (compose to a test address), team chat; open a thread and go back.
- Marketing, Reputation, Website, Social, Automations: pages load, buttons go to the right place (don't finish connecting).
- AI: Lisa page, AI Team assistants, AI CEO tab open and look right; past chats show; no messages sent (rule 5).
- Settings: every section opens, change something harmless, save, change back.
- Dark mode on every main screen.

**Crew login:** clock in/out (location off), today's job, job screen, messages, receipts, Me sheet.
**Sub login:** jobs, invoices (submit a sample), change orders, compliance upload, messages.
**Homeowner login:** My projects, a project's Home/Schedule/Pay/Messages, documents, Find a pro.
**Command Center:** every tab loads; Accounts Add key form opens (don't save); Memory, Approvals, Connections, Phone numbers.

## 3. Whole workflows, start to finish
1. Lead to paid job: calculator lead → contact → book inspection → estimate (Good/Better/Best) → customer approves and signs → deposit invoice → schedule job days → assign crew → crew clocks in and adds a photo → job step check-ins → change order approved by the customer → final invoice → marked paid → review request (to a test address) → job done.
2. Sub flow: owner adds a sample sub to a job → sub sees it → sub submits an invoice and a change order → owner approves → shows in the job's Money tab.
3. Homeowner flow: customer link → save to account → homeowner sees the project, schedule, payments and messages; owner sees their message.
4. Supply flow: estimate materials → order list → order → receipt matched to the job.
Note every place the flow breaks, loses data, needs a reload, or takes more taps than it should, and fix what you can.

## 4. Design and usability pass
Go screen by screen and make it better: crowded screens, text that doesn't fit, small tap targets (gloves), inconsistent cards/buttons/tabs, unclear wording (plain words a contractor uses), missing empty states, loading states that never end, things that look old next to the new design. Prioritize the screens a contractor uses every day: Home, Jobs, a job, Calendar, Estimates, Invoices, Inbox, crew Clock.

## 5. Edge cases (spot checks)
Very long names and addresses, $0 and $1,000,000 amounts, empty accounts, slow network (Chrome throttling "Slow 4G"), going offline mid-save, rotating between phone and desktop width.

## Cleanup and report
At the end, void/delete the sample records you made (keep the AZ Test account itself). Finish `docs/AZ-TEST-3-REPORT.md` with: what works, what you fixed (commit list), what's still broken, **Needs the owner**, and **Server fixes for the cloud session**. Commit, push, ship. Then write a short summary in the chat.
