-- M7: conversation review RPCs.
--
-- claim_conversation_review(): moves an ended conversation into a review attempt, using the
--   database clock for the 5-minute stale check, so two tabs can't run the reviewer at once.
-- apply_conversation_review(): the single writer for review results. Feedback, corrections,
--   target usage and the conversation's completion are written in one transaction; once the
--   conversation is completed, replaying the same call is a no-op. Gap events arrive in M8:
--   until then p_events must be an empty array.
--
-- Status changes made directly by clients are now limited to the transitions the app uses, so
-- a conversation can only become `completed` through apply_conversation_review().

-- Status transitions ------------------------------------------------------------------

-- review_started_at / review_attempts are set by claim_conversation_review() only.
revoke update (review_started_at, review_attempts) on public.conversations from authenticated;

create function public.conversations_guard_status()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Security definer RPCs run as the function owner and the service role is trusted;
  -- only direct client writes are limited.
  if current_user not in ('authenticated', 'anon') or new.status = old.status then
    return new;
  end if;
  if (old.status, new.status) in (
    ('active', 'reviewing'),        -- End conversation
    ('active', 'abandoned'),
    ('reviewing', 'failed_review')  -- the reviewer failed; the error code goes in review_error
  ) then
    return new;
  end if;
  raise exception 'conversation status cannot change from % to %', old.status, new.status
    using errcode = '42501';
end;
$$;

create trigger conversations_guard_status
  before update of status on public.conversations
  for each row execute function public.conversations_guard_status();

-- Claim -------------------------------------------------------------------------------

-- Returns 'claimed' when the caller should run the reviewer now, otherwise the reason not to:
-- 'in_progress' (another attempt started < 5 minutes ago), 'completed', 'active' or 'abandoned'.
create function public.claim_conversation_review(p_conversation_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_conversation public.conversations%rowtype;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select * into v_conversation
  from public.conversations c
  where c.id = p_conversation_id and c.user_id = v_uid
  for update;
  if not found then
    raise exception 'conversation not found' using errcode = 'P0002';
  end if;

  if v_conversation.status in ('completed', 'active', 'abandoned') then
    return v_conversation.status;
  end if;
  if v_conversation.status = 'reviewing'
     and v_conversation.review_started_at is not null
     and v_conversation.review_started_at > now() - interval '5 minutes' then
    return 'in_progress';
  end if;

  -- 'failed_review', a 'reviewing' that no attempt has picked up yet, or a stale attempt.
  update public.conversations c
  set status = 'reviewing',
      review_started_at = now(),
      review_attempts = c.review_attempts + 1,
      review_error = null
  where c.id = p_conversation_id;
  return 'claimed';
end;
$$;

revoke all on function public.claim_conversation_review(uuid) from public, anon, authenticated;
grant execute on function public.claim_conversation_review(uuid) to authenticated;

-- Apply -------------------------------------------------------------------------------

-- p_review is the validated reviewer output (src/lib/ai/schemas/review.ts) after unknown
-- message and item ids were dropped:
--   { model, summary, overallLabel, scores: { fluency, naturalness, grammar, vocabulary, confidence },
--     strengths: text[], corrections: [{ messageId, original, improved, category, subCategory,
--     isGrammatical, explanation, saveableExpressions: [{ expression, meaning }] }],
--     targetItemsUsed: [{ itemId, usedNaturally }] }
-- Returns true when the review was written, false when the conversation was already completed.
create function public.apply_conversation_review(
  p_conversation_id uuid,
  p_review jsonb,
  p_events jsonb default '[]'::jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_conversation public.conversations%rowtype;
  v_scores jsonb;
  v_correction record;
  v_target record;
  v_item public.learning_items%rowtype;
  v_inserted integer;
  v_ease numeric;
  v_mastery numeric;
  v_interval integer;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select * into v_conversation
  from public.conversations c
  where c.id = p_conversation_id and c.user_id = v_uid
  for update;
  if not found then
    raise exception 'conversation not found' using errcode = 'P0002';
  end if;
  if v_conversation.status = 'completed' then
    return false;
  end if;
  if v_conversation.status <> 'reviewing' then
    raise exception 'conversation is not being reviewed' using errcode = '55000';
  end if;

  if p_events is null or jsonb_typeof(p_events) <> 'array' or jsonb_array_length(p_events) > 0 then
    raise exception 'language events are not supported yet' using errcode = '0A000';
  end if;
  if jsonb_typeof(p_review) is distinct from 'object'
     or jsonb_typeof(p_review -> 'scores') is distinct from 'object'
     or jsonb_typeof(p_review -> 'strengths') is distinct from 'array'
     or jsonb_typeof(p_review -> 'corrections') is distinct from 'array'
     or jsonb_typeof(p_review -> 'targetItemsUsed') is distinct from 'array' then
    raise exception 'invalid review payload' using errcode = '22023';
  end if;
  if jsonb_array_length(p_review -> 'corrections') > 8 then
    raise exception 'too many corrections' using errcode = '22023';
  end if;
  v_scores := p_review -> 'scores';

  insert into public.conversation_feedback (
    conversation_id, user_id, summary, overall_label, fluency_score, naturalness_score,
    grammar_score, vocabulary_score, confidence_score, strengths, model
  )
  values (
    p_conversation_id, v_uid,
    coalesce(p_review ->> 'summary', ''),
    p_review ->> 'overallLabel',
    (v_scores ->> 'fluency')::integer,
    (v_scores ->> 'naturalness')::integer,
    (v_scores ->> 'grammar')::integer,
    (v_scores ->> 'vocabulary')::integer,
    (v_scores ->> 'confidence')::integer,
    array(select jsonb_array_elements_text(p_review -> 'strengths')),
    p_review ->> 'model'
  )
  on conflict (conversation_id) do nothing;

  -- Corrections may only point at the learner's own messages in this conversation.
  for v_correction in
    select value as c, ordinality - 1 as pos
    from jsonb_array_elements(p_review -> 'corrections') with ordinality
  loop
    if not exists (
      select 1 from public.messages m
      where m.id = (v_correction.c ->> 'messageId')::uuid
        and m.conversation_id = p_conversation_id
        and m.role = 'user'
    ) then
      raise exception 'correction does not point at a learner message' using errcode = '22023';
    end if;
    if jsonb_typeof(v_correction.c -> 'saveableExpressions') is distinct from 'array' then
      raise exception 'invalid review payload' using errcode = '22023';
    end if;

    insert into public.corrections (
      conversation_id, user_id, message_id, position, original, improved, category, sub_category,
      is_grammatical, explanation, saveable_expressions
    )
    values (
      p_conversation_id, v_uid,
      (v_correction.c ->> 'messageId')::uuid,
      v_correction.pos,
      v_correction.c ->> 'original',
      v_correction.c ->> 'improved',
      v_correction.c ->> 'category',
      v_correction.c ->> 'subCategory',
      (v_correction.c ->> 'isGrammatical')::boolean,
      coalesce(v_correction.c ->> 'explanation', ''),
      v_correction.c -> 'saveableExpressions'
    )
    on conflict (conversation_id, position) do nothing;
  end loop;

  -- Reuse: a target item used naturally moves its schedule once per conversation (rated
  -- 'good', the same rule as record_item_review and src/lib/domain/scheduling.ts).
  -- Items that weren't targets of this conversation are ignored.
  for v_target in
    select (t ->> 'itemId')::uuid as item_id, (t ->> 'usedNaturally')::boolean as used_naturally
    from jsonb_array_elements(p_review -> 'targetItemsUsed') t
  loop
    update public.conversation_targets ct
    set used_naturally = v_target.used_naturally
    where ct.conversation_id = p_conversation_id
      and ct.user_id = v_uid
      and ct.item_id = v_target.item_id;
    if not found or not v_target.used_naturally then
      continue;
    end if;

    insert into public.review_logs (user_id, item_id, conversation_id, rating, mode)
    values (v_uid, v_target.item_id, p_conversation_id, 'good', 'conversation')
    on conflict (conversation_id, item_id) where conversation_id is not null do nothing;
    get diagnostics v_inserted = row_count;
    if v_inserted = 0 then
      continue;
    end if;

    select * into v_item
    from public.learning_items li
    where li.id = v_target.item_id and li.user_id = v_uid
    for update;
    v_ease := round(v_item.ease::numeric, 2);
    v_mastery := least(1, round(v_item.mastery_score::numeric, 2) + 0.10);
    v_interval := least(365, case
      when v_item.interval_days = 0 then 1
      when v_item.interval_days = 1 then 3
      else round(v_item.interval_days * v_ease)::integer
    end);

    update public.learning_items li
    set ease = least(5, greatest(1.3, v_ease)),
        interval_days = v_interval,
        mastery_score = v_mastery,
        review_count = li.review_count + 1,
        next_review_at = now() + make_interval(hours => v_interval * 24),
        last_reviewed_at = now()
    where li.id = v_target.item_id;
  end loop;

  update public.conversations c
  set status = 'completed',
      completed_at = now(),
      review_error = null,
      overall_score = round((
        (v_scores ->> 'fluency')::numeric + (v_scores ->> 'naturalness')::numeric
        + (v_scores ->> 'grammar')::numeric + (v_scores ->> 'vocabulary')::numeric
        + (v_scores ->> 'confidence')::numeric
      ) / 5)::integer
  where c.id = p_conversation_id;
  return true;
end;
$$;

revoke all on function public.apply_conversation_review(uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.apply_conversation_review(uuid, jsonb, jsonb) to authenticated;
