-- Trip sharing: run once in Supabase SQL Editor. Safe to run more than once.
-- The trip creator (owner) is the admin. Each person on a trip can have an email.
-- Anyone who signs in with that email can VIEW the trip (read-only).

-- Email for each person on a trip
alter table public.members add column if not exists email text;
create unique index if not exists members_trip_email_uq
  on public.members (trip_id, lower(email)) where email is not null;
create index if not exists members_email_idx on public.members (lower(email));

-- Remember the admin's email so shared users can see who shared the trip
alter table public.trips add column if not exists owner_email text default lower(auth.jwt() ->> 'email');
update public.trips t set owner_email = lower(u.email)
  from auth.users u where u.id = t.owner_id and t.owner_email is null;

-- Email of the signed-in user
create or replace function public.my_email() returns text
language sql stable as $$
  select lower(coalesce(auth.jwt() ->> 'email', ''))
$$;

-- Can the signed-in user see this trip? (admin, or listed by email on the trip)
create or replace function public.can_view_trip(t uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.trips where id = t and owner_id = auth.uid())
      or (public.my_email() <> '' and exists (
            select 1 from public.members m
            where m.trip_id = t and lower(m.email) = public.my_email()));
$$;

-- Read-only access for shared people (the admin keeps full access through the existing policies)
drop policy if exists "shared read trips" on public.trips;
create policy "shared read trips" on public.trips for select using (public.can_view_trip(id));

drop policy if exists "shared read members" on public.members;
create policy "shared read members" on public.members for select using (public.can_view_trip(trip_id));

drop policy if exists "shared read expenses" on public.expenses;
create policy "shared read expenses" on public.expenses for select using (public.can_view_trip(trip_id));

drop policy if exists "shared read payments" on public.payments;
create policy "shared read payments" on public.payments for select using (public.can_view_trip(trip_id));

drop policy if exists "shared read splits" on public.expense_splits;
create policy "shared read splits" on public.expense_splits for select
  using (exists (select 1 from public.expenses e where e.id = expense_id and public.can_view_trip(e.trip_id)));

-- Shared people can also see the trip's bill photos (bills/<admin id>/<trip id>/...)
drop policy if exists "bills read shared" on storage.objects;
create policy "bills read shared" on storage.objects for select to authenticated
  using (bucket_id = 'bills' and exists (
    select 1 from public.trips t
    where t.id::text = (storage.foldername(name))[2] and public.can_view_trip(t.id)));
