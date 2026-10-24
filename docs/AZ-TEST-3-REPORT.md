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
- 8dabeb3 Jobs page: "Approved, not started yet" list with **Start job**, so an approved estimate becomes a job without a card deposit.

## Results
| Area | Result | Notes |
|---|---|---|
| Home (phone) | Pass, fixed | Navy hero, tiles, Needs you, Today, All apps. Fixes above. |
| + sheet | Pass, fixed | Estimate, Invoice, Job, Customer, Book an inspection, Snap a receipt, Note open the right place. |
| Estimate end to end | Pass | New customer from inside the builder, catalog search, mark-up, tax math ($15 → $19.13), send by email gives a link to share (email not connected). |
| Customer approval | Pass | Signed and approved on the first press; new wording "They'll be in touch". |
| Owner update | Pass | "Round3 approved the estimate" appeared without a reload (~30s). |
| Invoices | Pass | Payment plan (deposit 30% = $5.74 + final), Preview, Confirm and send shows "Invoicing isn't set up yet" with a Payouts link. |

## Needs the owner
1. Add Anthropic credit (at least $10; the first $5.50 pays the negative balance).
2. HighLevel: upgrade to Agency Pro, or make the sub-account by hand and use Add key.
3. Stripe billing webhook (see earlier instructions).

## Server fixes for the cloud session
