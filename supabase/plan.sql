-- Day-wise trip plan: run once in Supabase SQL Editor. Safe to run more than once.
-- Needs sharing.sql to have been run first (uses public.can_view_trip).

create table if not exists public.plan_items (
  id          uuid primary key default gen_random_uuid(),
  trip_id     uuid not null references public.trips(id) on delete cascade,
  day         date not null,
  time        text,                 -- optional, e.g. '07:30'
  title       text not null check (length(trim(title)) > 0),
  notes       text,
  done        boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists plan_items_trip_idx on public.plan_items (trip_id, day);

alter table public.plan_items enable row level security;

-- The admin (trip owner) can add, change and delete
drop policy if exists "own plan" on public.plan_items;
create policy "own plan" on public.plan_items for all
  using (public.owns_trip(trip_id)) with check (public.owns_trip(trip_id));

-- People the trip is shared with can view
drop policy if exists "shared read plan" on public.plan_items;
create policy "shared read plan" on public.plan_items for select using (public.can_view_trip(trip_id));
