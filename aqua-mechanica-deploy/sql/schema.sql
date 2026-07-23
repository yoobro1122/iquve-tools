-- Run this once in the Supabase SQL editor (Project -> SQL Editor -> New query)

create table if not exists public.saves (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state jsonb not null,
  updated_at timestamptz not null default now()
);

-- Row Level Security: each user can only ever see/write their own row.
-- The /api functions use the SERVICE ROLE key (which bypasses RLS) after
-- verifying the caller's identity themselves, so RLS here is a second
-- line of defense in case the anon key is ever used directly.
alter table public.saves enable row level security;

create policy "Users can read their own save"
  on public.saves for select
  using (auth.uid() = user_id);

create policy "Users can upsert their own save"
  on public.saves for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own save"
  on public.saves for update
  using (auth.uid() = user_id);
