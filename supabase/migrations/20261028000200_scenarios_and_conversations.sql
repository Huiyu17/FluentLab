-- FluentLab schema 2/5: shared content, scenarios, conversations, messages.

-- Curated expressions (shared, read-only) -----------------------------------

create table public.curated_expressions (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  expression text not null check (char_length(expression) between 1 and 200),
  meaning text not null,
  used_when text not null default '',
  example text not null default '',
  register text not null default 'neutral'
    check (register in ('casual', 'casual_neutral', 'neutral', 'formal')),
  frequency integer not null default 3 check (frequency between 1 and 5),
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);

alter table public.curated_expressions enable row level security;
revoke all on public.curated_expressions from anon, authenticated;
grant select on public.curated_expressions to authenticated;
create policy "curated_expressions readable" on public.curated_expressions
  for select to authenticated using (true);

-- Scenarios: shared catalog (migrations/seed only) + user-owned custom ------

create table public.scenarios (
  id uuid primary key default gen_random_uuid(),
  slug text unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  category text not null
    check (category in ('campus', 'social', 'everyday', 'career', 'travel', 'custom')),
  title text not null check (char_length(title) between 1 and 120),
  description text not null default '' check (char_length(description) <= 1000),
  user_role text not null check (char_length(user_role) between 1 and 300),
  ai_role text not null check (char_length(ai_role) between 1 and 300),
  ai_personality text not null default '' check (char_length(ai_personality) <= 300),
  goal text not null default '' check (char_length(goal) <= 500),
  difficulty text not null default 'intermediate'
    check (difficulty in ('intermediate', 'upper_intermediate', 'advanced')),
  opening_line text check (char_length(opening_line) <= 500),
  -- Extra trusted instructions; shared scenarios only (user text never goes in a system prompt).
  system_prompt text,
  est_minutes integer not null default 8 check (est_minutes between 1 and 60),
  is_custom boolean not null default false,
  created_by uuid references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint scenarios_owner_shape check (
    (is_custom and created_by is not null and system_prompt is null and slug is null)
    or (not is_custom and created_by is null and slug is not null)
  ),
  -- Lets debriefs reference only their owner's custom scenarios.
  constraint scenarios_id_owner_key unique (id, created_by)
);

create index scenarios_created_by_idx on public.scenarios (created_by) where is_custom;

create trigger scenarios_set_updated_at
  before update on public.scenarios
  for each row execute function public.set_updated_at();

alter table public.scenarios enable row level security;
revoke all on public.scenarios from anon, authenticated;
grant select, delete on public.scenarios to authenticated;
grant insert (
  category, title, description, user_role, ai_role, ai_personality,
  goal, difficulty, opening_line, est_minutes, is_custom, created_by
) on public.scenarios to authenticated;
grant update (
  category, title, description, user_role, ai_role, ai_personality,
  goal, difficulty, opening_line, est_minutes
) on public.scenarios to authenticated;

create policy "scenarios select shared or own" on public.scenarios
  for select to authenticated
  using (not is_custom or created_by = (select auth.uid()));
create policy "scenarios insert own custom" on public.scenarios
  for insert to authenticated
  with check (is_custom and created_by = (select auth.uid()));
create policy "scenarios update own custom" on public.scenarios
  for update to authenticated
  using (is_custom and created_by = (select auth.uid()))
  with check (is_custom and created_by = (select auth.uid()));
create policy "scenarios delete own custom" on public.scenarios
  for delete to authenticated
  using (is_custom and created_by = (select auth.uid()));

-- Conversations -----------------------------------------------------------------

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  scenario_id uuid references public.scenarios (id) on delete set null,
  scenario_snapshot jsonb not null default '{}',
  status text not null default 'active'
    check (status in ('active', 'reviewing', 'completed', 'failed_review', 'abandoned')),
  review_started_at timestamptz,
  review_attempts integer not null default 0 check (review_attempts >= 0),
  review_error text check (char_length(review_error) <= 1000),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  completed_at timestamptz,
  overall_score integer check (overall_score between 0 and 100),
  constraint conversations_id_user_key unique (id, user_id)
);

create index conversations_user_started_idx on public.conversations (user_id, started_at desc);
create index conversations_scenario_idx on public.conversations (scenario_id);

alter table public.conversations enable row level security;
revoke all on public.conversations from anon, authenticated;
grant select, delete on public.conversations to authenticated;
grant insert (user_id, scenario_id, scenario_snapshot) on public.conversations to authenticated;
-- completed_at / overall_score are written only by the review RPC (M7).
grant update (status, ended_at, review_started_at, review_attempts, review_error)
  on public.conversations to authenticated;

-- A plain FK would accept another user's custom scenario id (FK checks bypass RLS),
-- so insert/update also require the scenario to be shared or owned.
create policy "conversations select own" on public.conversations
  for select to authenticated using (user_id = (select auth.uid()));
create policy "conversations insert own" on public.conversations
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (conversations.scenario_id is null or exists (
      select 1 from public.scenarios s
      where s.id = conversations.scenario_id
        and (not s.is_custom or s.created_by = (select auth.uid()))
    ))
  );
create policy "conversations update own" on public.conversations
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and (conversations.scenario_id is null or exists (
      select 1 from public.scenarios s
      where s.id = conversations.scenario_id
        and (not s.is_custom or s.created_by = (select auth.uid()))
    ))
  );
create policy "conversations delete own" on public.conversations
  for delete to authenticated using (user_id = (select auth.uid()));

-- Messages (immutable) ------------------------------------------------------------

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null,
  user_id uuid not null default auth.uid(),
  role text not null check (role in ('user', 'assistant')),
  content text not null check (char_length(content) between 1 and 4000),
  seq integer not null check (seq >= 0),
  created_at timestamptz not null default now(),
  foreign key (conversation_id, user_id)
    references public.conversations (id, user_id) on delete cascade,
  constraint messages_conversation_seq_key unique (conversation_id, seq),
  constraint messages_id_user_key unique (id, user_id),
  -- Lets corrections/events pin a message to the same conversation.
  constraint messages_id_conversation_key unique (id, conversation_id)
);

alter table public.messages enable row level security;
revoke all on public.messages from anon, authenticated;
grant select on public.messages to authenticated;
grant insert (conversation_id, user_id, role, content, seq) on public.messages to authenticated;

create policy "messages select own" on public.messages
  for select to authenticated using (user_id = (select auth.uid()));
create policy "messages insert into own active conversation" on public.messages
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id
        and c.user_id = (select auth.uid())
        and c.status = 'active'
    )
  );
