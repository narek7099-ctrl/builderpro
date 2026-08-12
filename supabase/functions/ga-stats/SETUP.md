# Connect real Google Analytics to the BuilderPro dashboard

The dashboard's **My Website** view is already wired to read live GA data from an
edge function called `ga-stats`. Until that function is deployed with a Google
service account, the tiles show "—" and a "not connected yet" note. Follow these
one‑time steps to turn on real numbers.

Your GA4 tracking ID is already installed on the site: **G-QM37G969Z0**.

## 1. Create a Google service account (Google Cloud)
1. Go to https://console.cloud.google.com and pick (or create) a project.
2. **APIs & Services → Enabled APIs & services → + Enable APIs** → search
   **"Google Analytics Data API"** → **Enable**.
3. **IAM & Admin → Service Accounts → + Create service account**
   - Name: `builderpro-ga` → **Create and continue** → **Done** (no roles needed).
4. Open the new service account → **Keys → Add key → Create new key → JSON** →
   download the file. Inside it you'll use two values:
   - `client_email`  (looks like `builderpro-ga@<project>.iam.gserviceaccount.com`)
   - `private_key`   (a `-----BEGIN PRIVATE KEY-----` … block)

## 2. Give the service account access to your GA property
1. In https://analytics.google.com → **Admin** (bottom‑left gear).
2. Under the **Property** column → **Property Access Management** → **+** (top‑right)
   → **Add users** → paste the service‑account `client_email` → role **Viewer** →
   uncheck "Notify by email" → **Add**.
3. Get your numeric **Property ID**: **Admin → Property Settings** → copy the
   **Property ID** (a number like `481234567` — NOT the `G-…` id).

## 3. Deploy the function with your secrets (Supabase)
From the repo root, with the Supabase CLI installed and your project linked
(`supabase link --project-ref ttzwzouhiwdwamuimhpo`):

```bash
supabase secrets set GA_PROPERTY_ID=481234567
supabase secrets set GA_CLIENT_EMAIL=builderpro-ga@your-project.iam.gserviceaccount.com
# paste the whole private_key value from the JSON, keeping the \n sequences:
supabase secrets set GA_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEv...\n-----END PRIVATE KEY-----\n"

supabase functions deploy ga-stats --no-verify-jwt
```

## 4. Done
Reload the dashboard → **My Website**. The tiles (Visitors, Page views, Sessions,
Avg. engagement), the "Visitors over time" chart, **Top pages**, and **Traffic
sources** now show real Google Analytics data. Data typically starts appearing a
few hours after GA begins collecting; the 30‑day/12‑week windows fill in over time.

### Troubleshooting
- Tiles still "—": the function returned `{ok:false}`. Check
  `supabase functions logs ga-stats`. Most common causes: the service account
  isn't a **Viewer** on the property, the **Data API** isn't enabled, or
  `GA_PROPERTY_ID` is the `G-…` id instead of the numeric property id.
- `PERMISSION_DENIED`: re‑check step 2 (Viewer access) and that the Property ID
  matches the property the service account was added to.
