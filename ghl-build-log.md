# GHL build log

Spec: GHL-BUILD-SPEC.md. Demo and client sub-accounts are read-only.

## 2026-09-27
- Pulled latest (d03d4b9), read spec in full.
- Demo (aUs7E5m1gmLXoeIV3WM9) inventoried read-only: 18 workflows as audit, no custom values, pipeline Roofing Sales, calendar Roof Inspection. Existing snapshot "Demo Account V2" not used (starting blank to avoid carrying broken wiring).
- Created sub-account **BP Foundation Template** = location `pCL8sOwRPGo5ADh7S2wl` (blank snapshot, no sample data, agency-own type, America/Los_Angeles).
- Foundation: 22 custom values (Business Name/Phone/Email/Address/Website, Service Area, Business Hours, Trade, Owner Name, License Number, Owner Phone, Owner Email, Google Review Link, Booking Link, ridge_business_name/services/pricing/faq/rules/hours/service_area/tone) with neutral placeholders.
- Foundation: 34 tags incl. every software tag (new-lead, lead-source, radar, radar-prospect, radar-auto, auto, radar-contacted, radar-digest, booking-page, job-complete, deposit-sent, final-sent, system-test) + workflow tags (customer, bot-active, ai-qualified, intent-*, needs-time, not-interested, missed-call, appointment-booked, no-show, inspection-done, estimate-sent, estimate-accepted, invoice-paid, review-requested, reactivation, do-not-contact, calculator-lead).
- Foundation: pipeline "Jobs" = New Lead, Contacted, Inspection Scheduled, Estimate Due, Estimate Sent, Won, Lost, Reactivation.
- Note: GHL pauses background tabs; the Chrome window must stay visible during the build.
- Foundation: calendar "Inspection" (Event type, 60 min, Mon-Sat 8am-5pm, slug bpf-inspection; "inspection" slug is taken globally). Event type chosen because it books without an assigned user (templates have no users).
- Foundation: Conversation AI agent "Lisa" (id qCvZkBAx3XZHw48hTW26, prompt-based, GPT-4.1, Auto-Pilot). Prompt references ridge_* + trade + business_phone custom values (rendered as live chips). Actions: Appointment Booking on Inspection (can cancel/reschedule). Bot sleeps when owner sends a manual message. Channels: SMS (all numbers) + Chat widget (all widgets), both excluding tags do-not-contact, system-test.
- Demo's Lisa AI was only read (generic prompt, could not book). Not changed.
- Foundation workflows published: 09 Not Interested -> Lost (tag not-interested -> remove bot-active, opp Jobs/Lost status lost; opp source left blank so it is not overwritten); 03a Repair / 03b Replacement / 03c Storm or Insurance (tag intent-* -> add ai-qualified + in-app notification to all users, opens the contact); 03d Question (ai-qualified); 03e Needs Time (ai-qualified, remove bot-active).
- GHL's AI workflow builder is used for simple flows only and every result is checked; it picked wrong triggers and inverted a branch on complex asks, so those were deleted and redone.
- Owner alerts use GHL in-app notifications to all users (works without a sending number; client owner user is created at provisioning).
- Foundation: **01 AI Qualifier** published (hand-built). Trigger tag `bot-active`. Branches: customer -> remove bot-active; `in-pipeline` -> end (no stage reset, audit fix 7); `system-test`/`do-not-contact` -> end; else create opp Jobs/New Lead (duplicates off) + tag in-pipeline + opener SMS "Hi {first}, this is Lisa with {{custom_values.business_name}}. {{contact.bp_opener}}". Reply within 1d/2d/3d -> stage Contacted (Lisa takes the conversation); silence -> follow-up 2, follow-up 3 (uses business_phone), then remove bot-active + tag needs-time. Re-entry off, multiple opps off, contact timezone, 8am-8pm every day.
- Foundation: contact field **BP Opener** (`{{contact.bp_opener}}`, Additional Info).
- Foundation: **02a Calculator Lead (webhook)** published. Inbound webhook (premium trigger, same as the demo's estimator) -> create/update contact (first/last/phone/email/street address/contact source from the payload) -> note with estimate range, project, address, roof score, notes -> tag `calculator-lead`. Template webhook URL: https://services.leadconnectorhq.com/hooks/pCL8sOwRPGo5ADh7S2wl/webhook-trigger/975e6231-d9ec-4fd8-8752-675770dc603b (each client location gets its own after snapshot load; calculators must post to the client's URL).
- Foundation: **02 Speed to Lead** published. Triggers: tag `new-lead`, tag `calculator-lead`, any form submitted. Excluded (system-test / do-not-contact) -> end; calculator -> opener "Thanks for getting an instant quote! Want us to come out and confirm the numbers with a free inspection?"; else "Thanks for reaching out! What kind of project can we help you with?"; then tag `bot-active` (hands off to 01).
- Foundation: **04 Missed Call Text-Back** published. Trigger: call details, incoming, status busy/canceled/no-answer/voicemail. Tag missed-call -> in-app alert to all users (opens conversation) -> excluded: end; known contact (customer or in-pipeline): direct text-back SMS, no stage change (audit fix 7); new caller: opener "Sorry we missed your call! How can we help?" + bot-active -> 01. Re-entry on (every missed call), multiple opps off, 8am-8pm contact time.
- Foundation: **05 Appointment (confirm, reminders, post-visit check)** published — the ONE appointment workflow (audit fix 6). Triggers: appointment status confirmed or new, calendar Inspection, contact only (covers Lisa, the calendar widget and the booking-page, which books into this calendar). Tags appointment-booked + in-pipeline -> opp Jobs/Inspection Scheduled (open) -> confirmation SMS with date/time -> in-app owner alert -> wait until 24h before (skips if already passed) -> reminder -> wait until 2h before -> reminder -> wait until 2h after -> in-app "Did the inspection happen? tag inspection-done or no-show" -> wait for either tag, 1-day timeout -> timeout goes back to the ask (silence re-asks, never marks complete; audit fix 5). 8am-8pm contact time.
- Foundation: **05b Appointment Cancelled** published. Appointment status cancelled (Inspection) -> remove from 05 (no stray reminders) -> remove appointment-booked -> stage back to Contacted (backwards move allowed) -> in-app owner alert.
- Foundation: **06 Inspection Done - Estimate Due** published (audit fix 1). Tag inspection-done -> stage Estimate Due -> in-app "send the estimate" -> wait for estimate-sent or not-interested, 1 day -> timeout loops back to the reminder. Re-entry on so repeat customers get it again.
- Foundation: **07 Estimate Sent - Follow-up** published. Native trigger Estimates, status Sent -> tag estimate-sent (ends 06's loop) -> stage Estimate Sent (creates the opp if the owner estimated a contact directly) -> 2d -> SMS 1 -> 3d -> SMS 2 -> 4d -> in-app "estimate still open, call them". Stop on response on, 8am-8pm.
- Foundation: **08 Estimate Accepted - Invoice** published. Native Estimates status Accepted -> remove from 07 -> tag estimate-accepted -> customer thank-you SMS -> in-app "send the invoice and schedule the job". (Foundation has no deposit stage; OS adds the automatic deposit invoice.)
- Foundation: **10 Invoice Paid - Won** published. Native Invoice status Paid -> opp Jobs/Won status won -> tags customer + invoice-paid + review-requested -> remove bot-active -> in-app "payment received".
- Foundation: **11 Review Request** published. Tag review-requested -> 1d -> review SMS with {{custom_values.google_review_link}} -> 3d -> one reminder. Stop on response on, 8am-8pm.
- Foundation: **12 Reactivation (90 days)** published. Triggers: tag needs-time (01's silent leads, 03e) or opportunity moved to Lost -> wait 90 days -> skip if customer or do-not-contact -> opp Jobs/Reactivation status open -> tag reactivation -> SMS "Still thinking about your project?" -> remove needs-time (so it can recur). Stop on response, 8am-8pm.
- Foundation: **13 New Contact Email Auto-Reply** published (audit fix 10). Customer replied, channel Email, contact doesn't have tag customer; skip if in-pipeline or do-not-contact; re-entry off (first email only) -> email ack with business phone/name (location default sender) -> tag new-lead (-> 02 -> Lisa).
- Foundation: **14 No-Show - Rebook** published. Tag no-show or appointment status No-show (Inspection) -> remove from 05 -> tag no-show -> stage back to Contacted -> SMS with {{custom_values.booking_link}} -> in-app alert. Re-entry on, 8am-8pm.
- Foundation: Lisa Conversation AI actions: Trigger a workflow x5 (GHL max is 5): Repair -> 03a, Replacement -> 03b, Storm/insurance -> 03c, Needs time -> 03e, Not interested -> 09. Question-only -> 03d could not be added (limit); 03d stays published for tag intent-question. Human Handover skipped (needs a named user; templates have none). Test panel: "roof leaking, need repair" -> Lisa flags urgent and asks for the address. PASS.
- Foundation: Voice AI agent **Lisa (calls)** (id 6aba0429fa48a90e33189a58). Default prompt/greeting contained the location name "BP Foundation Template" -> replaced. Prompt references ridge_business_name/services/pricing/hours/service_area/faq/rules/tone + trade + business_phone (live chips). Greeting "Thanks for calling {{custom_values.business_name}}, this is Lisa." Action: Appointment Booking on Inspection. No phone number bought or assigned (done per client).
- Foundation: workflows filed in folders: 1 Leads and AI (01, 02, 02a, 03a-e, 04, 09, 13), 2 Appointments (05, 05b, 14), 3 Estimates and Payments (06, 07, 08, 10), 4 Follow-up and Reviews (11, 12).
- TEST 1 (chain): posted a calculator payload for "Narek Test" -> contact created with source "Roof Estimator", note written, tags calculator-lead + bot-active + in-pipeline, BP Opener set, opportunity "Narek Test" in Jobs / New Lead. 01's opener SMS shows Waiting at 9:51 PM = quiet hours hold until 8 AM. PASS.
- TEST 2 (full chain, Narek Test, contact timezone set to Asia/Tokyo so quiet-hours steps run during the night test):
  - Booked Inspection -> 05: tag appointment-booked, stage New Lead -> Inspection Scheduled, confirmation SMS rendered with custom value + contact-local date/time ("...with Your Business on September 29, 2026 at 12:00 AM"). PASS.
  - Tag inspection-done -> 06: stage -> Estimate Due. PASS.
  - Estimate EST-1 $100 sent (to the owner's own email) -> 07: tag estimate-sent (ends 06's loop), stage -> Estimate Sent. PASS.
  - Estimate accepted on the customer link -> 08: tag estimate-accepted, thank-you SMS rendered. PASS. (GHL does not auto-create an invoice on acceptance in Foundation; 08 tells the owner to send it.)
  - Invoice INV-000001 $100 marked sent + manual payment recorded -> 10: opportunity marked Won, tags customer + invoice-paid + review-requested, bot-active removed. PASS. 11 enrolled (review SMS after its 1-day wait).
  - All SMS show "failed" only because the template has no phone number (expected; each client gets a number at provisioning). In-app owner alerts go to location users; the template has none, so nothing showed in the bell (the client owner user is created at provisioning).
- **SNAPSHOT "BuilderPro Foundation" = `m8xaXFkznoQZLjySnFlZ`** (from BP Foundation Template, all assets: 24 workflow items incl. folders, 35 tags, 22 custom values, 41 custom fields, pipeline Jobs, calendar Inspection, Conversation AI Lisa, Voice AI Lisa, knowledge base, review settings).
- Created sub-account **BP OS Template** = location `e3hrfIp2KFkCb2c34qbI` from snapshot BuilderPro Foundation (no sample data, agency-own). Snapshot loaded (pipeline Jobs present).
- Code (for OS/Enterprise): job-complete now accepts `nextService` and writes contact field `next_service_date` (the portal sends it from the installation sign-off); radar-daily writes `radar_digest_count` on the owner contact before tagging `radar-digest`. Both functions need redeploying.
- Paused: Chrome window went hidden (minimized/locked screen) — GHL stops rendering; resumed when visible again (a "Tax ID" billing prompt appeared; dismissed, not filled).
- OS: pipeline Jobs = New Lead, Contacted, Inspection Scheduled, Estimate Due, Estimate Sent, Decision Pending, Deposit Requested, In Progress, Job Complete, Paid in Full, Lost, Reactivation ("Won" renamed to Paid in Full so the Foundation workflows keep the stage id). Stage reordering done by dispatching HTML5 drag events (plain click-drag doesn't register).
- OS: calendars Job (8 h slots, slug bp-job-3cb5a9f0) and Maintenance Visit (60 min, slug bp-maintenance-3cb5a9f0), both copies of Inspection.
- OS: contact fields Next Service Date (`next_service_date`, date) and Radar Digest Count (`radar_digest_count`, number); tags deposit-paid, paid-in-full, maint-due-6m/12m/24m, maintenance-due, review-positive, review-feedback (43 tags); custom value Deposit Percent = 30.
- Found: the snapshot carries custom value names but not their values (all blank in OS). Provisioning used to POST (create) them, which can't fill an existing one -> fixed account-signup / command / ai-team / agency to update by name. Also the AI booking calendar is now the one named Inspection, not calendars[0].
- GHL's "Send invoice" workflow action needs a named user and a fixed invoice template, so it can't send a deposit sized to each estimate. New function `estimate-accepted` does it (Deposit Percent x accepted estimate total, sends by SMS+email, tags deposit-sent).
- OS **08 Estimate Accepted - Deposit**: stop 07 -> tag estimate-accepted -> webhook estimate-accepted (locationId, contactId) -> stage Deposit Requested -> customer SMS "deposit invoice is on its way" -> owner alert.
- OS **10 Invoice Paid - Deposit or Paid in Full**: if deposit-sent and not deposit-paid -> tag deposit-paid, stage In Progress, webhook project-create (owner_email = Business Email custom value, name, phone, contactId -> Active Job in the portal), owner alert "book it on the Job calendar". Else -> remove from 15 + 16, stage Paid in Full (won), tags customer + invoice-paid + paid-in-full + review-requested, remove bot-active, owner alert. Re-entry on.
- OS **15 Job Complete - Final Invoice Due** (copy of 06): tag job-complete -> stage Job Complete -> owner alert "send the final invoice" -> wait for final-sent or paid-in-full, 1 day -> loop.
- OS **16 Final Invoice Chase** (copy of 07): tag final-sent -> 2d reminder SMS -> 3d reminder SMS -> 4d owner alert "call them". Stop on response, 8am-8pm. 10 removes the contact when paid.
- OS **07**: after the first follow-up, stage -> Decision Pending.
- OS **02 Speed to Lead**: extra trigger tag `lead-source` (Lead Sources leads carry new-lead + lead-source; re-entry off, so one enrollment).
- OS **17 Radar Contacted - Opener**: tag radar-contacted -> BP Opener = radar copy -> tag bot-active (-> 01, which skips customers/in-pipeline/excluded).
- OS **18 Radar Digest - Owner SMS**: tag radar-digest (radar-daily re-tags the owner's own contact daily) -> SMS "Your {{contact.radar_digest_count}} new Lead Radar leads are ready". Re-entry on.
- OS **19 Maintenance Reminder**: triggers custom date reminder (Next Service Date, 14 days before, match year) OR tag maintenance-due -> SMS "your maintenance is due in the next couple of weeks, reply with a day" -> owner alert "book it on the Maintenance Visit calendar" -> remove maintenance-due. Re-entry on, Mon-Fri 8-5 contact time.
- OS **19b Maintenance Timer (maint-due tags)**: tags maint-due-6m / 12m / 24m -> wait 168 / 351 / 716 days -> tag maintenance-due (-> 19) -> wait 14 days -> Go to the first wait (repeats every 6 / 12 / 24 months).
- OS **11 Review Request - Rating Routing**: 1d -> "How did we do? Reply 1-5" -> wait for reply (3 days) -> reply contains 4 or 5: Google review link + tag review-positive; contains 1-3: apology asking what went wrong + owner alert (no review link); other reply: owner alert. Stop on response turned OFF here (it would end the workflow at the rating reply).
- OS **20 Job and Maintenance Appointments**: appointment confirmed on Job or Maintenance Visit calendar -> confirmation SMS -> 1 day before -> reminder. Mon-Sat 8-5 contact time.
- Design: GHL if/else branches never rejoin and "wait for reply" needs an SMS in the same workflow, so every entry workflow only sets contact field `bp_opener` (its own opener line) and adds `bot-active`; 01 does all messaging.
- **OS TEST (Narek Test, contact dIsQBzwV5QY0U9JT9fDC, timezone Asia/Tokyo so customer SMS sit in quiet hours):**
  - new-lead + lead-source -> 02: bot-active, in-pipeline, opportunity New Lead. PASS.
  - Inspection booked -> Inspection Scheduled; inspection-done -> Estimate Due. PASS.
  - Estimate EST-1 $1000 sent -> Estimate Sent (07, then Decision Pending after the first follow-up). PASS.
  - Accepted on the customer link -> 08: estimate-accepted tag, stage Deposit Requested. PASS. The webhook step errored ("Needs review") because estimate-accepted is not deployed yet, so the deposit invoice was created by hand for the rest of the test.
  - Deposit invoice $300 marked sent + manual payment -> 10 deposit branch: deposit-paid, stage In Progress. PASS (project-create webhook needs the redeploy with the customData fix).
  - Tag job-complete -> 15: stage Job Complete, then exits when final-sent arrives. PASS.
  - Tag final-sent -> 16 enrolled. Final Invoice $700 paid -> 10 final branch: removed from 15 + 16 (0 active), stage Paid in Full, status Won, tags customer + invoice-paid + paid-in-full + review-requested, bot-active removed. PASS. 11 enrolled.
  - Tags maintenance-due + maint-due-6m -> 19 and 19b enrolled. PASS.
  - Not live-tested: 18 (needs the Owner Phone set at provisioning) and 20 (Job-calendar confirmation, same trigger as the tested Inspection flow).
- **SNAPSHOT "BuilderPro OS" = `cdRGIx2azgolhnDj257c`** (from BP OS Template, all assets: 31 workflow items incl. folders, 43 tags, 23 custom values, 43 custom fields, pipeline Jobs (12 stages), calendars Inspection + Job + Maintenance Visit, Conversation AI, Voice AI, knowledge bases, review settings).
- Created sub-account **BP Enterprise Template** = location `bjhV3CSImxxjN0HW23uJ` from snapshot BuilderPro OS (agency-own). GHL still added 5 "(Example)" sample contacts + a few sample tags (follow up, warm lead, high-priority); contacts are not snapshot assets, so they don't reach clients. Left as is (no deletions).
- Enterprise: custom values Location Name / Location Address / Location Phone / Location Service Area (blank; filled per location). Customer copy already uses custom values only; no hard-coded addresses.
- Enterprise: tags ai-team-alert (the AI Team adds it through its contacts.tag tool to page the owner) and priority-support.
- Enterprise folder **5 Enterprise**:
  - **21 Priority Owner Alerts**: triggers tag ai-team-alert / intent-storm / missed-call / estimate-accepted / review-feedback -> internal SMS to {{custom_values.owner_phone}} -> internal email to {{custom_values.owner_email}} ("Priority: {{contact.name}} needs you now") -> remove ai-team-alert. Re-entry on, no time window.
  - **22 Priority Support Request**: tag priority-support -> internal email to support@builderpro-os.com with business name, location id, owner name/phone/email, contact -> remove priority-support.
- Enterprise Lisa: new knowledge base **Lisa - Company Documents** (empty, upload-ready for price lists, warranties, FAQs) attached as a Knowledge Base Trigger; prompt gains a Location line (location_name / address / phone / service_area as live chips, falls back to the business facts when blank). Prompt still reads the ridge_* values.
- Found: snapshots do **not** carry Lisa's channel deployment (Deploy tab shows SMS / Chat widget "Configure" in OS and Enterprise even though Foundation had them). Each client account needs Lisa assigned to SMS + Chat widget after provisioning (manual or via API).
- For testing only, Enterprise Owner Email = support@builderpro-os.com and Owner Phone = +18184531111 (snapshots carry names, not values; provisioning overwrites them by name).
- **ENTERPRISE TEST (Narek Test, contact jWpn4wGZgDqsI04sbX8p):**
  - new-lead + lead-source + intent-storm -> 02 (opportunity New Lead, Lisa opener, bot-active, in-pipeline), 03c (ai-qualified), 21 (owner email "Priority: Narek Test needs you now" delivered; owner SMS failed only for lack of a number). PASS.
  - Inspection booked -> Inspection Scheduled + confirmation SMS; inspection-done -> Estimate Due. PASS.
  - Estimate EST-1 $1000 sent -> Estimate Sent; accepted on the customer link -> 08 (estimate-accepted, Deposit Requested, deposit SMS) and 21 again (owner email). PASS (08 webhook errors until estimate-accepted is deployed, as in OS).
  - Deposit $300 paid -> 10 deposit branch -> In Progress. PASS.
  - job-complete + final-sent + priority-support + ai-team-alert -> 15 Job Complete; 22 support email delivered; 21 owner email; both tags removed afterwards. PASS.
  - Final $700 paid -> 10 final branch: Won, customer + invoice-paid + paid-in-full + review-requested, bot-active removed. PASS.
  - 21: 3 enrollments, 22: 1, 0 active.
- **SNAPSHOT "BuilderPro Enterprise" = `cWoCOr2RJDfc3x3FxnQm`** (from BP Enterprise Template, all assets: 34 workflow items incl. folders, 48 tags, 27 custom values, 43 custom fields, pipeline Jobs, 3 calendars, Conversation AI, Voice AI, 4 knowledge bases, review settings).

## Snapshot IDs
- BuilderPro Foundation: `m8xaXFkznoQZLjySnFlZ`
- BuilderPro OS: `cdRGIx2azgolhnDj257c`
- BuilderPro Enterprise: `cWoCOr2RJDfc3x3FxnQm`

---

## Lead Radar removal - Oct 1, 2026

Scope: BP Foundation Template, BP OS Template, BP Enterprise Template only. Demo and client accounts not touched.

### BP Foundation Template (pCL8sOwRPGo5ADh7S2wl)
- Workflows: none had "radar" in the name (20 workflows, unchanged).
- Tags deleted (5): radar, radar-contacted, radar-digest, radar-prospect, radar-auto. Restorable in GHL for 2 months.
- Custom fields: no radar field existed. Custom values: none mention radar.
- Jobs pipeline: no radar stage (New Lead, Contacted, Inspection Scheduled, Estimate Due, Estimate Sent, Won, Lost, Reactivation). Unchanged.

### BP OS Template (e3hrfIp2KFkCb2c34qbI)
- Workflows deleted (2): 17 Radar Contacted - Opener, 18 Radar Digest - Owner SMS. In the Deleted tab for 30 days.
- Tags deleted (5): radar, radar-contacted, radar-digest, radar-prospect, radar-auto.
- Custom field deleted: Radar Digest Count ({{contact.radar_digest_count}}). Permanent.
- Custom values: none mention radar.
- 01 AI Qualifier: checked, no change needed. Trigger is tag bot-active; Excluded branch is system-test or do-not-contact; Opener SMS is "Hi {first name}, this is Lisa with {Business Name}, {BP Opener}" with no radar text. Still Published.
- Jobs pipeline: no radar stage. Unchanged.
- Workflows list "Needs review": 0 after the deletions.

### BP Enterprise Template (bjhV3CSImxxjN0HW23uJ)
- Workflows deleted (2): 17 Radar Contacted - Opener, 18 Radar Digest - Owner SMS.
- Tags deleted (5): radar, radar-contacted, radar-digest, radar-prospect, radar-auto.
- Custom field deleted: Radar Digest Count. Permanent.
- Custom values: none mention radar. Jobs pipeline: no radar stage.
- Workflows list "Needs review": 0 after the deletions.

### Snapshots (refreshed in place, all assets, v1 -> v2)
- BuilderPro Foundation - refreshed Oct 1 9:11 PM. ID expected unchanged: m8xaXFkznoQZLjySnFlZ
- BuilderPro OS - refreshed Oct 1 9:11 PM. ID expected unchanged: cdRGIx2azgolhnDj257c
- BuilderPro Enterprise - refreshed Oct 1 9:09 PM. ID expected unchanged: cWoCOr2RJDfc3x3FxnQm
No new snapshots were created. The IDs were not re-read from GHL; a refresh keeps the same snapshot record.

### Not done
- Did not open every remaining workflow one by one. Only 01 AI Qualifier (OS) was opened. The "Needs review (0)" count is the evidence that nothing else references the deleted tags or field.
- Did not search SMS/email templates, snippets, trigger links, forms, smart lists, or the Conversation AI / Voice AI prompts for "radar".
- Did not run the test contact (new lead -> AI Qualifier -> booked appointment).
- The BP Opener custom field was kept: 01 AI Qualifier's opener SMS uses it for every lead type.

### Follow-up: search and test (Oct 1, 2026, later the same evening)

Search for "radar":
- BP OS Template: Snippets - none exist. Trigger links - none exist. Conversation AI agent "Lisa" prompt - no match. Voice AI agent "Lisa (calls)" prompt - no match.
- BP Enterprise Template: Conversation AI agent "Lisa" prompt - no match.
- Not checked: Enterprise Voice AI prompt, Enterprise snippets/trigger links, anything in Foundation beyond tags/fields/values, email templates, forms, smart lists.

Test in BP OS Template with contact "Claude Test" (no phone or email, so no text or email was sent to anyone):
1. Added tag new-lead -> 02 Speed to Lead added bot-active -> 01 AI Qualifier created opportunity "Claude Test" in Jobs / New Lead and added in-pipeline.
2. Booked an Inspection appointment (Oct 2, 8-9 AM) by hand -> tag appointment-booked added, opportunity moved New Lead -> Inspection Scheduled.
3. Final tags: new-lead, bot-active, in-pipeline, appointment-booked. No radar tag was applied.
- Not tested: the SMS conversation with Lisa and her booking the appointment herself (the contact has no phone). OS only; Foundation and Enterprise were not test-run.
- Left in the OS template: contact "Claude Test", its opportunity and the Oct 2 test appointment. Contacts are not part of snapshots.

## Project automations 30-50 - Oct 4, 2026

Built from docs/highlevel-workflows.md, in the HighLevel UI only.

### BP OS Template (e3hrfIp2KFkCb2c34qbI) - build
- Contact fields: 19 BP fields (contact.bp_*) in the "BuilderPro" folder.
- Tags: the 11 OS bp-* tags plus past-customer.
- Workflow folders: "6 Project automations", "7 Alerts to you".
- Every workflow: trigger Contact Tag added = its bp-* tag; Allow re-entry ON; contact time zone.
- Customer-message workflows (30-41): If/Else "Excluded?" first (system-test OR do-not-contact -> End); window 8:00 AM-8:00 PM, all 7 days.
- Published, folder 6:
  - 30 Job Scheduled: SMS + email.
  - 31 Visit Tomorrow Reminder: wait until 5 pm, SMS.
  - 32 Crew Arrived: If BP Crew Lead not empty, two SMS versions.
  - 33 Job Completed -> Review -> Referral: SMS, wait 2 days, tag review-requested, wait 30 days, referral SMS, tag past-customer. Stop on response ON.
  - 34 Payment Overdue: final-sent added to the Excluded check; If BP Days Overdue is 3 / 7 / 14 -> 3: SMS; 7: SMS + email (subject "Your balance for {{contact.bp_job_name}}"); 14: in-app alert + task "Call about payment" (due in 1 day).
  - 37 Contract Signed -> Welcome: SMS, then If BP Start Date not empty -> start date SMS.
  - 38 Phase Done -> Progress Update: If BP Next Phase not empty -> progress SMS, else last-phase SMS.
  - 39 Schedule Pushed Back: SMS + in-app alert.
  - 40 Payment Received -> Thank You: If BP Balance Due is "$0" (the exact format ghl-events sends for zero) -> paid in full SMS, else amount and balance SMS.
  - 41 Change Order Waiting: If BP Days Overdue is 2 -> SMS; 5 -> in-app alert.
- Published, folder 7:
  - 47 Crew No-Show: no Excluded check, no time window. In-app alert to all users, plus SMS alert to custom number {{custom_values.owner_phone}}.
- In-app alerts: Internal Notification, type Notification, all users, redirect to Contact.
- Workflow names use "->" in place of the arrow.

### BP OS Template - tests (Oct 4, 2026, 6:06-6:12 PM PDT)
Test contact: "Claude Test" (no phone, no email, no system-test tag). Did not use "Narek Test" because it has a phone number.
Sample BP fields: Job Name Kitchen Remodel, Start/Visit Date Oct 14, Old Start Date Oct 10, Crew Lead Mike, Phase Demo, Next Phase Framing, Balance $3,000, Amount Paid $2,000, Days Overdue 3, Change Order "Add a window", Event Note "Test note", Portal Link https://example.com/p/test.
Round 1: added all 11 bp-* tags at once. Every workflow enrolled the contact once.
- 30 PASS: Send -> SMS + email (skipped: no phone/email) -> end.
- 31 PASS: waiting for 5 pm.
- 32 PASS: Has crew lead branch -> SMS.
- 33 PASS: job complete SMS -> waiting 2 days.
- 34 PASS: 3 days branch -> 3-day SMS.
- 37 PASS: welcome SMS -> Has date -> start date SMS.
- 38 PASS: Has next phase -> progress SMS.
- 39 PASS: SMS, then the in-app alert ran (Executed).
- 40 PASS: Balance left branch -> thanks SMS.
- 41 PASS: Days Overdue 3 -> Other days -> no action.
- 47 PASS: in-app alert ran; owner SMS skipped (Owner Phone custom value is blank in the template).
Round 2 (Days Overdue 14, Balance Due $0; removed and re-added bp-payment-overdue and bp-payment-received):
- 34: 14 days branch -> in-app alert ran. Task "Call about payment" was skipped: "Task cannot be created with both assigned to contact's assigned user or custom assigned user". The template has no users and the test contact has no owner. In a live account the task is created when the contact has an assigned user. Left unassigned on purpose; the alert covers it.
- 40 PASS: Paid in full branch -> paid in full SMS.
Not verified: rendered SMS/email text. Every customer message was skipped (no phone/email), and the logs do not show message bodies. Merge tags were checked in the builder (each one turned into a field chip).
Not tested: 34 at 7 days, 41 at 2 and 5 days (same If/Else pattern as the branches that passed), 33's later steps (2- and 30-day waits).
Left on "Claude Test": the 11 bp-* tags and the sample BP field values. Contacts are not part of snapshots.

### Snapshot BuilderPro OS - refreshed (Oct 4, 2026, 6:16 PM)
- Refreshed in place from BP OS Template, all assets (190). Same ID expected: cdRGIx2azgolhnDj257c.

### BP Enterprise Template (bjhV3CSImxxjN0HW23uJ) - build
- Contact folder "BuilderPro" created; the 19 BP fields created in it (Single line). Keys checked: contact.bp_job_name ... contact.bp_spent.
- Copied 30, 31, 32, 33, 34, 37, 38, 39, 40, 41, 47 from BP OS Template with "Copy to sub-account" (all 11 "Success"). They arrive as drafts at the root. The copy also created each trigger tag.
