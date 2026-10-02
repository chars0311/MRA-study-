-- Run this in Supabase SQL Editor once for the MRA Study app.

create table if not exists public.study_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  event_key text not null,
  question_id text not null,
  variant text,
  topic text,
  run_id text not null,
  world text,
  mode text,
  total integer not null default 0,
  correct boolean not null,
  guessed boolean not null default false,
  answered_at timestamptz not null default now(),
  primary key (user_id, event_key)
);

alter table public.study_progress enable row level security;

drop policy if exists "Students read own progress" on public.study_progress;
create policy "Students read own progress"
on public.study_progress
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Students insert own progress" on public.study_progress;
create policy "Students insert own progress"
on public.study_progress
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Students update own progress" on public.study_progress;
create policy "Students update own progress"
on public.study_progress
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Students delete own progress" on public.study_progress;
create policy "Students delete own progress"
on public.study_progress
for delete
to authenticated
using (auth.uid() = user_id);
