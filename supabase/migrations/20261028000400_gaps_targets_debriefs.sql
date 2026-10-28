-- FluentLab schema 4/5: language gaps, language events, conversation targets, debriefs.

-- Language gaps (aggregated learner model; a recomputable cache of events) ------

create table public.language_gaps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  category text not null,
  sub_category text not null,
  title text not null check (char_length(title) between 1 and 200),
  description text not null default '' check (char_length(description) <= 1000),
  -- emerging = stored but below the display threshold (docs/AI_SYSTEM.md → Gap detection).
  status text not null default 'emerging'
    check (status in ('emerging', 'active', 'improving', 'resolved', 'dismissed')),
  severity text not null default 'low' check (severity in ('low', 'medium', 'high')),
  confidence real not null default 0 check (confidence between 0 and 1),
  evidence_count integer not null default 0 check (evidence_count >= 0),
  conversations_count integer not null default 0 check (conversations_count >= 0),
  first_detected_at timestamptz,
  last_detected_at timestamptz,
  last_practiced_at timestamptz,
  status_changed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (category, sub_category) references public.gap_taxonomy (category, sub_category),
  constraint language_gaps_user_pair_key unique (user_id, category, sub_category),
  constraint language_gaps_id_user_key unique (id, user_id),
  -- Lets events require that their gap has the same owner AND the same category pair.
  constraint language_gaps_id_user_pair_key unique (id, user_id, category, sub_category)
);

create index language_gaps_user_status_idx on public.language_gaps (user_id, status, severity);

create function public.language_gaps_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  if new.status is distinct from old.status then
    new.status_changed_at := now();
  end if;
  return new;
end;
$$;

revoke all on function public.language_gaps_touch() from public, anon, authenticated;

create trigger language_gaps_touch
  before update on public.language_gaps
  for each row execute function public.language_gaps_touch();

alter table public.language_gaps enable row level security;
revoke all on public.language_gaps from anon, authenticated;
grant select on public.language_gaps to authenticated;
-- The only client write: dismissing a gap. Everything else goes through RPCs.
grant update (status) on public.language_gaps to authenticated;

create policy "language_gaps select own" on public.language_gaps
  for select to authenticated using (user_id = (select auth.uid()));
create policy "language_gaps dismiss own" on public.language_gaps
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and status = 'dismissed');

-- Language events (atomic evidence ledger) ----------------------------------------

create table public.language_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  conversation_id uuid not null,
  message_id uuid not null,
  event_type text not null check (event_type in (
    'unnatural_expression', 'grammar_error', 'overly_direct', 'register_mismatch',
    'limited_vocabulary', 'missed_opportunity', 'good_usage'
  )),
  category text not null,
  sub_category text not null,
  original text not null check (char_length(original) <= 4000),
  suggestion text check (char_length(suggestion) <= 4000),
  context text not null default '' check (char_length(context) <= 1000),
  confidence real not null check (confidence between 0 and 1),
  gap_id uuid,
  created_at timestamptz not null default now(),
  foreign key (conversation_id, user_id)
    references public.conversations (id, user_id) on delete cascade,
  foreign key (message_id, conversation_id)
    references public.messages (id, conversation_id) on delete cascade,
  foreign key (category, sub_category) references public.gap_taxonomy (category, sub_category),
  -- Same owner and same category pair as the gap it is linked to.
  foreign key (gap_id, user_id, category, sub_category)
    references public.language_gaps (id, user_id, category, sub_category)
    on delete set null (gap_id),
  -- Natural key: re-applying a review cannot duplicate evidence.
  constraint language_events_natural_key
    unique (conversation_id, message_id, event_type, category, sub_category)
);

create index language_events_user_created_idx on public.language_events (user_id, created_at desc);
create index language_events_gap_created_idx on public.language_events (gap_id, created_at);

alter table public.language_events enable row level security;
revoke all on public.language_events from anon, authenticated;
grant select on public.language_events to authenticated;
create policy "language_events select own" on public.language_events
  for select to authenticated using (user_id = (select auth.uid()));

-- Conversation targets (Reuse: items/gaps a conversation should elicit) -------------

create table public.conversation_targets (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null,
  user_id uuid not null default auth.uid(),
  item_id uuid,
  gap_id uuid,
  used_naturally boolean,   -- set by the review RPC
  created_at timestamptz not null default now(),
  foreign key (conversation_id, user_id)
    references public.conversations (id, user_id) on delete cascade,
  foreign key (item_id, user_id)
    references public.learning_items (id, user_id) on delete cascade,
  foreign key (gap_id, user_id)
    references public.language_gaps (id, user_id) on delete cascade,
  constraint conversation_targets_one_target check (num_nonnulls(item_id, gap_id) = 1)
);

create unique index conversation_targets_item_key
  on public.conversation_targets (conversation_id, item_id) where item_id is not null;
create unique index conversation_targets_gap_key
  on public.conversation_targets (conversation_id, gap_id) where gap_id is not null;
create index conversation_targets_item_idx on public.conversation_targets (item_id);
create index conversation_targets_gap_idx on public.conversation_targets (gap_id);

alter table public.conversation_targets enable row level security;
revoke all on public.conversation_targets from anon, authenticated;
grant select, delete on public.conversation_targets to authenticated;
grant insert (conversation_id, user_id, item_id, gap_id) on public.conversation_targets to authenticated;

create policy "conversation_targets select own" on public.conversation_targets
  for select to authenticated using (user_id = (select auth.uid()));
create policy "conversation_targets insert own active" on public.conversation_targets
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.conversations c
      where c.id = conversation_targets.conversation_id
        and c.user_id = (select auth.uid())
        and c.status = 'active'
    )
  );
create policy "conversation_targets delete own" on public.conversation_targets
  for delete to authenticated using (user_id = (select auth.uid()));

-- Debriefs --------------------------------------------------------------------------

create table public.debriefs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  situation text not null check (char_length(situation) between 1 and 2000),
  what_user_said text check (char_length(what_user_said) <= 2000),
  result jsonb check (result is null or jsonb_typeof(result) = 'object'),
  scenario_id uuid,
  created_at timestamptz not null default now(),
  -- Only the owner's own custom scenario (shared scenarios have created_by = null).
  foreign key (scenario_id, user_id)
    references public.scenarios (id, created_by) on delete set null (scenario_id),
  constraint debriefs_id_user_key unique (id, user_id)
);

create index debriefs_user_created_idx on public.debriefs (user_id, created_at desc);

alter table public.debriefs enable row level security;
revoke all on public.debriefs from anon, authenticated;
grant select, delete on public.debriefs to authenticated;
grant insert (user_id, situation, what_user_said, result, scenario_id) on public.debriefs to authenticated;
grant update (situation, what_user_said, result, scenario_id) on public.debriefs to authenticated;

create policy "debriefs select own" on public.debriefs
  for select to authenticated using (user_id = (select auth.uid()));
create policy "debriefs insert own" on public.debriefs
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "debriefs update own" on public.debriefs
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy "debriefs delete own" on public.debriefs
  for delete to authenticated using (user_id = (select auth.uid()));

-- Deferred FK from migration 3.
alter table public.learning_items
  add foreign key (source_debrief_id, user_id)
    references public.debriefs (id, user_id) on delete set null (source_debrief_id);
