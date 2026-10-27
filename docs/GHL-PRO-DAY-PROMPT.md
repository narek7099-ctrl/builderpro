# HighLevel Pro day: everything to get done before midnight (Claude Code + Chrome on the owner's PC)

The owner moved HighLevel to the **Agency Pro ($497)** plan for one day. Agency Pro is what lets BuilderPro create sub-accounts automatically. Before midnight the owner switches back to the cheaper plan, so **anything that needs Agency Pro gets done first**. Workflows don't need Pro; they can be finished later if time runs out.

Read these first: `docs/GHL-BUILD-GUIDE.md` (sections 1 and 4), `docs/highlevel-workflows.md`, `ghl-build-log.md` (what's already built) and `GHL-BUILD-SPEC.md` (ground rules). Log everything you do in `ghl-build-log.md` and commit and push to `claude/web-os-dashboard-design-ijwlrd` as you go.

## Ground rules
- Only touch: the three templates (`BP Foundation Template` pCL8sOwRPGo5ADh7S2wl, `BP OS Template` e3hrfIp2KFkCb2c34qbI, `BP Enterprise Template` bjhV3CSImxxjN0HW23uJ), the **BuilderPro OS house sub-account**, and sub-accounts created today for the test accounts. Never change real client accounts or the demo account.
- **Never message real people.** Test contacts use the owner's own phone and email, or no phone at all; then read the execution logs.
- **No money:** don't buy phone numbers, don't change billing, don't turn on paid add-ons. If something needs a purchase, stop and ask.
- No AI chats (Anthropic credit is empty).
- Never write passwords or keys in the chat, the report or the repo. Keys go into the Command Center or Supabase only.
- Keep the Chrome window visible (HighLevel pauses background tabs).

## Part 1: automatic sub-account creation (needs Pro, do first)
The cloud session resets the AZ Test account (narek7099+az2@gmail.com) so the Command Center's onboarding retries its HighLevel build; it runs within a few minutes. If it hasn't happened yet, ask the owner to press **Retry setup** on the AZ Test row in Command Center → Accounts.
1. Command Center → Accounts → AZ Test Roofing (sample): the Setup column should turn **Provisioned**. Hover it for the setup log: "GHL sub-account created from the enterprise snapshot", "Business details filled in", "AI receptionist set up", "GHL login created".
2. In HighLevel, open the new **AZ Test Roofing (sample)** sub-account. Look only, and check:
   - Settings → Business profile: name, phone, email and address match the sign-up.
   - Settings → Custom values: Business Name, Business Phone, Service Area, Business Hours, Trade, Owner Name and `ridge_assistant_name` are filled in, not placeholders.
   - Calendars: the Inspection calendar exists.
   - Automation → Workflows: the Enterprise workflows are there (01–52, S1–S5), with the same names and status as the Enterprise template.
   - Settings → Team: a user for narek7099+az2@gmail.com.
3. Note anything missing. If the build failed, copy the exact error from the setup log and tell the owner right away; the cloud session fixes it while you carry on.

## Part 2: a ready pool of sub-accounts (needs Pro)
After tonight, HighLevel won't let BuilderPro create sub-accounts again. So today BuilderPro makes a stock of blank sub-accounts while it can, and new sign-ups take one from that stock later. The cloud session builds the code for this; you check it.
1. When the cloud session says the pool is ready, the owner presses **Fill pool** in Command Center → Accounts (default: 5 Foundation, 5 OS, 5 Enterprise).
2. Check in HighLevel that they exist (named "BuilderPro pool · Enterprise 1" and so on) and were built from the right snapshot (spot-check one of each: the workflows are there).
3. In the Command Center, the **Ready pool** card shows the counts.
4. If any pool account failed, note the error.

## Part 3: workflows for BuilderPro's own customers (not Pro-dependent)
Build **W1–W7** from `docs/GHL-BUILD-GUIDE.md` section 1 in the **BuilderPro OS house sub-account**, exactly as written there:
- "BuilderPro demo" calendar
- "BuilderPro customers" pipeline (stages: Demo booked, Trial, Paid, Past due, Cancelled)
- the custom values `bp_demo_link` and `review_link`
- W1 Demo request, W2 Trial started, W3 Trial ending, W4 Paid, W5 Payment failed, W6 Cancelled, W7 Not using it

Every texting workflow: re-entry off, **stop on response on**, texts only 8am–8pm in the contact's time zone. Publish each one.

Then:
1. Make a Private Integration key in that sub-account (scopes: contacts, tags, opportunities, conversations). The owner adds it in Command Center → Accounts → **House account** (the cloud session adds that field).
2. Tell the cloud session the house sub-account's **Location ID**, the **pipeline ID** and the **five stage IDs**. IDs are fine to share; keys are not. The cloud session wires sign-ups, trials, payments and cancellations to add these tags.
3. Test each workflow on a test contact named "Narek Test" (the owner's own email; phone only if the owner says so): add the tag by hand, then read the execution log. Every step should show Executed, or Skipped for a reason you can explain (no phone, quiet hours).

## Part 4: test the contractor workflows on a real sub-account (not Pro-dependent)
Use the AZ Test sub-account from Part 1. It's a real Enterprise build. Create a contact "Narek Test" with only the owner's email (no phone, so nothing texts), then trigger and read the execution logs for:
- 02 Speed to lead (tag `new-lead`)
- 05 Appointment reminders (book an Inspection for tomorrow on that contact)
- the estimate follow-up, by sending a sample estimate from the AZ Test portal to that contact's email
- `bp-job-completed` → review request (mark a sample job done in the AZ Test portal)
- S1–S5 (missed call: just check the trigger and steps, since there's no number)

For each one, note Executed, Skipped or Failed, and why. Anything that fails because there's no phone number is expected (see Part 5). Clean up after: delete the test contact's appointments and opportunities, and void the sample estimate and job.

## Part 5: the phone number question (explain to the owner, change nothing)
Each client needs their own phone number in their sub-account before Lisa can text or call, missed-call text-back works, or appointment-reminder texts go out. Help the owner decide; don't buy anything. Explain with HighLevel's current prices from the owner's own billing pages, not from memory:
- **What a number costs:** HighLevel Phone (LC Phone) charges a monthly fee per number, plus per text and per call minute, billed to the agency wallet.
- **Texting rules (US):** sending texts needs A2P 10DLC registration per business: a one-time brand and campaign fee, then a small monthly fee. Approval takes days to a couple of weeks, so start it the day a client signs up.
- **The options per client:**
  - **A:** buy a new local number in their sub-account (simplest).
  - **B:** keep their existing business number and forward its calls to the new number (no porting).
  - **C:** port their existing number into HighLevel (slowest, but one number for everything).
- **Who pays:** use HighLevel's rebilling (Agency Pro / SaaS feature: check what stays on the cheaper plan), or include it in the plan price.

Write the owner's decision in the log. If they choose a setup, the cloud session adds a "Phone number" step to the Command Center checklist.

## Part 6: before midnight
1. Command Center: AZ Test is **Provisioned** and the pool counts are right.
2. Report in `ghl-build-log.md`: what passed, what failed, the IDs from Part 3 (no keys) and the phone decision. Commit and push.
3. Remind the owner what's below, in plain words.

## Switching the plan back (owner)
- **Downgrade to the Unlimited ($297) plan; don't "pause" the agency account.** In HighLevel, pausing can stop every sub-account (workflows, phones, AI) until it's resumed. Downgrading only removes Pro features like automatic sub-account creation.
- Check Settings → Billing for what was already charged today. Upgrades are usually charged right away (prorated), and downgrading may not refund it.
- After the downgrade, sign-ups take accounts from the pool. When the pool runs low, the Command Center says so; refill it on a future Pro day, or create sub-accounts by hand and use Add key.
