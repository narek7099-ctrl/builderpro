# GHL template build spec — Foundation / OS / Enterprise

Read this whole file before touching GHL. It is the source of truth for building the three
template sub-accounts and their snapshots. Keep a running log in `ghl-build-log.md`.

## Ground rules
- Work autonomously. Stop only for something irreversible or a real blocker.
- NEVER change or delete anything in the existing demo sub-account or any client sub-account.
  Read the demo account only to learn what exists.
- Never buy anything, change agency billing, buy phone numbers, or message real people.
  Test with test contacts only (use your own name + "Test", and the owner's own phone/email).
- Build one account completely (build → test → snapshot) before starting the next.
- Customer-facing copy uses custom values, never hard-coded business names:
  `{{custom_values.business_name}}`, `{{custom_values.business_phone}}`, etc. No "BuilderPro",
  no "Set Up for BuilderPro", no test text in anything a homeowner receives.
- Every workflow: quiet hours 8am–8pm contact local time on customer messages; "stop on response"
  on reminder/chase sequences; re-entry OFF on sequences (ON only where noted).

## Lessons from the demo audit (https://claude.ai/artifact/GH5uXYG1YncvzKWkuvWQBE) — do not repeat
1. Inspection done had no follow-up → estimate never chased. Fix: "Estimate Due" stage + owner reminder loop until an estimate is Sent.
2. "Estimate Accepted" only texted the owner. Fix: send the customer the deposit invoice automatically, stage → Deposit Requested.
3. deposit-sent / final-sent / job-complete were hand-applied. Fix: set by workflows or by the BuilderPro portal (see "Tags the software sends").
4. Won was set at deposit. Fix: stages Deposit Paid / In Progress → Job Complete → Paid in Full.
5. Post-inspection 1/2/3 check read the wrong replies and treated silence as "completed". Fix: owner answers via internal notification with a link/button or the portal; silence re-asks, never marks complete.
6. Two workflows with the identical appointment trigger. Fix: ONE appointment workflow.
7. Missed call/message reset existing customers to New Lead. Fix: only create an opportunity if the contact has no open opportunity and no `customer` tag.
8. Seven copies of one AI bot; every intent wrote the same result. Fix: ONE "AI Qualifier" workflow; every entry point hands off to it; each intent writes its own tag/stage.
9. A 45-day wait on tags nothing applies. Fix: every wait condition must reference a tag some workflow applies.
10. Email auto-responder had no filters. Fix: only first-time inbound from a new contact.
11. "Not interested" never marked Lost. Fix: opportunity status Lost.

## Tags the BuilderPro software sends (MUST exist, spelled exactly, and be listened for)
| Tag | Sent by | Meaning / workflow it should start |
|---|---|---|
| `new-lead`, `lead-source`, `<vendor>` (e.g. `angi`, `thumbtack`), `<trade>` | lead-intake webhook (Lead Sources page) | New purchased lead → speed-to-lead: AI Qualifier immediately |
| `booking-page` | book-public (public inspection booking page) | Appointment workflow (it books into the location's inspection calendar) |
| `job-complete` | portal "Mark job done" (+ required installation sign-off) | Job Complete → final invoice chase → review request |
| `deposit-sent` | portal invoice sent as deposit | Deposit Requested stage; listen for invoice paid |
| `final-sent` | portal invoice sent as final | Final Invoice Sent; paid → Paid in Full |
| `system-test` | system-test function | Ignore in all customer workflows (exclude this tag) |

Also: the portal creates real GHL **invoices** (ghl-invoice) and **estimates** (ghl-estimate) — use native triggers "Invoice paid", "Estimate status" in addition to the tags.

## Custom values the software writes (create them, reference them in copy and in Lisa's prompt)
Created at sign-up: `Business Name`, `Business Phone`, `Business Email`, `Business Address`,
`Business Website`, `Service Area`, `Business Hours`, `Trade`, `Owner Name`, `License Number`.
Written by the portal's Lisa "Publish" button: `ridge_business_name`, `ridge_services`,
`ridge_pricing`, `ridge_faq`, `ridge_rules`, `ridge_hours`, `ridge_service_area`, `ridge_tone`.
Lisa's (Voice AI + Conversation AI) prompt must reference the `ridge_*` values so every publish is live.
Leave the values filled with neutral placeholders in the template.

## Calendar
- "Inspection" calendar (30–60 min slots, business hours from the custom value) — the public booking page
  and Lisa book into it. Confirmation + reminders are in the ONE appointment workflow.
- OS/Enterprise add: "Job" calendar (all-day / multi-hour) for scheduled work, and "Maintenance Visit" calendar.

## Pipeline "Jobs" (stage order)
Foundation: New Lead · Contacted · Inspection Scheduled · Estimate Due · Estimate Sent · Won · Lost · Reactivation
OS / Enterprise: New Lead · Contacted · Inspection Scheduled · Estimate Due · Estimate Sent · Decision Pending ·
Deposit Requested · In Progress · Job Complete · Paid in Full · Lost · Reactivation
Every stage move is done by a workflow.

## Plans
### Foundation ($99)
Lisa AI receptionist (Conversation AI on SMS/web chat + Voice AI on calls, 150 call min/mo), missed-call
text-back, Inspection calendar + booking page, contacts/SMS/email, estimates + invoices + payments,
review request after paid, 1 instant-quote calculator (calculator leads arrive via inbound webhook like the demo's
"New Lead Estimator" — keep that webhook trigger, fix its filters).
Workflows: AI Qualifier (single), Speed-to-Lead (webhook/form/new-lead tag), Missed Call Text-Back,
Appointment (confirm + 24h + 2h reminders + post-visit check), Estimate Sent follow-up, Estimate Accepted →
invoice, Invoice Paid → Won + review request, Review request (+1 chase), Not Interested → Lost,
Reactivation (90 days after Lost/No decision), New-contact email auto-reply.

### OS ($199) — load the Foundation snapshot, then add
Full job pipeline above; Estimate Due owner reminder loop; Deposit Requested (auto deposit invoice);
Deposit paid → In Progress; `job-complete` → Job Complete → final invoice chase; final paid → Paid in Full →
review; Lead Sources speed-to-lead (`new-lead` + `lead-source`); Maintenance reminders (tag `maint-due-6m`, `maint-due-12m`, `maint-due-24m` or a
date field `next_service_date` → reminder 14 days before, book on Maintenance Visit calendar); social/reputation
review routing (4–5★ → Google link, 1–3★ → private feedback to owner). Up to 5 users.

### Enterprise ($299) — load the OS snapshot, then add
AI Team hooks (owner daily brief is sent by BuilderPro; make sure internal-notification numbers use the
owner custom value), multi-location readiness (location custom values, no hard-coded addresses), Lisa
knowledge base (upload-ready, references `ridge_*`), priority-support internal notifications. Unlimited users.

## Naming
Sub-accounts: `BP Foundation Template`, `BP OS Template`, `BP Enterprise Template`.
Snapshots: `BuilderPro Foundation`, `BuilderPro OS`, `BuilderPro Enterprise`.
Workflows prefixed by number for order, e.g. `01 AI Qualifier`, `02 Speed to Lead`, ... and put in folders.

## Finish
1. Test each account end to end with a test contact (lead → qualified → booked → estimate → paid → review) and
   log results in `ghl-build-log.md`.
2. Collect the three snapshot IDs.
3. Add them as Supabase Edge Function secrets (the owner does this in Supabase → Edge Functions → Secrets):
   `GHL_SNAPSHOT_FOUNDATION`, `GHL_SNAPSHOT_OS`, `GHL_SNAPSHOT_ENTERPRISE`.
   Sign-up already picks the snapshot by plan (account-signup + command `provisionClient({ plan })`);
   after the secrets are set, redeploy `account-signup` and `command` so they pick up the change.
4. Write a summary for the owner: what was built per plan, test results, anything left to do by hand.
