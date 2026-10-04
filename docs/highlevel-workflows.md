# BuilderPro project automations: HighLevel build instructions

**For Claude on the owner's desktop (Claude Code + Chrome).** Read this whole file, then build
everything in it. Keep a running log at the bottom of `ghl-build-log.md` (same style as the
entries already there), then commit and push that file to the branch
`claude/web-os-dashboard-design-ijwlrd`.

## You are authorized: build without asking

The owner has approved this whole build. **Do not stop to ask permission for each step.**
Work straight through: create fields and tags, build, test and publish every workflow listed,
file them in folders, and update the two snapshots. Only stop and ask if you hit:

- something irreversible outside this list (deleting anything, changing billing, buying numbers),
- a real blocker you can't work around (a login wall, a missing feature in the plan),
- or anything that would message a real customer.

All the ground rules in `GHL-BUILD-SPEC.md` still apply. In particular:

- **Only touch these two sub-accounts:** `BP OS Template` (`e3hrfIp2KFkCb2c34qbI`) and
  `BP Enterprise Template` (`bjhV3CSImxxjN0HW23uJ`). Never change the demo account or any client account.
- Never message real people. Test with a test contact named after the owner + "Test", on the owner's
  own phone/email, or with no phone at all and read the execution logs.
- Don't change the existing workflows 01–22. These are new workflows next to them.
- Keep the Chrome window visible while you work (HighLevel pauses background tabs).

## How these workflows get triggered

BuilderPro's servers watch projects, crews, clock-ins, money and paperwork. When something
happens, BuilderPro finds the customer's contact in the client's HighLevel account, fills in the
**BP fields** below with that job's details, then **removes and re-adds a tag** such as
`bp-job-completed`. Every workflow here starts on **Contact Tag Added** with one of those tags.
BuilderPro already checks the client's plan before it sends anything, and skips customer
messages for projects the owner has paused.

## Which template gets what

| Template sub-account | Build these | Count |
|---|---|---|
| **BP OS Template** (`e3hrfIp2KFkCb2c34qbI`) | 30, 31, 32, 33, 34, 37, 38, 39, 40, 41, 47 | 11 |
| **BP Enterprise Template** (`bjhV3CSImxxjN0HW23uJ`) | every workflow in this file: 30–50 | 21 |

(Foundation gets none: it has no projects.) "51 Domino Reschedule" lives inside BuilderPro only;
it reuses workflow 39, so there is nothing to build for it.

Order: finish the OS template completely (fields, tags, workflows, tests), update its snapshot,
then do the Enterprise template, then update its snapshot.

---

## Step 1: custom fields (both templates)

*Settings → Custom Fields → Contact*, type **Single line text**, put them in a folder named
**BuilderPro**. Names must be **exactly** these (BuilderPro looks them up by name):

```
BP Job Name        BP Job Address     BP Job Amount      BP Balance Due
BP Start Date      BP Visit Date      BP Crew Lead       BP Portal Link
BP Days Overdue    BP Company Name    BP Event Note      BP Phase Name
BP Next Phase      BP Amount Paid     BP Old Start Date  BP Inspection
BP Change Order    BP Budget          BP Spent
```

That's 19 fields. Their merge tags follow the name, e.g. `{{contact.bp_job_name}}`,
`{{contact.bp_balance_due}}`. Check each key after creating it, and use whatever the picker shows.

## Step 2: tags (both templates)

Create these tags so the triggers can be picked (Enterprise needs all; OS needs the first 11):

```
OS + Enterprise: bp-job-scheduled  bp-visit-tomorrow  bp-crew-arrived  bp-job-completed
                 bp-payment-overdue  bp-contract-signed  bp-phase-done  bp-schedule-moved
                 bp-payment-received  bp-change-order-waiting  bp-crew-no-show
Enterprise only: bp-job-anniversary  bp-storm-followup  bp-inspection-scheduled  bp-warranty
                 bp-message-unanswered  bp-over-budget  bp-sub-insurance-expiring
                 bp-weather-risk  bp-materials-not-ready  bp-job-stalled
Used by steps:   past-customer  warranty-sent
```

## Step 3: folders

Two new workflow folders: **6 Project automations** and **7 Alerts to you**. Name each
workflow with its number, exactly as below, e.g. "30 Job Scheduled".

## Settings for every workflow below

- Trigger: **Contact Tag Added** → the tag shown. Filter: tag is that tag only.
- **Allow re-entry: ON** (customers have several jobs; BuilderPro re-adds tags on purpose).
- Customer messages: **contact time zone, 8:00 am – 8:00 pm**.
- **Exclude** contacts tagged `system-test` or `do-not-contact` from customer messages (If/Else at the top → End).
- Customer copy uses custom values (`{{custom_values.business_name}}`), never "BuilderPro".
- Read the BP fields at the start: avoid long waits before a message that uses them (a second
  event for the same customer rewrites the fields).
- "Alert to you" = **Internal Notification** → in-app to all users (same as the existing workflows);
  add SMS/email to `{{custom_values.owner_phone}}` / `{{custom_values.owner_email}}` where noted.

---

# Folder 6: Project automations

## 30 Job Scheduled · tag `bp-job-scheduled` · OS + Enterprise
1. SMS: *Hi {{contact.first_name}}, this is {{custom_values.business_name}}. Your {{contact.bp_job_name}} is booked to start {{contact.bp_start_date}}. You can follow every step here: {{contact.bp_portal_link}}*
2. Email: the same message, subject *Your {{contact.bp_job_name}} is scheduled*.

## 31 Visit Tomorrow Reminder · tag `bp-visit-tomorrow` · OS + Enterprise
1. Wait until 5:00 pm (time-of-day wait), so it lands the evening before.
2. SMS: *Reminder from {{custom_values.business_name}}: our crew will be at {{contact.bp_job_address}} tomorrow, {{contact.bp_visit_date}}. Please keep the driveway clear and pets inside. Reply here with any questions.*

## 32 Crew Arrived · tag `bp-crew-arrived` · OS + Enterprise
1. If/Else **BP Crew Lead is not empty**:
   - Yes → SMS: *Good morning {{contact.first_name}}! {{contact.bp_crew_lead}} and the {{custom_values.business_name}} crew just arrived and are starting on your {{contact.bp_job_name}}. Photos and progress: {{contact.bp_portal_link}}*
   - No → SMS: *Good morning {{contact.first_name}}! Our crew just arrived and is starting on your {{contact.bp_job_name}}. Photos and progress: {{contact.bp_portal_link}}*

## 33 Job Completed → Review → Referral · tag `bp-job-completed` · OS + Enterprise
Stop on response: ON.
1. SMS: *Your {{contact.bp_job_name}} is complete! Thank you for choosing {{custom_values.business_name}}. Final photos and documents: {{contact.bp_portal_link}}*
2. Wait 2 days.
3. **Add tag `review-requested`** (this starts the existing 11 Review Request, so the customer gets exactly one review request; don't send a second one here).
4. Wait 30 days.
5. SMS: *Know a neighbor who needs work done? Send them our way and we'll take care of them like we did for you. Just reply with their name and number.*
6. Add tag `past-customer`.

## 34 Payment Overdue · tag `bp-payment-overdue` · OS + Enterprise
1. If the contact has tag `final-sent` → End (the existing 16 Final Invoice Chase already reminds them; no double reminders).
2. If/Else on **BP Days Overdue**:
   - `3` → SMS: *Hi {{contact.first_name}}, a quick reminder that {{contact.bp_balance_due}} is still open on your {{contact.bp_job_name}}. Thank you!*
   - `7` → SMS: *Hi {{contact.first_name}}, your balance of {{contact.bp_balance_due}} for {{contact.bp_job_name}} is now a week past due. Please let us know if anything is holding it up.* + the same by Email.
   - `14` → Alert to you: *{{contact.name}} owes {{contact.bp_balance_due}} on {{contact.bp_job_name}}, 14 days. Call them.* + Create task *Call about payment*.

## 35 Yearly Check-up · tag `bp-job-anniversary` · Enterprise
Stop on response: ON.
1. SMS: *Hi {{contact.first_name}}, it's been a year since we finished your {{contact.bp_job_name}}. Want a free check-up to make sure everything is holding up? Reply YES and we'll book it.*
2. Wait for reply, up to 3 days. If the reply contains "yes" → Create/update opportunity Jobs → New Lead + Alert to you *Book the check-up for {{contact.name}}*. Else → End.

## 36 Storm Follow-up · tag `bp-storm-followup` · Enterprise
(The owner sends this from BuilderPro → Leads → Automations → 36, for an area.) Stop on response: ON.
1. SMS: *Hi {{contact.first_name}}, {{custom_values.business_name}} here. After the recent storm we're offering free roof checks for our past customers. Want us to swing by? Reply YES. {{contact.bp_event_note}}*
2. Wait for reply, up to 2 days. "yes" → opportunity Jobs → New Lead + Alert to you *Book the storm check for {{contact.name}}*. Else → End.

## 37 Contract Signed → Welcome · tag `bp-contract-signed` · OS + Enterprise
1. SMS: *Thank you, {{contact.first_name}}! Your contract with {{custom_values.business_name}} is signed. Next: we pull permits, order materials and lock in your crew day. Everything is tracked here: {{contact.bp_portal_link}}*
2. If/Else **BP Start Date is not empty** → SMS: *You're on the schedule for {{contact.bp_start_date}}.* Else → End.

## 38 Phase Done → Progress Update · tag `bp-phase-done` · OS + Enterprise
1. If/Else **BP Next Phase is not empty**:
   - Yes → SMS: *Progress update on your {{contact.bp_job_name}}: {{contact.bp_phase_name}} is done ✅ Next up: {{contact.bp_next_phase}}. Photos: {{contact.bp_portal_link}}*
   - No → SMS: *{{contact.bp_phase_name}} is done ✅ That was the last step on your {{contact.bp_job_name}}; we'll be in touch to wrap up.*

## 39 Schedule Pushed Back · tag `bp-schedule-moved` · OS + Enterprise
1. SMS: *Heads-up from {{custom_values.business_name}}: your {{contact.bp_job_name}} start has moved from {{contact.bp_old_start_date}} to {{contact.bp_start_date}}. Sorry for the change, and reply here with any questions.*
2. Alert to you: *Told {{contact.name}} about the new start date ({{contact.bp_start_date}}).*

## 40 Payment Received → Thank You · tag `bp-payment-received` · OS + Enterprise
1. If/Else **BP Balance Due is `$0`**:
   - Yes → SMS: *Your {{contact.bp_job_name}} is paid in full. Thank you, {{contact.first_name}}!*
   - No → SMS: *Thank you! We received {{contact.bp_amount_paid}} for your {{contact.bp_job_name}}. Remaining balance: {{contact.bp_balance_due}}.*

## 41 Change Order Waiting · tag `bp-change-order-waiting` · OS + Enterprise
1. If/Else on **BP Days Overdue**:
   - `2` → SMS: *Hi {{contact.first_name}}, a change to your project is waiting for your OK: {{contact.bp_change_order}}. You can review and sign it here: {{contact.bp_portal_link}}*
   - `5` → Alert to you: *{{contact.name}} hasn't signed {{contact.bp_change_order}} (5 days). Give them a call.*

## 42 Inspection Scheduled · tag `bp-inspection-scheduled` · Enterprise
1. SMS: *Your {{contact.bp_inspection}} inspection is set for {{contact.bp_visit_date}}. The inspector may need access to the property; we'll let you know if you need to be home.*

## 43 Warranty Info · tag `bp-warranty` · Enterprise
1. SMS + Email: *Hi {{contact.first_name}}, your {{contact.bp_job_name}} is covered by our workmanship warranty. Your documents are saved here: {{contact.bp_portal_link}}. If anything ever comes up, just text this number.*
2. Add tag `warranty-sent`.

# Folder 7: Alerts to you

No time window on these (owner alerts go out right away). No customer messages, except 46,
which texts the **subcontractor**.

## 44 Customer Message Unanswered · tag `bp-message-unanswered` · Enterprise
1. Alert to you (in-app + SMS to owner): *{{contact.name}} messaged in the project portal 4+ hours ago and hasn't had a reply: "{{contact.bp_event_note}}"*

## 45 Job Over Budget · tag `bp-over-budget` · Enterprise
1. Alert to you: *{{contact.bp_job_name}} for {{contact.name}} is over budget: {{contact.bp_spent}} spent against {{contact.bp_budget}}.*

## 46 Sub Insurance Expiring · tag `bp-sub-insurance-expiring` · Enterprise
This tag lands on the **subcontractor's** contact.
1. SMS + Email to the contact: *Hi {{contact.first_name}}, this is {{custom_values.business_name}}. {{contact.bp_event_note}}. Please upload a current copy in your BuilderPro sub portal so we can keep sending you work.* (Contact time zone 8am–8pm on this one.)
2. Alert to you: *{{contact.name}}: {{contact.bp_event_note}}.*

## 47 Crew No-Show · tag `bp-crew-no-show` · OS + Enterprise
(BuilderPro also alerts the crew lead in the crew app.)
1. Alert to you (in-app + SMS to owner): *Nobody has clocked in on {{contact.bp_job_name}} for {{contact.name}}. {{contact.bp_event_note}}.*

## 48 Weather Delay Warning · tag `bp-weather-risk` · Enterprise
1. Alert to you (in-app + SMS to owner): *Weather risk tomorrow on {{contact.bp_job_name}} ({{contact.bp_job_address}}): {{contact.bp_event_note}}. Reschedule? Moving the date in BuilderPro texts the customer automatically.*

## 49 Materials Not Ready · tag `bp-materials-not-ready` · Enterprise
1. Alert to you: *{{contact.bp_job_name}} starts {{contact.bp_visit_date}} and its order list hasn't been sent to the supplier ({{contact.bp_event_note}}).*

## 50 Stuck-Job Watchdog · tag `bp-job-stalled` · Enterprise
1. Alert to you: *Stuck job: {{contact.bp_job_name}} for {{contact.name}}. {{contact.bp_event_note}}*
   (BuilderPro writes the reason and the next step into BP Event Note, e.g. "Contract signed 3+ days ago and the job has no start date. Next: book the crew.")

---

## Step 4: test every workflow

For each workflow, on the test contact: fill the BP fields it uses with sample values (or leave
some empty to test the If/Else), remove the tag if present, add it, open the workflow's
**Execution logs** and check every step ran and every merge tag rendered. Quiet-hours steps
showing "Waiting" are a pass. Log each result (PASS / what you fixed) in `ghl-build-log.md`.

## Step 5: update the snapshots

- After the OS template passes: update snapshot **BuilderPro OS** (`cdRGIx2azgolhnDj257c`)
  from `BP OS Template`, all assets.
- After the Enterprise template passes: update snapshot **BuilderPro Enterprise**
  (`cWoCOr2RJDfc3x3FxnQm`) from `BP Enterprise Template`, all assets.
- If HighLevel makes a new snapshot instead of updating, write the new IDs in the log so the
  `GHL_SNAPSHOT_OS` / `GHL_SNAPSHOT_ENTERPRISE` secrets can be updated.

## Step 6: finish

Append the log, commit `ghl-build-log.md` with a message like "GHL: project automations 30–50
built in OS + Enterprise templates", push to `claude/web-os-dashboard-design-ijwlrd`, and tell
the owner: what was built where, test results, snapshot IDs, and anything you couldn't do.
