-- Day-wise trip plan: run once in Supabase SQL Editor. Safe to run more than once.
-- Needs sharing.sql to have been run first (uses public.can_view_trip).

create table if not exists public.plan_items (
  id          uuid primary key default gen_random_uuid(),
  trip_id     uuid not null references public.trips(id) on delete cascade,
  day         date not null,
  title       text not null check (length(trim(title)) > 0),
  notes       text,
  photo_path  text,                 -- optional photo in the bills storage bucket
  done        boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists plan_items_trip_idx on public.plan_items (trip_id, day);
alter table public.plan_items add column if not exists photo_path text;

alter table public.plan_items enable row level security;

-- The admin (trip owner) can add, change and delete
drop policy if exists "own plan" on public.plan_items;
create policy "own plan" on public.plan_items for all
  using (public.owns_trip(trip_id)) with check (public.owns_trip(trip_id));

-- People the trip is shared with can view
drop policy if exists "shared read plan" on public.plan_items;
create policy "shared read plan" on public.plan_items for select using (public.can_view_trip(trip_id));

-- ---------- Photo storage (same as bills.sql; safe to run again) ----------
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

-- Shared people can see the trip's photos (bills/<user id>/<trip id>/...).
-- "objects.name" must be written out in full: a bare "name" would point at the trip's name.
drop policy if exists "bills read shared" on storage.objects;
create policy "bills read shared" on storage.objects for select to authenticated
  using (bucket_id = 'bills' and exists (
    select 1 from public.trips t
    where t.id::text = (storage.foldername(objects.name))[2] and public.can_view_trip(t.id)));
