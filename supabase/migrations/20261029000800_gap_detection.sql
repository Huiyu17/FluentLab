-- M8: gap detection.
--
-- 1. gap_taxonomy gets the fixed learner-facing title/description per sub-category
--    (mirrors GAP_DETAILS in src/lib/domain/taxonomy.ts; tests/db/gaps.test.ts checks they match).
-- 2. recompute_language_gaps(user): the SQL mirror of src/lib/domain/gaps.ts. Every gap of the user
--    is recomputed from all of its events (never incremented), so replaying a review changes nothing
--    and time-based changes (14-day severity window, resolve after 30 days) apply on the next review.
--    Internal: not executable by clients.
-- 3. apply_conversation_review() now takes language events: each must point at a learner message of
--    the conversation; its gap is found or created for (user, category, sub_category); then all of
--    the user's gaps are recomputed. Everything stays one transaction.
-- 4. restore_gap(): undo a dismissal (the only client write on gaps is status → dismissed).
--
-- Windows use hours, not days, so they mean exactly 24 h × n whatever the session time zone
-- (the TypeScript mirror works in milliseconds).

-- 1. Gap titles and descriptions ---------------------------------------------------------

alter table public.gap_taxonomy
  add column title text not null default '' check (char_length(title) <= 200),
  add column description text not null default '' check (char_length(description) <= 1000);

update public.gap_taxonomy t
set title = d.title, description = d.description
from (values
  ('polite_requests', 'Polite requests', 'Requests can sound too direct, like an order. Softeners such as "Could you…?" or "Would you mind…?" help.'),
  ('conversation_closing', 'Ending conversations', 'Wrapping up a conversation smoothly, without stopping abruptly or dragging on.'),
  ('conversation_opening', 'Starting conversations', 'Opening naturally: a greeting and a little context before getting to the point.'),
  ('disagreeing_politely', 'Disagreeing politely', 'Pushing back or saying no while keeping the tone friendly and respectful.'),
  ('small_talk', 'Small talk', 'Keeping casual conversation going: follow-up questions, reactions and sharing a little.'),
  ('turn_taking', 'Turn-taking', 'Answering in a way that invites the other person in, instead of very short or very long turns.'),
  ('phrasal_verbs', 'Phrasal verbs', 'Everyday verbs like "figure out" or "follow up" that sound more natural than formal single words.'),
  ('collocations', 'Word combinations', 'Words that natives put together, like "make a decision" rather than "do a decision".'),
  ('idioms', 'Idioms', 'Common idiomatic expressions, used in the right place and in the usual form.'),
  ('filler_and_softeners', 'Fillers and softeners', 'Small words like "actually", "just" or "kind of" that make speech sound relaxed and less blunt.'),
  ('word_choice', 'Word choice', 'Picking the word a native speaker would use in this situation.'),
  ('too_formal', 'Too formal', 'Sounding stiff or bookish in a casual situation.'),
  ('too_casual', 'Too casual', 'Sounding too relaxed for a professor, a manager or someone you''ve just met.'),
  ('articles', 'Articles', 'Using "a", "an", "the" or no article.'),
  ('tenses', 'Verb tenses', 'Choosing the tense that matches when something happened.'),
  ('prepositions', 'Prepositions', 'Small words like "in", "on", "at" and "for" in the usual combinations.'),
  ('word_order', 'Word order', 'Putting words in the natural order, especially in questions.'),
  ('agreement', 'Agreement', 'Matching verbs and nouns: singular and plural, "he goes" rather than "he go".'),
  ('academic', 'Academic vocabulary', 'Words for classes, research and campus life.'),
  ('everyday', 'Everyday vocabulary', 'Common words for daily situations.'),
  ('range_repetition', 'Vocabulary range', 'Reusing the same few words; trying some variety.')
) as d (sub_category, title, description)
where t.sub_category = d.sub_category;

-- 2. Recompute ------------------------------------------------------------------------------

create function public.recompute_language_gaps(p_user_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  with evidence as (
    -- Linked events that count as evidence (confidence compared as real, like it is stored).
    select e.gap_id, e.event_type, e.confidence, e.conversation_id, e.created_at
    from public.language_events e
    where e.user_id = p_user_id and e.gap_id is not null and e.confidence >= 0.6::real
  ),
  negative as (
    select * from evidence where event_type <> 'good_usage'
  ),
  agg as (
    select
      g.id,
      count(n.gap_id)::integer as evidence_count,
      count(distinct n.conversation_id)::integer as conversations_count,
      coalesce(max(n.confidence), 0)::real as confidence,
      min(n.created_at) as first_detected_at,
      max(n.created_at) as last_detected_at,
      coalesce(bool_or(n.confidence >= 0.85::real), false) as strong,
      count(n.gap_id) filter (where n.created_at >= now() - interval '336 hours')::integer as recent,
      count(distinct n.conversation_id)
        filter (where n.created_at >= now() - interval '336 hours')::integer as recent_conversations
    from public.language_gaps g
    left join negative n on n.gap_id = g.id
    where g.user_id = p_user_id
    group by g.id
  ),
  since_last as (
    select
      a.id,
      (select count(*) from evidence p
        where p.gap_id = a.id and p.event_type = 'good_usage'
          and p.created_at > a.last_detected_at)::integer as good_since,
      (select count(*) from public.conversation_targets ct
        join public.conversations c on c.id = ct.conversation_id
        where ct.gap_id = a.id and ct.user_id = p_user_id and c.status = 'completed'
          and c.completed_at > a.last_detected_at)::integer as targeted_since
    from agg a
  ),
  computed as (
    select
      g.id,
      case
        when g.status = 'dismissed' then 'dismissed'
        when not (a.evidence_count >= 2 or a.strong) then 'emerging'
        when not (s.good_since >= 2 or s.targeted_since >= 3) then 'active'
        when a.last_detected_at <= now() - interval '720 hours' then 'resolved'
        else 'improving'
      end as status,
      case
        when g.status = 'dismissed' or a.recent = 0 then g.severity
        when a.recent >= 7 or a.recent_conversations >= 3 then 'high'
        when a.recent >= 4 then 'medium'
        else 'low'
      end as severity,
      a.evidence_count, a.conversations_count, a.confidence, a.first_detected_at, a.last_detected_at
    from public.language_gaps g
    join agg a on a.id = g.id
    join since_last s on s.id = g.id
  )
  update public.language_gaps g
  set status = c.status,
      severity = c.severity,
      evidence_count = c.evidence_count,
      conversations_count = c.conversations_count,
      confidence = c.confidence,
      first_detected_at = c.first_detected_at,
      last_detected_at = c.last_detected_at
  from computed c
  where g.id = c.id
    and (g.status, g.severity, g.evidence_count, g.conversations_count, g.confidence,
         g.first_detected_at, g.last_detected_at)
      is distinct from
        (c.status, c.severity, c.evidence_count, c.conversations_count, c.confidence,
         c.first_detected_at, c.last_detected_at);
end;
$$;

revoke all on function public.recompute_language_gaps(uuid) from public, anon, authenticated;

-- 3. Apply a review, now with language events ----------------------------------------------

-- p_events: [{ messageId, eventType, category, subCategory, original, suggestion, context, confidence }]
-- (src/lib/ai/schemas/review.ts after unknown refs were dropped). At most 60.
create or replace function public.apply_conversation_review(
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
  v_event jsonb;
  v_gap_id uuid;
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

  if jsonb_typeof(p_review) is distinct from 'object'
     or jsonb_typeof(p_review -> 'scores') is distinct from 'object'
     or jsonb_typeof(p_review -> 'strengths') is distinct from 'array'
     or jsonb_typeof(p_review -> 'corrections') is distinct from 'array'
     or jsonb_typeof(p_review -> 'targetItemsUsed') is distinct from 'array'
     or jsonb_typeof(p_events) is distinct from 'array' then
    raise exception 'invalid review payload' using errcode = '22023';
  end if;
  if jsonb_array_length(p_review -> 'corrections') > 8 then
    raise exception 'too many corrections' using errcode = '22023';
  end if;
  if jsonb_array_length(p_events) > 60 then
    raise exception 'too many language events' using errcode = '22023';
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

  -- Language events: evidence for gaps, from learner messages only. The gap is found or created
  -- first so the event can be linked as it is inserted; the event insert checks the category pair
  -- (composite FK to gap_taxonomy), so an invalid pair fails here and rolls everything back.
  for v_event in select value from jsonb_array_elements(p_events)
  loop
    if not exists (
      select 1 from public.messages m
      where m.id = (v_event ->> 'messageId')::uuid
        and m.conversation_id = p_conversation_id
        and m.role = 'user'
    ) then
      raise exception 'language event does not point at a learner message' using errcode = '22023';
    end if;

    insert into public.language_gaps (user_id, category, sub_category, title, description)
    select v_uid, t.category, t.sub_category, t.title, t.description
    from public.gap_taxonomy t
    where t.category = v_event ->> 'category' and t.sub_category = v_event ->> 'subCategory'
    on conflict (user_id, category, sub_category) do nothing;

    v_gap_id := null;
    select g.id into v_gap_id
    from public.language_gaps g
    where g.user_id = v_uid
      and g.category = v_event ->> 'category'
      and g.sub_category = v_event ->> 'subCategory';

    insert into public.language_events (
      user_id, conversation_id, message_id, event_type, category, sub_category, original,
      suggestion, context, confidence, gap_id
    )
    values (
      v_uid, p_conversation_id,
      (v_event ->> 'messageId')::uuid,
      v_event ->> 'eventType',
      v_event ->> 'category',
      v_event ->> 'subCategory',
      v_event ->> 'original',
      v_event ->> 'suggestion',
      coalesce(v_event ->> 'context', ''),
      (v_event ->> 'confidence')::real,
      v_gap_id
    )
    on conflict (conversation_id, message_id, event_type, category, sub_category) do nothing;
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

  -- After completing, so a conversation that targeted a gap (M9) counts for it too.
  perform public.recompute_language_gaps(v_uid);
  return true;
end;
$$;

-- 4. Restore a dismissed gap -----------------------------------------------------------------

-- Returns the gap's recomputed status. Another user's gap raises P0002 like a missing one.
create function public.restore_gap(p_gap_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_status text;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not exists (select 1 from public.language_gaps g where g.id = p_gap_id and g.user_id = v_uid) then
    raise exception 'gap not found' using errcode = 'P0002';
  end if;

  -- Any non-dismissed value; the recompute decides the real status from the evidence.
  update public.language_gaps g
  set status = 'emerging'
  where g.id = p_gap_id and g.status = 'dismissed';

  perform public.recompute_language_gaps(v_uid);
  select g.status into v_status from public.language_gaps g where g.id = p_gap_id;
  return v_status;
end;
$$;

revoke all on function public.restore_gap(uuid) from public, anon, authenticated;
grant execute on function public.restore_gap(uuid) to authenticated;
