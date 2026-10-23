# BuilderPro A–Z test, round 2 (run in Claude Code with Chrome)

Paste everything below the line as your first message in a new Claude Code session (in the builderpro folder) after `/chrome`.

---

Run round 2 of the BuilderPro test at https://builderpro-os.com in my Chrome. Round 1 is in `docs/AZ-TEST-REPORT.md`; read it first so you know what already passed. This round signs up a brand-new account from the website, checks it was created in the Command Center and in HighLevel, then tests everything round 1 skipped or couldn't reach. Since round 1: email sending works (custom SMTP), the AI works (Anthropic key fixed), and chats now save. Don't stop to ask unless a rule below says to.

**Phone size.** Use a window about 400×860 wide (the app switches to its phone layout below 760px). If the tools can't resize it, ask me to drag it narrow. Do the sign-up page at both phone and desktop width.

**Hard rules (never break these):**
1. No real money. On the Stripe checkout page, only type a card if the page clearly says **test mode** (then use 4242 4242 4242 4242, any future date, any CVC). If it's live or you can't tell, don't type anything: screenshot it, note it, and carry on. The account and its setup are already made before checkout, so the test can continue.
2. Only message test contacts (example.com emails, 555-01xx phone numbers) or my own `narek7099+…@gmail.com` addresses. Never text, email or call a real customer or a real number.
3. Name everything you create "… (sample)". At the end, delete or void what you made (only yours).
4. Don't change billing, plans, API keys, connected accounts or anything on the other test accounts' settings that you don't change back. Don't disconnect anything.
5. Make exactly one new account (this one is approved). Don't make more, and don't use Command Center → + New account.
6. The AI is live now and costs a little per message. Ask each AI one or two short questions, not dozens. If an answer fails, screenshot the exact error and move on.
7. In HighLevel, only look. Don't change, delete or turn on anything (no workflows, no phone numbers, no sending).

## Part A: sign up from the website (phone width, then a quick desktop look)

1. Go to https://builderpro-os.com, find the pricing section and tap **Start free trial** on **Enterprise** ($299). Check it lands on the sign-up page with Enterprise picked.
2. Go through every step and check each screen with the design check below:
   - Plan: switch plans and back, the summary bar updates.
   - Your login: name "AZ Two Owner", phone (512) 555-0177, email **narek7099+az2@gmail.com**, password: make one up, 12+ characters, and tell me it in the chat at the end (never write it in the report or any file in the repo). Try Show/Hide on the password. Try Continue with a field empty (it should highlight it).
   - Your business: "AZ Test Roofing (sample)", Roofing, Austin, TX, service area "Austin, Round Rock".
   - Services and hours: tap a few suggestion chips, turn Sunday off and on.
   - AI receptionist: leave the defaults.
   - Review: use one **Edit** link and come back. Leave the Website add-on off.
3. Tap **Start my free trial**. Follow rule 1 on the Stripe page.
4. After checkout (or if you stopped at it), open https://builderpro-os.com/signup.html?done=1 and check the setup list ticks through (login, GoHighLevel workspace, details, AI receptionist).
5. Sign in to the portal as narek7099+az2@gmail.com. Check the first-run tour, then skip it, and replay it from the account menu.
6. Check that a welcome or confirmation email arrived in my Gmail if the app sends one (ask me to look; you can't read my inbox).

## Part B: Command Center (I sign in)

7. Ask me to sign in at https://builderpro-os.com/command.html, then wait.
8. **Accounts:** the new "AZ Test Roofing (sample)" row is there with plan Enterprise, the right status, and Setup showing the HighLevel workspace was built (hover it to see the setup log). Screenshot it.
9. **Approvals:** if anything is waiting that's about this new account (for example the Builder team finishing its setup), tell me what it is and approve it only after I say yes. Don't approve anything about other accounts.
10. Quick look at **AI Team board** and **Memory**: did the Builder or Support team pick up the new account (an "Onboard: AZ Test Roofing (sample)" conversation under Builder)? Note what you see.
11. **CEO chat:** ask the CEO "What happened with the newest sign-up?". It should answer (not an error). Close the panel, reopen the CEO: the same conversation should come back by itself. Reload the page and check again.

## Part B2: HighLevel (I sign in)

12. Ask me to sign in to HighLevel at https://app.gohighlevel.com (my agency login), then wait.
13. Find the sub-account **AZ Test Roofing (sample)** in the account switcher. Screenshot it. Check (look only, rule 7):
    - Settings → Business profile: name, phone, email, address match the sign-up.
    - Settings → Custom values: Business Name, Business Phone, Service Area, Business Hours, Trade, Owner Name are filled in (not placeholders).
    - Calendars: there's an inspection/booking calendar.
    - Automation → Workflows: the workflows from the Enterprise snapshot are there.
    - Settings → Team: a user for narek7099+az2@gmail.com exists.
    Note anything missing. If the sub-account isn't there at all, say so right away and check the Command Center setup log for the error.

## Part C: everything round 1 skipped (on the new account unless noted)

14. **Sign in / out:** sign out, sign back in, and open the password-reset screen. Send a reset to narek7099+az2@gmail.com (email works now) and ask me if it arrived.
15. **+ sheet, every option:** Estimate, Invoice, Job, Customer, Book an inspection, Snap a receipt (upload any test image), Note or to-do. Create a sample of each and check it shows up where it should (calendar, jobs, finances, to-dos).
16. **Good/Better/Best:** build an estimate with three options and "Let them choose", send it to az.sample2@example.com, open the customer link in a new tab, pick one, sign and approve. Check the job, the deposit invoice and that the owner side updates without a reload.
17. **HighLevel (now connected on this account):**
    - A new contact made in BuilderPro ("AZ Contact (sample)", az.contact@example.com) shows up in the HighLevel sub-account's Contacts (switch to the HighLevel tab and look).
    - Automations page loads and shows the workflows; turn nothing on that would text a real number.
    - Calendar: a job day or inspection you add shows on the calendar, and there's no "couldn't be put on the HighLevel calendar" warning. If there is, note it.
    - Calculators: open a calculator, copy the link and show the QR, submit a test lead with an example.com email, and check it lands in Leads.
18. **Jobs:** upload a photo on a job, tap a job step's **Finished** and **Not yet**, and **Mark done** on the sample job only.
19. **Inbox:** open an email thread (the sample estimate's) and go back. Check texts say why texting isn't set up yet if there's no number.
20. **Supply:** add two sample suppliers, make a template, use it on an order list.
21. **Reputation, Website, Social:** each page loads, the Connect buttons go to the right place (don't finish connecting).
22. **Payments:** if the Stripe checkout or Payouts says test mode, pay the sample deposit with the test card and check it shows as paid on both sides. If not, skip and note it.
23. **AI:** ask Lisa, one AI Team assistant (e.g. Sales) and the AI CEO tab one short question each (Enterprise has all three). Then leave the AI Team page, come back and reload: each chat should still be there (the assistant reopens your last conversation, the CEO tab shows your earlier questions and answers).
24. **Dark mode:** turn it on and walk Home, Jobs, a job, Calendar, Finances, Inbox and Settings, then turn it off.
25. **Homeowner sign-up prompt (round 1 issue 5):** open the sample estimate's customer link in a private/incognito window (signed out), approve, and check the "save to your account" prompt shows.
26. **Resize:** go between phone and desktop width on Home, Jobs and Calendar a few times; nothing should break.
27. Repeat 15, 18 and 24 quickly at full desktop width.

**For every step:** take a screenshot, check the browser console for errors, and note anything broken, confusing, slow, cut off, or too small to tap with gloves.

**Design check on every screen (phone and desktop), including pop-ups, sheets and menus:**
- Overlapping: text over text, buttons on top of each other, pop-ups or menus hidden behind other things, the bottom bar or a sticky button covering content.
- Cut off or overflowing: words, numbers or buttons running out of their box, sideways scrolling on a phone, long names breaking the layout.
- Spacing and alignment: cramped or uneven gaps, things not lined up, mismatched card styles, empty holes, double borders or headers.
- Consistency: buttons, cards, tabs, fonts and colors that don't match the new design (navy header, blue main button, rounded white cards); old-style screens; wording mismatches (Jobs vs Projects).
- Readability: low contrast, tiny text, unlabeled icons.
- States: empty, loading that never finishes, error messages, dark mode.

**Fixing:** when something is clearly broken and the fix is small and safe (CSS, wording, a small JS bug), fix it in the repo on branch `claude/web-os-dashboard-design-ijwlrd`, bump the `?v=` for any portal file you change, commit, push the branch, then ship that one commit to main (the live site deploys from main) and retest a minute later:
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
Don't change Supabase functions or the database; put server-side problems in the report for me. Leave bigger or risky fixes in the report too.

**Cleanup at the end:** void/delete the sample estimates, invoices, jobs, contacts, suppliers and to-dos you made. **Keep the new account itself** (I'll use it); note anything you couldn't remove.

**Report:** keep a running report in `docs/AZ-TEST-2-REPORT.md` with the same layout as round 1: for each step pass/fail, what broke, what you fixed (commit), what's left. Put the new account's email at the top (not the password). Commit it as you go. At the end, give me a short summary: what works, what's broken, and what I need to do myself.
