-- M4: review session RPC.
--
-- Learning items' spaced-repetition columns and review_logs are not writable by clients
-- (see 20261028000300). This security definer function is the only way a learner's own
-- review moves an item's schedule. The rules mirror src/lib/domain/scheduling.ts exactly;
-- tests/db/scheduling.test.ts checks that both give identical results.
--
-- p_expected_review_count is an optimistic-concurrency guard: a double submit or a stale tab
-- passes an old count and gets applied = false with the current state, so one answer can
-- never move the schedule twice.
--
-- Conversation reuse (mode 'conversation') is logged by the review RPC in M7, not here.

-- Fix: `ease` is real, but `ease between 1.3 and 5` compared it as double precision, where the
-- stored real 1.3 is 1.2999999523…, so an item could never reach the minimum ease. Compare as real.
-- (mastery_score and confidence use 0 and 1, which real represents exactly.)
alter table public.learning_items drop constraint learning_items_ease_check;
alter table public.learning_items
  add constraint learning_items_ease_check check (ease between 1.3::real and 5::real);

create function public.record_item_review(
  p_item_id uuid,
  p_rating text,
  p_mode text,
  p_expected_review_count integer
)
returns table (
  applied boolean,
  review_count integer,
  interval_days integer,
  ease real,
  mastery_score real,
  next_review_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_item public.learning_items%rowtype;
  v_ease numeric;
  v_mastery numeric;
  v_interval integer;
  v_good integer;
  v_next timestamptz;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if p_rating is null or p_rating not in ('again', 'hard', 'good', 'easy') then
    raise exception 'invalid rating' using errcode = '22023';
  end if;
  if p_mode is null or p_mode not in ('recall', 'use_in_sentence') then
    raise exception 'invalid mode' using errcode = '22023';
  end if;

  -- Another user's item looks exactly like a missing one.
  select * into v_item
  from public.learning_items li
  where li.id = p_item_id and li.user_id = v_uid
  for update;
  if not found then
    raise exception 'item not found' using errcode = 'P0002';
  end if;

  if p_expected_review_count is distinct from v_item.review_count then
    return query select false, v_item.review_count, v_item.interval_days, v_item.ease,
      v_item.mastery_score, v_item.next_review_at;
    return;
  end if;

  v_ease := round(v_item.ease::numeric, 2);
  v_mastery := round(v_item.mastery_score::numeric, 2);
  v_good := case
    when v_item.interval_days = 0 then 1
    when v_item.interval_days = 1 then 3
    else round(v_item.interval_days * v_ease)::integer
  end;

  case p_rating
    when 'again' then
      v_interval := 0;
      v_ease := v_ease - 0.20;
      v_mastery := v_mastery - 0.20;
    when 'hard' then
      v_interval := greatest(1, round(v_item.interval_days * 1.2)::integer);
      v_ease := v_ease - 0.15;
      v_mastery := v_mastery + 0.05;
    when 'good' then
      v_interval := v_good;
      v_mastery := v_mastery + 0.10;
    when 'easy' then
      v_interval := greatest(
        v_good + 1,
        case when v_item.interval_days = 0 then 3
             else round(v_item.interval_days * v_ease * 1.3)::integer end
      );
      v_ease := v_ease + 0.15;
      v_mastery := v_mastery + 0.15;
  end case;

  v_interval := least(v_interval, 365);
  v_ease := least(5, greatest(1.3, v_ease));
  v_mastery := least(1, greatest(0, v_mastery));
  v_next := case
    when p_rating = 'again' then now() + interval '10 minutes'
    else now() + make_interval(hours => v_interval * 24)
  end;

  update public.learning_items li
  set ease = v_ease,
      interval_days = v_interval,
      mastery_score = v_mastery,
      review_count = li.review_count + 1,
      next_review_at = v_next,
      last_reviewed_at = now()
  where li.id = p_item_id;

  insert into public.review_logs (user_id, item_id, rating, mode)
  values (v_uid, p_item_id, p_rating, p_mode);

  return query select true, v_item.review_count + 1, v_interval, v_ease::real, v_mastery::real, v_next;
end;
$$;

revoke all on function public.record_item_review(uuid, text, text, integer) from public, anon, authenticated;
grant execute on function public.record_item_review(uuid, text, text, integer) to authenticated;
