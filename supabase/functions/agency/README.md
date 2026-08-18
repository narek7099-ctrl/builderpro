# agency — private Agency Command Center backend

Secure backend for `agency.html`. Holds your GHL agency API key + Gemini key
server-side. Every request must come from a signed-in **admin email** (allowlist).
The AI never executes anything on its own — it only *proposes* an action
(`ai.plan`); the page executes it after you click **Approve**.

## Deploy
```bash
supabase functions deploy agency --no-verify-jwt
supabase secrets set \
  GHL_API_KEY=<your GHL agency API key / private integration token> \
  GHL_COMPANY_ID=<your GHL agency (company) id> \
  GEMINI_API_KEY=AIza... \
  ADMIN_EMAILS=narek7099@gmail.com
```
`SUPABASE_URL` is injected automatically. Add more admin emails comma-separated.

## Where to get the GHL values
- **API key / token:** GHL → **Settings → API Keys / Private Integrations** (agency level,
  not a single sub-account). It needs scopes for locations, contacts, conversations,
  opportunities, and workflows.
- **Company id:** GHL → agency **Settings → Business Info** (the company/agency id), or
  it's in the URL of your agency dashboard.

## What it can do (ops)
- `locations.*` — list / create / update / delete client sub-accounts
- `contacts.*` — list / create / update / delete / tag
- `conversations.*` — list / messages / send (SMS or Email)
- `pipelines.list`, `opportunities.list`, `workflows.list`, `workflows.enroll`

## Note on limits
GHL exposes no API to **author/edit workflow steps** — that stays in GHL's builder.
This tool lists workflows and enrolls contacts into them. Also, exact GHL v2 endpoint
shapes can change; if an op returns an error, the raw GHL response is shown in the page
so we can adjust the path/args in `opToRequest()`.

## Security
- Page is `noindex`, login-gated, and every backend call re-verifies your Supabase token
  against the admin allowlist. Keep `agency.html` unlinked from your public site.
