# ai-chat — the brain behind Nova (Web OS) & Atlas (BuilderPro)

Turns the chatbots from canned keyword replies into real, per-business AI using
Google **Gemini's free tier**. The API key lives only in this function
(server-side) — never in the page.

## What it does
1. Reads a business's knowledge from the `ai_brain` table (by `slug`) and/or from
   live context sent in the request (`business`).
2. Builds a system prompt from that knowledge.
3. Calls Claude and returns `{ reply }`.

The pages call it at `POST {SUPABASE_URL}/functions/v1/ai-chat` and fall back to the
old canned replies if it's unreachable, so nothing breaks before you deploy.

## Deploy (one time)

```bash
# 1. create the table + demo brains
supabase db push            # applies supabase/migrations/20260817000000_ai_brain.sql
#    (or paste that SQL into the Supabase SQL editor)

# 2. deploy the function
supabase functions deploy ai-chat --no-verify-jwt

# 3. set the secret (get a FREE key at https://aistudio.google.com/apikey)
supabase secrets set GEMINI_API_KEY=AIza...
# optional: pick a model (default gemini-2.0-flash)
supabase secrets set AI_MODEL=gemini-2.0-flash
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically — no need to set them.

## Request shape
```json
{
  "message": "how much for a new roof?",
  "slug": "demo-roofing",              // optional: pulls a stored brain
  "business": { "name": "...", "industry": "...", "tone": "Friendly", "assistant_name": "Atlas" },
  "history": [{ "role": "user", "content": "..." }, { "role": "assistant", "content": "..." }]
}
```

## Giving a real client their own brain
Insert a row (owner = their auth user id) or edit one:
```sql
insert into ai_brain (slug, owner, assistant_name, business_name, industry, tone,
  services, pricing, hours, booking_url, faqs, custom_instructions)
values ('sharp-cuts', '<auth-user-uuid>', 'Nova', 'Sharp Cuts', 'Barbershop', 'Friendly',
  'Haircuts, fades, beard trims, hot-towel shaves', 'Cuts $35, beard $20, combo $50',
  'Tue–Sat 9–7', 'https://…/book', 'Q: Walk-ins? A: Yes, but booking is faster.',
  'Keep it upbeat. Always offer to book.');
```
Then pass `"slug": "sharp-cuts"` from that client's chat.
