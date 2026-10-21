# BuilderPro A–Z test report

Run: Oct 20, 2026, in the owner's Chrome at phone width (417px), live site builderpro-os.com.
Sign-ins are done by the owner; Claude tests from there.

## Setup notes
- Window resize from the Chrome tools was ignored while the window was maximized; the owner narrowed it by hand.
- The app blocks being framed (clickjacking guard at index.html line 15), so a framed phone preview isn't possible. Kept on purpose.

## Results (plan199, BuilderPro OS owner)

| # | Area | Result | Notes |
|---|---|---|---|
| 2 | Owner Home | Pass | Navy header, 4 tiles, Needs you, Today, All apps render; AI Team locked on this plan as expected; no console errors. |
| 3 | + sheet → Customer | Pass | New contact "AZ Test Customer (sample)" created (555-0142, az.sample@example.com, auto-text unchecked). |
| 4 | Contact profile | Pass | Call/Text/Email/New inspection fit on one row, big Estimate button. |
| 5 | Estimate end to end | Pass, with notes | Built job → materials (catalog search) → labor (labeled boxes) → price (math correct: $681.66) → send by email → customer link → signed and approved. Owner side shows "accepted" after reload. |

### Issues found
1. **HighLevel calendar warning keeps popping up** ("Some project days could not be put on the HighLevel Jobs calendar…") on every save, on pages unrelated to the calendar. Noise for an account without HighLevel connected.
2. **Send step "Change" link** goes back to the Price step, where the Text/Email choice is at the bottom of the page. Easy to miss.
3. **Send-link dialog says "Your texting number isn't connected"** even when Email was chosen.
4. **Owner app doesn't refresh after the customer approves**; the estimate still says "sent" until the page is reloaded.
5. The customer's "save to your account" prompt didn't show after approving, likely because the same browser is signed in as the owner. Re-check in the homeowner step.
6. **Wording mismatch:** bottom tab says "Jobs", page title says "Projects".
7. **Job screen header:** the job name under the customer ("Kitchen remodel") was dark gray on navy, nearly unreadable. **Fixed and verified live** (mobile.css v=20261021r).
8. **Job screen header:** "Mark done" wrapped onto two lines. **Fixed and verified live.**
9. **Job screen:** the Cancel / Save bar showed on the read-only Overview. **Fixed and verified live**; it comes back after "Edit details".
10. **Job screen:** on every tab the navy header plus the automatic-messages box take nearly half the phone screen, leaving little room for the tab's content. Suggest a smaller header once you're inside a tab.
11. **Money tab numbers disagree:** Dana Meyers shows "Paid $2,800" but the payment plan only marks the $1,000 deposit as paid.
12. **Calendar:** empty To-dos / Upcoming boxes show a stray gray dash (empty count badge) and take space when empty.
13. **Deletes and invoice sends use the browser's plain grey confirm box.** Looks out of place on a phone, and it froze the test tools (the owner had to click OK). Suggest an in-app confirm.
14. **Invoice "Confirm and send" on an account without invoicing set up** shows an error ("Your account isn't fully set up yet…") that disappears in 6 seconds. The button shouldn't be offered (or should say why) while invoicing is off.
15. **Payouts:** the "Customer pays → Your Stripe → Your bank" row runs off the right edge.
16. **Email tab toolbar:** Scheduled / Compose / Broadcast wrap unevenly (Broadcast alone on a second line).
17. **Settings list rows** were 44px instead of 60px (a general rule was winning). **Fixed and verified live** (v=20261021s).

| 6 | Job tabs | Pass | Money, Schedule, Crew, Materials, Permits, Contract, Photos all load with clear empty states; no console errors. Photo upload not tested (needs a file). |
| 7 | Calendar | Pass, with notes | Month default, To-dos/Upcoming on top, + Add menu, added and deleted a sample to-do, Week and Day views. Issue 12, 13. |
| 8 | Finances | Partial | Overview, Invoices, Payouts load. Sending the sample invoice is blocked on this account (invoicing not set up), so **no payment could be tested**. Issues 14, 15. |
| 9 | Supply | Pass | Order lists (sample estimate's materials appear automatically), Order materials, Receipts. |
| 10 | Inbox | Pass (empty) | Texts, Email, Team chat load; no conversations on this account, so thread open/back not tested. Issue 16. |
| 11 | Marketing | Pass | Ads & Listings and Connections load; nothing connected. |
| 13 | Settings | Pass | Section list, open a section, All settings back. Issue 17 fixed. |

## Results (plan299, Enterprise owner)

| # | Area | Result | Notes |
|---|---|---|---|
| 12 | AI Team / CEO chat | **Fail (blocked)** | Board, CEO briefing, assistant chats load. Asking a question fails: "The CEO couldn't answer right now". Server logs show the Anthropic key in Supabase is still the broken one (`sk-ant-usr-…` with a line break). **Owner must create a new API key (sk-ant-api03-…) and replace the secret.** The old deployed code also writes the key into the logs on every failure; the redacting version is committed but not deployed yet. Treat the old key as exposed and delete it. |
| 12b | AI CEO card | Fixed | Tapping "AI CEO" on the phone board did nothing (only the hidden desktop-diagram copy had a click handler). Fixed in aiteam.js (v=20261020a); shipped, waiting on deploy to re-check. |
| — | Equipment (Enterprise) | Pass, with note | Loads with sample heat pump. Issue 19. |

## Results (crew / employee)

| # | Area | Result | Notes |
|---|---|---|---|
| 14 | Employee home | Pass | Blue Clock in circle, today's job, Clock · Jobs · Messages · Me bar; no console errors. |
| 14 | Clock in / out | Pass, with note | Clocked in (location off) and out; shift recorded. Issue 20. |
| 14 | Jobs | Pass | List and job screen: "View only", no money shown, Call / Text / Directions. |
| 14 | Messages | **Was broken, fixed** | Team chat message box sat under the bottom tab bar, so nothing could be typed. Fixed (mobile.css v=20261021t), verified live, sample message sent to the owner. Likely affected the owner's Team chat too. |
| 14 | Me sheet | Pass | My crew, My ID, Time clock, Projects, Equipment, tour, dark mode, sign out. Sheet title changed "More" → "Me" to match the tab. |

20. **The big Clock in circle doesn't clock in.** It opens the Time clock page, where you tap Clock in again (two taps). Suggest clocking straight in when there's one job today.
21. **Time clock page lit the "Me" tab** instead of "Clock". Fixed (mobile.js v=20261021d).

## Results (subcontractor)

| # | Area | Result | Notes |
|---|---|---|---|
| 15 | Sub home (Jobs) | Pass | Insurance warning with Upload, contract value / paid / unpaid, their job; no console errors. |
| 15 | Invoices | Pass | Submitted a $100 sample invoice; shows under "Waiting on review" with Sign waiver. |
| 15 | Changes, Messages, More | Pass | All load; More has Compliance, My company, Change orders, Invoices. |

22. **Sub invoice form:** the file picker is the browser's plain "Choose file / No file chosen" control; looks unstyled next to the rest.
23. **Sub screens still use the older look** (plain top bar, no navy header); they work but don't match the new owner/crew design.

## Results (homeowner)

| # | Area | Result | Notes |
|---|---|---|---|
| 16 | My projects | Pass | Kitchen remodel at 20%, Find a pro, Get the app; no console errors. |
| 16 | Customer portal | Pass | Home (progress, payments, quick actions, latest, "Saved to My projects"), Schedule, Pay, Messages (box visible), More. |
| 16 | Payments | Not testable | No pay button: the contractor has no online payments set up ("To pay, contact…"). Same blocker as the owner side. |

Issue 11 update: not a bug. The customer side shows $2,800 paid and $9,400 next for Cabinets ($11,200 minus the extra $1,800 paid). The owner's Money tab just doesn't show that partial credit on the step the way the customer's Pay tab does ("$1,800 paid").
Issue 5 (sign-up prompt after approving) not re-checked: it needs a signed-out browser. Auto-saving to a signed-in homeowner's account does work.

## Results (Command Center, owner's admin login)

| # | Area | Result | Notes |
|---|---|---|---|
| 17 | AI Team board | **Was broken, fixed** | On a phone the team list was shrunk to 34% (the desktop "fit" ran on resize), and the page threw "Cannot read properties of null" when the board redrew after leaving the tab. Both fixed in command.html; **verified live**: full-size list with last shift and tools per team. |
| 17 | Approvals, Accounts, Phone numbers, Memory, Connections | Pass | All load. Accounts: 5 accounts, $896 MRR. Tables scroll sideways on a phone (fine for an admin page). |
| 17 | + New account (create) | **Fail (blocked)** | Owner approved one sample account. Try 1 (test.contractor@example.com): Supabase rejects example.com addresses ("email_address_invalid"). Try 2 (owner's +contractor alias): **"email rate limit exceeded"**. Nothing was created either time (the login step runs first, before HighLevel). |

25. **Supabase's built-in email sender is rate-limited** (a few emails an hour). Every new account, sign-up and password reset sends an email, so real sign-ups will fail once a few happen in an hour. **Owner action:** set up custom SMTP (e.g. Resend) in Supabase → Authentication → Emails → SMTP Settings. Retry the Command Center account creation after that.

24. **Connections: Stripe shows "Sign in again".** The Stripe connection for the AI teams has expired; the owner needs to reconnect it.

18. **AI CEO chat on a phone:** the top strip crams "New chat", "Briefings / Run now" and the date into one sideways-scrolling row.
19. **Equipment:** the search box is squeezed to a tiny box ("Se…") at the start of the filter row.

| 6 | Jobs list + one job (partial) | Pass, with design issues | New job cards, filters and the folded "job steps" strip work. Job opens read-only with Edit details. Issues 6–9 above. Did not tap Finished/Not yet, to keep the demo schedule unchanged. |

## Where the test stopped

Stopped by the owner during step 6 (to resume when there are more credits).

**Test data left in the account (plan199), all labeled sample:**
- Contact "AZ Test Customer (sample)", (555) 010-0142, az.sample@example.com
- Job/estimate "Gutter replacement (sample)", $681.66, approved by the test customer

**Still to do:**
- Step 6 rest: Money, Schedule, Crew, Materials, Permits, Photos, Documents tabs; Mark done.
- Steps 7–18: Calendar, Finances (invoice, payment plan, test-mode payment), Supply, Inbox, Marketing, AI Team, Settings, crew login, sub login, homeowner login (re-check issue 5), Command Center, then desktop width.
- The design check on every remaining screen.
- Re-test issues 7–9 on the live site after shipping, then ship to main.
- Fix issues 1–4 and 6.
- Clean up the sample contact and job.

**To resume:** sign in as plan199 in a narrow Chrome window (resize from the tools doesn't work while maximized; drag it narrow by hand), and point Claude at this file.
