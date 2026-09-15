-- How a client's public embeds look: the calculator on their site and the
-- booking page. One row per owner and kind, a small JSON of colours, font,
-- corner radius and images. The portal's Customize page writes it; the public
-- pages read it anonymously (a theme is not secret — it is what visitors see).

create table if not exists public.embed_themes (
  owner      uuid not null references auth.users(id) on delete cascade,
  kind       text not null check (kind in ('calc','calendar')),
  theme      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (owner, kind)
);

alter table public.embed_themes enable row level security;

drop policy if exists embed_themes_sel on public.embed_themes;
create policy embed_themes_sel on public.embed_themes
  for select using (true);

drop policy if exists embed_themes_own on public.embed_themes;
create policy embed_themes_own on public.embed_themes
  for all using (auth.uid() = owner) with check (auth.uid() = owner);

grant select on public.embed_themes to anon, authenticated;
grant insert, update, delete on public.embed_themes to authenticated;
