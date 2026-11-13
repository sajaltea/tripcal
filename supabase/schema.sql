-- Trip Splitter schema. Run this once in Supabase: Dashboard -> SQL Editor -> New query -> paste -> Run.

create extension if not exists pgcrypto;

-- A trip / journey owned by the signed-in user
create table if not exists public.trips (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name        text not null check (length(trim(name)) > 0),
  currency    text not null default 'INR',
  start_date  date,
  end_date    date,
  notes       text,
  created_at  timestamptz not null default now()
);

-- People travelling on a trip
create table if not exists public.members (
  id          uuid primary key default gen_random_uuid(),
  trip_id     uuid not null references public.trips(id) on delete cascade,
  name        text not null check (length(trim(name)) > 0),
  created_at  timestamptz not null default now(),
  unique (trip_id, name),
  unique (id, trip_id)
);

-- Money spent: who paid, how much
create table if not exists public.expenses (
  id          uuid primary key default gen_random_uuid(),
  trip_id     uuid not null references public.trips(id) on delete cascade,
  description text not null check (length(trim(description)) > 0),
  amount      numeric(12,2) not null check (amount > 0),
  paid_by     uuid not null,
  category    text not null default 'Other',
  spent_on    date not null default current_date,
  created_at  timestamptz not null default now(),
  foreign key (paid_by, trip_id) references public.members(id, trip_id)
);

-- How each expense is shared between people (shares add up to the amount)
create table if not exists public.expense_splits (
  expense_id  uuid not null references public.expenses(id) on delete cascade,
  member_id   uuid not null references public.members(id),
  share       numeric(12,2) not null check (share >= 0),
  primary key (expense_id, member_id)
);

-- Money one person gave to another to settle up
create table if not exists public.payments (
  id          uuid primary key default gen_random_uuid(),
  trip_id     uuid not null references public.trips(id) on delete cascade,
  from_member uuid not null,
  to_member   uuid not null,
  amount      numeric(12,2) not null check (amount > 0),
  paid_on     date not null default current_date,
  note        text,
  created_at  timestamptz not null default now(),
  check (from_member <> to_member),
  foreign key (from_member, trip_id) references public.members(id, trip_id),
  foreign key (to_member, trip_id) references public.members(id, trip_id)
);

create index if not exists members_trip_idx  on public.members(trip_id);
create index if not exists expenses_trip_idx on public.expenses(trip_id);
create index if not exists payments_trip_idx on public.payments(trip_id);
create index if not exists splits_member_idx on public.expense_splits(member_id);

-- ---------- Row level security: each user only sees their own trips ----------
create or replace function public.owns_trip(t uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.trips where id = t and owner_id = auth.uid());
$$;

alter table public.trips          enable row level security;
alter table public.members        enable row level security;
alter table public.expenses       enable row level security;
alter table public.expense_splits enable row level security;
alter table public.payments       enable row level security;

drop policy if exists "own trips" on public.trips;
create policy "own trips" on public.trips for all
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists "own members" on public.members;
create policy "own members" on public.members for all
  using (public.owns_trip(trip_id)) with check (public.owns_trip(trip_id));

drop policy if exists "own expenses" on public.expenses;
create policy "own expenses" on public.expenses for all
  using (public.owns_trip(trip_id)) with check (public.owns_trip(trip_id));

drop policy if exists "own payments" on public.payments;
create policy "own payments" on public.payments for all
  using (public.owns_trip(trip_id)) with check (public.owns_trip(trip_id));

drop policy if exists "own splits" on public.expense_splits;
create policy "own splits" on public.expense_splits for all
  using (exists (select 1 from public.expenses e where e.id = expense_id and public.owns_trip(e.trip_id)))
  with check (exists (select 1 from public.expenses e where e.id = expense_id and public.owns_trip(e.trip_id)));

-- ---------- Save an expense and its split in one transaction ----------
create or replace function public.save_expense(
  p_id uuid, p_trip_id uuid, p_description text, p_amount numeric,
  p_paid_by uuid, p_category text, p_spent_on date, p_splits jsonb
) returns uuid language plpgsql security invoker set search_path = public as $$
declare
  v_id uuid;
  v_found uuid;
  v_total numeric;
begin
  if not public.owns_trip(p_trip_id) then
    raise exception 'Trip not found';
  end if;
  if p_splits is null or jsonb_array_length(p_splits) = 0 then
    raise exception 'Choose at least one person to split with';
  end if;
  select coalesce(sum((s->>'share')::numeric), 0) into v_total from jsonb_array_elements(p_splits) s;
  if v_total <> p_amount then
    raise exception 'Shares (%) must add up to the amount (%)', v_total, p_amount;
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_splits) s
    where not exists (select 1 from public.members m
                      where m.id = (s->>'member_id')::uuid and m.trip_id = p_trip_id)
  ) then
    raise exception 'Split includes someone who is not on this trip';
  end if;

  -- The app creates the id on the phone (so it works offline). Update if it exists, else insert.
  v_id := coalesce(p_id, gen_random_uuid());
  update public.expenses
     set description = p_description, amount = p_amount, paid_by = p_paid_by,
         category = coalesce(p_category, 'Other'), spent_on = coalesce(p_spent_on, current_date)
   where id = v_id and trip_id = p_trip_id
  returning id into v_found;
  if v_found is null then
    insert into public.expenses (id, trip_id, description, amount, paid_by, category, spent_on)
    values (v_id, p_trip_id, p_description, p_amount, p_paid_by, coalesce(p_category, 'Other'), coalesce(p_spent_on, current_date));
  else
    delete from public.expense_splits where expense_id = v_id;
  end if;

  insert into public.expense_splits (expense_id, member_id, share)
  select v_id, (s->>'member_id')::uuid, (s->>'share')::numeric
  from jsonb_array_elements(p_splits) s;

  return v_id;
end;
$$;

grant execute on function public.save_expense(uuid, uuid, text, numeric, uuid, text, date, jsonb) to authenticated;

-- Fix: allow deleting a trip that has expenses.
-- Checks on references to people now run at the end of the transaction,
-- after the whole trip (people, expenses, shares, payments) has been removed.
-- Removing a single person who still has expenses is still blocked.
do $$
declare c record;
begin
  for c in
    select conrelid::regclass as tbl, conname
    from pg_constraint
    where contype = 'f' and confrelid = 'public.members'::regclass
  loop
    execute format('alter table %s alter constraint %I deferrable initially deferred', c.tbl, c.conname);
  end loop;
end $$;

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
