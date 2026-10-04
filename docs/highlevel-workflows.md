# BuilderPro → HighLevel workflows: build sheet

BuilderPro now sends events into HighLevel by **adding a tag** to the customer's
contact, after filling in the **BP custom fields** with that job's details.
Each workflow below starts on **Contact Tag Added** with one of these tags.
BuilderPro removes and re-adds the tag each time, so a workflow fires every
time the event happens, even for a returning customer.

Build them in the **BuilderPro Roofing** sub-account (location
`aUs7E5m1gmLXoeIV3WM9`), test, then save them into the snapshot.

## The fields you can put in messages

Insert these with the **{ }** custom-value picker under *Contact → BP …*, or type them:

| Field | Merge tag | Example |
|---|---|---|
| BP Job Name | `{{contact.bp_job_name}}` | Roof Replacement |
| BP Job Address | `{{contact.bp_job_address}}` | 6100 Vineland Ave, North Hollywood |
| BP Job Amount | `{{contact.bp_job_amount}}` | $35,000 |
| BP Balance Due | `{{contact.bp_balance_due}}` | $8,000 |
| BP Start Date | `{{contact.bp_start_date}}` | Monday, October 5 |
| BP Visit Date | `{{contact.bp_visit_date}}` | Tuesday, October 6 |
| BP Crew Lead | `{{contact.bp_crew_lead}}` | Mark |
| BP Portal Link | `{{contact.bp_portal_link}}` | the customer's private project page |
| BP Days Overdue | `{{contact.bp_days_overdue}}` | 7 |
| BP Company Name | `{{contact.bp_company_name}}` | Summit Roofing Co |
| BP Event Note | `{{contact.bp_event_note}}` | (storm follow-up note) |

Check the exact key in *Settings → Custom Fields* if the picker shows a different one.
Fields can be empty (for example, no crew lead or no portal link yet); the
messages below are written to read fine either way, or use an If/Else on the field.

## Settings for every workflow

- **Allow re-entry: ON** (the same customer can have several jobs).
- **Stop on response: ON** for anything that asks the customer something.
- Send texts between **8:00 am and 8:00 pm** (Wait → "Wait until time window", or the workflow's time window setting).
- Publish only after a test on the **bp system test** contact.

---

## 1. Job scheduled — tag `bp-job-scheduled`

When a project gets its first day booked (or the start moves).

1. **Trigger:** Contact Tag Added → `bp-job-scheduled`
2. **SMS:**
   > Hi {{contact.first_name}}, this is {{contact.bp_company_name}}. Your {{contact.bp_job_name}} is booked to start {{contact.bp_start_date}}. You can follow every step here: {{contact.bp_portal_link}}
3. **Email** (optional): same message, subject "Your {{contact.bp_job_name}} is scheduled".

## 2. Visit tomorrow (appointment reminder) — tag `bp-visit-tomorrow`

Fires the day before each booked work day.

1. **Trigger:** Contact Tag Added → `bp-visit-tomorrow`
2. **Wait** until 5:00 pm (time window), so it lands the evening before.
3. **SMS:**
   > Reminder from {{contact.bp_company_name}}: our crew will be at {{contact.bp_job_address}} tomorrow, {{contact.bp_visit_date}}. Please keep the driveway clear and pets inside. Reply here with any questions.

## 3. Crew arrived (on site) — tag `bp-crew-arrived`

First clock-in on the job that day.

1. **Trigger:** Contact Tag Added → `bp-crew-arrived`
2. **SMS:**
   > Good morning {{contact.first_name}}! {{contact.bp_crew_lead}} and the {{contact.bp_company_name}} crew just arrived and are starting on your {{contact.bp_job_name}}. Photos and progress: {{contact.bp_portal_link}}
3. **If/Else** (optional): if BP Crew Lead is empty, use "Our crew just arrived…".

## 4. Job completed → review → referral — tag `bp-job-completed`

1. **Trigger:** Contact Tag Added → `bp-job-completed`
2. **SMS (right away):**
   > Your {{contact.bp_job_name}} is complete! Thank you for choosing {{contact.bp_company_name}}. Final photos and documents are here: {{contact.bp_portal_link}}
3. **Wait** 2 days.
4. **Send Review Request** (HighLevel's review action), or SMS:
   > Hi {{contact.first_name}}, would you mind leaving us a quick review? It really helps a small business: [review link]
5. **Wait** 30 days.
6. **SMS:**
   > Know a neighbor who needs work done? Send them our way and we'll take care of them like we did for you. Just reply with their name and number.
7. **Add tag** `past-customer` (useful for campaigns).

## 5. Payment overdue — tag `bp-payment-overdue`

Fires 3, 7 and 14 days after a job is marked done while a balance is still owed.

1. **Trigger:** Contact Tag Added → `bp-payment-overdue`
2. **If/Else** on BP Days Overdue:
   - **3** → SMS (friendly):
     > Hi {{contact.first_name}}, a quick reminder that {{contact.bp_balance_due}} is still open on your {{contact.bp_job_name}}. You can pay here: [invoice link]. Thank you!
   - **7** → SMS + Email (firmer):
     > Hi {{contact.first_name}}, your balance of {{contact.bp_balance_due}} for {{contact.bp_job_name}} is now a week past due. Please let us know if anything is holding it up.
   - **14** → **Internal notification** to the owner ("{{contact.name}} owes {{contact.bp_balance_due}}, 14 days") + **Create task** "Call about payment".

## 6. Yearly check-up — tag `bp-job-anniversary`

Fires once a year on the date a job was completed.

1. **Trigger:** Contact Tag Added → `bp-job-anniversary`
2. **SMS:**
   > Hi {{contact.first_name}}, it's been a year since we finished your {{contact.bp_job_name}}. Want a free check-up to make sure everything is holding up? Reply YES and we'll book it.
3. **If replied YES** (or on reply) → **Create opportunity** in the pipeline / book in the Inspections calendar.

## 7. Storm follow-up — tag `bp-storm-followup`

The owner sends this from BuilderPro for an area (ZIP codes or a city); it tags
past customers whose job address is in that area.

1. **Trigger:** Contact Tag Added → `bp-storm-followup`
2. **SMS:**
   > Hi {{contact.first_name}}, {{contact.bp_company_name}} here. After the recent storm we're offering free roof checks for our past customers. Want us to swing by? Reply YES. {{contact.bp_event_note}}
3. **On reply YES** → create opportunity / task "Book storm check".

---

## Testing a workflow

The **bp system test** contact already carries the BP fields. To fire a
workflow without touching real customers: open that contact, remove the
`bp-…` tag, add it again, and watch the workflow's *Execution logs*.
