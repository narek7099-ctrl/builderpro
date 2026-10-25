# BuilderPro round 4: finish what round 3 couldn't (Claude Code + Chrome)

Paste everything below the line after `/chrome` (or send: "Run docs/AZ-TEST-4-PROMPT.md").

---

Finish the BuilderPro tests that round 3 couldn't do because they needed signing in. Read `docs/AZ-TEST-3-REPORT.md` first. Same rules as `docs/AZ-TEST-3-PROMPT.md` (no money, no AI messages, no texts or calls, test contacts only, "(sample)" names, front-end fixes allowed and shipped, server problems written down). Work until every item below is done, then finish the report and stop.

**Signing in, with no passwords.** Open this link to sign in as a test account (it replaces whoever is signed in on builderpro-os.com):
`https://ttzwzouhiwdwamuimhpo.supabase.co/functions/v1/test-login?key=KEY&who=NAME`
- KEY is the line `test login key:` in `test-logins.local.txt` (never write it in the report, a commit or the chat).
- NAME is one of: `plan99`, `plan199`, `plan299`, `owner`, `crew`, `sub`, `homeowner`, `az2`.
- The Command Center (command.html), HighLevel and Stripe stay signed in as me; don't sign out of them.

**Windows.** Narrow Chrome window for the phone layout, wide one for desktop. If the window can't be narrowed, use the same-site phone frame `https://builderpro-os.com/index.html?bpframe=1` inside a 400×860 frame like round 3.

## Finish these
1. **Sub flow** (sign in as `owner`, then `sub`): owner adds the sample sub to a job (Subs tab) → sub sees the job → sub submits an invoice and a change order → owner approves both → they show in the job's Money tab and the sub's screen updates.
2. **Customer change order** (as `plan299`): on a sample job, make a change order, send it to a test contact by email, open the customer link in another tab, approve and sign → the job's price and Money tab update without a reload.
3. **Supply flow** (as `plan299`): estimate with catalog materials → its order list → order materials search → a supplier → upload a receipt and match it to the job → shows in the job's expenses.
4. **Desktop pass** (wide window) on Jobs, a job's tabs, Estimates, Invoices, Calendar and Settings for `plan299`: layout, spacing, nothing cut off, same look as the phone redesign.
5. **Command Center** (already signed in as me): every tab loads at desktop and phone width; the Accounts **Add key** form opens and closes (don't save); Memory, Approvals, Connections, Phone numbers.
6. **Homeowner** (as `homeowner`): a project's Home, Schedule, Pay, Messages, Documents; send a message and check the owner sees it (sign in as that project's owner, `plan199`).
7. **Crew** (as `crew`): clock in with a job assigned (assign one first as `owner`), add a photo from the job, check-in on a job step, clock out (two taps).
8. **Cleanup** of every "(sample)" record from rounds 3 and 4 that you can delete or void in the app (the list is in the round 3 report under "Sample records to delete"). Keep the test accounts themselves.
9. With any time left: keep improving the design of the daily screens (Home, Jobs, a job, Calendar, Estimates, Invoices, Inbox, crew Clock) like round 3.

Write results to `docs/AZ-TEST-4-REPORT.md` (same layout as round 3; commit and push at least every 30 minutes). End with **Needs the owner** and **Server fixes for the cloud session**, ship, and write a short summary in the chat.
