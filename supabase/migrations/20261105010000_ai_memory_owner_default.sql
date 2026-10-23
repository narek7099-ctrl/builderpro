-- the AI teams save notes without an owner email; let them
alter table public.ai_memory alter column owner_email set default '';
