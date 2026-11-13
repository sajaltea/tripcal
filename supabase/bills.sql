-- Bill photos: run once in Supabase SQL Editor. Safe to run more than once.

-- Where each expense's photo is stored
alter table public.expenses add column if not exists bill_path text;

-- Private storage bucket for the photos (max 5 MB each, images only)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('bills', 'bills', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Each user can only see and change photos inside their own folder: bills/<user id>/...
drop policy if exists "bills read own"   on storage.objects;
drop policy if exists "bills add own"    on storage.objects;
drop policy if exists "bills change own" on storage.objects;
drop policy if exists "bills delete own" on storage.objects;

create policy "bills read own" on storage.objects for select to authenticated
  using (bucket_id = 'bills' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "bills add own" on storage.objects for insert to authenticated
  with check (bucket_id = 'bills' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "bills change own" on storage.objects for update to authenticated
  using (bucket_id = 'bills' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "bills delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'bills' and (storage.foldername(name))[1] = auth.uid()::text);
