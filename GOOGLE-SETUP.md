# Setting up "Sign in with Google" (Website tab)

This lets each contractor connect their own Google Analytics and Google Search
Console in Portal → Marketing → Website. BuilderPro only **reads** their
numbers. You do this setup once, for BuilderPro as a whole.

Takes about 30 minutes. Google's app review (step 7) takes longer, but you can
use it with up to 100 test users before then.

---

## 1. Create a Google Cloud project

1. Go to <https://console.cloud.google.com/> and sign in with the Google account
   that should own BuilderPro's Google setup (a company account, not a personal one).
2. Top bar → project picker → **New project**.
3. Name: `BuilderPro`. Click **Create**, then make sure it's selected in the top bar.

## 2. Turn on the three APIs

Go to **APIs & Services → Library**, search for each of these, open it, click **Enable**:

- **Google Analytics Data API**
- **Google Analytics Admin API**
- **Google Search Console API**

## 3. Set up the consent screen (what people see when they sign in)

**APIs & Services → OAuth consent screen** (in newer consoles it's called
**Google Auth Platform → Branding / Audience / Data access**).

1. User type: **External**. Click **Create**.
2. App information:
   - App name: **BuilderPro**
   - User support email: your support address
   - App logo: the BuilderPro logo (120×120 PNG). Optional, but adding a logo also triggers review, so you can add it later.
3. App domain:
   - Home page: `https://builderpro-os.com`
   - Privacy policy: `https://builderpro-os.com/privacy` (use your real privacy page URL)
   - Terms of service: `https://builderpro-os.com/terms` (use your real terms URL)
4. Authorized domains: add `builderpro-os.com` **and** `supabase.co`.
5. Developer contact email: your email. **Save and continue.**
6. **Scopes** (Data access) → **Add or remove scopes** → add:
   - `openid`
   - `.../auth/userinfo.email`
   - `https://www.googleapis.com/auth/analytics.readonly`
   - `https://www.googleapis.com/auth/webmasters.readonly`

   Save.
7. **Test users** (Audience): add the Gmail addresses of the contractors who
   should be able to connect before Google approves the app. Up to 100.
   Anyone not on this list gets an "access blocked" screen until the app is verified.

### Prove you own the domain

Google needs to know you own `builderpro-os.com`:

1. Go to <https://search.google.com/search-console>, **Add property → Domain**, enter `builderpro-os.com`.
2. It gives you a TXT record. Add it at your DNS provider, wait a few minutes, click **Verify**.
3. Use the same Google account as the Cloud project (or add that account as an owner).

## 4. Create the sign-in keys (OAuth client)

**APIs & Services → Credentials → Create credentials → OAuth client ID**

- Application type: **Web application**
- Name: `BuilderPro portal`
- Authorized redirect URIs → **Add URI**, paste exactly:

  ```
  https://ttzwzouhiwdwamuimhpo.supabase.co/functions/v1/google-analytics?op=callback
  ```

- (Authorized JavaScript origins can stay empty.)

Click **Create**. Copy the **Client ID** and **Client secret**.

## 5. Make an encryption key

Each contractor's Google token is stored encrypted. Make a random key once,
on any Mac or Linux terminal:

```
openssl rand -base64 32
```

Copy the output (44 characters ending in `=`). Keep it safe. If you lose or
change it, everyone has to connect Google again.

## 6. Add the secrets in Supabase

Supabase dashboard → project `ttzwzouhiwdwamuimhpo` → **Edge Functions → Secrets** (or
**Project Settings → Edge Functions**). Add:

| Name | Value |
| --- | --- |
| `GOOGLE_CLIENT_ID` | Client ID from step 4 |
| `GOOGLE_CLIENT_SECRET` | Client secret from step 4 |
| `GOOGLE_TOKEN_KEY` | the key from step 5 |
| `PORTAL_URL` | `https://builderpro-os.com` |
| `GOOGLE_OAUTH_STATE_SECRET` | optional: another `openssl rand -base64 32`. If you leave it out, the service key is used. |

Or from the command line:

```
supabase secrets set GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... \
  GOOGLE_TOKEN_KEY="$(openssl rand -base64 32)" PORTAL_URL=https://builderpro-os.com
```

Until these are set, the Website tab just shows the BuilderPro snippet like before.

## 7. Get the app verified by Google

While the app is in **Testing**, only your test users can connect, and Google
makes them sign in again **every 7 days**. To open it to everyone:

1. Consent screen → **Publish app** (moves it to "In production").
2. `analytics.readonly` and `webmasters.readonly` are **sensitive scopes**, so
   Google asks for verification. You'll need:
   - The privacy policy saying what Google data you read (Analytics and Search
     Console numbers, read-only, shown only to that account owner, not sold or
     shared, deletable by disconnecting), and that it follows the
     [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy) including the Limited Use rules.
   - A short **YouTube video** (unlisted is fine) showing: the BuilderPro sign-in,
     clicking **Sign in with Google**, the consent screen with the app name and
     scopes visible (and the browser URL showing the client ID), then the Website tab
     showing the Analytics and Search numbers.
   - A sentence for each scope saying why you need it ("show the contractor their
     own website visitors / Google search clicks inside their dashboard").
3. Submit. Google usually answers by email within **a few days to a few weeks**
   and may ask follow-up questions. Reply in the same thread.

You don't need the heavier "restricted scope" security assessment. These scopes
are only "sensitive".

## Deploying the code (for the developer)

```
supabase db push                                   # creates public.google_connections
supabase functions deploy google-analytics --no-verify-jwt
```

Then publish the site so the new `portal/website.js` is live.

## If something goes wrong

- **"redirect_uri_mismatch"**: the URI in step 4 must match exactly, including `?op=callback`.
- **"Access blocked: app has not completed verification"**: add that Gmail as a test user (step 3.7), or finish step 7.
- **Connected but no properties listed**: that Google account has no GA4 property or verified Search Console site. They need to sign in with the account that owns them, or have the owner add them as a user.
- **Asked to reconnect**: they removed access in their Google account, or the 7-day testing limit ran out. Disconnect and connect again.
