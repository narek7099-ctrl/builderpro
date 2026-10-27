# Make the BuilderPro Marketplace app (Claude Code + Chrome on the owner's PC)

**Why we need it:** BuilderPro's agency key can create sub-accounts, but it can't work inside them. HighLevel doesn't offer that permission to agency keys. A **private Marketplace app** installed on the agency can. Once it's installed, every new sub-account gets its Business Name, Phone, Trade, hours and the other custom values filled in automatically, and AZ Test Roofing (sample) gets fixed by itself within 5 minutes.

**What the cloud session already did:** the `ghl_oauth` table, the `ghl-oauth` function (it receives the install), and the watcher (it fills AZ Test once the app works). There's no code to write here.

## Rules
- Use the owner's Chrome. They're signed in to HighLevel.
- **Never copy, show, type or log the Client Secret.** The owner puts it into Supabase themselves. The **Client ID** isn't secret, so you may log it.
- No money: if any step asks for payment or a paid plan, stop and tell the owner.
- Don't touch the Demo Account or real clients.
- Log each step in `ghl-build-log.md` under "Marketplace app", then commit and push to `claude/web-os-dashboard-design-ijwlrd`.

## Step 1: create the app
1. Open **https://marketplace.gohighlevel.com** and sign in with the agency login (the owner's HighLevel). If it asks for a developer account, use **"Sign in with HighLevel"** / the agency account.
2. **My Apps → Create App**:
   - **Name:** BuilderPro Connect
   - **App type:** **Private** (only this agency can install it). Not Public.
   - **Target user / distribution:** **Sub-account**, installable by the **Agency**. If it offers "Agency and Sub-account", pick that. If there's an option to install on all sub-accounts or on future sub-accounts automatically, turn it on.
   - Log which options it offered and what you picked.
3. **Advanced Settings → Auth**:
   - **Redirect URL:** `https://ttzwzouhiwdwamuimhpo.supabase.co/functions/v1/ghl-oauth`
   - **Scopes:** add every one of these that exists:
     - `oauth.readonly`, `oauth.write` (these matter most)
     - `locations.readonly`, `locations.write`
     - `locations/customValues.readonly`, `locations/customValues.write`
     - `locations/customFields.readonly`, `locations/customFields.write`
     - `locations/tags.readonly`, `locations/tags.write`
     - `contacts.readonly`, `contacts.write`
     - `opportunities.readonly`, `opportunities.write`
     - `calendars.readonly`, `calendars.write`, `calendars/events.readonly`, `calendars/events.write`
     - `conversations.readonly`, `conversations.write`, `conversations/message.readonly`, `conversations/message.write`
     - `users.readonly`, `users.write`
     - `workflows.readonly`
     - `snapshots.readonly`
     - `companies.readonly`
     - `invoices.readonly`, `invoices.write`, `invoices/estimate.readonly`, `invoices/estimate.write`
     - `products.readonly`, `products.write`
     
     If one isn't in the list, skip it and log which ones were missing.
4. **Client Keys → Add**: create one client key. HighLevel shows a **Client ID** and a **Client Secret**. Don't copy or read out the secret. Leave the page open for the owner.
5. Save the app.

## Step 2: the owner's turn (stop and wait here)
Tell the owner, in plain words:
> Your turn, about 2 minutes:
> 1. Open Supabase → your project → **Edge Functions → Secrets** (https://supabase.com/dashboard/project/ttzwzouhiwdwamuimhpo/functions/secrets).
> 2. Add a secret **GHL_CLIENT_ID**: copy the Client ID from the HighLevel app page.
> 3. Add a secret **GHL_CLIENT_SECRET**: copy the Client Secret from the same page.
> 4. Save, then tell me "done".

Wait for "done" before Step 3. The install only works once both secrets are in.

## Step 3: install it on the agency
1. On the app page, find the **install / authorization link** (often under "Share" or "Install link"), or use **Test the app**. Open it.
2. Choose the **agency** and, if it asks, **all sub-accounts** (including future ones if offered). Allow.
3. HighLevel sends you to the BuilderPro page. **"Connected! ✅"** means it worked. If it shows "Authorize failed" or "Not configured", copy that page's message into the log word for word (it never contains the secret), and tell the owner.

## Step 4: check it worked (wait 5–10 minutes)
1. Open **AZ Test Roofing (sample)** → **Settings → Custom Values**. These should now be filled in:

   | Custom value | Expected |
   |---|---|
   | Business Name | AZ Test Roofing (sample) |
   | Business Phone | (512) 555-0177 |
   | Trade | Roofing |
   | Owner Name | AZ Two Owner |
   | Service Area | Austin, Round Rock |
   | Business Hours | Mon 08:00-17:00 … Sun closed |

2. If they're still blank after 15 minutes, log "app installed but custom values still blank" and tell the owner. The cloud session will check the watcher's message.
3. Log pass or fail, commit and push, and give the owner a short summary:
   - did it install?
   - are AZ Test's custom values filled?
   - anything that needs them?
