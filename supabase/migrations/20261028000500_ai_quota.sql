-- FluentLab schema 5/5: per-user daily AI quota.
-- Clients can read their own usage; the only write path is consume_ai_quota().

create table public.ai_usage (
  user_id uuid not null references public.profiles (id) on delete cascade,
  day date not null,
  calls integer not null default 0 check (calls >= 0),
  primary key (user_id, day)
);

alter table public.ai_usage enable row level security;
revoke all on public.ai_usage from anon, authenticated;
grant select on public.ai_usage to authenticated;
create policy "ai_usage select own" on public.ai_usage
  for select to authenticated using (user_id = (select auth.uid()));

-- Atomically consume one AI call for the calling user.
-- * No arguments: the user comes only from auth.uid(), the limit only from app_config.
-- * Single upsert statement: concurrent calls serialize on the (user_id, day) row,
--   so calls can never exceed the limit.
-- * allowed = false (and calls unchanged) once the limit is reached.
create function public.consume_ai_quota()
returns table (allowed boolean, calls integer, daily_limit integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_day date := (now() at time zone 'utc')::date;
  v_limit integer;
  v_calls integer;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select c.ai_daily_limit into strict v_limit from public.app_config c where c.id;

  insert into public.ai_usage as u (user_id, day, calls)
  values (v_uid, v_day, 1)
  on conflict (user_id, day) do update
    set calls = u.calls + 1
    where u.calls < v_limit
  returning u.calls into v_calls;

  if v_calls is null then
    select u.calls into v_calls from public.ai_usage u
    where u.user_id = v_uid and u.day = v_day;
    return query select false, v_calls, v_limit;
  else
    return query select true, v_calls, v_limit;
  end if;
end;
$$;

revoke all on function public.consume_ai_quota() from public, anon, authenticated;
grant execute on function public.consume_ai_quota() to authenticated;
