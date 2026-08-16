# ghl-settings — sync BuilderPro Settings into GoHighLevel

This edge function pushes the dashboard **Settings** into your GHL (LeadConnector)
sub-account whenever the contractor hits **Save changes**:

- **Business profile** (name, phone, email, website, address) → updates the GHL **Location**.
- Everything else → upserted as GHL **Custom Values** (usable in workflows, SMS/email
  templates, etc.):
  - `Business Name`, `Trade`, `Service Area`, `License Number`
  - `Business Hours` (formatted, one line per day)
  - `Auto Reply Message`
  - `Owner Name`, `Owner Email`, `Owner Phone`

> The **logo** is a device-side image and is **not** pushed — GHL needs a hosted media
> URL, which is a separate upload step.

## 1. Deploy

```bash
supabase functions deploy ghl-settings --no-verify-jwt
```

## 2. Set secrets (Supabase → Edge Functions → Secrets)

| Secret | What it is |
| --- | --- |
| `GHL_TOKEN` | A GHL **Private Integration** token (or Location API token) with **Locations** + **Custom Values** write scopes. |
| `GHL_LOCATION_ID` | The sub-account (location) id to write to. |
| `GHL_API_BASE` | *(optional)* defaults to `https://services.leadconnectorhq.com`. |
| `GHL_API_VERSION` | *(optional)* defaults to `2021-07-28`. |

Required GHL scopes on the token:
- `locations.write`
- `locations/customValues.write` and `locations/customValues.readonly`

## 3. That's it

The dashboard already calls this function on Save. If it isn't deployed (or the token
is missing), Settings still saves on the device and the status line shows
"Saved on device ✓ · GHL sync unavailable" — nothing breaks.

## Request shape (for reference)

```json
POST /functions/v1/ghl-settings
{
  "action": "sync",
  "company": { "name":"Acme Roofing","trade":"Roofing","phone":"...","email":"...",
               "website":"...","address":"...","serviceArea":"Austin, 78704","license":"..." },
  "hours":   { "mon":{"open":true,"from":"08:00","to":"17:00"}, "...":  { } },
  "autoReply": "Thanks for reaching Acme Roofing! ...",
  "owner":   { "name":"...","email":"...","phone":"..." }
}
```

Response: `{ ok, location, customValues:{ updated, created, failed } }`.
