# HighLevel: everything to finish before the freeze

The freeze only matters for work that has to happen **inside HighLevel**: the
three templates (Foundation, OS, Enterprise), their snapshots, Lisa's prompts,
and BuilderPro's own house account. Code fixes in the app don't need HighLevel
open, so they're listed separately at the end.

Order of work: **A** (blockers), then **B** (Lisa), then **C** (template
workflows), then **D** (BuilderPro's own funnel). Re-take the snapshots last (**E**).

---

## A. Blockers (do these first)

1. **Remove your real phone number from the Enterprise template.**
   Settings > Custom Values > Owner Phone is +1 818-453-1111, and it ships to
   every Enterprise client. Clear it, or set a placeholder like 000-000-0000.
2. **Make Lisa's name a custom value.** Add a custom value called
   `ridge_assistant_name` (value: Lisa) to all three templates. Then replace the
   hard-coded "this is Lisa" with `{{custom_values.ridge_assistant_name}}` in:
   - Workflow 01 (the first text)
   - the Voice AI greeting ("Thanks for calling ..., this is Lisa")
   - the Conversation AI prompt

   After the freeze I'll make the app's Publish button write that value, so a
   contractor who renames Lisa gets the new name everywhere.
3. **Leads that arrive by tag must start the new-lead workflow.** Find a Pro
   quotes, the booking page, and Angi/Thumbtack/email leads all create the
   contact with the tag `new-lead`. Open the new-lead workflow (02) in each template and
   add the trigger **Contact Tag added: new-lead** next to whatever triggers it
   now.
4. **Calculator leads need a tag trigger too.** Right now every calculator posts
   to *your* house webhook, so every contractor's calculator leads land in your
   account. I'm moving them to each contractor's own account through
   BuilderPro, which will create the contact with the tags
   `calculator-lead` + `new-lead` and the quote fields filled in. In each template, open the
   workflow that starts from the calculator's inbound webhook and add the trigger
   **Contact Tag added: calculator-lead**. Leave the webhook trigger in place
   for now.
5. **Send me two IDs from the house Jobs pipeline:** the stage IDs for
   "Decision Pending" and "Won". Open Opportunities > the pipeline > stage menu,
   or copy them from the URL. The Close Deals page still has placeholders.

## B. Make Lisa sound like a person

Lisa's live texting and calling run on HighLevel's Conversation AI and Voice AI.
Those prompts live in HighLevel, not in the app, so do this in all three templates.

**Conversation AI (texts and chat)**
- Settings: turn on a **reply delay** (about 30 to 90 seconds; random if
  offered). An instant reply at 2 AM is the clearest sign it's a bot.
- Set **working hours / quiet hours** so Lisa doesn't text before 8 AM or after 9 PM.
- Add this to the end of the prompt:

```
How you write:
- Text like a friendly person at the front desk of a local contractor, not a company. Short and casual: 1-2 sentences, usually under 25 words.
- Use contractions (I'm, we'll, that's). Plain words. No lists, no bullet points, no bold.
- Never use dashes like "—" or "–". Use a comma or a new sentence.
- Never open with "Great question", "Absolutely", "Certainly", "I'd be happy to", or "Thank you for reaching out".
- Ask one question at a time, then wait.
- Use their first name once in a while, not in every message.
- Match their energy: if they text short, you text short. If they're upset, slow down and say sorry first.
- Don't repeat the business name in every message.
- If you don't know something, say you'll check with {{custom_values.ridge_owner_name}} and get back to them. Don't guess prices beyond what you were given.
- If someone asks if you're a real person or a bot, be honest: you're the company's assistant and can get a person on the line any time.
- Your goal is to book a free inspection, but only offer it once it makes sense. Don't push it in every message.
```

(If the owner-name custom value has a different key, use that one.)

**Voice AI (calls)**
- Pick the most natural voice available, and slow the speaking speed down a little.
- Turn on interruptions (barge-in), so callers can cut in like with a person.
- Use the same rules as above, plus: "Keep turns short. Confirm the address and
  time back to them. If they ask for a person, transfer to
  `{{custom_values.business_phone}}`."
- Greeting: "Hi, thanks for calling {{custom_values.business_name}}, this is
  {{custom_values.ridge_assistant_name}}. How can I help?"

I'll fix the robotic bits on the app side after the freeze (the website chat
and test chat still use dashes and canned "Great question!" replies).

## C. Workflows the contractor templates should have

Check each of these exists in the right template. Build the missing ones.
"F/OS/E" = which plans get it. My recommendation: give Foundation more of
these. Today Foundation gets no automated follow-ups at all, and those are
what a $99 customer notices first.

| Workflow | What it does | Plans |
|---|---|---|
| Missed-call text back | Text within 1 min of a missed call: "Sorry we missed you, this is Lisa with ..." | F/OS/E |
| Appointment reminders | Text 24 h and 2 h before the inspection; reply C to confirm, R to reschedule | F/OS/E |
| No-show rebook | If the appointment is marked no-show: text a rebook link 15 min later, again next day | F/OS/E |
| Estimate follow-up | Estimate sent, not accepted: day 2 text, day 5 email, day 10 "still thinking it over?" text | F/OS/E |
| Review request | On `job-complete`: day 1 thank-you + review link; day 4 reminder if no review | F/OS/E |
| Referral ask | 14 days after `job-complete`: "Know anyone who needs ...? We'll send you $X" | OS/E |
| Maintenance reminder | On `next_service_date`: 2 weeks before, offer to book | OS/E |
| Old lead re-engage | No reply in 30 days: one friendly check-in. Again at 90 days, then stop | OS/E |
| Home anniversary | 1 year after the job: check-in + review/referral | E |
| Storm follow-up | Already built (52) | E |

Every texting workflow needs a **stop if the contact replied** step and quiet hours.

## D. Workflows for BuilderPro itself (your house account)

Today nothing reaches your own customers after they sign up: no welcome, no
trial reminders, no failed-payment texts, no win-back. Build these in the
**house** account (not the templates). After the freeze I'll make signup and
billing put each customer into your house account with these tags, so the
workflows fire on their own:

| Tag the app will add | Workflow to build |
|---|---|
| `bp-demo-request` | Speed to lead: text in 1 min, email, book on a "BuilderPro demo" calendar (create it) |
| `bp-trial-started` | Onboarding series: day 0 welcome + login link; day 1 "connect your phone number"; day 2 "publish Lisa"; day 3 "add your first project"; day 5 "invite your crew"; day 7 "install the app" |
| `bp-trial-ending` | 3 days and 1 day before the trial ends: what they'll keep, and a link to add a card |
| `bp-paid` | Welcome to paid; on day 30, ask for a review and a referral |
| `bp-payment-failed` | Dunning: day 0 email, day 3 text, day 7 text + call task for you |
| `bp-cancelled` | Exit survey; win-back at 30 and 60 days |
| `bp-inactive-7d` | No login in 7 days: "Need a hand getting set up?" + a 15-minute call link |

Also add a pipeline for BuilderPro customers with these stages: Demo booked → Trial →
Paid → Past due → Cancelled. Tell me the stage IDs and I'll move people
automatically.

## E. Last: re-take the snapshots

After A to C, re-take all three snapshots (Foundation, OS, Enterprise). If the
snapshot IDs change, send me the new ones; signup picks the template from them.

Some things can't go in a snapshot. They're still manual for every new client:
- turning Lisa on for SMS and the chat widget
- buying the phone number

---

## After the freeze: my code fixes (no HighLevel changes needed)

1. Calculator leads go to each contractor's own HighLevel, not your house account.
2. Angi / Thumbtack / emailed leads go to the contractor's own HighLevel.
3. Fix Lisa's Publish button: today it writes to your house account and
   overwrites the contractor's location ID, which can send their invoices and
   estimates through your account.
4. Scheduled texts: lock down to each account (today there's no sign-in check
   and no owner on the table).
5. Retried and Command Center signups pick the template by plan (today they ignore it).
6. Sync Lisa's name and tone to `ridge_assistant_name`.
7. Website and test chat: remove dashes and canned openers, and fix the homepage
   chatbot (it calls a function that doesn't exist, so it only gives canned answers).
8. Push signups, trials, payments and cancellations into your house account with
   the `bp-*` tags in section D.
9. Plans: remove the $49 AI Team add-on still sold by the backend (the app
   says Enterprise only). Decide whether Foundation gets 1 calculator (the spec says
   yes, the app says no), and whether call minutes / user limits are enforced.
