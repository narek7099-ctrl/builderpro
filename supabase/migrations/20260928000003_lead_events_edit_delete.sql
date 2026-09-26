-- The owner can set what a lead cost and delete a lead; nothing else about a
-- received lead is editable from the browser.
drop policy if exists lead_events_update_own on public.lead_events;
create policy lead_events_update_own on public.lead_events for update to authenticated
  using (owner = auth.uid()) with check (owner = auth.uid());
drop policy if exists lead_events_delete_own on public.lead_events;
create policy lead_events_delete_own on public.lead_events for delete to authenticated
  using (owner = auth.uid());
revoke update on public.lead_events from authenticated;
grant update (cost) on public.lead_events to authenticated;
grant delete on public.lead_events to authenticated;
