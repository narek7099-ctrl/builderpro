# HighLevel build guide (before the freeze)

These are click-by-click steps for everything that has to be done inside
HighLevel. I can't log into HighLevel or click through it from here, and its
API can't create or delete workflows. So this part is yours. Each section says
where to go and what to type.

Do it in this order: **0, 1, 2, 3, 4, 5.**

---

## 0. Before you delete anything: don't touch the house account's setup

The account you use today (location `aUs7E5m1gmLXoeIV3WM9`, "Demo Account",
North Hollywood) is wired into the live app. If you delete its workflows,
these break for every customer right now:

| What breaks | Why |
|---|---|
| Every calculator on every contractor's site | They all post leads to two inbound webhooks in this account |
| Paying an invoice online | "Invoice Paid" here calls BuilderPro's payment-sync |
| A paid deposit creating the project | "Deposit Paid → Won" here calls project-create |
| The Calendar, Inbox, Contacts and dashboard numbers in the app | Hard-wired to this account's calendars and pipeline |

**Recommended:** don't clean this account out. Create a **new sub-account
called "BuilderPro OS"** for your own company (selling BuilderPro to
contractors) and build section 1 there.
- It starts empty, so there's nothing to delete.
- The demo account keeps working.
- Your own sales leads never get mixed up with test customers.

After the freeze, I'll move the calculators and the rest off the demo account.
Then it can be cleaned up or retired safely.

Things in the demo account you *can* delete now if you want them gone: old
test contacts, old manual campaigns, and any workflow whose name you don't
recognize from `ghl-build-log.md`. **Leave alone:**
- the two calculator webhook workflows
- Invoice Paid
- Deposit Paid / Won
- anything with "job-complete" in it

---

## 1. Workflows for your own company (in the new "BuilderPro OS" sub-account)

**Set up first, in the new sub-account:**
1. **Calendars → New → "BuilderPro demo"**: 20 minutes, Mon–Fri 9–5 your time, Zoom or phone.
2. **Opportunities → Pipelines → New → "BuilderPro customers"** with these
   stages: Demo booked · Trial · Paid · Past due · Cancelled. Send me the
   pipeline ID and the stage IDs.
3. **Settings → Private Integrations → new key** (contacts, tags,
   opportunities scopes). Then in BuilderPro: Command Center → Accounts → Add
   key. That lets the app put your signups into this account.

Once it's connected, the app will add the tags below. Each workflow below
starts from one tag. Every workflow that sends texts needs:
- **Settings:** Allow re-entry OFF; **Stop on response ON**.
- **Hours:** texts only go out 8am–8pm in the contact's time zone.

**W1. Demo request** (trigger: tag added `bp-demo-request`)
1. Wait 1 minute. SMS: "Hi {{contact.first_name}}, it's Narek from BuilderPro. Saw you wanted a look. Want me to walk you through it this week? Here's my calendar: {{custom_values.bp_demo_link}}"
2. Email: subject "Your BuilderPro walkthrough", the same text plus 3 bullets: answers calls and texts for you, estimates to paid in one place, your crew on their phones.
3. Wait 1 day; if no appointment booked: SMS "Still want that walkthrough? Takes 20 min."
4. Opportunity → BuilderPro customers → Demo booked (when they book).

**W2. Trial started** (trigger: tag `bp-trial-started`). One message per day,
stop if they reply:

| Day | Channel | Message |
|---|---|---|
| 0 | Email + SMS | Welcome + login link builderpro-os.com/app |
| 1 | SMS | "Quick win today: connect your business number so Lisa can answer calls and texts. Settings > Business number." |
| 2 | SMS | "Publish Lisa: tell her your services and prices, then tap Publish. Takes 10 minutes." |
| 3 | SMS | "Add your first project. Your customer gets their own project page automatically." |
| 5 | SMS | "Invite your crew so they can clock in from their phones. Settings > Team." |
| 7 | SMS | "Put BuilderPro on your phone: open builderpro-os.com/app and tap Add to Home Screen." |

Also add a task for yourself on day 3: "Call {{contact.first_name}}, see how setup is going."

**W3. Trial ending** (trigger: tag `bp-trial-ending`; the app adds it 3 days before)
- SMS: "Your BuilderPro trial ends in 3 days. You keep everything you've set up when it switches to paid. Questions? Just reply."
- Wait 2 days, SMS: "Last day of your trial tomorrow. Anything I can help with before then?"

**W4. Paid** (trigger: tag `bp-paid`)
- Opportunity → Paid. Email: thank you + support contact.
- Wait 30 days. SMS: "How's BuilderPro working for you? If it's helping, a quick Google review would mean a lot: {{custom_values.review_link}}. And if you know another contractor who'd like it, send them my way."

**W5. Payment failed** (trigger: tag `bp-payment-failed`)
- Day 0 email: "Your payment didn't go through", with the card update link builderpro-os.com/app.
- Day 3 SMS: "Hey {{contact.first_name}}, your BuilderPro card didn't go through. Update it here so nothing pauses: builderpro-os.com/app"
- Day 7: SMS again, plus a task for you: "Call about payment".
- Opportunity → Past due.

**W6. Cancelled** (trigger: tag `bp-cancelled`)
- Opportunity → Cancelled. Day 0 email: one-question survey ("What made you cancel?").
- Day 30 SMS: "Hey {{contact.first_name}}, we've added a lot since you left. Want a quick look?"
- Day 60: the same idea, then stop.

**W7. Not using it** (trigger: tag `bp-inactive-7d`)
- SMS: "Haven't seen you in BuilderPro this week. Want 15 minutes on a call to get it set up the way you work?" + {{custom_values.bp_demo_link}}.

I'll add the code that sets these tags once you send me the new sub-account's
ID and the pipeline and stage IDs.

---

## 2. Make Lisa sound like a person (do this in all 3 templates)

You'll do this three times: Foundation `pCL8sOwRPGo5ADh7S2wl`, OS
`e3hrfIp2KFkCb2c34qbI`, Enterprise `bjhV3CSImxxjN0HW23uJ`.

**First, in each template:** Settings → Custom Values → **add
`ridge_assistant_name` = Lisa**. Then replace the typed-in "Lisa" with
`{{custom_values.ridge_assistant_name}}` in workflow 01's first text.

### 2a. Texting (AI Agents → Conversation AI → Lisa)

Settings:
- Mode: Auto-Pilot (as now)
- **Response delay: on, 30–90 seconds** (random if offered)
- **Working hours:** answer 7am–9pm. Outside that, send one reply: "Thanks for texting! We'll get back to you first thing in the morning."
- Channels: SMS, Web chat, Facebook, Instagram

**Replace the prompt with this** (keep your existing knowledge-base / FAQ
attachments):

```
You're {{custom_values.ridge_assistant_name}}, and you answer texts for {{custom_values.business_name}}, a local {{custom_values.ridge_trade}} company in {{custom_values.ridge_service_area}}. You work with the owner, {{custom_values.ridge_owner_name}}.

Your job: help people quickly, find out what they need, and book a free inspection when it makes sense. You're not a salesperson. You're the friendly person at the front desk.

What you know:
Services: {{custom_values.ridge_services}}
Pricing guidance: {{custom_values.ridge_pricing}}
Hours: {{custom_values.ridge_hours}}
Things to never promise or discuss: {{custom_values.ridge_rules}}
Only use what's written here and in the knowledge base. If you don't know, say you'll check with {{custom_values.ridge_owner_name}} and get back to them. Never make up prices, dates, warranties or promises.

How you text:
- Short. 1 or 2 sentences, usually under 25 words. One question at a time, then wait.
- Casual and warm, like a real person texting from a phone. Use contractions (I'm, we'll, that's).
- No lists, no bullet points, no bold, no emojis unless they use them first.
- Never use dashes like — or –. Use a comma or a new sentence.
- Never start with "Great question", "Absolutely", "Certainly", "I'd be happy to", "Thank you for reaching out" or "I understand".
- Use their first name once in a while, not in every message.
- Don't repeat the company name over and over.
- Match them: if they text short, text short. If they're upset, say sorry first and slow down.
- It's fine to say "let me check" or "good question, one sec" like a person would.

How a conversation should go:
1. Find out what's going on (leak, replacement, estimate, repair) and roughly where they are.
2. Ask one or two useful questions (how old is the roof, is water coming in now, any photos?).
3. Offer the free inspection and book it on the calendar. Confirm the day, time and address back to them.
4. If it's an emergency (active leak, water inside, storm damage), say you'll get someone to call them right away and flag it for the owner.

If they ask whether you're a real person or a bot, be honest: you're the company's assistant, and you can have {{custom_values.ridge_owner_name}} call them. If they ask for a person, or they're angry, or it's a complaint, stop and hand it to the team.
```

(If any of these custom value names differ in your template, use the ones you
have; the app writes the `ridge_*` values when the contractor taps Publish.)

### 2b. Calls (AI Agents → Voice AI → "Lisa (calls)")

Settings:
- **Voice:** the most natural voice available. Try a few: a warm, slightly
  slower voice sounds less like a robot than a bright, fast one.
- **Speaking speed:** a little slower than default.
- **Interruptions / barge-in: ON**, so callers can cut in like with a person.
- **Background / ambient sound:** a light "office" sound if offered.
- **Max call length:** 10 minutes. Silence timeout: about 10 seconds, then "You still there?"
- **Call transfer:** to the owner's cell (`ridge_owner_cell`, or whatever
  your template calls it). **Not** to the business number. If the business
  number is the HighLevel number, transferring to it loops the call.
- **After the call:** turn on the call summary + transcript to the contact,
  and tag `voice-ai-call`.

Greeting:
```
Hi, thanks for calling {{custom_values.business_name}}, this is {{custom_values.ridge_assistant_name}}. How can I help?
```

Prompt: use the texting prompt above, plus:
```
On the phone:
- Keep each turn short, one or two sentences, then let them talk.
- Sound relaxed. It's fine to say "okay", "got it", "sure, one sec".
- Spell back phone numbers and addresses to confirm them.
- Don't read lists out loud. Give one or two options at a time ("I've got Tuesday at 10 or Wednesday at 2, which works better?").
- If they ask for the owner, or it's an emergency, transfer the call. If the transfer doesn't go through, take a message and promise a call back within the hour.
- Before hanging up, sum up what happens next in one sentence.
```

---

## 3. Calls when the owner is busy (this isn't set up anywhere today)

Right now nothing sends an unanswered call to Voice AI. A snapshot can't carry
phone routing either, so it's per client. Do it on your demo account first,
test it, then on each client when you onboard them.

What should happen:
1. A customer calls the business number.
2. It rings the owner's cell for about 20 seconds.
3. No answer or busy: Voice AI (Lisa) picks up and books, takes a message, or transfers.
4. The missed-call text (workflow 04) still goes out if they hang up before Lisa answers.

Where to set it (labels vary a little by HighLevel version):
- **Settings → Phone Numbers → (the number) → Edit → Inbound call settings:**
  - forward to the owner's cell, **ring timeout 20 seconds**
  - **when the call isn't answered: send to Voice AI agent "Lisa (calls)"**
  - If your version has no "send to Voice AI" option, build an **IVR**
    workflow instead: Inbound call → "Connect call" (owner's cell, 20s
    timeout) → if not answered → "Voice AI" step.
- **Turn on call recording** with the consent message ("This call may be recorded").
- **Voicemail:** keep it as the last fallback if Voice AI is off.

Then test each case:
- call and answer
- call and decline (busy)
- call and let it ring out
- call and hang up after 2 rings (you should get the missed-call text)
- call after hours

The app's Settings → Business number page says "Calls ring through to your
cell". That's only true once this is set.

Workflow 04 (missed-call text) waits until 8am for after-hours callers. If you
want a text at night too, change its sending window or add an after-hours
branch: "Sorry we missed you! We'll call you first thing in the morning. Want
to book a free inspection now? [the inspection booking link]"

---

## 4. New workflows to add to the templates

### Find a Pro (the app's directory)

The app now offers homeowners four ways to start on a contractor's listing.
Here's what each one sends into the contractor's HighLevel:

| On the listing | What lands in HighLevel | Workflow to build |
|---|---|---|
| **Ask for a quote** | Contact tagged `find-a-pro` + `quote-request`, with a note of the job. **Not** `new-lead`, so Lisa stays out of it. | **"Find a Pro: quote request"** (below) |
| **Talk now → chat** | Contact tagged `new-lead` + `find-a-pro` + `ai-chat` (Lisa is already talking to them) | Edit **02 Speed to Lead** (below) |
| **Book an inspection** | The appointment on their calendar, tag `booking-page` | Already covered by **05** |
| **Instant estimate** | Calculator lead | Covered by **02a/02** after my calculator fix |
| **Text / Call** | Normal inbound text / call to their number | Conversation AI / section 3 |

**"Find a Pro: quote request"** (all plans; trigger: tag added `quote-request`)
1. Create / update opportunity → Jobs pipeline → New Lead, source "Find a Pro".
2. Internal notification SMS + email to the owner: "New quote request from
   BuilderPro Find a Pro: {{contact.name}}, {{contact.phone}}. Reply to them
   from your inbox." Include the latest note.
3. Create a task: "Reply to {{contact.first_name}}'s quote request", due in 2 hours.
4. SMS to the homeowner (from the business, not the AI): "Hi
   {{contact.first_name}}, this is {{custom_values.business_name}}. Got your
   quote request, {{custom_values.ridge_owner_name}} will text you shortly."
5. Wait 4 hours. If there's no outbound message yet, notify the owner again: "Still
   waiting on a reply: {{contact.name}}".
6. Wait 2 days. If there's still no reply from the business and no appointment, add
   tag `new-lead` (hands it to Lisa so the lead doesn't go cold).

**Edit 02 Speed to Lead:** add an If/Else at the top: **if the contact has tag
`ai-chat`**, skip the opener text and `bot-active`. Just create the
opportunity. Otherwise someone who's already chatting with Lisa gets a second
"Hi, this is Lisa" text.

### Fixes the audit found in the existing workflows

| Workflow | Problem | Fix |
|---|---|---|
| 03a / 03b / 03c (Repair / Replacement / Storm) | Only tag the contact. A lead who only texts Lisa never gets an opportunity. | Add "Create/update opportunity → New Lead" to each |
| 03d Question | Nothing ever adds `intent-question`, so it never runs | Delete it |
| 11 Review Request (OS+) | The 1–3 star branch never adds `review-feedback`, so the owner alert in 21 never fires | Add tag `review-feedback` in that branch |
| 22 Priority Support | Nothing adds `priority-support` | Delete it, or keep it for manual use |
| 13 New contact auto-reply | Email only | Fine. Lisa covers texts. |
| 35 / 36 (Enterprise) | Built with Stop on response OFF on purpose. The app says ON. | Leave as built. I'll fix the app. |
| Enterprise Owner Phone custom value | Your real cell, ships to every Enterprise client | Clear it |

### Also worth adding (all plans unless noted)

- **"New lead went quiet" (OS+):** opportunity in New Lead for 48 hours with no
  reply → task for the owner + one friendly text.
- **"Lisa handoff":** when Lisa tags `needs-human` (add it as an action in Conversation AI: "customer asks for a person / complaint / emergency") → SMS to the owner right away with the conversation link. Today there's no handover at all.
- **Two-way confirm on appointment reminders (05):** "Reply C to confirm, R to reschedule". On R, send the reschedule link.
- **Home anniversary (Enterprise):** 1 year after `job-complete` → check-in + referral ask.

Then re-take all three snapshots and send me any new IDs.

---

## 5. What the app shows vs. what's in HighLevel

I checked the in-app Automations page against what was actually built.

**Correct:**
- the counts per plan (Foundation 20, OS 36, Enterprise 49)
- missed-call text-back is on every plan, Foundation included

**Wrong or confusing (I'll fix these in the app):**
- Every workflow says "Live", even ones that can't fire. The footer says
  "nothing to set up", but the phone number, Lisa going live, and the
  HighLevel key are all manual.
- A few details don't match what was built:
  - 34 is missing its 14-day "call about payment" task
  - 44 / 47 / 48 / 52 don't mention the text to the owner
  - 46 doesn't mention the email to the sub
  - 35 / 36 show "stop on response" ON, but they were built OFF
- 51 "Domino Reschedule" runs inside BuilderPro, not HighLevel, but is listed like a HighLevel workflow.
- Codes like 02a / 03b / 19b, and the same word meaning two things
  ("Inspection" = sales visit and permit inspection; "No-show" = customer and
  crew), make it hard to follow.

**Plan:** group the page by what the customer experiences:
1. New lead → booked
2. Missed calls & texts
3. Visit reminders
4. Estimate → deposit
5. Job updates
6. Getting paid
7. Reviews & repeat work
8. Heads-ups to you

Each card gets a plain name, the HighLevel workflow numbers in small grey
text, and a real status ("needs a phone number", "Lisa not live yet").

---

## 6. What I'm fixing in code (no HighLevel needed, works after the freeze)

1. Calculators send leads to each contractor's own HighLevel (today: your demo account).
2. Angi / Thumbtack / email leads go to the contractor's own HighLevel.
3. Lisa's Publish button stops writing to your demo account and stops overwriting the contractor's account ID.
4. Scheduled texts locked to each account.
5. Signups pick the right template for their plan on retry.
6. Lisa's name syncs to `ridge_assistant_name`.
7. Your company's signups / trials / payments / cancellations tagged into the new BuilderPro OS sub-account (section 1).
8. The Automations page rewrite (section 5).
9. "Mark job done" sends the next service date, so maintenance reminders (19) can fire.

Already done today: Find a Pro's four options. The website and Find a Pro
chat now write like a person (short, no dashes, no canned openers, honest if
asked whether it's a bot). It also no longer creates duplicate contacts.
