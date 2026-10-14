# Brief for the browser agent: build BuilderPro's HighLevel setup

You're working in HighLevel (app.gohighlevel.com) in Chrome, signed in as
the agency owner. The full instructions are in **docs/GHL-BUILD-GUIDE.md**
(same folder). This brief tells you **what to do, in what order, what not to
touch, and what to report back.** If the two disagree, this brief wins.

Work **one phase at a time.** Stop at the end of each phase and give the user
the report for that phase before you start the next.

---

## Fill-ins (ask the user for any that are blank before Phase 2)

| Item | Value |
|---|---|
| Name used in BuilderPro's own texts | Narek |
| BuilderPro support email | support@builderpro-os.com |
| Demo meeting type (Zoom / phone) | _ask_ |
| Your time zone | America/Los_Angeles |
| BuilderPro Google review link | _ask (leave the review step out if none)_ |
| A phone number for test texts (the user's own) | _ask_ |

## Accounts you'll work in

| Account | ID | What you do there |
|---|---|---|
| Demo / house account ("Demo Account", North Hollywood) | `aUs7E5m1gmLXoeIV3WM9` | **Read only**, except Phase 4's optional Voice AI test |
| Template: Foundation | `pCL8sOwRPGo5ADh7S2wl` | Phase 3 edits |
| Template: OS | `e3hrfIp2KFkCb2c34qbI` | Phase 3 edits |
| Template: Enterprise | `bjhV3CSImxxjN0HW23uJ` | Phase 3 edits |
| **New:** BuilderPro OS | _created in Phase 2_ | Phase 2 build |

Snapshots: Foundation `m8xaXFkznoQZLjySnFlZ`, OS `cdRGIx2azgolhnDj257c`,
Enterprise `cWoCOr2RJDfc3x3FxnQm`.

---

## Hard rules

1. **Never spend money.** Stop and ask before anything that shows a price or
   charge:
   - buying or porting a phone number
   - upgrading the plan or any add-on
   - buying credits (LC Phone, LC Email, AI)
   - a sub-account that shows a fee
2. **Don't delete, archive, edit or unpublish anything in the demo account**
   (`aUs7E5m1gmLXoeIV3WM9`). The live app depends on its workflows,
   webhooks, calendars and pipeline.
3. **Don't touch real client sub-accounts.** Only the three templates and the
   new BuilderPro OS account.
4. **Don't message real people.** Test only with a test contact that uses the
   user's own test phone number and email. Name it "BP Agent Test".
5. **Don't change** Stripe or payments, the agency's SaaS/rebilling settings,
   the domains or email sending settings, or any user's login or permissions.
6. **Don't delete anything in the templates** except workflow **03d Question**,
   and only if it's unpublished or draft. If it's published, set it to Draft
   instead and report it.
7. **When a menu or setting isn't where the guide says** (HighLevel moves
   things), look for the closest equivalent. If there isn't one, skip it and
   list it in your report. Don't invent a workaround that breaks a rule above.
8. **Message wording:**
   - Use HighLevel's real merge fields: `{{contact.first_name}}`, etc.
   - The guide's `{{calendar.link}}` is not a real field. Use the calendar's
     actual share link, or create a custom value `bp_demo_link` holding it and
     use `{{custom_values.bp_demo_link}}`.
   - In the templates, check the real names of the `ridge_*` custom values first
     (Phase 1). Use those names in the prompts.
   - No dashes like "—" or "–" in any customer-facing message.
9. **Every workflow you build that texts customers needs:**
   - Stop on response ON
   - Allow re-entry OFF
   - a send window of 8am–8pm in the contact's time zone

   Save it as **Draft** first, test it (rule 4), then **Publish**.

---

## Phase 1: look, don't change (report only)

1. List all sub-accounts. Confirm the three templates and the demo account above exist.
2. In each template, list:
   - all workflows (name, published or draft)
   - all custom values whose names start with `ridge_`, plus `business_name`, `business_phone` and the owner's name / phone fields
   - the Conversation AI agent's name and current settings: mode, channels, reply delay, working hours
   - the Voice AI agent's name, voice, and transfer settings
3. In the Enterprise template, check the owner phone custom value. If it is
   `+1 818-453-1111`, report it (you'll clear it in Phase 3).
4. Check whether the agency plan can add one more sub-account at no charge.

**Report:**
- the lists above
- which `ridge_*` names exist
- whether a free sub-account is available

## Phase 2: BuilderPro OS sub-account (guide section 1)

1. Create the sub-account "BuilderPro OS" (only if Phase 1 found it's free;
   otherwise stop and ask). Time zone America/Los_Angeles, no snapshot.
2. Create:
   - the calendar "BuilderPro demo" (20 min, Mon–Fri 9–5)
   - the pipeline "BuilderPro customers" with stages: Demo booked, Trial, Paid, Past due, Cancelled
   - custom values `bp_demo_link` (the calendar's link) and `review_link` (if the user gave one)
3. Build workflows W1–W7 exactly as in guide section 1, each triggered by its
   `bp-*` tag. Draft → test with "BP Agent Test" (add the tag by hand, check
   the first message arrives) → publish.
4. Create a Private Integration key (Settings → Private Integrations) with
   these scopes: contacts, tags, opportunities, conversations. **Don't paste
   the key into chat.** Tell the user it's ready. They'll add it in BuilderPro
   themselves.

**Report:**
- the new sub-account's location ID
- the calendar ID
- the pipeline ID and each stage ID
- the workflow names and whether each is published
- anything you skipped

## Phase 3: the three templates (guide sections 2 and 4)

Do Foundation completely, then report. Do OS and Enterprise only after the
user says Foundation looks right.

For each template:
1. **Custom value:** add `ridge_assistant_name` = Lisa. In workflow 01's first
   text, replace the typed-in "Lisa" with `{{custom_values.ridge_assistant_name}}`.
2. **Conversation AI ("Lisa"), section 2a:**
   - reply delay 30–90 seconds
   - working hours 7am–9pm, with the after-hours reply
   - replace the prompt with the 2a prompt, using the real custom value names from Phase 1
   - keep the existing knowledge base and actions
3. **Voice AI ("Lisa (calls)"), section 2b:**
   - the most natural voice, slightly slower
   - interruptions on
   - greeting and prompt from 2b
   - transfer to the owner's cell custom value, **not** `business_phone`
   - post-call summary on
4. **New workflow "Find a Pro: quote request"** (section 4), trigger: tag `quote-request`.
5. **Edit 02 Speed to Lead:** add the If/Else at the top. If the contact has tag
   `ai-chat`, create the opportunity only: no opener text, no `bot-active`.
6. **Existing-workflow fixes** from the section 4 table:
   - 03a/03b/03c: add "create/update opportunity → New Lead"
   - 03d: draft or delete per rule 6
   - 11 (OS and Enterprise only): add tag `review-feedback` in the 1–3 star branch
   - **Enterprise only:** clear the owner phone custom value if it's the user's real number (Phase 1)
7. **"No lead left behind" S1 to S5** (section 4). These are required, not optional, on every plan. Build each as Draft, test it with "BP Agent Test", then publish.
8. Optional, if time allows: the "Also worth adding" workflows in section 4.
   Each one as Draft. Report them; don't publish without the user's OK.

If you run short of time, do them in this order: items 4, 7 (S1, S2, S3), 5, 2, 3, 6, then the rest.

**Report per template:**
- what changed
- the Conversation AI and Voice AI settings that weren't available
- the new workflow names

## Phase 4: snapshots

Only after the user approves Phase 3 for all three templates:
1. For each template, **refresh** its existing snapshot (keeps the same
   snapshot ID). If refresh isn't possible, create a new snapshot named
   "BuilderPro <Plan> <date>".
2. Don't push snapshot updates to existing sub-accounts.

**Report:** each snapshot's ID (same or new).

## Not for you (the user and the developer do these)

- **Phone routing for busy and unanswered calls (guide section 3).** It needs a
  real number and live test calls from the user's phone. You can list the
  settings you find on the demo account's number, but don't change them.
- **Code changes (guide section 6).**
- **Adding the Private Integration key to BuilderPro.**

---

## Final report format

```
PHASE n DONE
Created: ...
Changed: ...
Skipped (and why): ...
IDs:
  BuilderPro OS location: ...
  Demo calendar: ...
  Pipeline: ...   stages: Demo booked=..., Trial=..., Paid=..., Past due=..., Cancelled=...
  Snapshots: Foundation=..., OS=..., Enterprise=...
Needs the user: ...
```
