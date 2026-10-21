-- Osembo licensing upgrade. Run once in Supabase: SQL Editor > New query > Run. Safe to run again.
-- Run supabase-setup.sql FIRST if you have not already.
-- After this, one Supabase project can serve many schools. Each school has its own data row,
-- its own expiry date, and only its own logins can read it.

-- 1. Extra columns on the existing subscriptions table
alter table subscriptions add column if not exists school_name text;
alter table subscriptions add column if not exists term_price int;                 -- KSh per term for this school. Empty = use the SUBSCRIPTION_PRICE secret
alter table subscriptions add column if not exists suspended boolean not null default false;  -- true = switch the school off immediately

-- 2. Which school each login belongs to
create table if not exists school_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  school_id text not null,
  email text,
  role text not null default 'staff' check (role in ('admin','staff')),
  created_at timestamptz default now()
);
alter table school_members enable row level security;
drop policy if exists "read own membership" on school_members;
create policy "read own membership" on school_members for select to authenticated using (user_id = auth.uid());

-- 3. Licence keys. No policies at all: the app cannot read or guess them. Only you (SQL editor / Table Editor) and the server functions can.
create table if not exists license_keys (
  key text primary key,
  school_id text not null,
  school_name text,
  valid_until timestamptz not null,
  status text not null default 'unused' check (status in ('unused','used','revoked')),
  note text,
  created_at timestamptz default now(),
  used_at timestamptz,
  used_by uuid
);
alter table license_keys enable row level security;

-- 4. The one rule that decides who can touch school data:
--    logged in + belongs to that school + paid_until in the future + not suspended
create or replace function public.school_has_access(sid text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from school_members m join subscriptions s on s.school_id = m.school_id
    where m.user_id = auth.uid() and m.school_id = sid
      and s.paid_until > now() and not s.suspended
  );
$$;
revoke all on function public.school_has_access(text) from public, anon;
grant execute on function public.school_has_access(text) to authenticated;

drop policy if exists "paid staff access" on app_state;
create policy "paid staff access" on app_state for all to authenticated
  using (public.school_has_access(school_id))
  with check (public.school_has_access(school_id));

-- A school can read only its own subscription row (before, any login could read all of them)
drop policy if exists "staff read subscription" on subscriptions;
drop policy if exists "read own subscription" on subscriptions;
create policy "read own subscription" on subscriptions for select to authenticated
  using (school_id in (select school_id from school_members where user_id = auth.uid()));

-- 5. Your key maker. Only you can run it (from the SQL editor), never the app.
--    create_license('School name', 'last valid day')            -> new school
--    create_license('School name', 'last valid day', 'school-id') -> renewal for an existing school
create or replace function public.create_license(p_school_name text, p_valid_until date, p_school_id text default null, p_note text default null)
returns text language plpgsql security definer set search_path = public as $$
declare k text; sid text;
begin
  sid := coalesce(p_school_id,
    trim(both '-' from lower(regexp_replace(p_school_name, '[^a-zA-Z0-9]+', '-', 'g'))) || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 4));
  k := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 16));
  k := substr(k,1,4) || '-' || substr(k,5,4) || '-' || substr(k,9,4) || '-' || substr(k,13,4);
  insert into license_keys (key, school_id, school_name, valid_until, note)
  values (k, sid, p_school_name, ((p_valid_until + 1)::timestamp at time zone 'Africa/Nairobi'), p_note);  -- valid through the END of that day, Nairobi time
  return k;
end $$;
revoke all on function public.create_license(text, date, text, text) from public, anon, authenticated;

-- 6. Move your existing school (osembo-main) into the new system.
--    Every login you already created joins it. CHANGE the email below to the head/admin's login email.
insert into school_members (user_id, school_id, email, role)
select id, 'osembo-main', email,
       case when lower(email) = lower('pm7huo@gmail.com') then 'admin' else 'staff' end
from auth.users
on conflict (user_id) do nothing;
update subscriptions set school_name = 'Osembo' where school_id = 'osembo-main' and school_name is null;
