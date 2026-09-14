-- Calculator embeds on clients' own websites.
--
-- A contractor pastes an <iframe> pointing at builderpro-os.com/embed/<trade>.html?u=<their id>
-- into their site. That page loads their prices anonymously, so anonymous
-- readers need to see any owner's pricing row, not just the agency defaults.
--
-- What this exposes: pricing tables and owner uuids. Pricing is public by
-- design (it drives an estimate every visitor to the client's site can see),
-- and a uuid on its own identifies nobody. Business names, contacts and
-- settings are NOT in this table and stay private. Writes are unchanged.
--
-- Run in the Supabase SQL editor (or `supabase db push`).

drop policy if exists calc_pricing_sel on public.calculator_pricing;
create policy calc_pricing_sel on public.calculator_pricing
  for select using (true);

grant select on public.calculator_pricing to anon, authenticated;
