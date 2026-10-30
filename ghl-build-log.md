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
- Tags: all 21 bp-* tags plus past-customer and warranty-sent exist (review-requested and final-sent were already there). The Tags page drops every second create if you go too fast; created the missed ones again and checked each by search.
- Workflow folders "6 Project automations" and "7 Alerts to you" at the root. Moved 30-41 into 6 and 47 into 7.
- 30-41 published with "Publish all". The copies kept their settings (re-entry, stop on response on 33, 8 am-8 pm window, contact time zone) and their tag steps.
- 42 Inspection Scheduled (made from a duplicate of 30): trigger bp-inspection-scheduled; Excluded check; SMS. Published.
- 43 Warranty Info (from a duplicate of 30): trigger bp-warranty; Excluded check; SMS and email (subject "Your {{contact.bp_job_name}} warranty"); tag warranty-sent. Published.
- 35 Yearly Check-up: trigger bp-job-anniversary; Excluded check; offer SMS; wait until the contact replies to that SMS, 3-day timeout. On a reply, If "Replied message" contains yes / Yes / YES: Create/update opportunity in Jobs > New Lead ("{{contact.name}} - yearly check-up", status open, source "Yearly check-up"), then in-app alert "Book the check-up for {{contact.name}}". Other reply or timeout: end. Published.
  - Stop on response is OFF here on purpose. With it on, the contact's reply would end the workflow before the yes branch could run. The reply wait does the same job.
  - HighLevel shows a notice that "Create/update opportunity" will be deprecated. Existing workflows keep working.
- 36 Storm Follow-up (a duplicate of 35): trigger bp-storm-followup; storm SMS; 2-day reply wait; same yes branch (opportunity "{{contact.name}} - storm roof check", source "Storm follow-up"; alert "Book the storm check for {{contact.name}}"). Stop on response is OFF for the same reason. Published.
- Folder 7 (no time window; made from duplicates of 47, so no Excluded check):
  - 44 Customer Message Unanswered: trigger bp-message-unanswered; in-app alert plus SMS alert to {{custom_values.owner_phone}}. Published.
  - 45 Job Over Budget: trigger bp-over-budget; in-app alert only. Published.
  - 47 Crew No-Show: the copy from OS. Published.
  - 48 Weather Delay Warning: trigger bp-weather-risk; in-app alert plus owner SMS. Published.
  - 49 Materials Not Ready: trigger bp-materials-not-ready; in-app alert only. Published.
  - 50 Stuck-Job Watchdog: trigger bp-job-stalled; in-app alert only. Published.
  - 46 Sub Insurance Expiring (from a spare duplicate of 30, so it keeps the Excluded check and the 8 am-8 pm window): trigger bp-sub-insurance-expiring; SMS and email to the contact, who is the sub (subject "Your insurance certificate is expiring"); in-app alert "{{contact.name}}: {{contact.bp_event_note}}." Moved to folder 7. Published.

### BP Enterprise Template - tests (Oct 4, 2026, 7:27-7:41 PM PDT)
Created test contact "Claude Test" (no phone, no email) in Enterprise. Sample BP fields: Roof Replacement, 123 Test St, Balance $3,000, Start/Visit Oct 14, Old Start Oct 10, Crew Lead Mike, Days Overdue 7, Phase Tear-off, Next Phase Shingles, Amount Paid $2,000, Inspection "Final roofing", Change Order "Add a skylight", Budget $10,000, Spent $12,000, Event Note "Test note".
Round 1: added all 21 bp-* tags. Every workflow (30-50) enrolled the contact once. 31, 33, 35 and 36 are waiting (5 pm / 2 days / reply), as designed. 43 added warranty-sent. 46 sent its in-app alert (SMS and email skipped: no phone or email).
- FOUND AND FIXED: "Copy to sub-account" keeps the OS template's custom-field IDs inside If/Else conditions. In Enterprise those conditions showed a raw ID (e.g. "ggNDN5DLSmPy6Q50zCw9") and never matched: 34 took "Other days" with Days Overdue 7, and 32 took "No crew lead" with Crew Lead set. Merge tags in message text are not affected, because they are stored by key.
  Re-picked the field in every copied BP-field condition: 32 (BP Crew Lead), 34 (BP Days Overdue, 3 branches), 37 (BP Start Date), 38 (BP Next Phase), 40 (BP Balance Due), 41 (BP Days Overdue, 2 branches). Saved; they stay published.
Round 2 (removed and re-added the six tags): 32 PASS (Has crew lead), 34 PASS (7 days branch: SMS + email), 37 PASS (Has date), 38 PASS (Has next phase), 40 PASS (Balance left), 41 PASS (Days Overdue 7 -> Other days, no action).
Not verified: rendered message text (customer messages are skipped without a phone or email), and 35/36 reply handling (needs a real reply).
Left on Enterprise "Claude Test": the bp-* tags, warranty-sent and the sample BP fields.

### Snapshot BuilderPro Enterprise - refreshed (Oct 4, 2026, 7:44 PM)
- Refreshed in place from BP Enterprise Template, all assets (225). Same ID expected: cWoCOr2RJDfc3x3FxnQm. No new snapshots were created, so GHL_SNAPSHOT_OS and GHL_SNAPSHOT_ENTERPRISE stay the same.

### Summary - project automations build (Oct 4, 2026)
- BP OS Template: 11 workflows published (30, 31, 32, 33, 34, 37, 38, 39, 40, 41 in "6 Project automations"; 47 in "7 Alerts to you"). Tested. Snapshot BuilderPro OS refreshed.
- BP Enterprise Template: 21 workflows published (30-43 in folder 6; 44-50 in folder 7). Tested. Snapshot BuilderPro Enterprise refreshed.
- Workflows 01-22, the demo account and client accounts were not touched. No message reached a real person: the test contacts have no phone or email, and Owner Phone is blank in both templates.
- Still open for the owner:
  1. 34's 14-day "Call about payment" task is skipped when the contact has no assigned user. It needs an owner on the contact (or a default assignee chosen per client).
  2. Rendered message text was not checked end to end. Test with a contact on the owner's own phone if wanted.
  3. 35 and 36 have Stop on response OFF on purpose (see the 35 note above).

## Workflow 52 Storm Alert to You - Oct 4, 2026 (Enterprise only)

- Pulled the branch; spec in docs/highlevel-workflows.md (52 · tag bp-storm-alert · build it like 48).
- BP Enterprise Template: created tag bp-storm-alert. Duplicated 48 Weather Delay Warning as "52 Storm Alert to You" in "7 Alerts to you". Trigger: Contact Tag added = bp-storm-alert. Steps: in-app alert (all users, title "Storm near past customers", message {{contact.bp_event_note}}), then SMS alert to {{custom_values.owner_phone}} with {{contact.bp_event_note}}. No Excluded check, no time window, re-entry ON. Published.
- Test (8:37 PM PDT) on Enterprise "Claude Test": BP Event Note set to "Storm near 14 past customers: 1.75 in hail near Lorena, TX. Open BuilderPro to send the storm check text." Added bp-storm-alert. PASS: both alert steps Executed, workflow finished.
- Snapshot BuilderPro Enterprise refreshed in place, all assets (227), now v4, 8:40 PM. Same ID expected: cWoCOr2RJDfc3x3FxnQm.

### Correction to earlier entries
- Earlier entries say Owner Phone is blank in both templates. That is only true for BP OS Template. BP Enterprise Template's Owner Phone custom value is +1 818-453-1111, the same number as the "Narek Test" contact (the owner's own number).
- So the Enterprise test runs sent owner-alert texts to that number: 44, 47 and 48 at 7:27 PM, and 52 at 8:37 PM. All four are marked "Executed". No customer messages went out: the test contact has no phone or email.
- Clients get their own Owner Phone, but this template value ships with the snapshot. Clear it, or replace it with a placeholder, if new client accounts should not inherit it.

## Agent brief run, Phase 3 and 4 - Oct 14, 2026 (non-stop mode)

### Phase 3, all three templates
- Custom value `ridge_assistant_name` = Lisa added. Workflow 01's first text now uses `{{custom_values.ridge_assistant_name}}` instead of the typed "Lisa".
- Built in Foundation, then copied with "Copy to sub-account" to OS and Enterprise (copies arrive as Draft; the Jobs/New Lead pipeline step in 23 had to be re-picked; error checker 0 in every copy). All published:
  - 23 Find a Pro - Quote Request (tag quote-request)
  - S1 Unanswered Message, S2 New Lead Not Contacted, S3 Catch-all New Contact
  - S4 Missed Call After Hours: incoming call no-answer/busy/voicemail; If current hour is before 8:00 AM or after 7:00 PM (true from 8:00 PM), contact time zone, no send window, re-entry off, stop on response on. Text: "Sorry we missed you! We'll call you first thing in the morning. Want to book a free inspection now? {{custom_values.booking_link}}"
  - S5 Lisa Handoff: triggers tag `stop bot` or tag `needs-human`; removes bot-active; SMS to {{custom_values.owner_phone}} with the inbox link.
- 02 Speed to Lead: new "AI chat" branch (tag ai-chat): Create/update opportunity Jobs / New Lead / open, then add tag in-pipeline. No opener text.
- 03a/03b/03c: added Create/update opportunity Jobs / New Lead / open, named "{{contact.name}} Repair / Replacement / Storm or Insurance".
- 03d Question: was published, set to Draft (not deleted).
- 11 Review Request (OS, Enterprise): Add tag review-feedback at the end of the 1-3 star branch.
- Enterprise: Owner Phone custom value cleared. Owner Email is still support@builderpro-os.com.
- Conversation AI "Lisa": name as custom value, "How you text (sound like a person)" rules appended, wait before responding 45 s. Stop Bot scenario "Needs a person" (asks for a person / angry / emergency) adds tag `stop bot`, final message "Got it. I'm getting someone from the team on this right now, they'll reach out to you shortly.", reactivates after 24 h. Goodbye Detection left off.
- Voice AI "Lisa (calls)": name as custom value, "How you talk" rules appended, greeting "Hi, thanks for calling {{custom_values.business_name}}, this is {{custom_values.ridge_assistant_name}}. How can I help?", voice speed 0.95, dynamic voice speed on, dynamic response on, backchanneling on at 0.4. Post-call contact notes (summary) on.
- Not possible / skipped:
  - Conversation AI working hours: no such setting in this version.
  - Voice AI transfer to the owner's cell: the Call transfer number field only takes a fixed +country number, not a custom value. Left unset; the prompt falls back to taking a message.
  - Human Handover action: needs a user to assign to; the templates have none. Used Stop Bot + S5 instead.
  - The Conversation AI tag picker can't find existing tags (search shows none), so the scenario uses the default `stop bot` tag and S5 listens for it.
  - "Also worth adding" workflows: not built.
- Conversation AI ids: Foundation qCvZkBAx3XZHw48hTW26, OS BDrsqT1rm8jO8x6vtSqZ, Enterprise 8IPa5ZGm3NWpvK3hET8F. Voice AI ids: Foundation 6aba0429fa48a90e33189a58, OS 6aba0cde4b104f62327b40c3, Enterprise 6aba992a1a6b909ae6f9d072.

### Phase 4, snapshots refreshed in place (all assets, Oct 14, 2026, 8:02-8:04 PM)
- BuilderPro Foundation m8xaXFkznoQZLjySnFlZ: v3 (137 assets)
- BuilderPro OS cdRGIx2azgolhnDj257c: v4 (201 assets)
- BuilderPro Enterprise cWoCOr2RJDfc3x3FxnQm: v5 (238 assets)
- Not pushed to any existing sub-account.

## Pro day 2026-10-27 (Agency Pro, run from the owner's PC)

### Part 0: agency key permission: NOT POSSIBLE (no change made)
- Opened agency Settings > Private Integrations > "ADMIN Command API" (the key BuilderPro uses; its "last used" matches the cloud watcher) > Edit > Scopes. Cancelled without saving.
- An agency-level Private Integration only offers agency scopes (companies, locations, SaaS, snapshots, users, custom menu links, phone numbers, number pools, documents, ad publishing). There is **no OAuth / location-token scope**, so it can never open a sub-account's insides (custom values, calendars list, contacts). The cloud check said the same: "The token is not authorized for this scope".
- What still works with this key: creating sub-accounts from a snapshot, setting the business profile (name, email, address), and creating the HighLevel login user.
- What doesn't: filling custom values (Business Name, Trade, Owner Name...) in a new sub-account. That needs either a Private Integration key made **inside** each sub-account (Command Center > Add key), or a HighLevel Marketplace app (OAuth). See "Needs the owner".
- The house account (BuilderPro OS) works already: it has its own key, and the automatic tag test passed (narek7099+az2 got bp-cancelled and a card in Cancelled at 02:00 UTC).

### Part 1: automatic build of AZ Test Roofing (sample) `ls5NV2b0IftrM7QDShJ6`
- Created by BuilderPro at 02:00 UTC from the Enterprise snapshot: **PASS**
- Business profile: name "AZ Test Roofing (sample)", Austin, TX: **PASS**
- Custom values: all 26 present but **empty**: **FAIL** (cause: Part 0; fill by hand or add the sub-account's key)
- Calendars: Inspection, Job, Maintenance Visit (+ the owner's personal calendar): **PASS**
- Workflows: the 7 template folders, workflows published as in the template (01 AI Qualifier, 02 Speed to Lead, 02a, 03a–03c published, 03d draft...): **PASS**
- Login user: "AZ Two Owner" exists (has a personal calendar): **PASS**
- AI receptionist row saved; the Builder AI check was skipped because the Anthropic credit is empty; the account is marked "built": **PASS** (fallback works)
- Note: the setup log says "Business details filled in" even though HighLevel refused the custom values. Logged for the cloud session to fix (the step should check the response).

### Part 2: ready pool (Agency Pro)
- Made by the cloud pool filler, a few every 5 minutes: Foundation 5/5, OS 5/5, Enterprise 1 + 4 more at the 02:15 UTC tick (final count below in the summary).
- Spot checks (Automation > Workflows): Foundation 1 `KZBRN30oM8OSEnDFfGmO` has the 4 Foundation folders + 23 Find a Pro + S1/S2, published: **PASS**. OS 1 `CrSNJ9vzI91dIyr0FpxB` has folders 1-4, 6, 7 (no Enterprise folder): **PASS**. Enterprise 1 `B3wHKZG2ikxqAPGlp65G` has all 7 folders: **PASS**.

### Part 3: BuilderPro's own customer workflows (BuilderPro OS `edV5mRAXJyhzTp6PthaS`)
- W1-W7 were **already built and published on 2026-10-14**, so nothing was rebuilt.
- Pipeline "BuilderPro customers": stages exactly Demo booked, Trial, Paid, Past due, Cancelled: **PASS** (the app finds it by name).
- Test contact: creating "Narek Test" failed in the HighLevel UI (Save did nothing, no error, nothing created). Used the existing **AZ Two Owner** contact instead: it's the owner's own address narek7099+az2@gmail.com with **no phone**.
- **End-to-end test, app to workflow: PASS.** The app's own `bp-cancelled` tag (from the cloud house sync at 02:00 UTC) started **W6 Cancelled** by itself: Add to workflow > Create/update cancelled opportunity **Executed** > cancellation feedback email **Executed** > Wait 30 days (waiting).
- Tags added by hand at 7:21 pm PDT, results from the execution logs:
  - **W1 Demo request: PASS.** Wait 1 min finished > Initial demo SMS **Skipped** (no phone) > walkthrough email **Executed** > waiting 1 day.
  - **W2 Trial started: PASS.** The "Welcome to BuilderPro" email arrived in the conversation; it's enrolled and waiting for the day-1 step.
  - **W3 Trial ending: PASS.** "Trial ends in 3 days" SMS **Skipped** (no phone) > waiting 2 days.
  - **W4 Paid: PASS.** The "Thanks for joining BuilderPro" email arrived; enrolled (30-day wait).
  - **W5 Payment failed: PASS.** The "Your BuilderPro payment didn't go through" email arrived; enrolled (day 3/7 steps waiting).
  - **W6 Cancelled: PASS** (above).
  - **W7 Not using BuilderPro: PASS.** Re-engagement SMS **Skipped** (no phone) > removed bp-inactive-7d tag **Executed** > finished.
- Left as is: the test contact stays enrolled in the waits. Its later texts will skip (no phone), and the only emails go to narek7099+az2@gmail.com. W5 day 7 will create a "Call about payment" task on it; ignore that.
- `review_link` / `bp_demo_link` custom values were not checked/changed (W1 and W4 use them; see "Needs the owner").

### Part 4: contractor workflows in AZ Test Roofing (sample)
- Contact "Narek Test" (narek7099@gmail.com, **no phone**) created at 7:25 pm PDT. Note: HighLevel's Save does nothing unless you click or tab out of the email box first. That's why the house-account attempt failed.
- **02 Speed to Lead (tag new-lead): PASS.** None branch > Set opener (general) **Executed** > Add tag bot-active **Executed** > finished.
- **01 AI Qualifier (started by 02's bot-active): PASS.** Create opportunity (Jobs / New Lead) **Executed** > tag **Executed** > Opener SMS **Skipped** (no phone) > waiting for a reply.
- **05 Appointment (Inspection booked for Tue Oct 27, 8:00 am): PASS.** Tag booked **Executed** > stage Inspection Scheduled **Executed** (the card moved New Lead > Inspection Scheduled) > Booking confirmation SMS **Skipped** (no phone) > owner alert **Executed** > wait until 24h before finished (less than 24h away) > Reminder 24h **Skipped** (no phone) > waiting until 2h before.
- **33 Job Completed > Review > Referral (tag bp-job-completed): PASS.** Send branch **Executed** > Job complete SMS **Skipped** (no phone) > waiting 2 days.
- **Estimate follow-up (07): NOT RUN.** It needs an estimate sent from the AZ Test portal, which needs that login's password (not typed, by the rules).
- **S1-S5 missed call: NOT RUN.** There's no phone number in the sub-account, so they can't fire (expected; see Part 5).
- Every SMS step skipped only because there's no phone. Every non-text step ran.
- Cleanup **not done on purpose**: the test contact, its opportunity and the Oct 27 8 am appointment stay in AZ Test (a test sub-account; deleting is permanent, so it's left to the owner). Its later texts will skip; nothing reaches a real person.

### Part 5: phone numbers (nothing bought or changed)
Prices from the agency's own **Billing > Wallet & Transactions > Pricing** page (United States, Oct 2026, LC Phone):
- **Local number: $1.03 per month** (list $1.15, now discounted). Mobile $1.15. Toll-free $1.94 per month.
- **Texts:** outbound SMS **$0.0083 per segment**, inbound $0.0083, plus "SMS carrier fees (variable)". MMS is variable.
- **Calls:** inbound and outbound voice minutes are **"Variable"** (charged per minute by destination); call recording $0.0025/min; voicemail drop variable.
- **A2P 10DLC (US texting registration):** "A2P Registration: variable". The agency wallet history shows one A2P registration at **$2.00**. "A2P Fast track" is $2.85. The Phone page says "A2P and carrier fees are passed through without markup". Approval usually takes days to 2 weeks, so start it the day a client signs up.
- Wallet balance today: $14.13. This month's total spend: $3.26 (BuilderPro OS $2.01, Demo $1.25).
- **Rebilling:** Settings > Phone Integration > Sub Account Settings already says "You are rebilling telephone usage (Calls, SMS, Phone No, etc) to your clients", **but it needs Stripe connected in HighLevel** ("Connect Stripe" button there). Rebilling is set per sub-account (all show Disabled). This is part of HighLevel's SaaS features. Check that the $297 Unlimited plan keeps rebilling before relying on it.
- **Owner's decision (recorded):** each client gets **a new local number in their sub-account (option A)**. **Forwarding** their existing number to it is offered (option B). **Porting** only if a client asks (option C). ~~Costs are rebilled to the client.~~ **Changed 2026-10-26: the owner does not want phone costs charged to clients. BuilderPro pays them from the agency wallet; rebilling stays off.**
- Rough cost per client: number $1.03/mo + texts about $0.01 each with carrier fees + call minutes + one-time A2P registration (a few dollars). A normal contractor sending about 500 texts a month comes to roughly $6-10 a month, paid by BuilderPro (not rebilled).

## Pro day summary (2026-10-26, evening PDT)
| Part | Result |
|---|---|
| 0 Agency key permission | **Not possible.** Agency integrations have no location-token scope. No change made. |
| 1 Automatic build (AZ Test) | **Pass**, except custom values are blank (because of Part 0) |
| 2 Ready pool | **Pass: 15 ready** (Foundation 5, OS 5, Enterprise 5), spot checks pass |
| 3 House workflows W1-W7 | **Pass**: already built and published; all 7 tested; app-to-W6 end-to-end works |
| 4 Contractor workflows | **Pass**: 01, 02, 05, 33. Estimate follow-up and S1-S5 not run (no portal login / no phone) |
| 5 Phone numbers | Prices logged; decision recorded |

### Needs the owner
1. **Billing: "Your next invoice is scheduled on Oct 27, 2026" ($497 Agency Pro).** Downgrade to the $297 Unlimited plan **before that invoice** (Settings > Billing > "Want to modify / cancel your subscription?"). **Downgrade, don't pause**: pausing can stop every sub-account.
2. **Custom values in new sub-accounts stay blank** (Business Name, Phone, Trade, Owner Name...), because the agency key can't open a sub-account's insides. Options:
   - per client, make a Private Integration key inside their sub-account and use Command Center > Add key (the app then fills everything in), or
   - type them in by hand in Settings > Custom Values, or
   - later: a HighLevel Marketplace app (OAuth), which would fix it for all accounts.
   Everything else in the automatic build works.
3. ~~Rebill phone costs~~ Not wanted: the owner pays phone costs. Leave Stripe unconnected under Phone Integration and leave rebilling Disabled on every sub-account (it is today). Keep the agency wallet topped up (auto-recharge) so clients' texts and calls never stop.
4. In BuilderPro OS, `bp_demo_link` is set (a booking widget link), but **`review_link` doesn't exist**, so W4's 30-day text would have a blank review link. Add a custom value named review_link with your Google review link (Settings > Custom Values > Add).
5. Test leftovers you may delete (deleting is permanent, so they were left for you):
   - in AZ Test Roofing (sample): the "Narek Test" contact, its Jobs opportunity and the Oct 27 8 am Inspection.
   - in BuilderPro OS: the AZ Two Owner contact has the test tags and is waiting in W1-W6; its texts skip, and its emails only go to narek7099+az2@gmail.com.
6. Anthropic credit is empty: the AI check after setup is skipped (the build still finishes).

### Notes for the cloud session
- `finishClient` logs "Business details filled in" even when HighLevel answers 401. It should check the response and log "custom values not filled: no sub-account key".
- The watcher (`ghl-diag`, cron `ghl-setup-watch`) will keep reporting "no (401)" every 5 minutes, which is harmless. Unschedule it, or point it at keys added with Add key.

## Marketplace app (2026-10-26, Claude Code on the owner's PC)

Plan: `docs/GHL-APP-PROMPT.md`. Before starting: `ghl-oauth` is deployed (v1), the `ghl_oauth` table exists and is empty, and `ghl-diag` is at v3 (uses the app login when there is one).

### Step 1: create the app - PASS
- marketplace.gohighlevel.com > My apps > Create app. Already signed in with the agency login; no developer sign-up and nothing to pay.
- Options offered and picked:
  - App name: **BuilderPro Connect**
  - App type: Private / Public. Picked **Private**. HighLevel's note: private is for small pilots; installs are blocked if it's active in more than 5 *external* agencies (we only use our own).
  - Target user: Sub-Account (recommended) / Agency. Picked **Sub-Account**. This can't be changed after creation.
  - Who can install: Everyone / Agency only. Picked **Agency only**.
  - Listing type: White-label (recommended) / Standard. Started on White-label, then switched to **Standard (non white-label)**: white-label refuses any redirect URL with a HighLevel reference ("The redirect url contains a HighLevel reference. Please remove any Highlevel references to save."), and `ghl-oauth` contains "ghl". Standard only changes how a public listing looks; the app is private.
  - There was no "install on all / future sub-accounts" toggle on the create form. The install screen in Step 3 may offer it.
- App id: `6ae0328f3e7307a1a02a17f0` (status: vdraft / DRAFT).
- Advanced Settings > Auth:
  - Redirect URL: `https://ttzwzouhiwdwamuimhpo.supabase.co/functions/v1/ghl-oauth`, saved.
  - Scopes: all **33** in the plan exist and are selected and saved (checked after a reload: "33 Scopes selected"). That's oauth.readonly/write, locations.readonly/write, locations/customValues, customFields and tags (read+write), contacts, opportunities, calendars, calendars/events, conversations, conversations/message, users (read+write), workflows.readonly, snapshots.readonly, companies.readonly, invoices, invoices/estimate and products (read+write). **None missing.** HighLevel flagged `users.write` as a sensitive scope (it asks to confirm); confirmed.
- Manage > Secrets > Client keys > Add: created one key named **BuilderPro Supabase**.
  - **Client ID:** `6ae0328f3e7307a1a02a17f0-mvq8h58r`.
  - The Client Secret was not copied, read or logged. The pop-up showing it was left open for the owner.

### Step 2: owner adds GHL_CLIENT_ID and GHL_CLIENT_SECRET in Supabase - waiting
- The owner accidentally deleted that first key, so a new one was made with the same name, **BuilderPro Supabase**. **New Client ID:** `6ae0328f3e7307a1a02a17f0-mvq8kkxg`. The old ID (`...-mvq8h58r`) no longer works. The secret pop-up was left open again, unread.
- Owner said "done" (both secrets saved in Supabase). Afterwards the Client keys table on the Secrets page showed "No Data" even after reloads, but the install link still carried the `...mvq8kkxg` client id and the install worked, so the key is live and the empty table is a HighLevel display glitch.

### Step 3: install it on the agency - PASS
- Opened the install link (Install link > Standard). HighLevel asked to sign in to the Marketplace again (Chrome had filled in the saved login); the **owner clicked Sign in** themselves.
- App page: Agency View, "Who can install: Agency", Pricing **Free**. Install > "Install Private App" warning > Proceed to Install. **No payment asked.**
- "Select Sub-Account" listed the agency plus 21 sub-accounts: 3 templates, 15 pool accounts, AZ Test Roofing (sample), BuilderPro OS and Demo Account. There are no real clients yet. Picked **Select all, then unticked Demo Account** (owner rule: don't touch it), so 20 sub-accounts.
- **"Auto-install on future sub-accounts" was offered and is ON**, so new sign-ups get the app automatically.
- Confirmation screen: 33 scopes > **Allow & Install**.
- HighLevel redirected to `ghl-oauth`, which showed **"Connected! ✅"**. (The page appears as raw HTML text because Supabase serves function responses as plain text. It's only cosmetic.)
- `ghl_oauth` row 1 saved at 05:29 UTC with an access and refresh token for company `9BrXBR8SmvrLflxbCgDa`, valid until 2026-10-28 05:28 UTC; `ghl-diag` renews it.

### Step 4: check it worked - PASS
- The watcher ran at 05:30 UTC, one minute after the install: `ghl_mint` = "ok at 2026-10-27 05:30" (before the install it was "no (401 The token is not authorized for this scope.)").
- It worked through the `refinish` queue (now empty) and wrote to AZ Test's setup log: "Business details filled in (10 custom values)" and "AI receptionist books into the Inspection calendar".
- Checked in HighLevel, AZ Test Roofing (sample) > Settings > Custom Values:

  | Custom value | Expected | Found |
  |---|---|---|
  | Business Name | AZ Test Roofing (sample) | AZ Test Roofing (sample) - pass |
  | Business Phone | (512) 555-0177 | (512) 555-0177 - pass |
  | Trade | Roofing | Roofing - pass |
  | Owner Name | AZ Two Owner | AZ Two Owner - pass |
  | Service Area | Austin, Round Rock | Austin, Round Rock - pass |
  | Business Hours | Mon 08:00-17:00 ... Sun closed | Mon-Fri 08:00-17:00, Sat 08:00-13:00, Sun closed - pass |

  Also filled: Business Address (Austin, TX), Business Email, Owner Email, Owner Phone.
- Still blank, because the watcher doesn't set them (AZ Test has no data for them): Booking Link, Business Website, Deposit Percent, Google Review Link, License Number, and the four Location* values.

### Result
- **Installed: yes.** BuilderPro Connect is on the agency, on 20 sub-accounts, and auto-installs on future ones. Demo Account is left out.
- **AZ Test custom values: filled in.**
- No payment was asked at any step. The Client Secret was never read, copied or logged.
- Notes for the cloud session:
  - `ghl-oauth`'s result page shows as raw HTML text (Supabase serves it as text/plain). Cosmetic only.
  - The Marketplace Secrets page lists no client keys even though the key works. It's a HighLevel display issue; nothing to do.
  - The earlier "Needs the owner" item about blank custom values (Pro day, item 2) is now solved for new sign-ups.

## Phone costs: who pays (2026-10-26)
- Owner's call: **clients are not charged for phone use** (numbers, texts, calls, A2P). BuilderPro pays from the agency wallet.
- Checked: rebilling is Disabled on every sub-account and Stripe isn't connected under Phone Integration, so nothing can be rebilled today. BuilderPro's code has no rebilling step. No setting was changed.
- Cost to plan for: about $6-10 per client per month (see Part 5).

## App login used everywhere (2026-10-26)
- 13 functions that open a client's sub-account now try the BuilderPro Connect app's login (ghl_oauth) before the agency key, which can't: lead-intake, lead-in, pros, asset-scan, estimate-options, estimate-accepted, ghl-invoice, ghl-estimate, customer-portal, ai-brain-sync, stripe-pay, stripe-webhook, ghl-events.
- ghl-invoice, ghl-estimate and customer-portal no longer hand BuilderPro's own key to other clients' accounts.
- Order stays: the client's own saved key first, then BuilderPro's key for BuilderPro's own account, then the app.
- **Deployed 2026-10-27** (owner said "deploy"): all 13 functions, verify JWT off as before.
- **Live test: PASS.** A test lead (narek7099@gmail.com, no phone) sent to lead-in for AZ Test Roofing (sample) reached AZ Test's HighLevel: lead_log ghl_status "sent" with a contact id. AZ Test has no saved key, so only the app login could have opened it.
- Seen while checking, **not caused by this change**: since Oct 25, ghl-events can't write custom fields in location aUs7E5m1gmLXoeIV3WM9 (the GHL_LOCATION_ID secret; it holds the Summit Roofing Co. / Foundation Roofing demo rows). That location keeps using GHL_TOKEN, which lacks the custom-fields scope ("401 The token is not authorized for this scope"). Two events failed (crew_no_show Oct 25, job_stalled Oct 27).

## No HighLevel login for clients (2026-10-27)
- Owner got HighLevel's "sign in" invite (from noreply@donotreply.acct-mgmt.com) when AZ Test was built. Cause: finishClient created a HighLevel user for the client (POST /users/), and HighLevel emails every new user.
- Removed that step from account-signup, command and ai-team (ghl.ts) and from the ghl-diag retry. Contractors work in BuilderPro only; nothing else used that login.
- Only AZ Test (narek7099+az2) ever got one. Its HighLevel user is left in place (removing it is the owner's call).
- **Deployed 2026-10-27** (owner said "deploy and ship to main"): ghl-diag, account-signup, command. ai-team has the same code but never calls it, so it wasn't redeployed.

## AI name check (2026-10-27)
- Owner saw "my name is Atlas" in a report: it was the old Demo Roofing demo (Atlas was renamed Ridge, then Lisa). No real account says Atlas: the live site, ai-chat, the database and BuilderPro OS's AI agents were all checked (house voice agent is "BuilderPro Support", no number; no house Conversation AI live).
- **Found, not fixed live:** AZ Test's custom value ridge_assistant_name is blank, so the client AI greeting "this is {{custom_values.ridge_assistant_name}}" has no name. Setup filled business details but never this value (only Publish on the AI page sets it).
- Fix written, **not deployed** (owner: test more tomorrow): finishClient (account-signup, command, ai-team) and the ghl-diag watcher now set ridge_assistant_name to the name picked at sign-up, else Lisa. To ship: deploy ghl-diag, account-signup and command, then queue AZ Test in ai_config refinish so the watcher fills it.
- Open for tomorrow: test texts with a real phone; missed-call (S1-S5) and estimate follow-up workflows; review_link in BuilderPro OS; the GHL_LOCATION_ID custom-fields 401 in ghl-events; confirm a new sign-up gets no HighLevel invite email.

## Demo-request and inactive tagging, cleanups (2026-10-28, cloud session)
- **W1 Demo request is now started by the app.** signup.html sends name, email, phone and plan (never the password) when someone passes the login step, saved in `signup_interest`. If no account exists for that email 45 minutes later, the `ghl-diag` watcher adds `bp-demo-request` + `bp-signup-unfinished` to their contact in BuilderPro OS. The login step now says BuilderPro may text and email them (STOP to opt out).
- **W7 Not using it is now started by the app.** The portal records when an owner last opened BuilderPro (`accounts.last_seen_at`, at most once an hour). After 7 days without a visit the watcher adds `bp-inactive-7d` (one nudge per absence; existing accounts start as already handled).
- The owner's test logins (name+tag@) never get a phone on house contacts, so nothing texts them.
- Setup log is honest: "Business details filled in (N custom values)" only when HighLevel took them, otherwise "not filled in" and the account is queued for the watcher.
- Lisa's name (ridge_assistant_name) is set during setup; AZ Test is queued so the watcher fills it once HighLevel is active.
- The app install page now lands on the Command Center ("HighLevel (BuilderPro Connect) is connected") instead of raw HTML.
- AI spending: Command Center shifts turned off (ai_config shifts_on=false), daily briefs off for the 6 test accounts (ai_brief_at set to 2099-01-01; set it back to null to turn one on).
- Deployed: account-signup, command, ghl-diag, ghl-oauth. ai-team has the same ghl.ts change but never runs setup, so it wasn't redeployed.
- While HighLevel is frozen all of this waits: the watcher logs "Company is not active" and retries every 5 minutes.

## Cancel in Stripe, Requests in the Command Center (2026-10-28, cloud session)
- **Cancel now ends the plan in Stripe** (account-signup op cancel): `cancel_at_period_end`, so a trial is never charged and a paid month runs out. "Keep my plan" undoes it before then (op uncancel). The AI Team add-on subscription follows. An account with no card on file is set to cancelled right away. `accounts.cancel_at` holds the end date; billing-webhook keeps it in step with Stripe, including cancels made in the Stripe dashboard.
- Plan page: "Ends Nov 9" badge, "Your plan is set to end" card with Keep my plan. Team members (no account row) still get the email fallback.
- **Requests card** (Command Center → Accounts, function cc-requests): open support requests, Enterprise first with a Priority label, Done button. New kinds: cancel, cancel_undone, website_addon (the $49 Website add-on, from sign-up or the Plan page).
- Tested: cancel on the Foundation test login (no card) end to end, then restored; AZ Test (subscription already ended in Stripe) shows Stripe's refusal clearly. No live subscription was touched.
- Deployed: account-signup, billing-webhook, cc-requests.

## Book a walkthrough (2026-10-28, cloud session)
- Homepage, under the plans: a "Book a walkthrough" form (name, business, phone, email). It saves to signup_interest (source walkthrough), files a Requests card ("Wants a walkthrough", phone and email in it), and the watcher adds the visitor to BuilderPro OS with tags `bp-demo-request` and `bp-walkthrough` right away (no 45-minute wait). A hidden field catches bots.
- support_requests.owner can now be empty, for visitors with no account. Clients only ever see rows they own, so these stay private.
- Fixed: portal/pipeline.js ran its HighLevel sync for signed-out homepage visitors and got 401s; it now waits for a signed-in session.
- Deployed: account-signup, ghl-diag. Migration 20261112000000_walkthrough applied.

## App store prep (2026-10-28, cloud session)
- Builds: Android built for the first time (run 2, test .apk + unsigned .aab as artifacts); iPhone compiles with the new privacy manifest (`mobile/ios/App/App/PrivacyInfo.xcprivacy`, UserDefaults reason CA92.1), which Apple requires before an upload is accepted.
- Store screenshots in `docs/store-screenshots/`: 6 iPhone, 6 iPad, 6 Android and the Google banner. Business name swapped to "Summit Roofing Co" in the picture only.
- Fixed: inside the native app, My projects offered "Get the app / Add to home screen"; bpIsStandalone() now counts the app as installed.
- privacy.html: new sections for the app's permissions and for AI features (HighLevel, Anthropic, Google), providers named. data-deletion.html: the in-app Delete account steps.

## Site check and System health (2026-10-28, cloud session)
- Site check: all 44 public pages load without errors, sideways scrolling or broken images at phone width; the homepage shows content in about 1.2 s on 4G, other pages about 0.6 s. Fixed: homepage search description (was too long) and canonical link; the old System Check page is kept out of Google. Long page titles (70-90 characters) are cut off in Google results but not broken; left as they are.
- **System health** (function health-check, cron health-check-daily at 14:41 UTC, table health_checks): pings 24 key functions with OPTIONS (no work, no cost), checks each scheduled job ran on time and didn't fail, background call failures, the HighLevel watcher's heartbeat (ghl_mint) and whether HighLevel is frozen, recent client setups, failed card payments, old open requests, and that the needed secrets exist (names only). Card at the top of Command Center → Accounts with Check now and the last 7 days.
- Supabase lets one function call about 30 others per run ("Rate limit exceeded for trace"), so the check pings 24; it reports a hit limit as a note, never a false alarm.
- It can't tell whether the Claude credit is empty without paying for a test call, so it doesn't try.
- Health alerts: a morning run that finds problems also puts a "BuilderPro: N problems found this morning" notification in the bell of each Command Center admin who has a BuilderPro login (kind system_health, once a day, tapping it opens the Command Center). It becomes a phone push once the app has its Apple/Firebase keys. Pressing Check now doesn't notify. A test alert was sent on 2026-10-28.

## LLC prep (2026-10-28, cloud session)
- docs/LLC-DAY.md: the ordered list for when the LLC exists (EIN, bank, D-U-N-S, Stripe business details, legal pages, HighLevel profile and A2P, Apple/Google as an organization, bills, sales tax, lawyer review).
- terms.html rewritten around the old text: free trial, billing, add-ons, call minutes, price changes, failed payments, cancelling and refunds (no refunds for partial months), texting consent (TCPA, A2P), AI features, contractor-customer payments, availability, disclaimer, liability cap (fees in the last 12 months), indemnity, changes.
- Every spot that needs the LLC's name, state or address has an `<!-- LLC: ... -->` marker (terms 4, privacy 3, data deletion 1); the "© 2026 BuilderPro OS" footer on the other pages is updated the same day.

## Help Center, page titles, sales one-pager (2026-10-28, cloud session)
- help.html: setup (Lisa, business number, team logins), jobs and crew, estimates, invoices, card payments, leads, plan, cancelling, passwords, deleting an account, with search. Button names checked against the live app. Linked from the homepage footer, the legal pages and the sitemap; it is the app-store support URL.
- 39 marketing page titles now fit Google's ~60 characters, search keyword first (social-share titles unchanged).
- docs/sales/BuilderPro-one-pager.pdf (source one-pager.html): one Letter page for contractors after a walkthrough, using only the live pricing page's claims. Rebuild it after any price change.

## How BuilderPro is different (2026-10-29, cloud session)
- Homepage section #simple is now "Why BuilderPro: Built to win the job, then run it": AI receptionist included, built for project jobs, brings the work in, flat price with no contract; links to the comparison page. Menu and footer say "Why BuilderPro", footer adds "Compare".
- compare.html, jobber-alternative.html, housecall-pro-alternative.html, servicetitan-alternative.html: built by tools/compare-pages.py from one table of facts, so they always agree. Only claims backed by competitor pricing pages or independent reviews (October 2026) are in the table; each page has a "when they may be the better fit" section and a trademark note. Re-check the facts in the script before changing a number.
- The switching steps promise "send us your customer list and we bring it in": that's done by hand with HighLevel's contact import (contacts then sync to BuilderPro).

## App cleanups and contact import (2026-10-29, cloud session)
- Phone tab rows (Leads, Jobs, Finances, Calendar): a blue arrow at the right edge while more tabs are hidden; tapping it slides them in (mobile.js tabsFade).
- Bell number counts news only (new leads, messages, approvals, payments, assignments; crew no-shows for one day). Standing reminders (due soon, overdue, needs inspection/estimate/invoice), briefings and job_new stay in the list without adding to the number (notify.js QUIET).
- Estimates: the "business number" note now says what's true: account setup is still finishing; drafts work now.
- Contacts on a phone: one line per person (name, stage, date, call and text buttons); edit and delete moved to the contact's page. Computer table gains a stage chip and loses the trash can.
- Calendar crew filter is one dropdown in the Today/Add row (hidden with fewer than two crews).
- Settings: "What Lisa knows" is part of Lisa's page; old links scroll to it.
- Phone home: "Finish setting up" card with the same steps as the computer dashboard (BPDASH.steps).
- Phone bottom bar: Home, Leads, New, Jobs, Inbox (Calendar is in Apps and Home's Today card).
- Contact import: Leads > Contacts > Import (portal/contacts-import.js). CSV from any software, columns matched by heading and changeable, duplicates (phone or email) and empty rows skipped, saved to public.contacts tagged "Imported". Imports never text anyone. Up to 5,000 rows per file.

## Website redesign previews (2026-10-30, cloud session)
- builderpro-os.com/new.html: the homepage with a new nav and presentation-style scrolling. Built by tools/make-preview.py from index.html (+ site/present-nav.html, site/present.css, site/present.js), so it always shows today's real content. noindex.
  - Nav: floating bar with Product and Tools menus, Pricing, Find a pro, Log in, Start free trial; the current section lights up and a progress line runs under it. Phones: full-screen menu sheet.
  - Slides: one flick, swipe or arrow key glides to the next stop and locks there. Stops are section tops, one per hero step and per How-it-works feature, and screen-sized pages through long sections, each starting at the top of a card. Dots on the right (computers). Overlays, forms and anything that scrolls by itself keep normal scrolling; "reduce motion" turns it off. Lenis is not loaded on the preview.
  - site.js: window.dlCalc(trade, tool) opens the tools panel on a tool (used by the new menus); index.html's site.js version bumped.
- Tool redesign previews: embed/roofing-new.html, embed/damage-roofing-new.html, embed/health-roofing-new.html. Built by tools/tool-skin.py: embed/tool-skin-est.css (+ tool-skin-est.js) for the cost calculators and embed/tool-skin-ck.css for the checks, from tools/skins/*.tpl.css. Look only: same questions, answers, prices, scoring and wording; colors follow the contractor's theme (--a).
- LIVE (2026-10-30): tools/build-embeds.py and tools/build-checkers.py link the skins into all 36 tool pages (version = hash of the skin file). The homepage has the new nav (in site/body-top.html, old navbar/menu kept hidden for site.js) and present.js/present.css via site/assemble.py, no Lenis. Previews (new.html, *-new.html, tools/make-preview.py) removed. Rebuild order: python3 tools/tool-skin.py && python3 tools/build-embeds.py; python3 site/assemble.py

## Marketing pages match the homepage (2026-10-30, cloud session)
- tools/marketing-pages.py updates the 39 trade pages (CRM software, lead generation, AI receptionist, missed-call text-back, cost calculators, roof-estimator-tool). Safe to re-run; the nav, head tags and calculator sit between <!--mk-...--> markers.
  - Nav: the homepage's nav (tools/mkt_nav.py → site/mkt-nav.css + site/mkt-nav.js), linking back to homepage sections, /signup.html (Start free trial) and /?portal=1 (Log in). The old "Ridge AI now books jobs" bar is gone.
  - Words: Ridge → Lisa; "Book a Free Demo" → Start free trial (/signup.html) or "Book a free walkthrough" (/#walkthrough); "done for you, live in 3–4 days" → "start today, free for 14 days". #booking, #estimator and #atlas links are gone.
  - Live tools on each page (#try): the trade's cost calculator in an iframe, with tabs for its damage check and health check (switched in place by mkt-nav.js; the nav's Tools menu does the same). On the cost-calculator pages this replaces the made-up "$14,200" box. Trades: remodeling → general, countertop → countertops, pool → pools, trim carpentry → trim; missed-call-text-back.html and ai-receptionist-for-roofers → roofing.
- tools/compare-pages.py uses the same nav (Tools there open the homepage's tools panel, /?calc=roofing:tool).

## Search tune-up (2026-10-30, cloud session)
- Share images: assets/og/*.png (1200x630), made by `node tools/og-cards.js`. One per trade, a homeowner "What will your X cost?" card for each cost-calculator page, plus default and compare.
- tools/seo.py (run last, after site/assemble.py, tools/marketing-pages.py and tools/compare-pages.py): adds og:image / twitter:image to every public page, Open Graph tags to the homepage, a canonical to signup.html, and JSON-LD: homepage = Organization + WebSite + SoftwareApplication (plan prices read from the homepage pricing) + FAQPage (read from the homepage FAQ); trade and compare pages = breadcrumb + software; cost calculators = breadcrumb + free WebApplication. Also rewrites sitemap.xml (49 pages: everything not noindex; lastmod from git). All between <!--seo--> markers.
- Homepage FAQ fixed (site/body-bottom.html): no more "one-time setup fee". Answers now match sign-up: card on file, not charged today, 14 days free, no setup fee; phone number and texting take a few days for carrier approval.

## Daily website check (2026-10-30, cloud session)
- .github/workflows/site-check.yml runs tools/site-check.js every day at 13:47 UTC (and by hand: Actions > Website check). It opens the live site: every sitemap page answers with a title; homepage (nav, 3 prices, FAQ) on computer and phone; 3 trade pages with the live calculator; compare and sign-up; all 36 tools show their first step; the app's log-in screen opens. No forms are sent; analytics are blocked. About 2 minutes of free GitHub time a day.
- It reports to health-check ({op:"site_report"}, header x-site-check-key = ai_config site_check_key; the result is saved in ai_config site_check). The 14:41 morning health check lists its problems under "Website" (so they reach the bell), and flags the check if it hasn't reported for 50 hours. Until the GitHub secret SITE_CHECK_KEY is added it only shows a note. GitHub also emails on a failed run.
- health-check v6 deployed.

## Sales kit (2026-10-30, cloud session)
- docs/sales/sales-kit.md: the facts and prices to know, the one-line answer to "how are you different from Jobber / Housecall Pro / ServiceTitan" (from compare.html), who to target and the missed-call test, cold call and voicemail scripts, answers to pushback, a 3-email sequence with trade first lines (CAN-SPAM footer), follow-up texts (only to people who agreed; no cold texting, TCPA), links by trade, the 20-minute walkthrough. Claims come from the live site; update it when prices change.

## Speed and accessibility (2026-10-30, cloud session)
- Lighthouse (mobile) before: homepage performance 32, accessibility 91; trade pages 69 / 96. Most of the homepage's blocking time was the 3D cube, which only runs where the hero videos can't play (Lighthouse's Chromium has no H.264). Real visitors see the videos.
- site/hero3d.js: on touch devices the cube rests once it has assembled and caught up with the scroll (no idle drift, no frames); scrolling wakes it. Its clock only moves while drawing, so it never jumps. Computers unchanged. site/site.js loads hero3d.js after the load event, when the browser is idle.
- #videoScrub (2.7 MB) is preload="none" and starts loading when the story is about 3 screens away, so it no longer downloads with the page.
- Contrast: marketing/compare pages --blue #2f6bff → #2a62f0, --grey-l → #6e6e74, step numbers opacity .8; homepage .hww_steps labels #5b6676 and .blob-cta #0062e0; tool skins' small kickers use the accent mixed 14% toward black (still follows each contractor's color); signup.html --blue #0062e0, --ok #15803d. Links inside text on marketing pages are underlined. SplitText no longer puts aria-label on paragraphs (aria:'none' for non-headings).
- favicon.ico added (pages without an icon link were getting a 404).
- After: accessibility and best-practices 100 on the homepage, a trade page, compare, sign-up, a calculator and a damage check.

## Command Center and AI Team checks (2026-10-30, cloud session)
- Command Center: run against simulated answers (no live calls), all 6 tabs on computer and phone with no errors; "Create account" sends op account_create with name, business, email, phone, trade. Every op in supabase/functions/command needs an ADMIN_EMAILS login; ?shift needs the cron key. New-account form now checks the email's shape and turns Supabase's "already been registered" reply into plain words. Not run live: it would make a real login and a HighLevel sub-account (HighLevel is frozen, so that step would wait). Admin-made accounts start as plan/status "trial" with no card.
- AI Team ($299 test login, test login cleared after): board, AI CEO tab and the other assistants load with no errors on computer and phone; the CEO chat uses the same chat shell (ai-wrap > ai-chat > ai-comp) as the others. No messages sent (no AI cost).

## Homepage and app split (2026-10-30, cloud session)
- app.html is now the source: the whole app plus the marketing site it opens over (the old index.html, renamed, with history). Edit app code in app.html.
- index.html (the homepage) is GENERATED by tools/build-home.py from app.html: every <!--app-only-->...<!--/app-only--> region is dropped (portal markup, its inline scripts and styles, portal/*.js and *.css, supabase-js, the noindex tag). site/assemble.py now writes app.html, then runs build-home.py and tools/seo.py. Never hand-edit index.html.
- Homepage went from 2.4 MB to about 195 KB; app.html from 2.4 MB to about 1.2 MB.
- The 7 calculators that lived inline in the homepage as <iframe srcdoc> (a hidden carousel) are now embed-src/<trade>.html like the other five; tools/build-embeds.py and tools/inject-theme.py read embed-src only. The app's "My calculators" preview loads embed/<trade>.html.
- Forwarder (first thing in the homepage head): ?portal|app|aiteam|connected|mail|mailstart|google|add|found|pro|bpframe=, ?source=app|pwa, #home|est|sign|pay|my|pros|find-a-pro|payouts|qb, and auth hashes (#access_token, #error, type=recovery|invite|...) go to /app.html with the query and hash kept. So old links (emails, texts, edge functions' ${SITE}/index.html?portal=1 and ${SITE}#est=, the test-login redirect, the store app's /?portal=1) keep working. /app (app/index.html) forwards to /app.html. app.html (and /app) always opens the app.
- Homepage stand-ins (build-home.py): BP_URL/BP_ANON, bpSyncLock, bpOpenPortal (goes to /app.html?portal=1).
- Direct links updated: Log in and Find a pro in the navs (site/body-top.html, tools/mkt_nav.py), signup.html's log-in links, manifest start_url, mobile/capacitor.config.json server url (/app.html?portal=1&source=app; takes effect on the next store build).
- Fixed: the homepage "Start my free trial" drawer opened an email (site.js's dlContactSend overrode index.html's). It now goes to signup.html with name, business, phone and email filled in.
- Password-reset links now return to /app.html: Supabase Auth > URL Configuration > Redirect URLs must allow https://builderpro-os.com/app.html (or https://builderpro-os.com/**).
- Tested: 21 forwarding cases; homepage on computer and phone (nav, prices, FAQ, Lisa chat, tools panel, drawer to sign-up, Log in) with no errors and no app files loaded; signed in as plan299 (computer and phone, 12 pages incl. calculator preview), crew and homeowner; a real customer project link and an estimate link through the homepage address; site-check (49 pages, 36 tools) and tools/calc-models + crew-cost tests.

## Slide scrolling fixes (2026-10-30, cloud session)
Measured on the live homepage first (computer, with the 3D cube off as on a real visitor's machine; phone emulation):
- 11 of 21 stops showed blank areas (up to 65% of the screen): every section except the current one was hidden (pr-out) until you "arrived" at it.
- A trackpad flick could skip several slides; the phone address bar showing or hiding snapped the page back to the section's top (~280px); stops were measured while sections were drawn 56px low, so cards could be cut.
site/present.js now:
- reveal: a section rises in once, the first time any of it comes into view (IntersectionObserver), and is never hidden again, however the page got there.
- build() measures with html.pr-measure on (present.css turns the rise-in transform off), so stops sit exactly on the cards.
- wheel: one gesture = one slide. A new gesture is a 300ms pause, a fresh trackpad flick (deltas jump up 1.8x), or, after the last slide has landed, a mouse wheel's next notch (same-size deltas; a glide only fades).
- resize re-measures but never moves the page (height-only changes are the phone address bar); a width change re-aligns to the current stop.
- glides are 700 to 1000ms (were 900 to 1300).
After: no blank areas at any stop; a trackpad flick moves exactly one slide; a 3-notch mouse spin moves one slide, slow notches keep moving, one notch up goes back one; the phone address bar no longer snaps the page back.
