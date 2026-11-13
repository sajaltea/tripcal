-- Update for offline support + deleting trips. Safe to run more than once.

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
