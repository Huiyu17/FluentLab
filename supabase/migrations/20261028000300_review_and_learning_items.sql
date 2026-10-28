-- FluentLab schema 3/5: conversation review outputs, learning items, review logs.
-- Review outputs and review logs are written only by security definer RPCs
-- (M7: apply_conversation_review, M4: record_item_review); clients read them.

-- Conversation feedback (1:1) ---------------------------------------------------

create table public.conversation_feedback (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null unique,
  user_id uuid not null,
  summary text not null default '' check (char_length(summary) <= 2000),
  overall_label text not null
    check (overall_label in ('needs_work', 'developing', 'good_communication', 'strong')),
  fluency_score integer not null check (fluency_score between 0 and 100),
  naturalness_score integer not null check (naturalness_score between 0 and 100),
  grammar_score integer not null check (grammar_score between 0 and 100),
  vocabulary_score integer not null check (vocabulary_score between 0 and 100),
  confidence_score integer not null check (confidence_score between 0 and 100),
  strengths text[] not null default '{}',
  model text,
  created_at timestamptz not null default now(),
  foreign key (conversation_id, user_id)
    references public.conversations (id, user_id) on delete cascade
);

create index conversation_feedback_user_idx on public.conversation_feedback (user_id, created_at desc);

alter table public.conversation_feedback enable row level security;
revoke all on public.conversation_feedback from anon, authenticated;
grant select on public.conversation_feedback to authenticated;
create policy "conversation_feedback select own" on public.conversation_feedback
  for select to authenticated using (user_id = (select auth.uid()));

-- Corrections ---------------------------------------------------------------------

create table public.corrections (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null,
  user_id uuid not null,
  message_id uuid not null,
  position integer not null check (position >= 0),
  original text not null check (char_length(original) <= 4000),
  improved text not null check (char_length(improved) <= 4000),
  category text not null references public.gap_categories (category),
  sub_category text,
  is_grammatical boolean not null,
  explanation text not null default '' check (char_length(explanation) <= 2000),
  saveable_expressions jsonb not null default '[]'
    check (jsonb_typeof(saveable_expressions) = 'array'),
  created_at timestamptz not null default now(),
  foreign key (conversation_id, user_id)
    references public.conversations (id, user_id) on delete cascade,
  -- The message must belong to this conversation (and therefore this user).
  foreign key (message_id, conversation_id)
    references public.messages (id, conversation_id) on delete cascade,
  -- MATCH SIMPLE: a NULL sub_category skips the pair check; category is still checked above.
  foreign key (category, sub_category) references public.gap_taxonomy (category, sub_category),
  constraint corrections_conversation_position_key unique (conversation_id, position),
  constraint corrections_id_user_key unique (id, user_id)
);

create index corrections_message_idx on public.corrections (message_id);

alter table public.corrections enable row level security;
revoke all on public.corrections from anon, authenticated;
grant select on public.corrections to authenticated;
create policy "corrections select own" on public.corrections
  for select to authenticated using (user_id = (select auth.uid()));

-- Learning items ("My English") ---------------------------------------------------

create table public.learning_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  type text not null check (type in ('word', 'phrase', 'expression', 'grammar')),
  expression text not null check (char_length(btrim(expression)) between 1 and 200),
  meaning text not null default '' check (char_length(meaning) <= 1000),
  native_meaning text check (char_length(native_meaning) <= 1000),
  example text check (char_length(example) <= 1000),
  details jsonb not null default '{}' check (jsonb_typeof(details) = 'object'),
  source text not null default 'manual'
    check (source in ('studio', 'review', 'debrief', 'curated', 'manual')),
  source_conversation_id uuid,
  source_correction_id uuid,
  source_debrief_id uuid,   -- FK added in migration 4 (debriefs)
  source_curated_id uuid references public.curated_expressions (id) on delete set null,
  -- Spaced-repetition state: updated only by review RPCs.
  mastery_score real not null default 0 check (mastery_score between 0 and 1),
  ease real not null default 2.5 check (ease between 1.3 and 5),
  interval_days integer not null default 0 check (interval_days >= 0),
  review_count integer not null default 0 check (review_count >= 0),
  next_review_at timestamptz not null default now(),
  last_reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (source_conversation_id, user_id)
    references public.conversations (id, user_id) on delete set null (source_conversation_id),
  foreign key (source_correction_id, user_id)
    references public.corrections (id, user_id) on delete set null (source_correction_id),
  constraint learning_items_id_user_key unique (id, user_id)
);

create unique index learning_items_user_expression_key
  on public.learning_items (user_id, lower(btrim(expression)));
create index learning_items_user_next_review_idx on public.learning_items (user_id, next_review_at);

create trigger learning_items_set_updated_at
  before update on public.learning_items
  for each row execute function public.set_updated_at();

alter table public.learning_items enable row level security;
revoke all on public.learning_items from anon, authenticated;
grant select, delete on public.learning_items to authenticated;
grant insert (
  user_id, type, expression, meaning, native_meaning, example, details, source,
  source_conversation_id, source_correction_id, source_debrief_id, source_curated_id
) on public.learning_items to authenticated;
grant update (type, expression, meaning, native_meaning, example, details)
  on public.learning_items to authenticated;

create policy "learning_items select own" on public.learning_items
  for select to authenticated using (user_id = (select auth.uid()));
create policy "learning_items insert own" on public.learning_items
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "learning_items update own" on public.learning_items
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy "learning_items delete own" on public.learning_items
  for delete to authenticated using (user_id = (select auth.uid()));

-- Review logs (SRS ledger) --------------------------------------------------------

create table public.review_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  item_id uuid not null,
  conversation_id uuid,
  rating text not null check (rating in ('again', 'hard', 'good', 'easy')),
  mode text not null check (mode in ('recall', 'use_in_sentence', 'conversation')),
  created_at timestamptz not null default now(),
  foreign key (item_id, user_id)
    references public.learning_items (id, user_id) on delete cascade,
  foreign key (conversation_id, user_id)
    references public.conversations (id, user_id) on delete cascade,
  constraint review_logs_conversation_mode check ((mode = 'conversation') = (conversation_id is not null))
);

-- A conversation can move an item's schedule at most once (review retries are no-ops).
create unique index review_logs_conversation_item_key
  on public.review_logs (conversation_id, item_id) where conversation_id is not null;
create index review_logs_item_idx on public.review_logs (item_id, created_at desc);

alter table public.review_logs enable row level security;
revoke all on public.review_logs from anon, authenticated;
grant select on public.review_logs to authenticated;
create policy "review_logs select own" on public.review_logs
  for select to authenticated using (user_id = (select auth.uid()));
