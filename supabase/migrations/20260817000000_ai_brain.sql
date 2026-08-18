-- AI "brain": per-business knowledge the ai-chat edge function uses to answer in-character.
-- One row per business (a demo brain, or a real client's brain tied to their auth user).

create extension if not exists "pgcrypto";

create table if not exists public.ai_brain (
  id                uuid primary key default gen_random_uuid(),
  slug              text unique not null,          -- stable lookup key, e.g. 'demo-auto' or a client slug
  owner             uuid references auth.users(id) on delete cascade,  -- null = shared/demo brain
  is_demo           boolean not null default false,
  assistant_name    text not null default 'Nova',  -- 'Nova' (Web OS) or 'Atlas' (BuilderPro)
  business_name     text,
  industry          text,
  tone              text default 'Friendly',        -- Friendly | Professional | Bold
  services          text,                           -- freeform: services offered
  pricing           text,                           -- freeform: price ranges / packages
  hours             text,
  service_area      text,
  booking_url       text,
  phone             text,
  faqs              text,                           -- freeform Q&A the assistant should know
  custom_instructions text,                         -- anything else / guardrails / persona notes
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists ai_brain_owner_idx on public.ai_brain(owner);

alter table public.ai_brain enable row level security;

-- Anyone (even anon) may READ demo brains; owners may read their own.
drop policy if exists ai_brain_read on public.ai_brain;
create policy ai_brain_read on public.ai_brain
  for select using (is_demo = true or owner = auth.uid());

-- Owners manage their own brain rows.
drop policy if exists ai_brain_insert on public.ai_brain;
create policy ai_brain_insert on public.ai_brain
  for insert with check (owner = auth.uid());

drop policy if exists ai_brain_update on public.ai_brain;
create policy ai_brain_update on public.ai_brain
  for update using (owner = auth.uid()) with check (owner = auth.uid());

drop policy if exists ai_brain_delete on public.ai_brain;
create policy ai_brain_delete on public.ai_brain
  for delete using (owner = auth.uid());

-- keep updated_at fresh
create or replace function public.ai_brain_touch() returns trigger as $$
begin new.updated_at = now(); return new; end; $$ language plpgsql;

drop trigger if exists ai_brain_touch on public.ai_brain;
create trigger ai_brain_touch before update on public.ai_brain
  for each row execute function public.ai_brain_touch();

-- A couple of starter demo brains so the marketing chatbots are custom out of the box.
insert into public.ai_brain (slug, is_demo, assistant_name, business_name, industry, tone, services, pricing, hours, booking_url, faqs, custom_instructions)
values
('demo-roofing', true, 'Atlas', 'BuilderPro Roofing', 'Roofing', 'Friendly',
 'Inspections, repairs, full replacements, storm & hail damage, insurance claims, gutters, skylights, ventilation. Materials: asphalt, metal, tile, flat/TPO, slate.',
 'Repairs $300–$1,500. Full replacement $8,000–$25,000+ depending on size and material. Free inspections.',
 'Mon–Sat 7am–7pm', '#booking',
 'Q: Do you help with insurance? A: Yes, we document damage and help file the claim. Q: How fast can you inspect? A: Usually within 1–2 days.',
 'You are a roofing receptionist. Keep replies 2–4 sentences. Never invent exact prices beyond the ranges given. Always steer toward booking a free inspection.'),
('demo-auto', true, 'Nova', 'Web OS Auto', 'Auto', 'Friendly',
 'Diagnostics, oil changes, brakes, tires, engine & transmission, detailing.',
 'Oil change from $59. Brake service $150–$400 per axle. Diagnostics $89 (waived with repair).',
 'Mon–Fri 8am–6pm, Sat 9am–3pm', '#contact',
 'Q: Do you offer loaner cars? A: On major repairs, yes. Q: Walk-ins? A: Welcome, but appointments are faster.',
 'You are an auto-shop receptionist. Keep replies 2–4 sentences. Offer a ballpark, then move toward booking.')
on conflict (slug) do nothing;
