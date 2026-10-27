# HighLevel Pro day: everything to get done before midnight (Claude Code + Chrome on the owner's PC)

The owner moved HighLevel to the **Agency Pro ($497)** plan for one day, because only Agency Pro lets BuilderPro create sub-accounts automatically. **The owner is away, so work on your own from start to finish.** Don't wait for answers. If something needs the owner (a purchase, a password, a decision), write it under "Needs the owner" in the log and move on to the next part.

Read these first: `docs/GHL-BUILD-GUIDE.md` (section 1), `ghl-build-log.md` (what's already built) and `GHL-BUILD-SPEC.md` (ground rules). Log everything you do in `ghl-build-log.md` under a new heading "Pro day 2026-10-27", and commit and push to `claude/web-os-dashboard-design-ijwlrd` after each part.

## What the cloud session already did (you don't need to do it)
- **Automatic creation is on.** Command Center onboarding retries the AZ Test account (narek7099+az2@gmail.com) by itself: it builds a sub-account from the Enterprise snapshot.
- **The ready pool is filling by itself.** These are blank sub-accounts named "BuilderPro pool · Enterprise 1", "BuilderPro pool · OS 1" and so on, about 5 at a time every 5 minutes, up to 5 for each plan. After the downgrade, new sign-ups take one from the pool.
- **Your own customers get tagged automatically.** The house sub-account is **BuilderPro OS** (`edV5mRAXJyhzTp6PthaS`). When an account's status changes, BuilderPro adds the tag there and moves the contact's card in the **"BuilderPro customers"** pipeline:

  | Status change | Tag | Pipeline stage |
  |---|---|---|
  | trial started | `bp-trial-started` | Trial |
  | 3 days left in the trial | `bp-trial-ending` | Trial |
  | paid | `bp-paid` | Paid |
  | payment failed | `bp-payment-failed` | Past due |
  | cancelled | `bp-cancelled` | Cancelled |

  The pipeline is found by name, so **no IDs need to be sent to anyone**.
- **A watcher finishes the setup.** It runs every 5 minutes and completes anything that was blocked, as soon as Part 0 is done.

## Ground rules
- Only touch: the three templates, the **BuilderPro OS** house sub-account, the "BuilderPro pool ·" sub-accounts, and the AZ Test sub-account. Never change the **Demo Account** or real clients.
- **Never message real people.** The only test contact is "Narek Test" with the owner's email (narek7099@gmail.com) and **no phone number**, so nothing gets texted. Read execution logs instead.
- **No money:** don't buy phone numbers, don't touch billing, plans or wallet, and don't turn on paid add-ons.
- No AI chats.
- **Never copy, show or type any key or password.** Don't open key values, don't paste them anywhere, and don't make new keys. If a step would need a key, skip it and log it.
- Keep the Chrome window visible (HighLevel pauses background tabs).

## Part 0: give the agency key one more permission (do this first)
Right now BuilderPro can create sub-accounts, but HighLevel won't let it work inside them. The check said: "The token is not authorized for this scope". Without this fix, new sub-accounts come out with blank business details.
1. In HighLevel, switch to the **agency** view (Agency Settings, not a sub-account), then go to **Settings → Private Integrations**.
2. Open the existing integration that BuilderPro uses. It's probably the only one, or the one named BuilderPro. Choose **Edit** (or the scopes / permissions option).
   - **Don't create a new integration, and don't delete or rotate this one.** Either would change the key, and the owner can't update Supabase today.
3. Keep every scope that's already ticked, and add these:
   - **OAuth / location tokens:** `oauth.readonly` and `oauth.write`. These are the important ones.
   - locations, locations/customValues and locations/customFields (read + write)
   - calendars and calendars/events (read + write)
   - contacts (read + write)
   - opportunities (read + write)
   - users (read + write)
   - snapshots (read)
   - workflows (read)
   
   Save.
4. If editing would show a new key or warn that the key will change, **cancel**, and log "Part 0 needs the owner: the agency key needs the OAuth scopes".
5. Within 10 minutes the watcher confirms it. You can see this in the BuilderPro OS sub-account under Contacts: a contact for narek7099+az2@gmail.com shows up with the tags `bp-cancelled`, `bp-customer` and `bp-plan-enterprise`. That's the automatic tagging test. Log whether it appeared and when.

## Part 1: check the automatic build (Agency Pro)
1. In HighLevel's agency view → Sub-Accounts, find **AZ Test Roofing (sample)**. It should appear within about 10 minutes of starting; log the time you see it.
2. Open it and check (look, don't change):
   - **Business profile:** the name, email and address match the sign-up.
   - **Custom values:** Business Name, Business Phone, Service Area, Business Hours, Trade and Owner Name are filled in, not placeholders. Before Part 0 is done they'll be blank; the watcher fills them within 10 minutes after.
   - **Calendars:** there's an Inspection calendar.
   - **Automation → Workflows:** the Enterprise workflows are there (01–52, S1–S5) and match the Enterprise template.
   - **Settings → Team:** there's a user for narek7099+az2@gmail.com.
3. Log pass or fail for each line. If the sub-account never appears, log it under "Needs the owner".

## Part 2: check the ready pool (Agency Pro)
1. In the agency view, sub-accounts named **"BuilderPro pool · …"** should keep appearing, up to 5 each of Foundation, OS and Enterprise.
2. Spot-check one of each: it has the workflows from its plan's template.
3. Log how many of each exist by the end of the day. If they stop growing, log it.

## Part 3: workflows for BuilderPro's own customers (in BuilderPro OS `edV5mRAXJyhzTp6PthaS`)
Build these in **BuilderPro OS**, exactly as written in `docs/GHL-BUILD-GUIDE.md` section 1. Skip the Private Integration step in that section; it isn't needed anymore.
1. Calendar **"BuilderPro demo"**: 20 minutes, Mon–Fri 9–5.
2. Pipeline **"BuilderPro customers"** with exactly these stage names: Demo booked, Trial, Paid, Past due, Cancelled. The app looks for these names, so spell them exactly.
3. Custom values:
   - `bp_demo_link`: the BuilderPro demo calendar's booking link
   - `review_link`: leave it empty if there's no Google review link, and log it
4. Workflows W1 Demo request, W2 Trial started, W3 Trial ending, W4 Paid, W5 Payment failed, W6 Cancelled and W7 Not using it. Each starts from its tag. For every workflow that texts:
   - Allow re-entry OFF
   - **Stop on response ON**
   - texts only 8am–8pm
   
   Publish each one.
5. Test each one:
   - Use the contact "Narek Test" (email narek7099@gmail.com, **no phone**). Create it if it doesn't exist.
   - Add the workflow's tag by hand, then open the workflow's **Execution logs**.
   - Email steps should show Executed. SMS steps should show Skipped or Failed with "no phone". Waits should show waiting.
   - Then remove the tag and remove the contact from the workflow.
6. Log pass or fail for each workflow.

## Part 4: test the contractor workflows (in AZ Test Roofing (sample))
This is a real Enterprise build.
1. Create a contact "Narek Test" with only narek7099@gmail.com (no phone).
2. Trigger each workflow below and read its execution log:
   - **02 Speed to lead:** add the tag `new-lead`.
   - **05 Appointment reminders:** book an Inspection for tomorrow at 10am on that contact.
   - **Review request:** add the tag `bp-job-completed`.
   - **S1–S5 (missed call):** open them and check the trigger and the steps only. There's no phone number, so they can't fire.
3. For each one, log Executed, Skipped or Failed, and the reason. Failures that come from having no phone number are expected; see Part 5.
4. Clean up: cancel the appointment, delete the opportunity if one was made, remove the tags and delete the "Narek Test" contact in AZ Test.

## Part 5: the phone number question (explain it, don't change anything)
Each client needs their own phone number in their sub-account before:
- Lisa can text or call,
- missed-call text-back works,
- reminder texts go out.

Don't buy anything. Look up the real prices in the agency's own pages: **Settings → Phone System / LC Phone pricing** and **Wallet & billing → rates**. Then write a short explainer in the log:
- **What a number costs:** the monthly fee per number, and the price per text and per call minute.
- **US texting registration (A2P 10DLC):** each business has to register before it can text. Write down:
  - the one-time brand fee,
  - the one-time campaign fee,
  - the monthly campaign fee,
  - how long approval takes (usually days to 2 weeks).
- **The options for each client:**
  - **A:** buy a new local number in their sub-account. Simplest.
  - **B:** keep their existing number and forward its calls to the new one.
  - **C:** move ("port") their existing number into HighLevel. Slowest.
- **Who pays:** check whether rebilling of phone and texting costs (Settings → SaaS / Rebilling) is still available on the $297 Unlimited plan, or only on Agency Pro.
- **A recommendation:** the cloud session suggests A + rebilling. Say whether the prices support that.

## Part 6: before you finish
1. Put a summary at the top of the Pro-day section in `ghl-build-log.md`:
   - Parts 0–5, pass or fail
   - how many pool accounts there are of each plan
   - "Needs the owner" items
   - the phone explainer
2. Commit and push.
3. End with a plain-words message to the owner (below).

## The message to leave for the owner
- Whether automatic creation worked, and whether the pool is ready (the counts).
- **At midnight: downgrade to the $297 Unlimited plan; don't "pause" the agency account.** In HighLevel, pausing can stop every sub-account (workflows, phones, AI) until it's resumed. Downgrading only removes Pro features, like creating sub-accounts automatically.
- Check Settings → Billing for what was charged for the upgrade. Upgrades are usually charged right away, and downgrading may not refund it.
- After the downgrade, sign-ups use the pool. The Command Center's **Ready pool** card shows how many are left and warns when it's low. To refill: another Pro day, or make a sub-account by hand and use **Add key**.
