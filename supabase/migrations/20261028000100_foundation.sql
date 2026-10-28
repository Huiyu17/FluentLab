-- FluentLab schema 1/5: helpers, reference data, profiles.
-- Conventions (docs/DATABASE.md):
--   * RLS on every table; anon gets no privileges on app tables.
--   * Privileges are granted per table and per column; Supabase's default
--     "grant all to anon, authenticated" is revoked explicitly.
--   * User-owned children reference parents via same-owner composite FKs.

-- Helpers -------------------------------------------------------------------

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.set_updated_at() from public, anon, authenticated;

-- Reference: gap taxonomy (mirrors src/lib/domain/taxonomy.ts) ---------------

create table public.gap_categories (
  category text primary key,
  score_dimension text not null
    check (score_dimension in ('naturalness', 'grammar', 'vocabulary')),
  label text not null
);

create table public.gap_taxonomy (
  category text not null references public.gap_categories (category),
  sub_category text not null unique,
  primary key (category, sub_category)
);

insert into public.gap_categories (category, score_dimension, label) values
  ('pragmatics', 'naturalness', 'Pragmatics'),
  ('natural_expression', 'naturalness', 'Natural expression'),
  ('register', 'naturalness', 'Register'),
  ('grammar', 'grammar', 'Grammar'),
  ('vocabulary', 'vocabulary', 'Vocabulary');

insert into public.gap_taxonomy (category, sub_category) values
  ('pragmatics', 'polite_requests'),
  ('pragmatics', 'conversation_closing'),
  ('pragmatics', 'conversation_opening'),
  ('pragmatics', 'disagreeing_politely'),
  ('pragmatics', 'small_talk'),
  ('pragmatics', 'turn_taking'),
  ('natural_expression', 'phrasal_verbs'),
  ('natural_expression', 'collocations'),
  ('natural_expression', 'idioms'),
  ('natural_expression', 'filler_and_softeners'),
  ('natural_expression', 'word_choice'),
  ('register', 'too_formal'),
  ('register', 'too_casual'),
  ('grammar', 'articles'),
  ('grammar', 'tenses'),
  ('grammar', 'prepositions'),
  ('grammar', 'word_order'),
  ('grammar', 'agreement'),
  ('vocabulary', 'academic'),
  ('vocabulary', 'everyday'),
  ('vocabulary', 'range_repetition');

alter table public.gap_categories enable row level security;
alter table public.gap_taxonomy enable row level security;
revoke all on public.gap_categories, public.gap_taxonomy from anon, authenticated;
grant select on public.gap_categories, public.gap_taxonomy to authenticated;
create policy "gap_categories readable" on public.gap_categories
  for select to authenticated using (true);
create policy "gap_taxonomy readable" on public.gap_taxonomy
  for select to authenticated using (true);

-- App config (singleton; no client access, read by security definer RPCs) ----

create table public.app_config (
  id boolean primary key default true check (id),
  ai_daily_limit integer not null default 200 check (ai_daily_limit > 0)
);

insert into public.app_config default values;

alter table public.app_config enable row level security;
revoke all on public.app_config from anon, authenticated;

-- Profiles --------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) <= 80),
  native_language text check (char_length(native_language) <= 60),
  english_level text
    check (english_level in ('intermediate', 'upper_intermediate', 'advanced')),
  learning_goal text check (char_length(learning_goal) <= 500),
  contexts text[] not null default '{}'
    check (contexts <@ array['campus', 'social', 'everyday', 'career', 'travel']),
  daily_goal_minutes integer not null default 20 check (daily_goal_minutes between 5 and 120),
  timezone text not null default 'UTC' check (char_length(timezone) <= 64),
  onboarded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (
  display_name, native_language, english_level, learning_goal,
  contexts, daily_goal_minutes, timezone, onboarded_at
) on public.profiles to authenticated;

create policy "profiles select own" on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy "profiles update own" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- Create an empty profile for every new auth user.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, left(nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''), 80));
  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
