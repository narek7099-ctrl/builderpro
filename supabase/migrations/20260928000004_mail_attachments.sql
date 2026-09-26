-- Files attached to emails sent from the portal. Public read (the email
-- carries a link to them); only a signed-in user uploads, into their own folder.
insert into storage.buckets (id, name, public, file_size_limit)
values ('mail-attachments', 'mail-attachments', true, 10485760)
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit;
drop policy if exists "mail attachments: upload own" on storage.objects;
create policy "mail attachments: upload own" on storage.objects for insert to authenticated
  with check (bucket_id = 'mail-attachments' and (storage.foldername(name))[1] = auth.uid()::text);
