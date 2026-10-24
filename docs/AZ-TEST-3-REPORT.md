# BuilderPro round 3: test and improve run

Run: Oct 24, 2026, in the owner's Chrome. Desktop window is 3440px and maximized (can't be resized by the tools), so the phone layout is tested in a same-site 400×860 preview frame (`index.html?bpframe=1`, allowed by commit a3bb1e0; other sites still can't frame the app).

## Re-checks
| Check | Result |
|---|---|
| HighLevel sub-account for AZ Test Roofing (sample) | Not made yet. Setup column now says why: "HighLevel plan doesn't allow creating sub-accounts by API. Make it by hand and Add key." |
| AI answers | Out of Anthropic credit ("credit balance is too low"). Saved chats work: the CEO chat reopened the last conversation by itself. |
| Stripe | AZ Test still on "Add a card" (billing webhook not set). |

## Fixed and shipped
- a3bb1e0 Same-site phone preview frame allowed (for testing).
- dd38417 Command Center chat: plain-words AI errors (out of credit / busy / key turned down) instead of raw API JSON.
- fe0f498 Avatar initials skip punctuation and "(sample)"-style notes ("A(" became "AR").
- b17bf1f / 8c66800 Home "Needs you" lists approved estimates ready to invoice (it said "all caught up" with two approved); phone All apps says "Jobs" like the bottom tab.
- b3ed600 / 1734689 Estimate and invoice builders: "+ Add a new customer…" in the customer list opens the contact form and picks the new customer without leaving the builder.
- 009505f + sheet "Snap a receipt" opens the receipt upload right away.
- 3510942 Estimates/invoices default to the send method you last used; a customer with only email (or only phone) gets that.
- 986d6f5 Ready-to-invoice cards keep cents on small amounts ($5.74, not $6); no duplicate "account isn't fully set up" line.
- 8dabeb3 / 31b80d4 Jobs page: "Approved, not started yet" list with **Start job**, so an approved estimate becomes a job without a card deposit (cash, check, or before payments are set up). Phone layout with a full-width button.
- e9c59a5 Phone page title stuck at "Jobs" on every page after visiting Jobs (an earlier fix replaced the heading element). Fixed.
- c3ad1ef / 957dd7c **Book an inspection works without HighLevel**: it used to say "Could not load open times right now" with no way to book. Now you pick the day and time by hand and it goes on the BuilderPro calendar, and shows under Upcoming.
- d5ae656 **Two tabs open could lose changes**: one tab's older copy of the jobs overwrote the other's newer save (a payment plan disappeared this way). Each tab now takes the other's saves.
- bad601a American spelling in what users see (color, labor, license, canceled, center); line endings put back to LF (an earlier Windows commit had switched index.html, quote.js and mobile.js to CRLF).
- 26038f1 Job Photos count updates (said 0/24 with a photo showing).
- e221110 Job step check-ins stay open on phones while answering them.
- c1f7989 Email compose: plain-words reason when business email isn't set up (points to My inbox for Gmail/Outlook) instead of "HighLevel isn't connected".
- 5ede30a More American spelling (personalizes, gray, labeled, fulfill, meters).
- 305c7e6 Dark mode: New estimate tile readable on phone Home.
- 6d83675 Crew: page title says Clock like its tab; Me sheet says Jobs.
- a7d7ffd AI Team on phones: no visible scrollbar under the chats strip.
- b30d782 $99 plan: + sheet and Home tiles show a lock on things not on the plan (Job, Add job).
- fdb2c88 **Money boxes rounded away cents**: Edit details, Paid so far, budget, expenses, Mark done and permit fee boxes showed $19.13 as $19 and saved $19. They keep cents now. Mark done says only the sign-off is required.
- 36db34c Customer estimate, contract and invoice links: the "Get updates" account sheet no longer pops over the page after 9 seconds (it covered the signature box); it shows right after they approve, sign or pay.
- 9f37ae3 Crew: Clock out asks for a second tap (one tap ended the day with no undo).
- aae2098 Contract and project links cut short (a text message that wrapped) say "This link looks incomplete. Ask your contractor to send it again." instead of opening the BuilderPro home page.

## Results
| Area | Result | Notes |
|---|---|---|
| Home (phone) | Pass, fixed | Navy hero, tiles, Needs you, Today, All apps. Fixes above. |
| + sheet | Pass, fixed | Estimate, Invoice, Job, Customer, Book an inspection, Snap a receipt, Note open the right place. |
| Estimate end to end | Pass | New customer from inside the builder, catalog search, mark-up, tax math ($15 → $19.13), send by email gives a link to share (email not connected). |
| Customer approval | Pass | Signed and approved on the first press; new wording "They'll be in touch". |
| Owner update | Pass | "Round3 approved the estimate" appeared without a reload (~30s). |
| Jobs | Pass, fixed | Start job from an approved estimate, every tab loads (Overview, Money, Schedule, Crew, Subs, Materials, Permits, Contract, Customer, Inspections, Photos, Documents), photo upload saved to storage, Plan the phases, Finished / Not yet (moves the finish date and suggests calling the customer), Mark done with sign-off and review link. |
| Calendar | Pass, fixed | Month default, + Add menu, to-do added, inspection booked by hand. |
| Inbox | Pass, fixed | Texts explain the number isn't connected; Email compose explains business email isn't set up (fixed wording); My inbox offers Gmail/Outlook; Team chat loads. |
| All pages | Pass | Order lists, Order materials, Suppliers, Receipts, Templates, Contacts, Calculator leads, Automations, Calculators, Finances, Estimates, Archive, Payouts, QuickBooks, Marketing, Reputation, Website, Social, Competitors, Equipment, Employees, Subcontractors, Driving routes, AI Team, Settings: all load, no console errors. |
| Settings | Pass | Every section opens from the list and "All settings" goes back. |
| Dark mode | Pass, fixed | Home, Jobs, Calendar, Finances, Settings readable (one tile fixed). |
| Crew | Pass, fixed | Clock in (no job, location off) and out, Jobs (view only, no money), Messages, Me. |
| Sub | Pass | Navy header, Jobs, Invoices ($100 sample), Changes, Messages. |
| Homeowner | Pass | My projects loads. |
| Plan locks ($99) | Pass, fixed | Projects, Supply, AI Team, Marketing locked with a clear upgrade page; locks now shown on the + sheet and Home tiles. |
| Desktop (1440px) | Pass | Dashboard, locked sections grouped under "Upgrade to unlock", first-run tour. |
| Signed-out customer (round 1 issue 5) | Pass, fixed | The free-account sheet popped up 9 seconds after an estimate opened and covered the signature box. Now it waits for the approval; approved signed out, then the sheet offered the account (not created: no new accounts this run). |
| Bad customer links | Pass, fixed | Unknown estimate, contract, project and invoice links each show a plain "ask your contractor" page; cut-off links did not (fixed). |
| Sign-up page (phone) | Pass | No sideways scroll, plan step, empty boxes highlighted, bad email caught. Not submitted (no new accounts this run). |
| Money edge cases | Pass (code) | Money boxes take "1,000,000" and show $1,000,000; $0 shows $0. |
| Invoices | Pass | Payment plan (deposit 30% = $5.74 + final), Preview, Confirm and send shows "Invoicing isn't set up yet" with a Payouts link. |

## Needs the owner
1. Add Anthropic credit (at least $10; the first $5.50 pays the negative balance).
2. HighLevel: upgrade to Agency Pro, or make the sub-account by hand and use Add key.
3. Stripe billing webhook (see earlier instructions).
4. **Signed-in testing stopped partway.** From here on Claude won't type passwords into the live site, so these were not tested this run. They can be done in a session where you sign in yourself (or on a staging copy of the site):
   - Sub flow: add a sample sub to a job, the sub sends an invoice and a change order, you approve.
   - Supply flow: estimate materials → order list → receipt.
   - A change order approved by the customer.
   - Desktop pass on Jobs, Estimates and Invoices at laptop width; Command Center tabs.
5. **Sample records to delete** (made during testing; Claude couldn't sign in to remove them):
   - Enterprise ($299) account: contact "Signout Tester (sample)" and its estimate "Fence repair (sample)" ($275, approved).
   - AZ Test Roofing: contact "Round3 Customer (sample)", job "Gutter repair (sample)" (done), to-do "Order gutter hangers (sample)", the inspection note on Oct 25, and "Roof replacement (sample)" (approved).
   - Crew login: a 0-hour clock punch from today.

## Server fixes for the cloud session
1. **Jobs save as one big record, last save wins.** `portal_finance` stores all jobs plus finances in one row, and each device pushes the whole row. Two devices (or a phone and a laptop) editing at once can wipe each other's changes (a payment plan disappeared this way in testing). Two tabs on one computer are now handled in the app; across devices it needs a per-job merge on the server (or a jobs table).
2. Features that need HighLevel (texting, business email, booking times, automations that say "On") should read as off while the HighLevel sub-account isn't connected, so nobody thinks texts are going out.
